// AI writing for sessions: recap, strong start, read-aloud text, NPC lines, clues —
// and adapting a planned session to what actually happened at the table (play log).
import type { Campaign, Session } from '../lib/types';
import { chat, parseBlocks, type LlmSettings } from './llm';
import { aliases, FORMAT, skeleton, SYSTEM, type ExpandCallbacks } from './expand';

function history(c: Campaign, upTo: Session): string {
  const played = c.sessions.filter((s) => s.number < upTo.number && (s.playLog?.trim() || s.status === 'played'));
  if (!played.length) return 'No sessions have been played yet.';
  return played.map((s) => `Session ${s.number} "${s.title}": ${s.playLog?.trim() || '(played as planned)'}`).join('\n');
}

export async function writeSession(s: LlmSettings, c: Campaign, session: Session, cb: ExpandCallbacks = {}): Promise<Session> {
  const al = aliases(c);
  const npc = (id: string) => c.npcs.find((n) => n.id === id);
  const loc = (id?: string) => c.locations.find((l) => l.id === id)?.name;
  const act = c.acts.find((a) => a.id === session.actId);
  const prev = c.sessions.filter((x) => x.number < session.number).at(-1);
  const deviated = !!prev?.playLog?.trim();

  const npcIds = [...new Set(session.scenes.flatMap((sc) => sc.npcIds))].filter((id) => npc(id));
  const plan = {
    number: session.number,
    act: act ? `Act ${act.number}: ${act.title}` : undefined,
    level: session.level,
    title: session.title,
    strong_start: session.strongStart,
    scenes: session.scenes.map((sc, i) => ({
      key: `S${i + 1}`, title: sc.title, kind: sc.kind, where: loc(sc.locationId), purpose: sc.purpose, outcome: sc.outcome,
      npcs: sc.npcIds.map((id) => npc(id)?.name), enemies: sc.encounter?.monsters.map((m) => `${m.count}× ${m.name}`).join(', '),
    })),
    secrets_and_clues: session.secrets,
  };

  const adaptBlock = deviated
    ? `The players did NOT necessarily follow the plan. Rewrite this session so it follows naturally from what actually happened (see history).
You may change scene titles and purposes. For each scene you change, add blocks "@@S1.TITLE" and "@@S1.PURPOSE" (one line each).
Also add "@@CHANGES": 2-4 bullet points telling the DM what you changed and why.`
    : 'Keep the planned structure.';

  const task = `Prepare session ${session.number} for a 3-4 hour game night.

SESSION HISTORY (what really happened at the table):
${history(c, session)}

PLANNED SESSION:
${JSON.stringify(plan)}

${adaptBlock}

Write these blocks:
@@TITLE — an evocative session title (one line).
@@RECAP — "Previously…": 80-120 words to read to the players, based on the session history (if none, a short teaser of the campaign premise).
@@STRONG_START — 80-120 words of read-aloud text that drops the players straight into action or tension.
${session.scenes.map((_, i) => `@@S${i + 1} — boxed read-aloud text for scene S${i + 1} (60-110 words, second person, sensory), then a line "DM:" with 1-2 sentences of running advice.`).join('\n')}
${npcIds.map((id) => `@@${al.toAlias.get(id)} — 2-3 lines of sample dialogue for ${npc(id)?.name}, in their voice.`).join('\n')}
@@SECRETS — 8 secrets and clues the party can discover this session, one per line starting with "- ", connected to the campaign.`;

  const text = await chat(s, [
    { role: 'system', content: `${SYSTEM}\n\n${FORMAT}` },
    { role: 'user', content: `Campaign skeleton:\n${JSON.stringify(skeleton(c, al))}\n\n${task}\n\nRemember: "@@KEY" blocks only, no JSON.` },
  ], { maxTokens: 5000, signal: cb.signal, onDelta: cb.onDelta });

  const raw = parseBlocks(text);
  const b: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) b[k.toUpperCase()] = v;
  if (!Object.keys(b).length) throw new Error('The model reply had no "@@" blocks. Try again, or pick a different model.');

  const firstLine = (x?: string) => x?.split('\n')[0].replace(/^["*#\s]+|["*\s]+$/g, '');
  const npcLines: Record<string, string> = { ...session.npcLines };
  for (const id of npcIds) {
    const alias = al.toAlias.get(id);
    if (alias && b[alias]) npcLines[id] = b[alias];
  }
  const secrets = b.SECRETS
    ? b.SECRETS.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l.length > 5)
    : session.secrets;

  return {
    ...session,
    title: firstLine(b.TITLE) || session.title,
    recap: b.RECAP ?? session.recap,
    strongStart: b.STRONG_START ?? session.strongStart,
    scenes: session.scenes.map((sc, i) => {
      const k = `S${i + 1}`;
      return {
        ...sc,
        readAloud: b[k] ?? sc.readAloud,
        title: deviated ? firstLine(b[`${k}.TITLE`]) || sc.title : sc.title,
        purpose: deviated ? b[`${k}.PURPOSE`]?.trim() || sc.purpose : sc.purpose,
      };
    }),
    secrets: secrets.length >= 3 ? secrets : session.secrets,
    npcLines,
    adapted: deviated || session.adapted,
    aiNotes: b.CHANGES ?? session.aiNotes,
  };
}
