// Prompt building for the DM and player seats. Players never see DM-only information
// (the session plan, secrets, monster stats, director notes).
import type { Campaign, Session } from '../lib/types';
import { chat, LLM_PROVIDERS, type LlmSettings } from '../ai/llm';
import { mod } from '../lib/dice';
import type { Creature, GameState, PcSheet, Seat } from './types';
import { distance, has, isDown, sheetOf } from './engine';
import { SPELLS } from './spells';
import { asciiMap, coordName, sight } from './map';

export function seatLlm(seat: Seat, def: LlmSettings): LlmSettings {
  if (seat.model.useDefault || !seat.model.provider) return def;
  const p = seat.model.provider;
  return {
    ...def,
    enabled: true,
    provider: p,
    baseUrl: seat.model.baseUrl || LLM_PROVIDERS[p].baseUrl,
    model: seat.model.model || LLM_PROVIDERS[p].model,
    apiKey: seat.model.apiKey || (p === def.provider ? def.apiKey : ''),
  };
}

// ---------- transcript / memory ----------

function line(m: GameState['log'][number]): string {
  switch (m.kind) {
    case 'narration': return `DM: ${m.text}`;
    case 'dialogue': return `${m.speaker}: ${m.text}`;
    case 'action': return `${m.speaker ?? ''} ${m.text}`.trim();
    case 'roll': return `[dice] ${m.text}`;
    case 'system': return `[game] ${m.text}`;
    case 'director': return `[director note to DM] ${m.text}`;
    case 'summary': return `[story so far] ${m.text}`;
  }
}

export function transcript(g: GameState, viewer: 'dm' | 'player'): string {
  const parts: string[] = [];
  if (g.summary) parts.push(`STORY SO FAR (summary of earlier play):\n${g.summary}\n`);
  for (const m of g.log.slice(g.summarizedCount)) {
    if (viewer === 'player' && m.dmOnly) continue;
    parts.push(line(m));
  }
  return parts.join('\n');
}

export function transcriptChars(g: GameState) {
  return g.log.slice(g.summarizedCount).reduce((n, m) => n + m.text.length + 20, 0);
}

/** Full transcript by default; when it outgrows the budget, compress the oldest part into the summary. */
export async function maybeSummarize(g: GameState, llm: LlmSettings, signal?: AbortSignal): Promise<boolean> {
  if (transcriptChars(g) <= g.contextChars) return false;
  const keepChars = Math.floor(g.contextChars * 0.5);
  let acc = 0;
  let cut = g.log.length;
  while (cut > g.summarizedCount && acc < keepChars) { cut--; acc += g.log[cut].text.length + 20; }
  if (cut <= g.summarizedCount) return false;
  const chunk = g.log.slice(g.summarizedCount, cut).filter((m) => !m.dmOnly).map(line).join('\n');
  const text = await chat(llm, [
    { role: 'system', content: 'You summarize tabletop RPG play for continuity. Keep names, decisions, promises, discovered clues, items gained, injuries, deaths and unresolved threads. Past tense, 200-400 words, no preamble.' },
    { role: 'user', content: `${g.summary ? `Earlier summary:\n${g.summary}\n\n` : ''}New events to add:\n${chunk}` },
  ], { maxTokens: 2500, signal });
  g.summary = text.trim();
  g.summarizedCount = cut;
  return true;
}

// ---------- state blocks ----------

const hpWord = (c: Creature) => (c.dead ? 'dead' : c.hp <= 0 ? 'down' : c.hp <= c.maxHp / 4 ? 'badly wounded' : c.hp <= c.maxHp / 2 ? 'bloodied' : c.hp < c.maxHp ? 'lightly hurt' : 'unhurt');

function creatureLine(c: Creature, from: Creature | undefined, exact: boolean) {
  const conds = c.conditions.map((x) => x.name).join(', ');
  const hp = exact || c.side === 'party' ? `${c.hp}/${c.maxHp} HP${c.tempHp ? ` +${c.tempHp} temp` : ''}` : hpWord(c);
  const dist = from && from !== c ? `, ${distance(from, c)} ft away` : '';
  const at = `at ${coordName(c.pos.x, c.pos.y)}`;
  return `- ${c.name} (${c.side}${c.monster && exact ? `, ${c.monster}, AC ${c.ac}` : ''}) ${at}: ${hp}${conds ? `, ${conds}` : ''}${dist}${c.concentration ? `, concentrating on ${c.concentration.spell}` : ''}`;
}

function battlefield(g: GameState, from: Creature | undefined, exact: boolean) {
  const order = g.combat ? g.combat.order.map((id) => g.creatures.find((c) => c.id === id)!).filter((c) => c && !(c.dead && c.kind === 'monster')) : g.creatures;
  const list = order.map((c) => {
    let l = creatureLine(c, from, exact);
    if (from && from !== c && g.map) {
      const v = sight(g, from, c);
      l += !v.visible ? ' — NO line of sight' : v.cover ? ` — ${v.cover === 2 ? 'half' : 'three-quarters'} cover` : '';
    }
    return l;
  }).join('\n');
  if (!g.map) return list;
  const a = asciiMap(g);
  return `MAP (columns A-${coordName(g.map.w - 1, 0).replace(/\d+$/, '')}, rows 1-${g.map.h}; # wall, o obstacle/cover, , difficult terrain, ~ water, . open; each square is 5 ft):
${a.map}
${a.legend}

${list}`;
}

function sheetSummary(sh: PcSheet, c?: Creature) {
  const ab = Object.entries(sh.abilities).map(([k, v]) => `${k.toUpperCase()} ${v} (${mod(v) >= 0 ? '+' : ''}${mod(v)})`).join(', ');
  const spells = sh.spellcasting ? `\nSpells (save DC ${sh.spellcasting.saveDc}, attack +${sh.spellcasting.attackBonus}): cantrips ${sh.spellcasting.cantrips.join(', ') || '—'}; prepared ${sh.spellcasting.spells.join(', ') || '—'}; slots left ${(c?.spell?.slots ?? sh.spellcasting.slots).map((n, i) => (i && n ? `L${i}:${n}` : '')).filter(Boolean).join(' ') || 'none'}` : '';
  return `${sh.name}, ${sh.species} ${sh.cls} ${sh.level}. AC ${sh.ac}, HP ${c ? `${c.hp}/${c.maxHp}` : sh.maxHp}, speed ${sh.speed} ft. ${ab}.
Proficient skills: ${[...sh.skillProfs, ...sh.expertise.map((x) => `${x} (expertise)`)].join(', ') || '—'}. Save proficiencies: ${sh.saveProfs.join(', ').toUpperCase() || '—'}.
Attacks: ${sh.attacks.map((a) => `${a.name} +${a.bonus} (${a.damage} ${a.type}${a.range ? `, range ${a.range[0]}/${a.range[1]}` : ''})`).join('; ')}${sh.attacksPerAction > 1 ? ` — ${sh.attacksPerAction} attacks per Attack action` : ''}.${spells}
Features: ${sh.features || '—'}
Inventory: ${sh.inventory || '—'}; Potions of Healing: ${c?.potions ?? sh.potions}`;
}

// ---------- DM ----------

const DM_TAGS = `GAME-ENGINE TAGS (the engine rolls all dice and applies all results; you NEVER roll or invent numbers):
[CHECK <character> <Skill> DC <n>]   e.g. [CHECK Mira Perception DC 15]   (add "adv" or "dis" if warranted)
[GROUP <Skill> DC <n>]               whole-party check, e.g. [GROUP Stealth DC 12]
[SAVE <character|party> <Ability> DC <n> dmg <dice> <type> half cond <condition>]   (dmg/half/cond optional), e.g. [SAVE party DEX DC 13 dmg 2d6 fire half]
[DAMAGE <character> <dice> <type>]   [HEAL <character> <dice>]   [CONDITION <character> <condition>]   [REMOVE <character> <condition>]
[COMBAT <Monster> xN, <Monster>; ally <Monster>]   starts combat with SRD monsters, e.g. [COMBAT Goblin x4, Bugbear]
[MOOD <tavern|town|travel|forest|dungeon|battle|boss|horror|mystery|sea|sacred|calm>]   [SCENE next]   [REST short|long]   [END] (session over)`;

export function dmSystem(c: Campaign, s: Session, g: GameState): string {
  const scene = s.scenes[g.sceneIndex];
  const npcIds = [...new Set(s.scenes.flatMap((x) => x.npcIds))];
  const npcs = npcIds.map((id) => c.npcs.find((n) => n.id === id)).filter(Boolean).map((n) => `- ${n!.name} (${n!.species} ${n!.role}; ${n!.personality}; wants: ${n!.want}; secret: ${n!.secret})${s.npcLines[n!.id] ? ` e.g. ${s.npcLines[n!.id].replace(/\n/g, ' ')}` : ''}`);
  const loc = (id?: string) => c.locations.find((l) => l.id === id)?.name ?? '';
  return `You are the Dungeon Master of a D&D 5e (2024 rules) game, playing live with the players below.

CAMPAIGN: ${c.title} — ${c.region.name}. Tone: ${c.tones.join(', ')}.
Villain (secret): ${c.villain.name}, ${c.villain.archetype}; wants ${c.villain.motivation}; plan: ${c.villain.plan}; weakness: ${c.villain.weakness}.

SESSION ${s.number}: ${s.title} (party level ~${s.level})
${s.recap ? `Recap: ${s.recap}\n` : ''}Strong start: ${s.strongStart}
Scenes (you are on scene ${g.sceneIndex + 1} of ${s.scenes.length}):
${s.scenes.map((sc, i) => `${i === g.sceneIndex ? '▶' : ' '} ${i + 1}. ${sc.title} [${sc.kind}${loc(sc.locationId) ? `, ${loc(sc.locationId)}` : ''}] — ${sc.purpose} Could end: ${sc.outcome}${sc.encounter ? ` Encounter: ${sc.encounter.monsters.map((m) => `${m.count}× ${m.name}`).join(', ')}.` : ''}${sc.readAloud ? `\n     Read-aloud: ${sc.readAloud.replace(/\n/g, ' ').slice(0, 500)}` : ''}`).join('\n')}
Current scene: ${scene ? scene.title : 'finale / wrap-up'}.
Secrets & clues to reveal when the players earn them:
${s.secrets.map((x) => `- ${x}`).join('\n')}
NPCs:
${npcs.join('\n') || '—'}

PLAYER CHARACTERS:
${g.sheets.map((sh) => `- ${sh.name}: ${sh.species} ${sh.cls} ${sh.level}. ${sh.hook ? `Hook: ${sh.hook}.` : ''}`).join('\n')}

HOW YOU RUN THE GAME:
- Narrate vividly but briefly (80-160 words), voice NPCs, then hand it back to the players: ask what they do, or react to what they just did.
- Never decide the outcome of an uncertain action yourself: call for a roll with a tag. The engine posts the result right after your message; narrate the consequence on your next turn.
- Never speak or decide for the player characters.
- Follow the scene plan, but improvise when the players go off-script; that is what a good DM does. Use [SCENE next] when a scene is resolved.
- Start fights with [COMBAT ...] using standard SRD monster names. The engine handles initiative, turns and damage.
- Reveal secrets and clues naturally when players investigate or talk to the right people.
- When the last scene is resolved, wrap up the session with a short cliffhanger and add [END].

${DM_TAGS}`;
}

export function dmExploreUser(g: GameState): string {
  const notes = g.directorNotes.length ? `\n\nPRIVATE DIRECTOR NOTES from the human running the app (follow them, don't mention them):\n${g.directorNotes.map((n) => `- ${n}`).join('\n')}` : '';
  const party = g.creatures.filter((c) => c.kind === 'pc').map((c) => creatureLine(c, undefined, true)).join('\n');
  return `TRANSCRIPT SO FAR:\n${transcript(g, 'dm') || '(the session is just starting: open with the recap and the strong start)'}\n\nPARTY STATUS:\n${party}${notes}\n\nYour turn as DM. Write your narration (with tags where needed).`;
}

export function dmMonsterTurn(g: GameState, m: Creature): string {
  const acts = m.attacks.map((a) => `- ${a.name}${a.hit !== undefined ? `: +${a.hit} to hit${a.reach ? `, reach ${a.reach} ft` : ''}${a.range ? `, range ${a.range[0]}/${a.range[1]} ft` : ''}` : ''}${a.dmg ? `, ${a.dmg.map(([d, t]) => `${d} ${t}`).join(' + ')}` : ''}${a.dc ? `, DC ${a.dc} ${a.save?.toUpperCase()} save${a.area ? `, ${a.area[1]}-ft ${a.area[0]}` : ''}` : ''}${a.recharge ? (m.used[a.name] ? ' (NOT recharged)' : ` (recharge ${a.recharge}-6, available)`) : ''}`).join('\n');
  const spells = m.spell ? `\nSpellcasting: DC ${m.spell.dc}, +${m.spell.hit} to hit. Known: ${m.spell.known.join(', ')}. Slots left: ${m.spell.slots.map((n, i) => (i && n ? `L${i}:${n}` : '')).filter(Boolean).join(' ') || 'none'}. Automated spells: ${SPELLS.filter((sp) => m.spell!.known.some((k) => k.toLowerCase() === sp.name.toLowerCase())).map((sp) => sp.name).join(', ') || 'none (others are adjudicated)'}` : '';
  const e = g.combat!.economy;
  return `COMBAT — round ${g.combat!.round}. It's ${m.name}'s turn (${m.monster}). You control it as the DM.
${m.name}: ${m.hp}/${m.maxHp} HP, AC ${m.ac}, speed ${m.speed} ft${m.conditions.length ? `, conditions: ${m.conditions.map((x) => x.name).join(', ')}` : ''}.
Actions:${m.multi ? `\n- MULTIATTACK: ${m.multiText ?? `${m.multi} attacks`}` : ''}
${acts}${spells}
Traits: ${m.traits.map(([n]) => n).join(', ') || '—'}

BATTLEFIELD (distances from ${m.name}):
${battlefield(g, m, true)}

Recent events:
${g.log.slice(-12).filter((x) => x.kind !== 'director').map(line).join('\n')}
${g.directorNotes.length ? `\nDirector notes: ${g.directorNotes.join('; ')}` : ''}

Remaining this turn: ${e.action ? 'action' : 'no action'}, ${e.bonus ? 'bonus action' : 'no bonus'}, ${e.move} ft movement.
Play it smart but fair: intelligent foes focus on threats and casters; beasts attack the nearest; creatures below a quarter HP may flee (MOVE: away from X).
Reply with ONE optional line "NARRATE: <one vivid sentence>", then commands, one per line, then END. Commands:
MOVE: toward <target> | MOVE: away from <target> | MOVE: to <square, e.g. F7>
MULTIATTACK: <target>        ATTACK: <target> with <attack name>
USE: <action name> on <target1>, <target2>   (save-based/area abilities)
CAST: <spell> on <target>    DASH | DODGE | DISENGAGE | HIDE
END`;
}

export function dmAdjudicate(g: GameState, what: string[]): string {
  return `Adjudicate these actions that the engine can't resolve automatically:
${what.map((w) => `- ${w}`).join('\n')}

BATTLEFIELD:
${battlefield(g, undefined, true)}

Reply with at most two sentences of narration plus the tags that apply the effects: [SAVE ...], [DAMAGE ...], [HEAL ...], [CONDITION ...], [CHECK ...]. If the action simply isn't possible, say so without tags.
${DM_TAGS}`;
}

// ---------- players ----------

export function playerSystem(g: GameState, sh: PcSheet): string {
  return `You are a player at a D&D 5e (2024 rules) table, playing ${sh.name}. Play ONLY ${sh.name}.
Personality: ${sh.personality || 'decide from the class and backstory, and stay consistent'}.
Backstory hook: ${sh.hook || '—'}.

CHARACTER SHEET:
${sheetSummary(sh, g.creatures.find((c) => c.sheetId === sh.id))}

How to play:
- Stay in character and be a good table-mate: pursue your goals, engage with NPCs and the other characters, take smart risks.
- Never narrate outcomes or roll dice: say what you attempt, the DM and the engine decide.
- Keep it short. Don't repeat what others said.`;
}

export function playerExploreUser(g: GameState, sh: PcSheet): string {
  const others = g.sheets.filter((x) => x.id !== sh.id).map((x) => `${x.name} (${x.species} ${x.cls})`).join(', ');
  return `Other characters: ${others || 'none'}.

TRANSCRIPT SO FAR:
${transcript(g, 'player')}

It's your moment. Reply with 1-3 lines:
SAY: "what ${sh.name} says"
DO: what ${sh.name} tries to do (optional)`;
}

export function playerCombatUser(g: GameState, sh: PcSheet, me: Creature): string {
  const e = g.combat!.economy;
  const known = me.spell ? me.spell.known.join(', ') : '';
  return `COMBAT — round ${g.combat!.round}. It's YOUR turn (${sh.name}).
You: ${me.hp}/${me.maxHp} HP, AC ${me.ac}${me.conditions.length ? `, conditions: ${me.conditions.map((x) => x.name).join(', ')}` : ''}${me.concentration ? `, concentrating on ${me.concentration.spell}` : ''}.
Remaining this turn: ${e.action ? 'action' : 'NO action'}, ${e.bonus ? 'bonus action' : 'NO bonus action'}, ${e.move} ft movement${e.attacksLeft > 0 ? `, ${e.attacksLeft} attacks left in your Attack action` : ''}.
Your attacks: ${me.attacks.map((a) => `${a.name} (+${a.hit}${a.reach ? `, reach ${a.reach}` : ''}${a.range ? `, range ${a.range[0]}/${a.range[1]}` : ''})`).join('; ')}${(me.multi ?? 1) > 1 ? ` — ${me.multi} attacks per Attack action` : ''}.
${me.spell ? `Spells: ${known}. Slots left: ${me.spell.slots.map((n, i) => (i && n ? `L${i}:${n}` : '')).filter(Boolean).join(' ') || 'none (cantrips only)'}.` : ''}
Features: ${sh.features || '—'}. Potions of Healing: ${me.potions}.

BATTLEFIELD (distances from you):
${battlefield(g, me, false)}

Recent events:
${g.log.slice(-10).filter((x) => !x.dmOnly).map(line).join('\n')}

Choose your turn. Reply with commands, one per line, then END:
SAY: "short battle line" (optional)
MOVE: toward <target> [N ft]  |  MOVE: away from <target>  |  MOVE: to <square, e.g. F7>
ATTACK: <target> with <weapon>   (repeat the line for each attack you get; add "+ Sneak Attack" etc. if a feature applies)
CAST: <spell> [at level N] on <target>[, <target2>]   (area spells: CAST Fireball at <square> — it hits EVERYONE in the area, allies too)
BONUS: <a bonus-action command>, e.g. BONUS: CAST Healing Word on <ally> | BONUS: DASH (Cunning Action)
FEATURE: <feature name> [on <target>]   (Second Wind, Rage, Action Surge, Lay on Hands 10…)
DODGE | DISENGAGE | HIDE | DASH | HELP: <ally> | POTION [: <ally>] | SHOVE: <target> | GRAPPLE: <target>
END
Rules reminder: melee needs you within reach (5 ft); moving out of an enemy's reach provokes an opportunity attack unless you DISENGAGE. Walls block movement and sight; obstacles give cover (+2/+5 AC); difficult terrain costs double. Hiding needs three-quarters cover or being out of sight. Unconscious allies need healing fast.`;
}

export const isHelpless = (c: Creature) => isDown(c) || has(c, 'unconscious');
export { sheetOf };
