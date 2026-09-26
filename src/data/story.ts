// Story tables. Original content. Templates use {tokens} filled by gen/fill.ts.
import type { Tone } from '../lib/types';

export const TONES: { id: Tone; label: string; blurb: string }[] = [
  { id: 'heroic', label: 'Heroic / Epic', blurb: 'Clear stakes, rising heroes, world-saving deeds.' },
  { id: 'dark', label: 'Dark / Horror', blurb: 'Dread, corruption, things that should stay buried.' },
  { id: 'intrigue', label: 'Intrigue / Political', blurb: 'Courts, spies, shifting loyalties.' },
  { id: 'exploration', label: 'Exploration / Sandbox', blurb: 'Uncharted lands, ruins, the journey itself.' },
  { id: 'comedic', label: 'Comedic / Lighthearted', blurb: 'Absurd situations, lovable rogues, low grimness.' },
  { id: 'mystery', label: 'Mystery / Investigation', blurb: 'Clues, suspects, a truth to uncover.' },
  { id: 'war', label: 'War / Military', blurb: 'Armies, sieges, hard choices at the front.' },
  { id: 'nautical', label: 'Nautical / Pirates', blurb: 'Ships, islands, storms and plunder.' },
  { id: 'planar', label: 'Planar / Cosmic', blurb: 'Other planes, gods, reality fraying at the edges.' },
  { id: 'survival', label: 'Survival / Wilderness', blurb: 'Scarce resources, harsh land, every day a fight.' },
];

export const ART_STYLES = [
  { id: 'painterly', label: 'Painterly fantasy', prompt: 'detailed fantasy oil painting, dramatic lighting, rich colors, concept art' },
  { id: 'ink', label: 'Ink sketch', prompt: 'black ink sketch, crosshatching, old bestiary illustration, parchment background' },
  { id: 'dark', label: 'Dark gothic', prompt: 'dark gothic oil painting, chiaroscuro, muted palette, eerie atmosphere' },
  { id: 'watercolor', label: 'Watercolor', prompt: 'soft watercolor illustration, storybook style, gentle colors' },
  { id: 'anime', label: 'Anime', prompt: 'anime style illustration, clean lineart, cel shading, vibrant' },
  { id: 'pixel', label: 'Pixel art', prompt: '16-bit pixel art, limited palette, retro RPG style' },
  { id: 'comic', label: 'Comic book', prompt: 'comic book art, bold inks, flat colors, dynamic pose' },
  { id: 'realistic', label: 'Cinematic realistic', prompt: 'cinematic photorealistic fantasy, 35mm, depth of field' },
] as const;

// Themes per tone — used for the campaign pitch.
export const TONE_THEMES: Record<Tone, string[]> = {
  heroic: ['destiny and sacrifice', 'a fallen kingdom reborn', 'the last line against darkness', 'ancient heroes returning'],
  dark: ['a curse spreading through bloodlines', 'faith rotting from within', 'the dead refusing to rest', 'bargains that cost more than gold'],
  intrigue: ['a succession crisis', 'a guild war in the shadows', 'an empire built on a lie', 'a masked conspiracy at court'],
  exploration: ['a newly surfaced continent', 'the map that rewrites history', 'ruins of a vanished empire', 'a frontier no one returns from'],
  comedic: ['a prophecy that got the details wrong', 'the worst adventuring charter ever signed', 'a wizard\'s escaped experiments', 'a festival that must not be cancelled'],
  mystery: ['a string of impossible deaths', 'a city that forgets one day each week', 'a stolen name', 'a saint who never existed'],
  war: ['a border war on the brink', 'mercenaries caught between crowns', 'a siege that has lasted a generation', 'an army of the returned dead'],
  nautical: ['a sunken god stirring', 'a pirate republic on the rise', 'islands that move with the tide', 'the map to the Drowned Crown'],
  planar: ['a tear between worlds', 'a god gone missing', 'a city adrift between planes', 'stars going out one by one'],
  survival: ['an endless winter', 'a plague of hunger', 'the land itself turning hostile', 'an exodus through the wastes'],
};

export const VILLAIN_ARCHETYPES: { name: string; statBlock: string; tones: Tone[] }[] = [
  { name: 'lich seeking apotheosis', statBlock: 'Lich', tones: ['dark', 'heroic', 'planar'] },
  { name: 'vampire noble', statBlock: 'Vampire', tones: ['dark', 'intrigue', 'mystery'] },
  { name: 'fallen paladin', statBlock: 'Death Knight', tones: ['heroic', 'dark', 'war'] },
  { name: 'ancient dragon', statBlock: 'Adult Red Dragon', tones: ['heroic', 'exploration', 'war'] },
  { name: 'hag coven matriarch', statBlock: 'Green Hag', tones: ['dark', 'mystery', 'survival'] },
  { name: 'usurper chancellor', statBlock: 'Archmage', tones: ['intrigue', 'war', 'mystery'] },
  { name: 'cult prophet', statBlock: 'Cultist Fanatic', tones: ['dark', 'mystery', 'planar'] },
  { name: 'warlord conqueror', statBlock: 'Gladiator', tones: ['war', 'heroic', 'survival'] },
  { name: 'pirate queen', statBlock: 'Bandit Captain', tones: ['nautical', 'comedic', 'intrigue'] },
  { name: 'aboleth dreaming beneath the sea', statBlock: 'Aboleth', tones: ['nautical', 'dark', 'planar'] },
  { name: 'fiendish contract-broker', statBlock: 'Horned Devil', tones: ['planar', 'intrigue', 'dark'] },
  { name: 'mad artificer', statBlock: 'Iron Golem', tones: ['comedic', 'exploration', 'mystery'] },
  { name: 'fey lord of a stolen season', statBlock: 'Oni', tones: ['survival', 'dark', 'comedic'] },
  { name: 'shapechanger in the royal court', statBlock: 'Doppelganger', tones: ['intrigue', 'mystery'] },
  { name: 'frost giant jarl', statBlock: 'Frost Giant', tones: ['survival', 'war', 'exploration'] },
  { name: 'mummy lord of a buried dynasty', statBlock: 'Mummy Lord', tones: ['exploration', 'dark', 'heroic'] },
  { name: 'rogue angel', statBlock: 'Planetar', tones: ['planar', 'heroic', 'dark'] },
  { name: 'merchant prince', statBlock: 'Spy', tones: ['intrigue', 'comedic', 'nautical'] },
];

export const MOTIVATIONS = [
  'to resurrect a lost love, no matter the cost',
  'to end death itself',
  'to reclaim a throne stolen centuries ago',
  'revenge against the order that exiled them',
  'to prove the gods are frauds',
  'to save the world from a threat only they can see',
  'hunger — for power, for souls, for more',
  'to rewrite history so their people never fell',
  'to become a god',
  'to free an imprisoned patron',
  'to impose perfect order on a chaotic world',
  'to erase a shameful secret from every mind',
  'to win a wager made with a being far older',
  'to protect their kin by any means necessary',
];

export const PLANS = [
  'gather {n} relics scattered across {region} to open a sealed gate',
  'poison the ley lines beneath {place}, one shrine at a time',
  'place puppets on every council seat before the coronation',
  'raise an army from the battlefields of the last war',
  'steal the true names of the region\'s guardians',
  'drown {place} and raise a new kingdom from the waves',
  'trigger a war between {faction} and its rivals, then pick up the pieces',
  'complete a ritual at the next eclipse, now {n} months away',
  'breed a plague that only their followers can survive',
  'unmake the oath that binds the old dragons to sleep',
  'buy up every debt in the region and call them all in at once',
  'replace key leaders with perfect duplicates',
];

export const WEAKNESSES = [
  'their phylactery is hidden inside a child\'s toy',
  'they cannot cross running water',
  'they still love someone the party can reach',
  'their power is bound to a relic that can be stolen',
  'their lieutenants are one betrayal away from turning',
  'they must keep a promise they made long ago',
  'their true name is written in a forgotten library',
  'the ritual fails if a specific bell is rung',
  'their arrogance: they always monologue before striking',
  'they are dying and racing a clock of their own',
];

export const LAIRS = [
  'a cathedral sunk into a crater', 'a fortress built from the bones of a titan', 'an inverted tower beneath a lake',
  'a palace that exists only at dusk', 'a ship-city anchored over an abyss', 'a clockwork citadel',
  'a necropolis under the capital', 'a glacier with a heart of fire', 'a garden where it is always autumn',
  'an observatory on a floating rock',
];

export const APPEARANCE = [
  'scarred face and a calm, unsettling smile', 'tall and gaunt with ink-stained fingers', 'broad-shouldered, missing two fingers',
  'bright clothes and too many rings', 'silver hair braided with charms', 'eyepatch and a booming laugh',
  'moves with a limp and a jeweled cane', 'freckled, restless, always eating', 'immaculate robes, never blinks enough',
  'weathered skin and a sailor\'s tattoos', 'wears mourning black, always', 'glowing tattoos along both arms',
  'a voice far deeper than their frame suggests', 'burn scars, hood always up', 'elegant, with a porcelain mask',
];

export const NPC_ROLES: { role: string; kind: 'town' | 'wild' | 'any' }[] = [
  { role: 'innkeeper', kind: 'town' }, { role: 'blacksmith', kind: 'town' }, { role: 'priest', kind: 'town' },
  { role: 'town guard captain', kind: 'town' }, { role: 'merchant', kind: 'town' }, { role: 'noble heir', kind: 'town' },
  { role: 'thieves\' guild fixer', kind: 'town' }, { role: 'sage', kind: 'town' }, { role: 'mayor', kind: 'town' },
  { role: 'alchemist', kind: 'town' }, { role: 'bard', kind: 'any' }, { role: 'ranger', kind: 'wild' },
  { role: 'hermit', kind: 'wild' }, { role: 'retired adventurer', kind: 'any' }, { role: 'smuggler', kind: 'any' },
  { role: 'bounty hunter', kind: 'any' }, { role: 'druid', kind: 'wild' }, { role: 'cartographer', kind: 'any' },
  { role: 'healer', kind: 'any' }, { role: 'mercenary captain', kind: 'any' }, { role: 'ship captain', kind: 'any' },
  { role: 'court wizard', kind: 'town' }, { role: 'spy', kind: 'town' }, { role: 'gravedigger', kind: 'town' },
];

export const PERSONALITIES = [
  'cheerful and nosy', 'gruff but fair', 'paranoid', 'melancholic', 'boastful', 'deeply pious', 'sarcastic',
  'shy and precise', 'greedy but honest about it', 'reckless', 'warm and motherly', 'cold and calculating',
  'idealistic', 'world-weary', 'flirtatious', 'superstitious', 'pedantic', 'jovial', 'bitter', 'curious',
];

export const QUIRKS = [
  'collects teeth', 'speaks in the third person', 'hums constantly', 'never sits with back to a door',
  'always carries a cat', 'counts coins compulsively', 'quotes a holy book, wrongly', 'is terrified of birds',
  'tells the same joke every time', 'writes everything down', 'bets on anything', 'insists on proper titles',
  'smells faintly of smoke', 'cannot lie without sneezing', 'names their weapons', 'whittles while talking',
];

export const SECRETS = [
  'works for {villain} out of fear', 'is the lost heir of {place}', 'murdered their predecessor',
  'is in debt to {faction}', 'is secretly a werewolf', 'knows where the missing relic is hidden',
  'is a deserter from the last war', 'is informing on the party', 'has a forbidden romance with a {faction} member',
  'is not who they claim to be', 'witnessed {villain}\'s first crime', 'forges documents for anyone who pays',
  'has a twin nobody knows about', 'stole their fortune from a temple', 'is dying and hiding it',
];

export const WANTS = [
  'wants revenge on {villain}', 'wants to leave {place} forever', 'wants their child back', 'wants a seat on the council',
  'wants to pay off a debt', 'wants to find a legendary recipe', 'wants to be remembered', 'wants the party to fail',
  'wants to protect their business', 'wants proof the old gods exist', 'wants a map of the ruins', 'wants peace and quiet',
];

export const FACTION_KINDS = [
  'knightly order', 'thieves\' guild', 'merchant league', 'secret cult', 'druid circle', 'mercenary company',
  'noble house', 'arcane college', 'rebel movement', 'pirate fleet', 'temple', 'monster-hunter lodge',
  'smugglers\' ring', 'royal inquisition', 'explorers\' society',
];

export const FACTION_ADJ = ['Silver', 'Crimson', 'Veiled', 'Ashen', 'Golden', 'Iron', 'Twilight', 'Hollow', 'Emerald', 'Black', 'Sunlit', 'Broken', 'Last', 'Seventh'];
export const FACTION_NOUN = ['Hand', 'Circle', 'Lantern', 'Crown', 'Rose', 'Wolves', 'Covenant', 'Chain', 'Compass', 'Serpent', 'Oath', 'Tide', 'Eye', 'Anvil'];
export const FACTION_PREFIX = ['The Order of the', 'The', 'The Brotherhood of the', 'The Society of the', 'The Company of the', 'House of the'];

export const FACTION_GOALS = [
  'control trade through {place}', 'destroy {villain}', 'recover a lost relic', 'overthrow the current ruler',
  'protect the old forest', 'hoard forbidden knowledge', 'keep the peace at any cost', 'profit from the coming war',
  'awaken their sleeping patron', 'map the unexplored lands', 'purge all magic from the realm', 'restore an ancient bloodline',
];

export const FACTION_METHODS = [
  'bribery and blackmail', 'open force', 'careful diplomacy', 'assassination', 'charity and propaganda',
  'infiltration', 'arcane rituals', 'trade monopolies', 'hiring adventurers', 'fear and intimidation',
];

export const FACTION_SYMBOLS = [
  'a lantern inside a closed fist', 'a coiled silver serpent', 'a broken crown', 'an eye within a sunburst',
  'three crossed keys', 'a black rose', 'an anvil struck by lightning', 'a wolf\'s head on red', 'a compass with no north',
  'an hourglass full of ash', 'a hooded moon', 'an oak tree with golden roots',
];

export const TERRAINS = ['forest', 'mountains', 'hills', 'swamp', 'coast', 'desert', 'tundra', 'plains', 'ruins', 'underdark'] as const;

export const LOCATION_SUMMARIES: Record<string, string[]> = {
  village: [
    'a farming village where the harvest keeps failing', 'a fishing hamlet built on stilts',
    'a mining village sitting on something that hums at night', 'a village where every door is painted with warding sigils',
    'a crossroads village of inns and gossip', 'a village of retired soldiers who don\'t talk about the war',
  ],
  town: [
    'a walled market town famous for its fairs', 'a river town controlled by a toll-lord', 'a pilgrim town around a weeping statue',
    'a frontier town full of prospectors', 'a lumber town at the edge of a haunted wood', 'a town rebuilt on top of its own ruins',
  ],
  city: [
    'a capital of spires and slums', 'a port city ruled by merchant princes', 'a city carved into a canyon wall',
    'a city under martial law', 'a university city where magic is currency', 'a holy city with a buried heresy',
  ],
  fortress: [
    'a border fortress that hasn\'t heard from the capital in months', 'a mountain keep of a proud dwarven clan',
    'a crumbling watchtower held by a handful of loyalists', 'a fortress-monastery of warrior monks',
  ],
  wilderness: [
    'a forest where the trees whisper names', 'a salt flat littered with giant bones', 'a mist-choked marsh with drowned bells',
    'a mountain pass guarded by statues', 'a sea of grass hiding an old battlefield', 'a frozen lake with something beneath the ice',
  ],
  landmark: [
    'a standing-stone circle that aligns with the stars', 'a colossal broken statue of a forgotten king', 'a tree that bleeds silver sap',
    'a crater with a still-warm heart', 'a bridge that crosses to nowhere', 'a lighthouse whose flame never dies',
  ],
  dungeon: [
    'a collapsed temple swallowed by roots', 'an abandoned dwarven mine', 'the crypt beneath an old abbey',
    'a wizard\'s tower sunk into the earth', 'a smugglers\' cave network', 'a vault of a vanished empire',
    'a flooded sewer labyrinth', 'a prison built for a single inmate',
  ],
};

export const LOCATION_FEATURES = [
  'a shrine to a forgotten god', 'a market that only opens at night', 'a haunted well', 'a ruined watchtower',
  'a sacred grove', 'a toll bridge', 'a gallows with fresh flowers beneath it', 'a hot spring', 'a guarded library',
  'an arena', 'a graveyard of statues', 'a smuggler\'s dock', 'a ferry run by a ghost', 'an old battlefield',
  'a colossal skeleton', 'an alchemist\'s greenhouse', 'a sealed door carved with runes', 'a lighthouse',
];

export const ACT_STRUCTURE: { title: string[]; summary: string[] }[] = [
  {
    title: ['Sparks in the Dark', 'An Ill Omen', 'The Call', 'Small Beginnings', 'Strange Tidings'],
    summary: [
      'Trouble in {place} draws the party in. The first signs of {villain}\'s plan surface, though no one yet sees the whole shape.',
      'A local crisis in {place} hides the first move of a greater scheme. The party earns a name — and enemies.',
    ],
  },
  {
    title: ['Threads of the Web', 'The Widening Gyre', 'Allies and Knives', 'Roads of Ash'],
    summary: [
      'Following leads across {region}, the party learns {villain} exists and what they want. {faction} offers help — for a price.',
      'The party races {villain}\'s agents to key sites. Loyalties are tested as {faction} reveals its own agenda.',
    ],
  },
  {
    title: ['The Turning', 'A Price Paid', 'Betrayal at {place}', 'The Dark Hour'],
    summary: [
      'A major setback: {villain} achieves a key goal. An ally falls or turns, and the party must regroup.',
      'The party strikes at {villain}\'s power base and learns a devastating truth about the plan.',
    ],
  },
  {
    title: ['Gathering Storm', 'Against the Tide', 'The Long March'],
    summary: [
      'Forging alliances between old rivals, the party prepares for the final confrontation and hunts for {villain}\'s weakness.',
      'The world shifts as {villain}\'s plan nears completion. Only bold action can turn the tide.',
    ],
  },
  {
    title: ['The Last Door', 'Endgame', 'Crown of Ashes', 'Where It Ends'],
    summary: [
      'The party assaults {lair} to stop {villain} once and for all.',
      'Everything converges on {lair}. Victory will cost something — the only question is what.',
    ],
  },
];

export const HOOKS = [
  'A dying courier presses a sealed letter into a PC\'s hand.',
  'The party is hired to escort a cart that is far too heavy for its declared cargo.',
  'A bounty notice shows the face of someone a PC knows.',
  'Every bell in {place} rings at midnight — and no one is in the towers.',
  'A child asks the party to find their missing parent.',
  '{npc} offers a fortune for a simple retrieval job.',
  'The party wakes up in a cell with no memory of the last three days.',
  'A storm drives the party to shelter in a place that shouldn\'t exist.',
  'A rival adventuring party is found dead with a strange mark on each body.',
  'A PC inherits a deed to property in {place}.',
  '{faction} publicly accuses the party of a crime they didn\'t commit.',
  'A map falls out of a library book, annotated in fresh ink.',
];

export const GOALS = [
  'Find out who is behind the disappearances', 'Secure the aid of {faction}', 'Recover the relic from {place}',
  'Protect {npc} from assassins', 'Uncover {villain}\'s identity', 'Break the siege of {place}',
  'Cleanse the corruption at {place}', 'Obtain proof of the conspiracy', 'Escort refugees to safety',
  'Win the tournament in {place}', 'Destroy one of {villain}\'s lieutenants', 'Decode the ancient map',
];

export const CLIMAXES = [
  'A battle on a collapsing bridge with {npc}\'s life at stake.',
  'A duel with {villain}\'s lieutenant while the ritual completes around them.',
  'A trial before {faction}, where the party must prove their innocence.',
  'A desperate defense of {place} against waves of attackers.',
  'A chase through the rooftops of {place}.',
  'Confronting {villain} face to face — and learning they cannot win this way.',
  'A heist in the heart of {faction}\'s vault.',
  'A choice: save {npc} or stop the ritual.',
];

export const TWISTS = [
  'Reinforcements arrive halfway through.', 'The enemies are fleeing something worse.', 'The ground starts collapsing.',
  'One enemy wants to surrender and has information.', 'An innocent is caught in the middle.', 'Fog rolls in; visibility drops.',
  'The enemies are under a charm and fight unwillingly.', 'A rival party shows up to claim the prize.',
  'The treasure is bait for a trap.', 'Fire spreads each round.', 'It\'s an ambush — they knew the party was coming.',
  'The leader offers a deal mid-fight.',
];

export const RUMORS = [
  'They say {villain} was once a hero of {place}.', 'The mayor of {place} hasn\'t been seen in daylight for weeks.',
  '{faction} is paying triple for any old coins with a serpent mark.', 'Something big has been moving under the lake near {place}.',
  'The priests in {place} are hoarding healing potions.', 'A dragon was spotted over the mountains — or a very large bird.',
  'A caravan vanished on the road to {place}; only the horses returned.', '{npc} knows more than they let on.',
  'The old ruins glow on moonless nights.', 'Someone is buying up all the silver in {region}.',
  'Wolves are avoiding the forest. Wolves.', '{faction} and the city guard are secretly the same people.',
];

export const DUNGEON_THEMES = [
  'crypt', 'mine', 'temple', 'wizard tower', 'sewer', 'fortress ruin', 'cave', 'vault', 'prison', 'lair',
];

export const ROOM_NAMES: Record<string, string[]> = {
  any: ['Entry Hall', 'Guard Post', 'Collapsed Passage', 'Storeroom', 'Shrine', 'Barracks', 'Well Chamber', 'Throne Room', 'Library',
    'Armory', 'Prison Cells', 'Kitchen', 'Flooded Chamber', 'Gallery of Statues', 'Ritual Circle', 'Treasure Vault', 'Mushroom Grotto',
    'Workshop', 'Ossuary', 'Chasm Bridge', 'Collapsed Chapel', 'Mirror Room', 'Feast Hall', 'Alchemy Lab', 'Chamber of Echoes', 'Crypt'],
};

export const ROOM_FEATURES = [
  'dripping water and slick floors', 'a faded mural of a coronation', 'a pit covered by rotten planks', 'glowing fungus on the ceiling',
  'broken furniture piled as a barricade', 'bloodstains leading to a wall', 'a statue with gemstone eyes', 'a stone altar with fresh candles',
  'bones arranged in a spiral', 'a cold draft from a crack in the wall', 'an iron cage hanging from chains', 'a fountain of black water',
  'claw marks on the door', 'a pile of rusted weapons', 'a giant spider web', 'scattered pages of a journal', 'a rune-circle faintly glowing',
  'a collapsed ceiling open to the sky', 'an organ that plays itself', 'a mosaic floor that shifts when stepped on',
];

export const ROOM_CONTENTS = [
  'Empty — but something has been here recently.', 'A monster lair.', 'A puzzle blocks the way forward.', 'Treasure, poorly hidden.',
  'A trapped corridor.', 'A captive who begs for release.', 'Signs of a previous adventuring party.', 'A peaceful creature willing to talk.',
  'A clue about the dungeon\'s history.', 'A secret door behind a tapestry.', 'Guardians who stand motionless until touched.',
];

export const TRAPS = [
  'Pressure plate: poison darts (DC 13 Dex save).', 'Collapsing floor into a 20 ft. pit.', 'Glyph of warding on the door.',
  'Swinging blade across the corridor.', 'Room slowly floods when the door closes.', 'Falling net and an alarm bell.',
  'Rune that casts Fear on the first to enter.', 'Rolling boulder down the sloped hall.', 'Poisoned needle in the lock.',
  'Ceiling of spikes lowers on a timer.',
];

export const DUNGEON_HISTORY = [
  'Built by {people} as a {purpose}, it was abandoned after {event}. Now {occupant} dwell within.',
];
export const DH_PEOPLE = ['a dwarven clan', 'an order of mages', 'a forgotten empire', 'a cult', 'a mad noble', 'giants', 'a sect of monks'];
export const DH_PURPOSE = ['tomb', 'vault', 'prison', 'temple', 'mine', 'laboratory', 'stronghold', 'hideout'];
export const DH_EVENT = ['a plague', 'a war', 'a failed ritual', 'an earthquake', 'a betrayal', 'the death of its master', 'a flood'];
export const DH_OCCUPANT = ['monsters', 'cultists', 'undead', 'bandits', 'a sleeping horror', 'goblins', 'elementals', 'refugees and worse'];

export const TOWN_BUILDINGS = [
  'Tavern', 'Temple', 'Smithy', 'Market', 'Town Hall', 'General Store', 'Stables', 'Guardhouse', 'Alchemist', 'Library',
  'Manor', 'Warehouse', 'Bathhouse', 'Mill', 'Shrine', 'Tailor', 'Jeweler', 'Wizard\'s Tower', 'Docks', 'Graveyard',
];
