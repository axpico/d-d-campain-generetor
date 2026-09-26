// Magic item references (names from the D&D 2024 SRD 5.2, CC-BY-4.0).
export const ITEMS: Record<string, string[]> = {
  Common: ['Potion of Healing', 'Spell Scroll (Cantrip)', 'Driftglobe', 'Cloak of Many Fashions', 'Moon-Touched Sword', 'Candle of the Deep', 'Mystery Key', 'Clockwork Amulet'],
  Uncommon: ['Bag of Holding', 'Boots of Elvenkind', 'Cloak of Protection', 'Gloves of Thievery', 'Immovable Rod', 'Pearl of Power', 'Weapon +1',
    'Wand of Magic Missiles', 'Sending Stones', 'Goggles of Night', 'Potion of Greater Healing', 'Ring of Jumping', 'Sword of Vengeance', 'Alchemy Jug'],
  Rare: ['Armor +1', 'Belt of Dwarvenkind', 'Cape of the Mountebank', 'Flame Tongue', 'Necklace of Fireballs', 'Ring of Protection', 'Weapon +2',
    'Wand of Fireballs', 'Cloak of Displacement', 'Boots of Speed', 'Potion of Superior Healing', 'Staff of Healing', 'Ring of Evasion'],
  'Very Rare': ['Armor +2', 'Weapon +3', 'Manual of Bodily Health', 'Staff of Power', 'Carpet of Flying', 'Dancing Sword', 'Oathbow',
    'Ring of Regeneration', 'Cloak of Arachnida', 'Potion of Supreme Healing'],
  Legendary: ['Holy Avenger', 'Vorpal Sword', 'Ring of Three Wishes', 'Staff of the Magi', 'Cloak of Invisibility', 'Armor of Invulnerability', 'Sphere of Annihilation'],
};

export const TRINKETS = [
  'a silver locket with a stranger\'s portrait', 'a map fragment inked on leather', 'a pouch of foreign coins',
  'a jeweled goblet', 'an ivory chess piece', 'a signet ring of a fallen house', 'a gem that is warm to the touch',
  'a letter sealed with black wax', 'a music box that plays a lullaby', 'a crown of copper leaves',
];

/** Weighted rarity by party level. */
export function rarityWeights(level: number): { value: string; weight: number }[] {
  if (level <= 4) return [{ value: 'Common', weight: 5 }, { value: 'Uncommon', weight: 5 }, { value: 'Rare', weight: 1 }];
  if (level <= 10) return [{ value: 'Uncommon', weight: 5 }, { value: 'Rare', weight: 4 }, { value: 'Very Rare', weight: 1 }];
  if (level <= 16) return [{ value: 'Rare', weight: 5 }, { value: 'Very Rare', weight: 4 }, { value: 'Legendary', weight: 1 }];
  return [{ value: 'Very Rare', weight: 5 }, { value: 'Legendary', weight: 3 }];
}
