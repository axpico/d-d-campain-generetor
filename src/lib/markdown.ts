import type { Campaign, Encounter, LootItem } from './types';
import { blobToDataUrl, imagesDb } from './storage';
import { TONES } from '../data/story';

async function imageMd(id: string | undefined, alt: string, embed: boolean): Promise<string> {
  if (!id) return '';
  const img = await imagesDb.get(id);
  if (!img) return '';
  if (img.url) return `![${alt}](${img.url})\n\n`;
  if (img.blob && embed) return `![${alt}](${await blobToDataUrl(img.blob)})\n\n`;
  return '';
}

const enc = (e: Encounter) =>
  `- **${e.title}** — ${e.difficulty}, ${e.xp}/${e.budget} XP (level ${e.level})\n` +
  e.monsters.map((m) => `  - ${m.count} × ${m.name} (CR ${m.cr}, ${m.xp} XP each)`).join('\n') +
  `\n  - *Twist:* ${e.twist}` + (e.note ? `\n  - *Note:* ${e.note}` : '');

const loot = (l: LootItem[]) => l.map((i) => `${i.name}${i.rarity !== 'Coins' ? ` (${i.rarity})` : ''}${i.note ? ` ${i.note}` : ''}`).join(', ');

export async function campaignToMarkdown(c: Campaign, embedImages: boolean): Promise<string> {
  const npc = (id?: string) => c.npcs.find((n) => n.id === id)?.name ?? '—';
  const loc = (id?: string) => c.locations.find((l) => l.id === id)?.name;
  const fac = (id?: string) => c.factions.find((f) => f.id === id)?.name;
  const out: string[] = [];

  out.push(`# ${c.title}\n`);
  out.push(`*${c.tones.map((t) => TONES.find((x) => x.id === t)?.label).join(' · ')} — Levels ${c.options.startLevel}–${c.options.endLevel}, ${c.options.partySize} players — ${c.region.name}*\n`);
  out.push(`Seed: \`${c.options.seed}\`\n`);
  out.push(await imageMd(c.mapImageId, `Map of ${c.region.name}`, embedImages));
  out.push(`## Pitch\n\n${c.pitch}\n`);

  const v = c.villain;
  out.push(`## Villain: ${v.name}\n`);
  out.push(await imageMd(v.imageId, v.name, embedImages));
  out.push(`- **Archetype:** ${v.archetype} (${v.species}); use the *${v.statBlock}* stat block\n- **Motivation:** ${v.motivation}\n- **Plan:** ${v.plan}\n- **Weakness:** ${v.weakness}\n- **Lair:** ${v.lair}\n- **Appearance:** ${v.appearance}\n- **Lieutenants:** ${v.lieutenants.map(npc).join(', ')}\n`);
  if (v.description) out.push(`${v.description}\n`);

  out.push(`## Acts\n`);
  for (const a of c.acts) {
    out.push(`### Act ${a.number}: ${a.title} (levels ${a.levels[0]}–${a.levels[1]})\n`);
    out.push(`${a.summary}\n`);
    if (a.description) out.push(`${a.description}\n`);
    out.push(`- **Hook:** ${a.hook}\n- **Goals:** ${a.goals.join('; ')}\n- **Locations:** ${a.locationIds.map(loc).join(', ')}\n- **NPCs:** ${a.npcIds.map(npc).join(', ')}\n- **Climax:** ${a.climax}\n- **Rewards:** ${loot(a.loot)}\n`);
    out.push(`#### Encounters\n\n${a.encounters.map(enc).join('\n')}\n`);
  }

  out.push(`## Factions\n`);
  for (const f of c.factions) {
    out.push(`### ${f.name} (${f.attitude})\n`);
    out.push(await imageMd(f.imageId, f.name, embedImages));
    out.push(`- **Type:** ${f.kind}\n- **Goal:** ${f.goal}\n- **Methods:** ${f.method}\n- **Symbol:** ${f.symbol}\n- **Leader:** ${npc(f.leaderId)}\n`);
    if (f.description) out.push(`${f.description}\n`);
  }

  out.push(`## NPCs\n`);
  for (const n of c.npcs) {
    out.push(`### ${n.name}: ${n.species} ${n.role} (${n.attitude})\n`);
    out.push(await imageMd(n.imageId, n.name, embedImages));
    out.push(`- **Personality:** ${n.personality}; *quirk:* ${n.quirk}\n- **Appearance:** ${n.appearance}\n- **Wants:** ${n.want}\n- **Secret:** ${n.secret}\n` +
      (loc(n.locationId) ? `- **Found at:** ${loc(n.locationId)}\n` : '') + (fac(n.factionId) ? `- **Faction:** ${fac(n.factionId)}\n` : ''));
    if (n.description) out.push(`${n.description}\n`);
  }

  out.push(`## Locations\n`);
  for (const l of c.locations) {
    out.push(`### ${l.name} (${l.kind}, ${l.terrain})\n`);
    out.push(await imageMd(l.imageId, l.name, embedImages));
    out.push(`${l.summary}. Notable: ${l.features.join('; ')}.\n`);
    if (l.description) out.push(`${l.description}\n`);
    if (l.town) {
      out.push(`**Key buildings:** ${l.town.buildings.filter((b) => b.name !== b.kind || b.npcId).map((b) => `${b.name}${b.npcId ? ` (${npc(b.npcId)})` : ''}`).join(', ')}\n`);
    }
    if (l.dungeon) {
      const d = l.dungeon;
      out.push(`#### Dungeon (${d.theme}, level ${d.level})\n\n${d.history}\n`);
      for (const r of d.rooms) {
        out.push(`**${r.id}. ${r.name}.** ${r.feature}. ${r.contents} Exits: ${r.exits.join(', ') || 'none'}.` +
          (r.trap ? ` *Trap:* ${r.trap}` : '') + (r.treasure ? ` *Treasure:* ${loot(r.treasure)}.` : '') + '\n');
        if (r.encounter) out.push(enc(r.encounter) + '\n');
      }
    }
  }

  out.push(`## Rumors\n\n${c.rumors.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`);
  out.push(`---\n*Generated with D&D Campaign Generator. Monster and magic item names reference the System Reference Document 5.2 by Wizards of the Coast LLC, licensed under CC-BY-4.0.*\n`);
  return out.filter(Boolean).join('\n');
}

export function download(filename: string, content: string | Blob, type = 'text/markdown') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
