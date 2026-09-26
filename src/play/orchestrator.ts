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

export async function newGame(c: Campaign, s: Session, seats: Seat[], sheets: PcSheet[], contextChars = 60000, rules = { flanking: false, autoShield: true }): Promise<GameState> {
  await loadSrd();
  const g: GameState = {
    id: uid(), campaignId: c.id, sessionId: s.id, createdAt: Date.now(), updatedAt: Date.now(),
    seats, sheets: structuredClone(sheets), creatures: sheets.map(creatureFromSheet),
    phase: 'dm', playerQueue: [], log: [], summarizedCount: 0, sceneIndex: 0, status: 'running',
    directorNotes: [], contextChars, mood: s.scenes[0]?.mood, sceneTheme: themeFor(c, s, 0), rules,
  };
  log(g, 'system', `Session ${s.number}: ${s.title} begins. Party: ${sheets.map((x) => `${x.name} (${x.species} ${x.cls} ${x.level})`).join(', ')}.`);
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

function queuePlayers(g: GameState) {
  g.playerQueue = g.seats.filter((s) => s.role === 'player' && creatureFor(g, s) && !isDown(creatureFor(g, s)!)).map((s) => s.id);
  g.phase = g.playerQueue.length ? 'players' : 'dm';
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
    if (sc) { log(g, 'system', `Scene ${g.sceneIndex + 1}: ${sc.title}`, { dmOnly: true }); if (!fx.mood) setMood(g, env, sc.mood); }
  }
  setMood(g, env, fx.mood);
  if (fx.end) { g.status = 'ended'; log(g, 'system', 'The DM ends the session.'); return; }
  if (fx.combat) {
    g.phase = 'combat';
    if (!fx.mood) setMood(g, env, g.creatures.some((c) => c.legendary || (c.side === 'enemy' && c.maxHp > 100)) ? 'boss' : 'battle');
    return;
  }
  queuePlayers(g);
}

function handlePlayerExplore(g: GameState, seat: Seat, text: string) {
  const sh = sheetFor(g, seat)!;
  let any = false;
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
    const seatId = g.playerQueue[0];
    const seat = g.seats.find((s) => s.id === seatId);
    if (!seat) { g.playerQueue.shift(); if (!g.playerQueue.length) g.phase = 'dm'; return touch(g); }
    const me = creatureFor(g, seat);
    if (!me || isDown(me)) { g.playerQueue.shift(); if (!g.playerQueue.length) g.phase = 'dm'; return touch(g); }
    if (seat.controller === 'human') { g.waitingFor = seat.id; return g; }
    const sh = sheetFor(g, seat)!;
    const text = await chat(seatLlm(seat, env.llm), [
      { role: 'system', content: playerSystem(g, sh) },
      { role: 'user', content: playerExploreUser(g, sh) },
    ], { maxTokens: 1500, signal: env.signal, onDelta: (ch) => env.onDelta?.(sh.name, ch) });
    handlePlayerExplore(g, seat, text);
    g.playerQueue.shift();
    if (!g.playerQueue.length) g.phase = 'dm';
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
    handlePlayerExplore(g, seat, text);
    g.playerQueue.shift();
    if (!g.playerQueue.length) g.phase = 'dm';
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
