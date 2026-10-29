// World objects: resource nodes, ruins, loot containers and player-built structures.
// kind: resource | structure | door | container | station | deco
// breakable: zombies will smash through it to reach you.

import { G } from '../config.js';

const resource = (name, extra) => ({ name, kind: 'resource', ...extra });
const container = (name, size, loot, rolls, extra = {}) => ({ name, kind: 'container', solid: true, size, loot, rolls, hp: 200, breakable: true, ...extra });

export const OBJ = {
  // --- resource nodes ---
  tree: resource('Oak Tree', { solid: true, hp: 45, tool: 'axe', drops: [['wood', 2, 4], ['stick', 0, 2]], hand: [['stick', 1, 1]], xp: 3 }),
  pine: resource('Pine Tree', { solid: true, hp: 55, tool: 'axe', drops: [['wood', 3, 5], ['stick', 0, 1]], hand: [['stick', 1, 1]], xp: 3 }),
  rock: resource('Boulder', { solid: true, hp: 55, tool: 'pick', drops: [['stone', 2, 4]], hand: [['stone', 1, 1]], xp: 3 }),
  iron_deposit: resource('Iron Deposit', { solid: true, hp: 80, tool: 'pick', needTool: true, drops: [['iron_ore', 2, 3], ['stone', 0, 1]], xp: 6 }),
  coal_deposit: resource('Coal Seam', { solid: true, hp: 70, tool: 'pick', needTool: true, drops: [['coal', 2, 3], ['stone', 0, 1]], xp: 5 }),
  nitrate_deposit: resource('Nitrate Crust', { solid: true, hp: 60, tool: 'pick', needTool: true, drops: [['nitrate', 1, 3]], xp: 5 }),
  bush: resource('Berry Bush', { solid: false, hp: 6, drops: [['berries', 1, 3], ['fiber', 1, 2]], seedChance: 0.35, xp: 1, handOk: true }),
  tallgrass: resource('Tall Grass', { solid: false, hp: 2, drops: [['fiber', 1, 2]], seedChance: 0.06, xp: 1, handOk: true }),

  // --- ruins ---
  ruin_wall: { name: 'Old Wall', kind: 'structure', solid: true, hp: 500, breakable: true },
  ruin_door: { name: 'Old Door', kind: 'door', door: true, hp: 140, breakable: true },

  // --- loot containers ---
  cabinet: container('Kitchen Cabinet', [5, 4], 'kitchen', [1, 3]),
  fridge: container('Fridge', [4, 5], 'fridge', [1, 3]),
  wardrobe: container('Wardrobe', [5, 5], 'wardrobe', [1, 3]),
  desk: container('Office Desk', [5, 3], 'desk', [1, 3]),
  shelf: container('Store Shelf', [6, 4], 'kitchen', [2, 4]),
  toolbox: container('Toolbox', [5, 3], 'toolbox', [1, 4]),
  shed_crate: container('Old Crate', [6, 4], 'shed', [1, 3]),
  med_cabinet: container('Medicine Cabinet', [4, 3], 'medical', [1, 3]),
  locker: container('Steel Locker', [5, 6], 'military', [1, 3], { hp: 400 }),
  car: container('Wrecked Car', [6, 4], 'car', [1, 3], { hp: 900 }),
  trash: container('Trash Pile', [5, 4], 'trash', [1, 4], { solid: false, breakable: false }),
  bag: container('Dropped Items', [8, 8], null, [0, 0], { solid: false, breakable: false, temp: true }),
  corpse: container('Remains', [10, 8], null, [0, 0], { solid: false, breakable: false, temp: true }),

  // --- player built ---
  campfire: { name: 'Campfire', kind: 'station', station: 'campfire', solid: false, hp: 60, light: 8, breakable: true,
    build: { cost: { wood: 3, stone: 4 }, lvl: 1, cat: 'Stations' } },
  workbench: { name: 'Workbench', kind: 'station', station: 'workbench', solid: true, hp: 220, breakable: true,
    build: { cost: { wood: 12, stone: 4 }, lvl: 1, cat: 'Stations' } },
  forge: { name: 'Forge', kind: 'station', station: 'forge', solid: true, hp: 450, light: 3, breakable: true,
    build: { cost: { stone: 25, wood: 6 }, lvl: 2, cat: 'Stations' } },
  machine_shop: { name: 'Machine Shop', kind: 'station', station: 'machine_shop', solid: true, hp: 700, breakable: true,
    build: { cost: { iron_ingot: 10, electronics: 4, scrap: 12, screws: 10 }, lvl: 5, cat: 'Stations' } },
  storage_crate: { name: 'Storage Crate', kind: 'container', size: [8, 6], solid: true, hp: 180, breakable: true,
    build: { cost: { wood: 8 }, lvl: 1, cat: 'Utility' } },
  storage_locker: { name: 'Storage Locker', kind: 'container', size: [10, 8], solid: true, hp: 600, breakable: true,
    build: { cost: { scrap: 10, iron_ingot: 2 }, lvl: 3, cat: 'Utility' } },
  bedroll: { name: 'Bedroll', kind: 'deco', bed: 0.7, solid: false, hp: 40, breakable: true,
    build: { cost: { fiber: 10, hide: 2 }, lvl: 1, cat: 'Utility' } },
  bed: { name: 'Bed', kind: 'deco', bed: 1, solid: true, hp: 120, breakable: true,
    build: { cost: { wood: 6, cloth: 4 }, lvl: 2, cat: 'Utility' } },
  farm_plot: { name: 'Farm Plot', kind: 'deco', farm: true, solid: false, hp: 50,
    build: { cost: { wood: 2, stick: 2 }, lvl: 1, cat: 'Utility' } },
  rain_collector: { name: 'Rain Collector', kind: 'deco', rain: true, solid: true, hp: 140, breakable: true,
    build: { cost: { wood: 6, scrap: 3, cloth: 2 }, lvl: 2, cat: 'Utility' } },
  torch_stand: { name: 'Torch Stand', kind: 'deco', light: 6, solid: false, hp: 40, breakable: true,
    build: { cost: { stick: 2, fiber: 3, wood: 1 }, lvl: 1, cat: 'Utility' } },
  spike_trap: { name: 'Spike Trap', kind: 'deco', trap: 18, solid: false, hp: 100,
    build: { cost: { wood: 3, stick: 4 }, lvl: 1, cat: 'Defense' } },
  wood_wall: { name: 'Wood Wall', kind: 'structure', solid: true, hp: 220, breakable: true,
    build: { cost: { wood: 4 }, lvl: 1, cat: 'Defense' } },
  wood_door: { name: 'Wood Door', kind: 'door', door: true, hp: 180, breakable: true,
    build: { cost: { wood: 6 }, lvl: 1, cat: 'Defense' } },
  stone_wall: { name: 'Stone Wall', kind: 'structure', solid: true, hp: 550, breakable: true,
    build: { cost: { stone: 8, wood: 1 }, lvl: 2, cat: 'Defense' } },
  metal_wall: { name: 'Metal Wall', kind: 'structure', solid: true, hp: 1300, breakable: true,
    build: { cost: { iron_ingot: 2, scrap: 4 }, lvl: 4, cat: 'Defense' } },
  metal_door: { name: 'Metal Door', kind: 'door', door: true, hp: 950, breakable: true,
    build: { cost: { iron_ingot: 2, scrap: 6, springs: 1 }, lvl: 4, cat: 'Defense' } },
  wood_floor: { name: 'Wood Floor', floor: G.WOODFLOOR, build: { cost: { wood: 2 }, lvl: 1, cat: 'Floors' } },
  stone_floor: { name: 'Stone Floor', floor: G.STONEFLOOR, build: { cost: { stone: 3 }, lvl: 2, cat: 'Floors' } },
};

for (const [id, d] of Object.entries(OBJ)) d.id = id;

export const BUILDABLES = Object.values(OBJ).filter(d => d.build);
