// Runs the table one step at a time: a DM turn, one player's turn, or one combat turn.
// Human seats pause the loop until they submit; AI seats call their own model.
import type { Campaign, Mood, Session } from '../lib/types';
import type { BattleMap } from './map';
import { chat, type LlmSettings } from '../ai/llm';
import { uid } from '../lib/rng';
import type { Creature, GameState, PcSheet, Seat } from './types';
import { creatureFromSheet, loadSrd } from './creatures';
import { advanceTurn, combatOver, currentCreature, endCombat, isDown, log, startTurn } from './engine';
import { applyDmTags, legendaryReactions, runCombatCommands } from './commands';
import { dmAdjudicate, dmExploreUser, dmMonsterTurn, dmSystem, maybeSummarize, playerCombatUser, playerExploreUser, playerSystem, seatLlm, transcript } from './prompts';

export interface Env {
  campaign: Campaign;
  session: Session;
  llm: LlmSettings;
  signal?: AbortSignal;
  onDelta?: (who: string, chunk: string) => void;
  onMood?: (m: Mood) => void;
}

const MOODS: Mood[] = ['tavern', 'town', 'travel', 'forest', 'dungeon', 'battle', 'boss', 'horror', 'mystery', 'sea', 'sacred', 'calm'];

export async function newGame(c: Campaign, s: Session, seats: Seat[], sheets: PcSheet[], contextChars = 60000, rules: NonNullable<GameState['rules']> = { flanking: false, autoShield: true, images: 'off', flow: 'free' }): Promise<GameState> {
  await loadSrd();
  const g: GameState = {
    id: uid(), campaignId: c.id, sessionId: s.id, createdAt: Date.now(), updatedAt: Date.now(),
    seats, sheets: structuredClone(sheets), creatures: sheets.map(creatureFromSheet),
    phase: 'dm', playerQueue: [], log: [], summarizedCount: 0, sceneIndex: 0, status: 'running',
    directorNotes: [], contextChars, mood: s.scenes[0]?.mood, sceneTheme: themeFor(c, s, 0), rules,
  };
  log(g, 'system', `Session ${s.number}: ${s.title} begins. Party: ${sheets.map((x) => `${x.name} (${x.species} ${x.cls} ${x.level})`).join(', ')}.`);
  const sp = scenePrompt({ campaign: c, session: s } as Env, g);
  requestImage(g, 'scene', sp.prompt, sp.caption);
  return g;
}

/** Battle-map theme from the scene's location. */
export function themeFor(c: Campaign, s: Session, sceneIndex: number): BattleMap['theme'] {
  const sc = s.scenes[Math.min(sceneIndex, s.scenes.length - 1)];
  const loc = c.locations.find((l) => l.id === sc?.locationId);
  if (!loc) return 'open';
  if (loc.kind === 'dungeon') return /cave|mine/i.test(loc.dungeon?.theme ?? '') ? 'cave' : 'dungeon';
  if (['town', 'city', 'village', 'fortress'].includes(loc.kind)) return 'town';
  if (loc.terrain === 'forest' || loc.terrain === 'swamp') return 'forest';
  if (loc.terrain === 'underdark' || loc.terrain === 'mountains') return 'cave';
  return 'open';
}

export const dmSeat = (g: GameState) => g.seats.find((s) => s.role === 'dm')!;
const seatFor = (g: GameState, c: Creature) => (c.kind === 'pc' ? g.seats.find((s) => s.sheetId === c.sheetId) : dmSeat(g));
const sheetFor = (g: GameState, seat: Seat) => g.sheets.find((x) => x.id === seat.sheetId);
const creatureFor = (g: GameState, seat: Seat) => g.creatures.find((c) => c.sheetId === seat.sheetId);

const aliveSeats = (g: GameState) => g.seats.filter((s) => s.role === 'player' && creatureFor(g, s) && !isDown(creatureFor(g, s)!));
const firstName = (n: string) => n.split(/\s+/)[0].toLowerCase();
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does `text` address a character by full or first name? */
const mentions = (text: string, name: string) => new RegExp(`\\b(${escapeRe(name)}|${escapeRe(firstName(name))})\\b`, 'i').test(text);

/** Free-flow caps: lines per character and per round before the DM takes over. */
const MAX_PER_PLAYER = 3;
const maxPerRound = (g: GameState) => Math.max(6, aliveSeats(g).length * 2);

/** Seats addressed by name in a text, in the order they are mentioned. */
function addressed(g: GameState, text: string, exceptSeat?: string): Seat[] {
  return aliveSeats(g)
    .filter((s) => s.id !== exceptSeat && mentions(text, sheetFor(g, s)!.name))
    .map((s) => {
      const n = sheetFor(g, s)!.name;
      const i = Math.min(...[n, n.split(/\s+/)[0]].map((x) => { const k = text.toLowerCase().indexOf(x.toLowerCase()); return k < 0 ? Infinity : k; }));
      return { s, i };
    })
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

/**
 * Start a round of player talk after the DM speaks.
 * Round-robin: everyone once, in seat order.
 * Free flow (default): a live conversation. Whoever the DM addressed goes first; after every line the
 * next speaker is whoever was addressed by name, otherwise a short "moderator" call picks the character
 * who would naturally react — or hands back to the DM. So P1 → P2 → P1 → P4 → P1 → DM is possible.
 */
function queuePlayers(g: GameState, dmText = '') {
  const seats = aliveSeats(g);
  g.roundSpoken = {};
  g.roundActs = 0;
  g.roundPassed = [];
  g.lastSpeaker = undefined;
  if (!seats.length) { g.playerQueue = []; g.phase = 'dm'; return; }
  if ((g.rules?.flow ?? 'free') === 'round') {
    g.playerQueue = seats.map((s) => s.id);
  } else {
    const named = addressed(g, dmText);
    g.playerQueue = named.length ? [named[0].id] : []; // empty = ask the moderator
  }
  g.phase = 'players';
}

function endRound(g: GameState) {
  g.playerQueue = [];
  g.quietRounds = (g.roundActs ?? 0) === 0 ? (g.quietRounds ?? 0) + 1 : 0;
  g.phase = 'dm';
}

/** After a player's line: bookkeeping and who goes next. */
function afterPlayer(g: GameState, seat: Seat, acted: boolean, said: string) {
  g.playerQueue.shift();
  const free = (g.rules?.flow ?? 'free') === 'free';
  if (acted) {
    g.roundActs = (g.roundActs ?? 0) + 1;
    g.roundSpoken = { ...(g.roundSpoken ?? {}), [seat.id]: (g.roundSpoken?.[seat.id] ?? 0) + 1 };
    g.lastSpeaker = seat.id;
  } else {
    g.roundPassed = [...new Set([...(g.roundPassed ?? []), seat.id])];
  }
  if (!free) { if (!g.playerQueue.length) endRound(g); return; }
  if ((g.roundActs ?? 0) >= maxPerRound(g)) { endRound(g); return; }
  if (acted) {
    // Addressed by name → that character answers next (even if they passed before).
    const next = addressed(g, said, seat.id).find((s) => (g.roundSpoken?.[s.id] ?? 0) < MAX_PER_PLAYER);
    g.playerQueue = next ? [next.id] : [];
  }
  // Empty queue → the moderator decides on the next step.
}

/** Characters who may still take the floor this round. */
function candidates(g: GameState): Seat[] {
  return aliveSeats(g).filter((s) => s.id !== g.lastSpeaker && !(g.roundPassed ?? []).includes(s.id) && (g.roundSpoken?.[s.id] ?? 0) < MAX_PER_PLAYER);
}

/** One short call: who speaks next, or back to the DM. */
async function moderate(g: GameState, env: Env): Promise<Seat | 'DM'> {
  const cands = candidates(g);
  if (!cands.length) return 'DM';
  const recent = g.log.slice(-14).filter((m) => !m.dmOnly && ['narration', 'dialogue', 'action', 'roll'].includes(m.kind))
    .map((m) => (m.kind === 'narration' ? `DM: ${m.text}` : m.kind === 'roll' ? `[dice] ${m.text}` : `${m.speaker}: ${m.text}`)).join('\n');
  const who = cands.map((s) => { const sh = sheetFor(g, s)!; return `- ${sh.name} (${sh.species} ${sh.cls}${sh.personality ? `; ${sh.personality}` : ''}${g.roundSpoken?.[s.id] ? `; already spoke ${g.roundSpoken[s.id]}×` : ''})`; }).join('\n');
  const text = await chat(seatLlm(dmSeat(g), env.llm), [
    { role: 'system', content: 'You moderate the flow of conversation at a tabletop RPG table. You decide who speaks next. Reply with exactly one line: "NEXT: <character name>" or "NEXT: DM".' },
    { role: 'user', content: `Recent table talk:\n${recent}\n\nCharacters who could speak now:\n${who}\n\nWho speaks next?\n- A character who was asked something, whose goals or backstory are touched, or who would naturally react or object.\n- "DM" if the players have agreed on what to do, asked the DM a question, attempted an action the DM must resolve, or the talk is going in circles.\nReply with only: NEXT: <name> or NEXT: DM` },
  ], { maxTokens: 400, signal: env.signal });
  const pick = text.match(/NEXT\s*:\s*(.+)/i)?.[1]?.trim() ?? text.trim();
  if (/^\W*DM\b/i.test(pick) || /dungeon master/i.test(pick)) return 'DM';
  return cands.find((s) => mentions(pick, sheetFor(g, s)!.name)) ?? 'DM';
}

function requestImage(g: GameState, kind: 'tag' | 'scene', prompt: string, caption: string) {
  const mode = g.rules?.images ?? 'off';
  if (mode === 'off' || (kind === 'tag' && mode === 'scenes') || (kind === 'scene' && mode === 'tags')) return;
  g.imageRequests = [...(g.imageRequests ?? []), { id: uid(), prompt, caption, afterMsgId: g.log[g.log.length - 1]?.id }];
}

function scenePrompt(env: Env, g: GameState): { prompt: string; caption: string } {
  const sc = env.session.scenes[Math.min(g.sceneIndex, env.session.scenes.length - 1)];
  const loc = env.campaign.locations.find((l) => l.id === sc?.locationId);
  const where = loc ? `${loc.name}, ${loc.summary}, ${loc.terrain}` : env.campaign.region.name;
  return {
    prompt: `Fantasy scene: ${sc?.title ?? 'adventure'}. ${where}. ${(sc?.readAloud ?? sc?.purpose ?? '').replace(/\s+/g, ' ').slice(0, 260)} Wide cinematic shot, no text`,
    caption: `${sc?.title ?? 'Scene'}${loc ? ` — ${loc.name}` : ''}`,
  };
}

function setMood(g: GameState, env: Env, m: Mood | undefined) {
  if (!m || !MOODS.includes(m) || g.mood === m) return;
  g.mood = m;
  env.onMood?.(m);
}

/** Apply a DM message in exploration: narration, tags, results, phase changes. */
function handleDm(g: GameState, text: string, env: Env) {
  const { narration, results, fx } = applyDmTags(g, text);
  if (narration) log(g, 'narration', narration, { speaker: 'DM', side: 'dm' });
  for (const r of results) log(g, 'roll', r);
  if (fx.scene) {
    g.sceneIndex = fx.scene === 'next' ? Math.min(env.session.scenes.length, g.sceneIndex + 1) : Math.max(0, Math.min(env.session.scenes.length, fx.scene - 1));
    const sc = env.session.scenes[g.sceneIndex];
    g.sceneTheme = themeFor(env.campaign, env.session, g.sceneIndex);
    if (sc) {
      log(g, 'system', `Scene ${g.sceneIndex + 1}: ${sc.title}`, { dmOnly: true });
      if (!fx.mood) setMood(g, env, sc.mood);
      const sp = scenePrompt(env, g);
      requestImage(g, 'scene', sp.prompt, sp.caption);
    }
  }
  for (const p of fx.images) requestImage(g, 'tag', `Fantasy illustration: ${p}. No text`, p);
  setMood(g, env, fx.mood);
  if (fx.end) { g.status = 'ended'; log(g, 'system', 'The DM ends the session.'); return; }
  if (fx.combat) {
    g.phase = 'combat';
    const foes = g.creatures.filter((c) => c.side === 'enemy' && !c.dead).map((c) => c.monster ?? c.name);
    const sp = scenePrompt(env, g);
    requestImage(g, 'scene', `Dramatic battle: adventurers face ${[...new Set(foes)].join(', ')}. ${sp.prompt}`, `Battle: ${[...new Set(foes)].join(', ')}`);
    if (!fx.mood) setMood(g, env, g.creatures.some((c) => c.legendary || (c.side === 'enemy' && c.maxHp > 100)) ? 'boss' : 'battle');
    return;
  }
  queuePlayers(g, narration);
}

/** Log a player's exploration reply. Returns whether they actually did/said something (PASS = no). */
function handlePlayerExplore(g: GameState, seat: Seat, text: string): { acted: boolean; said: string } {
  const sh = sheetFor(g, seat)!;
  let any = false;
  if (/^[\s"'*_.-]*(PASS|\(?pass(es)?\)?|\.\.\.)[\s"'*_.!-]*$/i.test(text.trim()) || !text.trim()) {
    if ((g.rules?.flow ?? 'free') === 'round') log(g, 'action', 'waits and watches.', { speaker: sh.name, side: 'party' });
    return { acted: false, said: '' };
  }
  for (const raw of text.split('\n')) {
    const l = raw.replace(/^[\s>*\-•]+/, '').replace(/\*\*/g, '').trim();
    if (!l) continue;
    const say = l.match(/^SAY\s*:\s*(.+)$/i);
    const act = l.match(/^(?:DO|ACTION)\s*:\s*(.+)$/i);
    if (say) { log(g, 'dialogue', say[1].trim(), { speaker: sh.name, side: 'party' }); any = true; }
    else if (act) { log(g, 'action', act[1].trim(), { speaker: sh.name, side: 'party' }); any = true; }
    else if (!/^(END|PASS)$/i.test(l)) { log(g, 'dialogue', l, { speaker: sh.name, side: 'party' }); any = true; }
  }
  if (!any) log(g, 'action', 'waits and watches.', { speaker: sh.name, side: 'party' });
  return { acted: any, said: text };
}

async function finishTurn(g: GameState, env: Env, actor: Creature) {
  for (const l of legendaryReactions(g, actor)) log(g, 'roll', l);
  const w = combatOver(g);
  if (w) {
    log(g, 'system', endCombat(g, w));
    setMood(g, env, env.session.scenes[g.sceneIndex]?.mood ?? 'calm');
    if (w === 'enemy') { g.status = 'ended'; log(g, 'system', 'The party has fallen. Total party kill.'); return; }
    g.phase = 'dm';
    return;
  }
  const t = advanceTurn(g);
  if (t) log(g, 'system', t);
  g.combat!.started = false;
}

/** Run a combat turn's text (from AI or human), then adjudicate freeform actions via the DM if needed. */
async function combatTurn(g: GameState, actor: Creature, text: string, env: Env, fromDm: boolean) {
  const narr = text.match(/^\s*NARRATE\s*:\s*(.+)$/im);
  if (narr) log(g, 'narration', narr[1].trim(), { speaker: 'DM', side: 'dm' });
  const body = text.replace(/^\s*NARRATE\s*:.*$/gim, '');
  const r = runCombatCommands(g, actor, body);
  for (const s of r.said) log(g, 'dialogue', s.replace(/^"|"$/g, ''), { speaker: actor.name, side: actor.side });
  for (const l of r.lines) log(g, 'roll', l);
  if (!r.lines.length && !r.said.length && !r.freeform.length) log(g, 'action', 'hesitates.', { speaker: actor.name, side: actor.side });
  if (r.freeform.length) {
    const dm = dmSeat(g);
    if (dm.controller === 'ai') {
      const out = await chat(seatLlm(dm, env.llm), [
        { role: 'system', content: dmSystem(env.campaign, env.session, g) },
        { role: 'user', content: dmAdjudicate(g, r.freeform) },
      ], { maxTokens: 3000, signal: env.signal, onDelta: (ch) => env.onDelta?.('DM', ch) });
      const t = applyDmTags(g, out);
      if (t.narration) log(g, 'narration', t.narration, { speaker: 'DM', side: 'dm' });
      for (const x of t.results) log(g, 'roll', x);
    } else {
      log(g, 'system', `DM, please adjudicate (use the DM tools): ${r.freeform.join(' | ')}`);
    }
  }
  void fromDm;
  await finishTurn(g, env, actor);
}

/** Advance the game by one step. Returns a new state (never mutates the input). */
export async function step(g0: GameState, env: Env): Promise<GameState> {
  const g = structuredClone(g0);
  if (g.status !== 'running' || g.waitingFor) return g;
  const dm = dmSeat(g);
  const dmLlm = seatLlm(dm, env.llm);
  if (await maybeSummarize(g, dmLlm, env.signal)) log(g, 'summary', 'Older events were summarized to fit the model\'s context.', { dmOnly: true });

  if (g.phase === 'dm') {
    if (dm.controller === 'human') { g.waitingFor = dm.id; return g; }
    const text = await chat(dmLlm, [
      { role: 'system', content: dmSystem(env.campaign, env.session, g) },
      { role: 'user', content: dmExploreUser(g) },
    ], { maxTokens: 3000, signal: env.signal, onDelta: (ch) => env.onDelta?.('DM', ch) });
    g.directorNotes = [];
    handleDm(g, text, env);
  } else if (g.phase === 'players') {
    if (!g.playerQueue.length) {
      if ((g.rules?.flow ?? 'free') === 'round') { endRound(g); return touch(g); }
      const next = await moderate(g, env);
      if (next === 'DM') endRound(g);
      else g.playerQueue = [next.id];
      return touch(g);
    }
    const seatId = g.playerQueue[0];
    const seat = g.seats.find((s) => s.id === seatId);
    if (!seat) { g.playerQueue.shift(); return touch(g); }
    const me = creatureFor(g, seat);
    if (!me || isDown(me)) { afterPlayer(g, seat, false, ''); return touch(g); }
    if (seat.controller === 'human') { g.waitingFor = seat.id; return g; }
    const sh = sheetFor(g, seat)!;
    const text = await chat(seatLlm(seat, env.llm), [
      { role: 'system', content: playerSystem(g, sh) },
      { role: 'user', content: playerExploreUser(g, sh) },
    ], { maxTokens: 1500, signal: env.signal, onDelta: (ch) => env.onDelta?.(sh.name, ch) });
    const r = handlePlayerExplore(g, seat, text);
    afterPlayer(g, seat, r.acted, r.said);
  } else if (g.phase === 'combat' && g.combat) {
    const c = currentCreature(g);
    if (!c) { g.phase = 'dm'; return touch(g); }
    if (!g.combat.started) {
      const st = startTurn(g, c);
      g.combat.started = true;
      if (st.text) log(g, 'roll', st.text);
      if (st.skip) { await finishTurn(g, env, c); return touch(g); }
      log(g, 'system', `${c.name}'s turn.`);
    }
    const seat = seatFor(g, c);
    if (!seat || seat.controller === 'human') { g.waitingFor = seat?.id ?? dm.id; return touch(g); }
    let text: string;
    if (c.kind === 'pc') {
      const sh = sheetFor(g, seat)!;
      text = await chat(seatLlm(seat, env.llm), [
        { role: 'system', content: playerSystem(g, sh) },
        { role: 'user', content: playerCombatUser(g, sh, c) },
      ], { maxTokens: 1500, signal: env.signal, onDelta: (ch) => env.onDelta?.(sh.name, ch) });
    } else {
      text = await chat(dmLlm, [
        { role: 'system', content: 'You are the Dungeon Master controlling monsters in a D&D 5e combat. Be tactical, fair and brief. Output only the requested lines.' },
        { role: 'user', content: dmMonsterTurn(g, c) },
      ], { maxTokens: 1500, signal: env.signal, onDelta: (ch) => env.onDelta?.(c.name, ch) });
    }
    await combatTurn(g, c, text, env, c.kind !== 'pc');
  }
  return touch(g);
}

function touch(g: GameState) { g.updatedAt = Date.now(); return g; }

/** A human seat submits its move. */
export async function submitHuman(g0: GameState, text: string, env: Env): Promise<GameState> {
  const g = structuredClone(g0);
  const seat = g.seats.find((s) => s.id === g.waitingFor);
  if (!seat) return g;
  g.waitingFor = undefined;
  if (g.phase === 'dm' && seat.role === 'dm') {
    handleDm(g, text, env);
  } else if (g.phase === 'players' && seat.role === 'player') {
    const r = handlePlayerExplore(g, seat, text);
    afterPlayer(g, seat, r.acted, r.said);
  } else if (g.phase === 'combat') {
    const c = currentCreature(g);
    if (c) await combatTurn(g, c, text, env, seat.role === 'dm');
  }
  return touch(g);
}

/** DM tools usable any time (human DM, or the app user as "director with powers"). */
export function dmIntervene(g0: GameState, text: string, env: Env): GameState {
  const g = structuredClone(g0);
  const { narration, results, fx } = applyDmTags(g, text);
  if (narration) log(g, 'narration', narration, { speaker: 'DM', side: 'dm' });
  for (const r of results) log(g, 'roll', r);
  setMood(g, env, fx.mood);
  if (fx.combat) { g.phase = 'combat'; g.waitingFor = undefined; }
  if (fx.end) g.status = 'ended';
  return touch(g);
}

export function addDirectorNote(g0: GameState, note: string): GameState {
  const g = structuredClone(g0);
  g.directorNotes.push(note);
  log(g, 'director', note, { dmOnly: true });
  return touch(g);
}

/** Summarize the played session into a play log for the Sessions tab. */
export async function writePlayLog(g: GameState, env: Env): Promise<string> {
  const text = await chat(seatLlm(dmSeat(g), env.llm), [
    { role: 'system', content: 'You write concise play logs for a Dungeon Master: what actually happened at the table. 120-250 words, past tense, bullet points allowed. Cover key decisions, NPC fates, clues discovered, loot, injuries/deaths and unresolved threads.' },
    { role: 'user', content: transcript(g, 'dm') },
  ], { maxTokens: 2500, signal: env.signal });
  return text.trim();
}
