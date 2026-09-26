// Converts SRD monster data into the compact format the play engine uses.
// Source: npm package @adkinn/fifth-edition-srd-mcp@1.4.0 (data/monsters.json), which
// republishes Open5e's "wotc-srd" document: the D&D System Reference Document 5.1
// by Wizards of the Coast LLC, licensed under CC-BY-4.0.
// Usage: node scripts/build-srd.mjs path/to/monsters.json > src/data/srd/monsters.json
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const ABIL = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

function parseAction(a) {
  const d = a.description ?? '';
  const out = { n: a.name, t: d };
  if (a.attack_bonus !== undefined) out.hit = a.attack_bonus;
  if (a.damage?.length) out.dmg = a.damage.map((x) => [x.dice.replace(/\+0$/, ''), x.type]);
  const reach = d.match(/reach (\d+) ft/); if (reach) out.reach = +reach[1];
  const range = d.match(/range (\d+)\/(\d+) ft/); if (range) out.range = [+range[1], +range[2]];
  const save = d.match(/DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
  if (save) {
    out.dc = +save[1];
    out.save = ABIL[save[2].toLowerCase()];
    if (/half as much damage/i.test(d)) out.half = 1;
  }
  const rech = a.name.match(/Recharge (\d)/); if (rech) out.recharge = +rech[1];
  const area = d.match(/(\d+)-foot[- ](cone|line|cube|sphere|radius)/i); if (area) out.area = [area[2].toLowerCase(), +area[1]];
  const cond = d.match(/(?:be|become|is) (blinded|charmed|deafened|frightened|grappled|incapacitated|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)/i);
  if (cond) out.cond = cond[1].toLowerCase();
  return out;
}

const monsters = raw.monsters.map((m) => {
  const sb = m.stat_block_json;
  const acts = (sb.actions ?? []).map(parseAction);
  const multi = (sb.actions ?? []).find((a) => /^multiattack/i.test(a.name));
  const mt = multi?.description.match(/makes (one|two|three|four|five|six) /i);
  return {
    name: m.name,
    cr: m.cr_numeric,
    type: m.type,
    size: m.size,
    ac: m.armor_class,
    hp: m.hp_max,
    hpDice: m.hp_formula,
    speed: sb.speed?.walk ?? 30,
    fly: sb.speed?.fly,
    ab: sb.ability_scores,
    saves: sb.saving_throws,
    init: m.initiative_modifier,
    res: sb.damage_resistances,
    imm: sb.damage_immunities,
    vul: sb.damage_vulnerabilities,
    cimm: sb.condition_immunities,
    multi: mt ? NUM[mt[1].toLowerCase()] : undefined,
    multiText: multi?.description,
    actions: acts.filter((a) => !/^multiattack/i.test(a.n)),
    traits: (sb.traits ?? []).map((t) => [t.name, t.description]),
    legendary: sb.legendary_actions?.actions?.map((a) => [a.name, a.description, a.cost ?? 1]),
    reactions: (sb.reactions ?? []).map((r) => [r.name, r.description]),
  };
});

process.stdout.write(JSON.stringify({
  attribution: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. Converted to a compact format.',
  monsters,
}));
