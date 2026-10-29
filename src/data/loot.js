// Weighted loot tables: [itemId, weight, min, max]

export const LOOT = {
  kitchen: [
    ['canned_food', 10, 1, 2], ['soda', 6, 1, 2], ['chips', 6, 1, 1], ['tin_can', 8, 1, 3],
    ['glue', 3, 1, 1], ['duct_tape', 4, 1, 1], ['kitchen_knife', 2, 1, 1], ['water_bottle', 5, 1, 1],
    ['toaster', 3, 1, 1], ['empty_bottle', 4, 1, 1], ['light_bulb', 3, 1, 1], ['seeds', 2, 1, 3],
  ],
  fridge: [
    ['canned_food', 4, 1, 2], ['soda', 8, 1, 2], ['raw_meat', 3, 1, 2], ['water_bottle', 8, 1, 1], ['potato', 4, 1, 3],
  ],
  wardrobe: [
    ['old_clothes', 10, 1, 1], ['cloth', 5, 1, 3], ['hide_backpack', 1, 1, 1], ['leather_armor', 1, 1, 1],
    ['baseball_bat', 2, 1, 1], ['duct_tape', 2, 1, 1],
  ],
  desk: [
    ['typewriter', 3, 1, 1], ['radio', 3, 1, 1], ['alarm_clock', 4, 1, 1], ['light_bulb', 4, 1, 2],
    ['glue', 4, 1, 1], ['electronics', 2, 1, 1], ['painkillers', 2, 1, 1], ['desk_fan', 2, 1, 1],
  ],
  toolbox: [
    ['screws', 8, 2, 6], ['springs', 5, 1, 2], ['duct_tape', 6, 1, 1], ['old_wrench', 6, 1, 1],
    ['scrap', 8, 2, 5], ['adhesive', 4, 1, 2], ['bolts_box', 4, 1, 1], ['pipe', 3, 1, 1],
    ['sledgehammer', 1, 1, 1], ['iron_ingot', 1, 1, 2], ['stone_pick', 1, 1, 1],
  ],
  shed: [
    ['fertilizer', 4, 1, 1], ['seeds', 5, 1, 4], ['pipe', 4, 1, 1], ['scrap', 6, 1, 4],
    ['car_battery', 2, 1, 1], ['coal', 3, 1, 3], ['wood', 4, 2, 5], ['old_wrench', 2, 1, 1],
  ],
  medical: [
    ['bandage', 10, 1, 3], ['painkillers', 7, 1, 2], ['antibiotics', 4, 1, 1], ['medkit', 1, 1, 1],
  ],
  military: [
    ['pistol_ammo', 8, 4, 12], ['shells', 5, 2, 6], ['rifle_ammo', 3, 3, 10], ['pistol', 2, 1, 1],
    ['shotgun', 1, 1, 1], ['police_vest', 2, 1, 1], ['military_backpack', 1, 1, 1], ['bandage', 4, 1, 2],
    ['assault_rifle', 0.3, 1, 1], ['hunting_rifle', 0.6, 1, 1], ['gunpowder', 3, 2, 6], ['antibiotics', 1, 1, 1],
  ],
  car: [
    ['car_battery', 4, 1, 1], ['scrap', 6, 1, 4], ['duct_tape', 4, 1, 1], ['water_bottle', 3, 1, 1],
    ['tin_can', 4, 1, 2], ['old_wrench', 3, 1, 1], ['pipe', 3, 1, 1], ['canned_food', 2, 1, 1], ['pistol_ammo', 1, 2, 6],
  ],
  trash: [
    ['tin_can', 10, 1, 2], ['old_clothes', 4, 1, 1], ['light_bulb', 4, 1, 1], ['glue', 2, 1, 1],
    ['duct_tape', 2, 1, 1], ['radio', 2, 1, 1], ['alarm_clock', 3, 1, 1], ['desk_fan', 2, 1, 1],
    ['typewriter', 1, 1, 1], ['empty_bottle', 3, 1, 1],
  ],
  zombie: [
    ['tin_can', 4, 1, 1], ['cloth', 5, 1, 2], ['old_clothes', 2, 1, 1], ['bandage', 3, 1, 1],
    ['pistol_ammo', 2, 1, 4], ['soda', 2, 1, 1], ['chips', 2, 1, 1], ['duct_tape', 2, 1, 1], ['painkillers', 1, 1, 1],
  ],
  raider: [
    ['pistol_ammo', 6, 3, 8], ['scrap', 5, 2, 5], ['canned_food', 4, 1, 2], ['bandage', 4, 1, 2],
    ['gunpowder', 3, 1, 4], ['pipe_pistol', 2, 1, 1], ['machete', 1, 1, 1], ['antibiotics', 1, 1, 1], ['shells', 2, 2, 4],
  ],
};
