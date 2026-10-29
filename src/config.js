// Global constants shared across modules.
export const TILE = 32;            // pixels per tile at zoom 1
export const WORLD_W = 200;
export const WORLD_H = 200;
export const DAY_LEN = 600;        // real seconds per in-game day
export const HOUR = DAY_LEN / 24;  // real seconds per in-game hour
export const START_HOUR = 7;
export const HORDE_EVERY = 7;      // blood moon every N days
export const REACH = 1.9;          // tiles the player can harvest/interact at

export const G = {
  DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4,
  DIRT: 5, ROAD: 6, FLOOR: 7, WOODFLOOR: 8, STONEFLOOR: 9,
};

export const GROUND_INFO = [
  { name: 'Deep Water',    color: [29, 59, 92],   pass: false, speed: 0,    water: true },
  { name: 'Shallow Water', color: [47, 95, 138],  pass: true,  speed: 0.55, water: true },
  { name: 'Sand',          color: [190, 174, 124], pass: true,  speed: 0.9 },
  { name: 'Grass',         color: [84, 122, 68],  pass: true,  speed: 1 },
  { name: 'Forest Floor',  color: [56, 88, 50],   pass: true,  speed: 0.95 },
  { name: 'Dirt',          color: [116, 96, 70],  pass: true,  speed: 1 },
  { name: 'Road',          color: [66, 66, 70],   pass: true,  speed: 1.08 },
  { name: 'Old Floor',     color: [104, 96, 88],  pass: true,  speed: 1 },
  { name: 'Wood Floor',    color: [138, 98, 58],  pass: true,  speed: 1.05, built: true },
  { name: 'Stone Floor',   color: [122, 122, 128], pass: true, speed: 1.05, built: true },
];
