// Item definitions. Every item occupies a w x h block in a grid inventory.
// cat: res | comp | junk | food | med | tool | weapon | ammo | gear

const base = (name, icon, cat, extra) => ({ name, icon, cat, w: 1, h: 1, stack: 1, desc: '', ...extra });
const res = (name, icon, extra = {}) => base(name, icon, 'res', { stack: 20, ...extra });
const comp = (name, icon, extra = {}) => base(name, icon, 'comp', { stack: 20, ...extra });
const junk = (name, icon, w, h, scrap, desc) =>
  base(name, icon, 'junk', { w, h, stack: w * h === 1 ? 5 : 1, scrap, desc: desc || 'Junk. Scrap it for components.' });
const food = (name, icon, use, extra = {}) => base(name, icon, 'food', { stack: 5, use, ...extra });
const med = (name, icon, use, extra = {}) => base(name, icon, 'med', { stack: 5, use, ...extra });
const ammo = (name, icon, stack) => base(name, icon, 'ammo', { stack, desc: 'Ammunition.' });

export const ITEMS = {
  // --- raw resources ---
  stick: res('Stick', '🥢', { desc: 'A sturdy stick.' }),
  wood: res('Wood', '🪵', { desc: 'Chopped timber. Used for building.' }),
  stone: res('Stone', '🪨', { desc: 'Rough stone.' }),
  fiber: res('Plant Fiber', '🌿', { stack: 30, desc: 'Twisted into cordage and bandages.' }),
  hide: res('Animal Hide', '🟫', { stack: 10, desc: 'Tanned into leather goods.' }),
  iron_ore: res('Iron Ore', '🟠', { desc: 'Smelt at a forge with coal.' }),
  coal: res('Coal', '⚫', { desc: 'Fuel for the forge.' }),
  nitrate: res('Nitrate', '⚪', { desc: 'Combine with coal to make gunpowder.' }),
  iron_ingot: res('Iron Ingot', '🧱', { desc: 'Smelted iron. The backbone of the machined age.' }),
  seeds: res('Seeds', '🌱', { desc: 'Plant in a farm plot.' }),

  // --- components (from scrapping junk) ---
  scrap: comp('Scrap Metal', '⚙️', { stack: 30 }),
  cloth: comp('Cloth', '🧵'),
  adhesive: comp('Adhesive', '🧴'),
  screws: comp('Screws', '🔩', { stack: 50 }),
  springs: comp('Springs', '🌀'),
  electronics: comp('Electronics', '💾', { stack: 10 }),
  gunpowder: comp('Gunpowder', '🧂', { stack: 50 }),

  // --- junk (the scavenging loop) ---
  tin_can: junk('Tin Can', '🥫', 1, 1, { scrap: 1 }),
  duct_tape: junk('Duct Tape', '📼', 1, 1, { adhesive: 2, cloth: 1 }),
  glue: junk('Wood Glue', '🫙', 1, 1, { adhesive: 3 }),
  light_bulb: junk('Light Bulb', '💡', 1, 1, { electronics: 1 }),
  bolts_box: junk('Box of Bolts', '📦', 1, 1, { screws: 6 }),
  alarm_clock: junk('Alarm Clock', '⏰', 1, 1, { springs: 1, screws: 2, scrap: 1 }),
  old_wrench: junk('Rusty Wrench', '🔧', 1, 2, { scrap: 3 }),
  pipe: junk('Metal Pipe', '➖', 1, 3, { scrap: 4 }),
  radio: junk('Broken Radio', '📻', 2, 1, { electronics: 2, screws: 2, scrap: 1 }),
  old_clothes: junk('Old Clothes', '👕', 2, 2, { cloth: 4 }),
  toaster: junk('Toaster', '🍞', 2, 2, { scrap: 3, springs: 1, screws: 2, electronics: 1 }),
  car_battery: junk('Car Battery', '🔋', 2, 2, { scrap: 3, electronics: 2 }),
  fertilizer: junk('Fertilizer Bag', '🛍️', 2, 2, { nitrate: 4 }, 'Rich in nitrates.'),
  desk_fan: junk('Desk Fan', '🌬️', 2, 2, { scrap: 2, electronics: 1, screws: 2, springs: 1 }),
  typewriter: junk('Typewriter', '⌨️', 2, 2, { springs: 3, screws: 3, scrap: 2 }),

  // --- food & drink ---
  berries: food('Berries', '🫐', { hunger: 6, thirst: 3 }, { stack: 10 }),
  raw_meat: food('Raw Meat', '🥩', { hunger: 8, sick: 0.5 }, { desc: 'Cook it first. Really.' }),
  cooked_meat: food('Cooked Meat', '🍖', { hunger: 30 }),
  potato: food('Potato', '🥔', { hunger: 10 }, { stack: 10 }),
  baked_potato: food('Baked Potato', '🥔', { hunger: 22 }, { stack: 10 }),
  stew: food('Hearty Stew', '🍲', { hunger: 55, thirst: 20, heal: 10 }),
  canned_food: food('Canned Food', '🥫', { hunger: 30, thirst: 5 }, { leaves: 'tin_can' }),
  chips: food('Bag of Chips', '🍟', { hunger: 15, thirst: -5 }),
  soda: food('Soda', '🥤', { thirst: 25, hunger: 3 }, { leaves: 'tin_can' }),
  water_bottle: food('Clean Water', '🍶', { thirst: 45 }, { h: 2, stack: 1, leaves: 'empty_bottle' }),
  murky_water: food('Murky Water', '🫗', { thirst: 35, sick: 0.35 }, { h: 2, stack: 1, leaves: 'empty_bottle', desc: 'Boil at a campfire.' }),
  empty_bottle: base('Empty Bottle', '🧪', 'food', { h: 2, fill: true, desc: 'Use near water to fill.' }),

  // --- medicine ---
  bandage: med('Bandage', '🩹', { heal: 5, cure: ['bleeding'] }),
  painkillers: med('Painkillers', '💊', { heal: 20 }),
  antibiotics: med('Antibiotics', '💉', { cure: ['infection', 'sick'] }, { desc: 'Cures infection and sickness.' }),
  medkit: med('Medkit', '🧰', { heal: 60, cure: ['bleeding'] }, { w: 2, h: 2, stack: 1 }),

  // --- tools & melee ---
  stone_axe: base('Stone Axe', '🪓', 'tool', { h: 2, dur: 120, tool: { axe: 1 }, weapon: { type: 'melee', dmg: 9, range: 1.2, cd: 0.7, stam: 8 } }),
  stone_pick: base('Stone Pickaxe', '⛏️', 'tool', { h: 2, dur: 120, tool: { pick: 1 }, weapon: { type: 'melee', dmg: 8, range: 1.2, cd: 0.75, stam: 8 } }),
  iron_axe: base('Iron Axe', '🪓', 'tool', { h: 2, dur: 320, tool: { axe: 2.2 }, weapon: { type: 'melee', dmg: 16, range: 1.3, cd: 0.6, stam: 7 } }),
  iron_pick: base('Iron Pickaxe', '⛏️', 'tool', { h: 2, dur: 320, tool: { pick: 2.2 }, weapon: { type: 'melee', dmg: 14, range: 1.3, cd: 0.65, stam: 7 } }),
  chainsaw: base('Chainsaw', '🪚', 'tool', { w: 2, h: 2, dur: 450, tool: { axe: 6 }, weapon: { type: 'melee', dmg: 30, range: 1.3, cd: 0.22, stam: 2, noise: 16 }, desc: 'Industrial. Loud.' }),
  jackhammer: base('Jackhammer', '🔨', 'tool', { w: 2, h: 2, dur: 450, tool: { pick: 6 }, weapon: { type: 'melee', dmg: 22, range: 1.2, cd: 0.25, stam: 2, noise: 16 }, desc: 'Industrial. Loud.' }),
  torch: base('Torch', '🔥', 'tool', { h: 2, dur: 300, light: 6.5, burns: true, weapon: { type: 'melee', dmg: 5, range: 1.1, cd: 0.6, stam: 5 }, desc: 'Burns while held. Lights the night.' }),
  wooden_club: base('Wooden Club', '🏏', 'weapon', { h: 2, dur: 90, weapon: { type: 'melee', dmg: 12, range: 1.25, cd: 0.75, stam: 9, knock: 0.6 } }),
  wooden_spear: base('Wooden Spear', '🔱', 'weapon', { h: 3, dur: 80, weapon: { type: 'melee', dmg: 16, range: 1.9, cd: 0.9, stam: 10, arc: 0.4 } }),
  kitchen_knife: base('Kitchen Knife', '🔪', 'weapon', { dur: 80, weapon: { type: 'melee', dmg: 10, range: 1.0, cd: 0.4, stam: 4 } }),
  baseball_bat: base('Baseball Bat', '🏏', 'weapon', { h: 3, dur: 160, weapon: { type: 'melee', dmg: 18, range: 1.4, cd: 0.7, stam: 9, knock: 0.8 } }),
  machete: base('Machete', '🗡️', 'weapon', { h: 2, dur: 260, weapon: { type: 'melee', dmg: 24, range: 1.4, cd: 0.55, stam: 7 } }),
  sledgehammer: base('Sledgehammer', '🔨', 'weapon', { h: 3, dur: 300, tool: { pick: 1.6 }, weapon: { type: 'melee', dmg: 38, range: 1.5, cd: 1.3, stam: 18, knock: 1.4 } }),

  // --- ranged ---
  bow: base('Primitive Bow', '🏹', 'weapon', { h: 3, dur: 120, weapon: { type: 'ranged', ammo: 'arrow', dmg: 22, cd: 0.9, speed: 18, spread: 0.04, noise: 2, range: 14 } }),
  pipe_pistol: base('Pipe Pistol', '🔫', 'weapon', { w: 2, dur: 90, weapon: { type: 'ranged', ammo: 'pistol_ammo', mag: 4, reload: 2.0, dmg: 22, cd: 0.5, speed: 30, spread: 0.09, noise: 22, range: 16 } }),
  pistol: base('9mm Pistol', '🔫', 'weapon', { w: 2, dur: 300, weapon: { type: 'ranged', ammo: 'pistol_ammo', mag: 12, reload: 1.4, dmg: 26, cd: 0.28, speed: 34, spread: 0.05, noise: 25, range: 18 } }),
  shotgun: base('Double-Barrel Shotgun', '🔫', 'weapon', { w: 4, dur: 220, weapon: { type: 'ranged', ammo: 'shells', mag: 2, reload: 2.2, dmg: 12, pellets: 7, cd: 0.35, speed: 28, spread: 0.24, noise: 34, range: 9 } }),
  hunting_rifle: base('Hunting Rifle', '🎯', 'weapon', { w: 4, dur: 260, weapon: { type: 'ranged', ammo: 'rifle_ammo', mag: 5, reload: 2.5, dmg: 80, cd: 1.1, speed: 45, spread: 0.01, noise: 40, range: 28, pierce: 2 } }),
  assault_rifle: base('Assault Rifle', '🔫', 'weapon', { w: 4, h: 2, dur: 400, weapon: { type: 'ranged', ammo: 'rifle_ammo', mag: 30, reload: 2.2, dmg: 30, cd: 0.1, auto: true, speed: 40, spread: 0.06, noise: 38, range: 22 } }),
  arrow: ammo('Arrow', '➶', 20),
  pistol_ammo: ammo('9mm Rounds', '•', 30),
  shells: ammo('Shotgun Shells', '🔴', 12),
  rifle_ammo: ammo('Rifle Rounds', '▮', 30),

  // --- gear (equip via Use) ---
  hide_backpack: base('Hide Backpack', '🎒', 'gear', { w: 2, h: 2, equip: 'pack', grid: [8, 6], desc: 'Equip: inventory 8x6.' }),
  military_backpack: base('Military Rucksack', '🎒', 'gear', { w: 3, h: 3, equip: 'pack', grid: [10, 7], desc: 'Equip: inventory 10x7.' }),
  leather_armor: base('Leather Armor', '🦺', 'gear', { w: 2, h: 2, equip: 'armor', armor: 0.2, desc: 'Equip: -20% damage, fewer bites.' }),
  scrap_armor: base('Scrap Plate Armor', '🛡️', 'gear', { w: 2, h: 3, equip: 'armor', armor: 0.35, desc: 'Equip: -35% damage, fewer bites.' }),
  police_vest: base('Police Vest', '🦺', 'gear', { w: 2, h: 2, equip: 'armor', armor: 0.4, desc: 'Equip: -40% damage, fewer bites.' }),
};

for (const [id, d] of Object.entries(ITEMS)) d.id = id;

export const CAT_COLORS = {
  res: '#4b5a3a', comp: '#4a4f63', junk: '#5c4d3d', food: '#5a3f3f', med: '#3f5a55',
  tool: '#5a5233', weapon: '#5e3b3b', ammo: '#4d4d2f', gear: '#3d4d5e',
};
