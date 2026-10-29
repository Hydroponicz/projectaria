// World map: ground tiles + one object per tile, procedural generation, line of sight.
import { WORLD_W as W, WORLD_H as H, G, GROUND_INFO } from './config.js';
import { OBJ } from './data/objects.js';
import { mulberry32, fbm, randInt, pick, bytesToB64, b64ToBytes } from './util.js';
import { Grid } from './inventory.js';

export class World {
  constructor(seed) {
    this.seed = seed;
    this.w = W; this.h = H;
    this.ground = new Uint8Array(W * H);
    this.objs = new Array(W * H).fill(null);
    this.towns = [];
    this.version = 0; // bumps on any change (minimap redraw)
    this.dirty = new Set(); // render chunks needing a rebuild
  }
  touch(x, y) { this.version++; this.dirty.add(((y >> 4) << 8) | (x >> 4)); }
  inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  idx(x, y) { return y * W + x; }
  g(x, y) { return this.inb(x, y) ? this.ground[y * W + x] : G.DEEP; }
  setG(x, y, v) { if (this.inb(x, y)) { this.ground[y * W + x] = v; this.touch(x, y); this.groundDirty = true; } }
  o(x, y) { return this.inb(x, y) ? this.objs[y * W + x] : null; }
  setO(x, y, o) { if (this.inb(x, y)) { this.objs[y * W + x] = o; this.touch(x, y); } }
  def(x, y) { const o = this.o(x, y); return o ? OBJ[o.t] : null; }

  // kind: 'player' | 'zombie' | 'human' | 'animal'
  blocked(x, y, kind) {
    if (!this.inb(x, y)) return true;
    if (!GROUND_INFO[this.ground[y * W + x]].pass) return true;
    const o = this.objs[y * W + x];
    if (!o) return false;
    const d = OBJ[o.t];
    if (d.door) return !o.open && kind !== 'human';
    return !!d.solid;
  }

  // Bullets / sight are stopped by solid objects (not water).
  opaque(x, y) {
    const o = this.o(x, y);
    if (!o) return false;
    const d = OBJ[o.t];
    if (d.door) return !o.open;
    return !!d.solid && d.kind !== 'container';
  }

  los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.ceil(Math.hypot(dx, dy) * 2.5);
    let lx = -1, ly = -1;
    for (let i = 1; i < steps; i++) {
      const tx = Math.floor(x0 + dx * i / steps), ty = Math.floor(y0 + dy * i / steps);
      if (tx === lx && ty === ly) continue;
      lx = tx; ly = ty;
      if (tx === Math.floor(x1) && ty === Math.floor(y1)) break;
      if (this.opaque(tx, ty)) return false;
    }
    return true;
  }

  nearWater(x, y, r) {
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (!GROUND_INFO[this.g(tx, ty)].water) continue;
        const cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1));
        if (Math.hypot(cx - x, cy - y) <= r) return true;
      }
    return false;
  }

  // Find nearest tile around (x,y) where a non-solid object can be dropped.
  freeTileNear(x, y, allowType) {
    for (let r = 0; r < 6; r++)
      for (let ty = y - r; ty <= y + r; ty++)
        for (let tx = x - r; tx <= x + r; tx++) {
          if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) !== r) continue;
          if (!this.inb(tx, ty) || !GROUND_INFO[this.g(tx, ty)].pass) continue;
          const o = this.o(tx, ty);
          if (!o || o.t === 'tallgrass' || (allowType && o.t === allowType)) return [tx, ty];
        }
    return null;
  }

  toJSON() {
    const objs = [];
    for (let i = 0; i < this.objs.length; i++) if (this.objs[i]) objs.push([i, this.objs[i]]);
    return { seed: this.seed, ground: bytesToB64(this.ground), objs, towns: this.towns };
  }

  static from(data) {
    const w = new World(data.seed);
    w.ground.set(b64ToBytes(data.ground));
    for (const [i, o] of data.objs) {
      if (!OBJ[o.t]) continue;
      if (o.inv) o.inv = Grid.from(o.inv);
      w.objs[i] = o;
    }
    w.towns = data.towns || [];
    return w;
  }
}

// ---------------- generation ----------------

const BUILDING_TYPES = {
  house: { w: [7, 10], h: [6, 8], items: ['cabinet', 'fridge', 'wardrobe', 'desk', 'med_cabinet', 'cabinet'] },
  store: { w: [9, 12], h: [7, 9], items: ['shelf', 'shelf', 'shelf', 'shelf', 'fridge', 'fridge', 'cabinet'] },
  garage: { w: [7, 9], h: [6, 8], items: ['toolbox', 'toolbox', 'shed_crate', 'shed_crate', 'car'] },
  clinic: { w: [8, 10], h: [6, 8], items: ['med_cabinet', 'med_cabinet', 'med_cabinet', 'desk', 'cabinet'] },
  police: { w: [8, 11], h: [7, 9], items: ['locker', 'locker', 'locker', 'desk', 'med_cabinet', 'desk'] },
  office: { w: [8, 11], h: [6, 8], items: ['desk', 'desk', 'desk', 'desk', 'cabinet'] },
};

export function generateWorld(seed) {
  const world = new World(seed);
  const rng = mulberry32(seed);
  const rocky = new Float32Array(W * H);

  // 1. terrain
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = fbm(x / 48, y / 48, seed, 5);
    const m = fbm(x / 30, y / 30, seed + 77, 4);
    rocky[y * W + x] = fbm(x / 18, y / 18, seed + 333, 3);
    // soft island falloff near the borders
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    const fall = edge < 10 ? (10 - edge) * 0.03 : 0;
    const v = e - fall;
    let t;
    if (v < 0.33) t = G.DEEP;
    else if (v < 0.38) t = G.WATER;
    else if (v < 0.41) t = G.SAND;
    else if (m > 0.56) t = G.FOREST;
    else if (m < 0.36) t = G.DIRT;
    else t = G.GRASS;
    world.ground[y * W + x] = t;
  }

  // 2. roads (two horizontal, two vertical, 3 wide; bridges over water)
  const rows = [randInt(rng, 40, 80), randInt(rng, 120, 160)];
  const cols = [randInt(rng, 40, 80), randInt(rng, 120, 160)];
  const setRoad = (x, y) => { if (x > 4 && y > 4 && x < W - 5 && y < H - 5) world.ground[y * W + x] = G.ROAD; };
  for (const ry of rows) {
    let y = ry;
    for (let x = 5; x < W - 5; x++) {
      if (rng() < 0.04) y += rng() < 0.5 ? -1 : 1;
      for (let k = -1; k <= 1; k++) setRoad(x, y + k);
    }
  }
  for (const cx of cols) {
    let x = cx;
    for (let y = 5; y < H - 5; y++) {
      if (rng() < 0.04) x += rng() < 0.5 ? -1 : 1;
      for (let k = -1; k <= 1; k++) setRoad(x + k, y);
    }
  }

  // 3. towns near intersections, plus scattered cabins
  const occupied = new Uint8Array(W * H); // building footprint + margin
  const tryBuilding = (bx, by, bw, bh, type) => {
    if (bx < 6 || by < 6 || bx + bw > W - 6 || by + bh > H - 6) return false;
    for (let y = by - 1; y <= by + bh; y++) for (let x = bx - 1; x <= bx + bw; x++) {
      const g = world.ground[y * W + x];
      if (g === G.ROAD || g === G.DEEP || g === G.WATER || occupied[y * W + x]) return false;
    }
    placeBuilding(world, rng, bx, by, bw, bh, type);
    for (let y = by - 2; y <= by + bh + 1; y++) for (let x = bx - 2; x <= bx + bw + 1; x++)
      if (world.inb(x, y)) occupied[y * W + x] = 1;
    return true;
  };

  const names = TOWN_NAMES.slice();
  for (const ry of rows) for (const cx of cols) {
    if (rng() < 0.15) continue;
    const name = names.splice(Math.floor(rng() * names.length), 1)[0];
    const town = { name, x: cx, y: ry, r: 24, buildings: [] };
    let placed = 0, policeDone = false;
    for (let tries = 0; tries < 160 && placed < 12; tries++) {
      let type = pick(rng, ['house', 'house', 'house', 'store', 'garage', 'clinic', 'office', 'police']);
      if (type === 'police' && policeDone) type = 'house';
      const bt = BUILDING_TYPES[type];
      const bw = randInt(rng, bt.w[0], bt.w[1]), bh = randInt(rng, bt.h[0], bt.h[1]);
      const bx = cx + randInt(rng, -town.r, town.r) - (bw >> 1);
      const by = ry + randInt(rng, -town.r, town.r) - (bh >> 1);
      if (tryBuilding(bx, by, bw, bh, type)) {
        placed++; town.buildings.push({ x: bx, y: by, w: bw, h: bh, type });
        if (type === 'police') policeDone = true;
      }
    }
    if (placed > 0) world.towns.push(town);
  }
  for (let i = 0, cabins = 0; i < 400 && cabins < 8; i++) {
    const bx = randInt(rng, 10, W - 20), by = randInt(rng, 10, H - 20);
    const g = world.ground[by * W + bx];
    if (g !== G.FOREST && g !== G.GRASS) continue;
    if (tryBuilding(bx, by, randInt(rng, 5, 7), randInt(rng, 5, 6), rng() < 0.5 ? 'house' : 'garage')) cabins++;
  }

  // 4. road clutter: wrecked cars
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (world.ground[y * W + x] !== G.ROAD || world.objs[y * W + x]) continue;
    if (rng() < 0.006) world.objs[y * W + x] = { t: 'car', hp: OBJ.car.hp };
  }

  // 5. nature
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (world.objs[i] || occupied[i]) continue;
    const g = world.ground[i];
    const rk = rocky[i];
    const r = rng();
    let t = null;
    if (g === G.FOREST) {
      if (r < 0.28) t = rng() < 0.6 ? 'pine' : 'tree';
      else if (r < 0.33) t = 'bush';
      else if (r < 0.38) t = 'tallgrass';
      else if (r < 0.39) t = 'rock';
    } else if (g === G.GRASS) {
      if (r < 0.035) t = 'tree';
      else if (r < 0.055) t = 'bush';
      else if (r < 0.13) t = 'tallgrass';
      else if (r < 0.14) t = 'rock';
    } else if (g === G.DIRT) {
      if (r < 0.03) t = 'rock';
      else if (r < 0.06) t = 'tallgrass';
      else if (r < 0.065) t = 'tree';
    } else if (g === G.SAND) {
      if (r < 0.01) t = 'rock';
    }
    if (rk > 0.6 && g !== G.FOREST && g !== G.SAND && g !== G.ROAD && g !== G.WATER && g !== G.DEEP) {
      const q = rng();
      if (q < 0.10) t = 'rock';
      else if (q < 0.13) t = 'iron_deposit';
      else if (q < 0.15) t = 'coal_deposit';
      else if (q < 0.16) t = 'nitrate_deposit';
    }
    if (t) world.objs[i] = { t, hp: OBJ[t].hp };
  }

  // 6. guarantee some ore exists even on unlucky seeds
  const need = { iron_deposit: 40, coal_deposit: 30, nitrate_deposit: 15 };
  for (const [t, n] of Object.entries(need)) {
    let have = world.objs.filter(o => o && o.t === t).length;
    for (let tries = 0; have < n && tries < 20000; tries++) {
      const x = randInt(rng, 6, W - 7), y = randInt(rng, 6, H - 7);
      const g = world.ground[y * W + x];
      if ((g === G.GRASS || g === G.DIRT) && !world.objs[y * W + x] && !occupied[y * W + x]) {
        world.objs[y * W + x] = { t, hp: OBJ[t].hp }; have++;
      }
    }
  }
  return world;
}

function placeBuilding(world, rng, bx, by, bw, bh, type) {
  const set = (x, y, t, extra = {}) => { world.objs[y * W + x] = { t, hp: OBJ[t].hp, ...extra }; };
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    world.ground[y * W + x] = G.FLOOR;
    world.objs[y * W + x] = null;
    const edge = x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1;
    if (edge) set(x, y, 'ruin_wall');
  }
  // doors: one guaranteed on a random side, maybe a second
  const doorSpots = () => {
    const side = randInt(rng, 0, 3);
    if (side === 0) return [randInt(rng, bx + 1, bx + bw - 2), by];
    if (side === 1) return [randInt(rng, bx + 1, bx + bw - 2), by + bh - 1];
    if (side === 2) return [bx, randInt(rng, by + 1, by + bh - 2)];
    return [bx + bw - 1, randInt(rng, by + 1, by + bh - 2)];
  };
  const [dx, dy] = doorSpots();
  set(dx, dy, 'ruin_door', { open: false });
  if (rng() < 0.5) { const [ex, ey] = doorSpots(); set(ex, ey, 'ruin_door', { open: rng() < 0.5 }); }
  // decay: broken wall segments
  const breaks = randInt(rng, 0, 2);
  for (let i = 0; i < breaks; i++) {
    const [ex, ey] = doorSpots();
    world.objs[ey * W + ex] = null;
  }
  // interior wall for bigger buildings
  if (bw >= 9 && rng() < 0.6) {
    const wx = bx + randInt(rng, 3, bw - 4);
    const gap = randInt(rng, by + 1, by + bh - 2);
    for (let y = by + 1; y < by + bh - 1; y++) if (y !== gap) set(wx, y, 'ruin_wall');
  }
  // loot containers along inner walls
  const spots = [];
  for (let y = by + 1; y < by + bh - 1; y++) for (let x = bx + 1; x < bx + bw - 1; x++) {
    if (world.objs[y * W + x]) continue;
    const touchesWall = ['ruin_wall'].includes(world.objs[(y - 1) * W + x]?.t) || ['ruin_wall'].includes(world.objs[(y + 1) * W + x]?.t)
      || ['ruin_wall'].includes(world.objs[y * W + x - 1]?.t) || ['ruin_wall'].includes(world.objs[y * W + x + 1]?.t);
    // don't block doors
    const nearDoor = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([ox, oy]) => world.objs[(y + oy) * W + x + ox]?.t === 'ruin_door');
    if (touchesWall && !nearDoor) spots.push([x, y]);
  }
  const items = BUILDING_TYPES[type].items;
  for (const t of items) {
    if (!spots.length) break;
    const k = Math.floor(rng() * spots.length);
    const [x, y] = spots.splice(k, 1)[0];
    set(x, y, t);
  }
  if (rng() < 0.6 && spots.length) { const [x, y] = spots.splice(Math.floor(rng() * spots.length), 1)[0]; set(x, y, 'trash'); }
  // trash outside
  for (let i = 0; i < 2; i++) {
    const x = bx + randInt(rng, -2, bw + 1), y = by + randInt(rng, -2, bh + 1);
    if (world.inb(x, y) && !world.objs[y * W + x] && world.ground[y * W + x] !== G.FLOOR && rng() < 0.5) set(x, y, 'trash');
  }
}

const TOWN_NAMES = ['Millbrook', 'Ashford', 'Harrow Creek', 'Pinecrest', 'Dunmore', 'Fallow Rest', 'Greywater', 'Kessler', 'Redfield', 'Hollow Pines'];

export function findSpawn(world, rng) {
  for (let tries = 0; tries < 5000; tries++) {
    const x = randInt(rng, 40, W - 40), y = randInt(rng, 40, H - 40);
    const g = world.g(x, y);
    if (g !== G.GRASS && g !== G.DIRT) continue;
    if (world.towns.some(t => Math.hypot(t.x - x, t.y - y) < 32)) continue;
    let ok = true;
    for (let oy = -1; oy <= 1 && ok; oy++) for (let ox = -1; ox <= 1; ox++) if (world.blocked(x + ox, y + oy, 'player')) ok = false;
    if (!ok) continue;
    return [x + 0.5, y + 0.5];
  }
  return [W / 2 + 0.5, H / 2 + 0.5];
}
