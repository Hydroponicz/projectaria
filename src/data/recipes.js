// Crafting recipes. st = required station within range (null = by hand).
// lvl = minimum Crafting skill. also = extra outputs.

export const STATIONS = {
  null: 'By Hand',
  campfire: 'Campfire',
  workbench: 'Workbench',
  forge: 'Forge',
  machine_shop: 'Machine Shop',
};

const r = (out, n, st, lvl, req, extra = {}) => ({ key: extra.key || out, out, n, st, lvl, req, xp: extra.xp || 8 + lvl * 4, also: extra.also });

export const RECIPES = [
  // --- primitive (by hand) ---
  r('stone_axe', 1, null, 1, { stick: 2, stone: 2, fiber: 3 }),
  r('stone_pick', 1, null, 1, { stick: 2, stone: 3, fiber: 3 }),
  r('wooden_club', 1, null, 1, { wood: 2, fiber: 1 }),
  r('wooden_spear', 1, null, 1, { stick: 3, stone: 1, fiber: 2 }),
  r('torch', 1, null, 1, { stick: 1, fiber: 3 }),
  r('bandage', 1, null, 1, { fiber: 5 }, { key: 'bandage_fiber' }),
  r('bandage', 2, null, 1, { cloth: 2 }, { key: 'bandage_cloth' }),
  r('bow', 1, null, 2, { stick: 3, fiber: 8 }),
  r('arrow', 4, null, 1, { stick: 2, stone: 1, fiber: 1 }),
  r('hide_backpack', 1, null, 2, { hide: 4, fiber: 8, stick: 2 }),
  r('leather_armor', 1, null, 2, { hide: 6, fiber: 6 }),

  // --- campfire ---
  r('cooked_meat', 1, 'campfire', 1, { raw_meat: 1 }, { xp: 3 }),
  r('baked_potato', 1, 'campfire', 1, { potato: 1 }, { xp: 3 }),
  r('water_bottle', 1, 'campfire', 1, { murky_water: 1 }, { xp: 3, key: 'boil_water' }),
  r('stew', 1, 'campfire', 2, { cooked_meat: 1, potato: 2, water_bottle: 1 }, { also: { empty_bottle: 1 } }),

  // --- forge ---
  r('iron_ingot', 1, 'forge', 1, { iron_ore: 2, coal: 1 }, { xp: 5 }),
  r('iron_ingot', 1, 'forge', 2, { scrap: 4 }, { key: 'smelt_scrap', xp: 5 }),
  r('gunpowder', 2, 'forge', 2, { nitrate: 1, coal: 1 }, { xp: 5 }),

  // --- workbench ---
  r('arrow', 10, 'workbench', 2, { stick: 4, scrap: 1, fiber: 2 }, { key: 'arrow_bulk' }),
  r('iron_axe', 1, 'workbench', 2, { iron_ingot: 3, wood: 2, adhesive: 1 }),
  r('iron_pick', 1, 'workbench', 2, { iron_ingot: 3, wood: 2, adhesive: 1 }),
  r('machete', 1, 'workbench', 3, { iron_ingot: 3, cloth: 1, adhesive: 1 }),
  r('pipe_pistol', 1, 'workbench', 2, { scrap: 6, springs: 1, screws: 4, adhesive: 1 }),
  r('pistol_ammo', 8, 'workbench', 2, { scrap: 1, gunpowder: 2 }),
  r('medkit', 1, 'workbench', 3, { bandage: 3, antibiotics: 1, adhesive: 1 }),
  r('military_backpack', 1, 'workbench', 3, { cloth: 10, hide: 4, adhesive: 3, screws: 4 }),
  r('scrap_armor', 1, 'workbench', 3, { scrap: 10, cloth: 4, adhesive: 2 }),
  r('shotgun', 1, 'workbench', 4, { iron_ingot: 6, scrap: 6, springs: 2, screws: 6, wood: 3 }),
  r('shells', 6, 'workbench', 4, { scrap: 2, gunpowder: 3 }),
  r('hunting_rifle', 1, 'workbench', 5, { iron_ingot: 8, springs: 3, screws: 8, wood: 4, adhesive: 2 }),
  r('rifle_ammo', 10, 'workbench', 5, { scrap: 2, gunpowder: 4, iron_ingot: 1 }),

  // --- machine shop (industrial age) ---
  r('pistol', 1, 'machine_shop', 5, { iron_ingot: 5, springs: 2, screws: 6 }),
  r('rifle_ammo', 25, 'machine_shop', 6, { scrap: 3, gunpowder: 8, iron_ingot: 2 }, { key: 'rifle_ammo_bulk' }),
  r('chainsaw', 1, 'machine_shop', 6, { iron_ingot: 8, electronics: 3, springs: 2, screws: 8 }),
  r('jackhammer', 1, 'machine_shop', 6, { iron_ingot: 8, electronics: 3, springs: 2, screws: 8 }),
  r('assault_rifle', 1, 'machine_shop', 7, { iron_ingot: 12, springs: 4, screws: 12, electronics: 2, adhesive: 2 }),
];
