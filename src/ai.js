// Non-player actors: zombies, survivors, raiders, wildlife. Plus spawning.
import { DAY_LEN, HOUR, G, GROUND_INFO } from './config.js';
import { OBJ } from './data/objects.js';
import { ITEMS } from './data/items.js';
import { clamp, angleDiff, pick, randInt } from './util.js';

// ---------- movement ----------
export function collides(world, x, y, r, kind) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!world.blocked(tx, ty, kind)) continue;
    const cx = clamp(x, tx, tx + 1), cy = clamp(y, ty, ty + 1);
    if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return true;
  }
  return false;
}

// Returns true if the entity moved the full distance.
export function moveEntity(world, e, dx, dy, kind) {
  if (collides(world, e.x, e.y, e.r * 0.9, kind)) { e.x += dx; e.y += dy; return true; } // escape if trapped
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  let full = true;
  for (let i = 0; i < steps; i++) {
    const nx = e.x + dx / steps;
    if (!collides(world, nx, e.y, e.r, kind)) e.x = nx; else full = false;
    const ny = e.y + dy / steps;
    if (!collides(world, e.x, ny, e.r, kind)) e.y = ny; else full = false;
  }
  return full;
}

function steer(g, e, tx, ty, speed, dt, kind) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return true;
  const gi = GROUND_INFO[g.world.g(Math.floor(e.x), Math.floor(e.y))];
  const s = Math.min(d, speed * (gi.speed || 1) * dt);
  e.angle = Math.atan2(dy, dx);
  const ok = moveEntity(g.world, e, (dx / d) * s, (dy / d) * s, kind);
  e.moving = true;
  if (!ok) {
    e.stuck = (e.stuck || 0) + dt;
    // try sliding sideways when blocked
    const side = (e.id % 2 ? 1 : -1) * Math.PI / 2;
    const a = e.angle + side;
    moveEntity(g.world, e, Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7, kind);
  } else e.stuck = 0;
  return false;
}

// ---------- zombies ----------
export const ZTYPES = {
  walker: { name: 'Walker', hp: 40, speed: 1.3, night: 2.0, dmg: 9, sdmg: 10, color: 0x6f7f5a, scale: 1, xp: 5 },
  runner: { name: 'Runner', hp: 30, speed: 2.5, night: 3.8, dmg: 7, sdmg: 6, color: 0x8a6a58, scale: 0.92, xp: 7 },
  brute: { name: 'Brute', hp: 160, speed: 1.05, night: 1.5, dmg: 20, sdmg: 40, color: 0x4b5844, scale: 1.4, xp: 18 },
};

let nextId = 1;
export const newId = () => nextId++;
export const bumpId = (n) => { if (n >= nextId) nextId = n + 1; };

export function makeZombie(x, y, type) {
  const t = ZTYPES[type];
  return { id: newId(), kind: 'zombie', type, x, y, r: 0.3 * t.scale, hp: t.hp, maxHp: t.hp, angle: 0, state: 'wander',
    tx: x, ty: y, timer: 0, atkCd: 0, perceive: Math.random() * 0.3, target: null, lostTime: 0, horde: false, hitFlash: 0 };
}

function humansAndPlayer(g) {
  const out = [];
  if (!g.player.dead) out.push(g.player);
  for (const h of g.humans) if (!h.dead) out.push(h);
  return out;
}

export function updateZombie(g, z, dt) {
  const t = ZTYPES[z.type];
  const night = g.darkness > 0.5;
  const speed = (night ? t.night : t.speed) * (z.horde ? 1.15 : 1);
  z.atkCd -= dt; z.hitFlash -= dt; z.moving = false;
  if (z.kb) { moveEntity(g.world, z, z.kb.x * dt * 8, z.kb.y * dt * 8, 'zombie'); z.kb.x *= 0.8; z.kb.y *= 0.8; if (Math.abs(z.kb.x) + Math.abs(z.kb.y) < 0.05) z.kb = null; }

  // perception
  z.perceive -= dt;
  if (z.perceive <= 0) {
    z.perceive = 0.3;
    const sight = night ? 7 : 12;
    let best = null, bd = 1e9;
    for (const h of humansAndPlayer(g)) {
      let s = sight;
      if (h === g.player) { if (h.crouch) s *= 0.5; if (h.sprinting) s *= 1.3; if (h.sleeping) s *= 0.4; if (h.lightOn && night) s *= 1.6; }
      const d = Math.hypot(h.x - z.x, h.y - z.y);
      if (d < s && d < bd && (d < 1.5 || g.world.los(z.x, z.y, h.x, h.y))) { best = h; bd = d; }
    }
    if (z.horde && !best && !g.player.dead) best = g.player;
    if (best) {
      if (z.state !== 'chase' && best === g.player && bd < 14) g.groan(z);
      z.state = 'chase'; z.target = best; z.lostTime = 0; z.tx = best.x; z.ty = best.y;
    } else if (z.state === 'chase') {
      z.lostTime += 0.3;
      if (z.lostTime > 6) { z.state = 'investigate'; z.target = null; }
    }
  }

  // spike traps
  const ti = Math.floor(z.x), tj = Math.floor(z.y);
  const under = g.world.o(ti, tj);
  if (under && OBJ[under.t].trap) {
    g.damage(z, OBJ[under.t].trap * dt, 'trap');
    under.hp -= 6 * dt;
    if (under.hp <= 0) g.destroyObject(ti, tj, false);
  }

  if (z.state === 'chase' && z.target) {
    const tg = z.target;
    if (tg.dead) { z.state = 'wander'; z.target = null; return; }
    const d = Math.hypot(tg.x - z.x, tg.y - z.y);
    if (d < z.r + tg.r + 0.35) {
      z.angle = Math.atan2(tg.y - z.y, tg.x - z.x);
      if (z.atkCd <= 0) { z.atkCd = 1.2; z.swing = 0.3; g.damage(tg, t.dmg, z); }
      return;
    }
    // follow the flow field toward the player; smash obstacles in the way
    if (tg === g.player && d > 1.6) {
      const step = g.flowStep(z);
      if (step) {
        if (step.smash) {
          z.angle = Math.atan2(step.y + 0.5 - z.y, step.x + 0.5 - z.x);
          if (Math.hypot(step.x + 0.5 - z.x, step.y + 0.5 - z.y) < 1.15) {
            if (z.atkCd <= 0) { z.atkCd = 1.3; z.swing = 0.3; g.damageObject(step.x, step.y, t.sdmg); }
            return;
          }
        }
        steer(g, z, step.x + 0.5, step.y + 0.5, speed, dt, 'zombie');
        return;
      }
    }
    steer(g, z, tg.x, tg.y, speed, dt, 'zombie');
    return;
  }

  if (z.state === 'investigate') {
    if (steer(g, z, z.tx, z.ty, speed * 0.8, dt, 'zombie') || z.stuck > 2) { z.state = 'wander'; z.timer = 2; }
    return;
  }

  // wander
  z.timer -= dt;
  if (z.timer <= 0) {
    z.timer = 3 + Math.random() * 6;
    if (Math.random() < 0.4) { z.tx = z.x; z.ty = z.y; } // stand still and sway
    else { z.tx = z.x + (Math.random() - 0.5) * 12; z.ty = z.y + (Math.random() - 0.5) * 12; }
  }
  if (Math.hypot(z.tx - z.x, z.ty - z.y) > 0.3) steer(g, z, z.tx, z.ty, speed * 0.4, dt, 'zombie');
}

// ---------- humans (survivors & raiders) ----------
export const FIRST_NAMES = ['Ada', 'Ben', 'Cass', 'Dmitri', 'Elena', 'Finn', 'Grace', 'Hugo', 'Iris', 'Jonah', 'Kira', 'Leo', 'Mara', 'Nico',
  'Opal', 'Pete', 'Quinn', 'Rosa', 'Sam', 'Tess', 'Uri', 'Vera', 'Wade', 'Xan', 'Yara', 'Zeke', 'Abel', 'Bea', 'Cole', 'Dina', 'Eli', 'Faye',
  'Gus', 'Hana', 'Ivan', 'June', 'Kai', 'Lena', 'Milo', 'Nora', 'Otto', 'Pia', 'Reed', 'Sage', 'Theo', 'Uma', 'Vic', 'Willa'];
export const SURNAMES = ['Ashworth', 'Blackwood', 'Carrow', 'Dunstan', 'Everly', 'Fairchild', 'Graves', 'Holloway', 'Ironside', 'Kettle',
  'Lockhart', 'Marsh', 'Northcott', 'Oakes', 'Pryce', 'Redmayne', 'Stone', 'Thorne', 'Vance', 'Whitlock'];

export const TRAITS = {
  Friendly: 'Warms up to people quickly.',
  Grumpy: 'Hard to impress.',
  Brave: 'Fights the dead instead of running.',
  Coward: 'Flees at the first sign of danger.',
  Glutton: 'Loves food gifts, gets hungry fast.',
  Romantic: 'Open to romance.',
  Loyal: 'Never abandons a friend.',
  Hardworking: 'Gathers twice as much.',
  Lazy: 'Gathers half as much.',
  Funny: 'Jokes always land.',
};
const OPPOSED = [['Friendly', 'Grumpy'], ['Brave', 'Coward'], ['Hardworking', 'Lazy']];

export function rollTraits(rng) {
  const keys = Object.keys(TRAITS), out = [];
  while (out.length < 2) {
    const t = pick(rng, keys);
    if (out.includes(t)) continue;
    if (OPPOSED.some(([a, b]) => (t === a && out.includes(b)) || (t === b && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
}

export function makeHuman(rng, x, y, faction) {
  const raider = faction === 'raider';
  const ranged = raider && rng() < 0.5;
  return {
    id: newId(), kind: 'human', faction, x, y, r: 0.3, angle: 0,
    name: pick(rng, FIRST_NAMES) + ' ' + pick(rng, SURNAMES),
    age: randInt(rng, 19, 58),
    traits: raider ? ['Hostile'] : rollTraits(rng),
    hp: raider ? 70 : 80, maxHp: raider ? 70 : 80,
    hunger: 80, opinion: raider ? -100 : randInt(rng, -5, 15), romance: 0,
    status: 'stranger', mode: 'wander', home: { x, y }, stay: null,
    weapon: ranged ? { name: 'Pipe Pistol', dmg: 14, range: 8, cd: 1.5, ranged: true, spread: 0.12 }
      : raider ? { name: 'Machete', dmg: 13, range: 1.2, cd: 1.0 } : { name: 'Knife', dmg: 8, range: 1.1, cd: 0.8 },
    atkCd: 0, timer: 0, tx: x, ty: y, cd: {}, bubble: null, hitFlash: 0, workTimer: HOUR * 2, hungerTimer: HOUR,
    color: raider ? 0x7a2a2a : [0x3b6ea5, 0xa5803b, 0x6e3ba5, 0x3ba57a, 0xa53b6e][randInt(rng, 0, 4)],
  };
}

export function say(h, text, dur = 3.5) { h.bubble = { text, t: dur }; }

const isAlly = (h) => h.faction === 'survivor' && ['follower', 'partner', 'family'].includes(h.status);

export function updateHuman(g, h, dt) {
  h.atkCd -= dt; h.hitFlash -= dt; h.moving = false;
  if (h.bubble) { h.bubble.t -= dt; if (h.bubble.t <= 0) h.bubble = null; }
  if (h.kb) { moveEntity(g.world, h, h.kb.x * dt * 8, h.kb.y * dt * 8, 'human'); h.kb.x *= 0.8; h.kb.y *= 0.8; if (Math.abs(h.kb.x) + Math.abs(h.kb.y) < 0.05) h.kb = null; }
  const p = g.player;
  const speed = h.faction === 'raider' ? 3.3 : 3.6;

  if (h.faction === 'raider') {
    // pick a target: player or nearest non-raider human
    let tg = null, bd = 18;
    for (const c of humansAndPlayer(g)) {
      if (c === h || c.faction === 'raider') continue;
      const d = Math.hypot(c.x - h.x, c.y - h.y);
      if (d < bd) { bd = d; tg = c; }
    }
    // zombies nearby are also threats
    for (const z of g.zombies) {
      const d = Math.hypot(z.x - h.x, z.y - h.y);
      if (d < 4 && d < bd) { bd = d; tg = z; }
    }
    if (h.hp < h.maxHp * 0.25 && tg) { // retreat
      steer(g, h, h.x - (tg.x - h.x), h.y - (tg.y - h.y), speed, dt, 'human');
      return;
    }
    if (tg) {
      if (!h.shouted) { h.shouted = true; say(h, pick(Math.random, ['Hand over your stuff!', 'Nobody leaves alive.', 'Fresh meat!', "That's our turf!"])); }
      fightTarget(g, h, tg, dt, speed);
      return;
    }
    // drift toward the player's last known position
    steer(g, h, h.tx, h.ty, speed * 0.6, dt, 'human');
    return;
  }

  // ---- survivor ----
  const ally = isAlly(h);
  let threat = null, td = ally ? 8 : 6;
  for (const z of g.zombies) {
    const d = Math.hypot(z.x - h.x, z.y - h.y);
    if (d < td) { td = d; threat = z; }
  }
  for (const r of g.humans) {
    if (r.faction !== 'raider' || r.dead) continue;
    const d = Math.hypot(r.x - h.x, r.y - h.y);
    if (d < td) { td = d; threat = r; }
  }
  const brave = h.traits.includes('Brave') || (ally && !h.traits.includes('Coward'));
  if (threat) {
    if (brave && h.hp > h.maxHp * 0.25) { fightTarget(g, h, threat, dt, speed); return; }
    if (!h.fleeSaid) { h.fleeSaid = true; say(h, pick(Math.random, ['Stay away!', 'Help!', 'Run!'])); }
    steer(g, h, h.x - (threat.x - h.x) * 2, h.y - (threat.y - h.y) * 2, speed, dt, 'human');
    return;
  }
  h.fleeSaid = false;

  // needs (allies only — strangers fend for themselves)
  if (ally) {
    h.hunger -= dt * 100 / (DAY_LEN * 1.3) * (h.traits.includes('Glutton') ? 1.4 : 1);
    h.hunger = Math.max(0, h.hunger);
    h.hungerTimer -= dt;
    if (h.hungerTimer <= 0) {
      h.hungerTimer = HOUR;
      if (h.hunger < 50 && g.npcEatFromStorage(h)) { /* ate */ }
      else if (h.hunger < 25) say(h, h.hunger <= 0 ? "I'm starving... I can't go on like this." : "I'm getting really hungry.");
      if (h.hunger <= 0) {
        g.changeOpinion(h, -4);
        if (h.opinion < -10 && !h.traits.includes('Loyal')) {
          say(h, "I'm done. I'll survive on my own.", 5);
          g.msg(`${h.name} has left your group.`, 'bad');
          h.status = 'stranger'; h.mode = 'wander'; h.home = { x: h.x, y: h.y };
        }
      }
    }
  }

  if (h.mode === 'follow') {
    const d = Math.hypot(p.x - h.x, p.y - h.y);
    if (d > 22 && !g.onScreen(h)) { // catch up off-screen
      const a = Math.random() * Math.PI * 2;
      const nx = p.x + Math.cos(a) * 1.5, ny = p.y + Math.sin(a) * 1.5;
      if (!collides(g.world, nx, ny, h.r, 'human')) { h.x = nx; h.y = ny; }
    }
    if (d > 2.6) steer(g, h, p.x, p.y, d > 6 ? speed * 1.1 : speed * 0.75, dt, 'human');
    return;
  }

  if (h.mode === 'stay' || h.mode === 'work') {
    const s = h.stay || h.home;
    if (h.mode === 'work') {
      h.workTimer -= dt;
      if (h.workTimer <= 0) { h.workTimer = HOUR * 2; g.npcWork(h); }
    }
    wanderNear(g, h, s, h.mode === 'work' ? 4 : 1.2, dt, speed);
    return;
  }
  wanderNear(g, h, h.home, 5, dt, speed);
}

function wanderNear(g, h, c, rad, dt, speed) {
  h.timer -= dt;
  if (h.timer <= 0) {
    h.timer = 4 + Math.random() * 6;
    h.tx = c.x + (Math.random() - 0.5) * 2 * rad; h.ty = c.y + (Math.random() - 0.5) * 2 * rad;
  }
  if (Math.hypot(h.tx - h.x, h.ty - h.y) > 0.3 && (h.stuck || 0) < 1.5) steer(g, h, h.tx, h.ty, speed * 0.45, dt, 'human');
  else if ((h.stuck || 0) >= 1.5) { h.timer = 0; h.stuck = 0; }
}

function fightTarget(g, h, tg, dt, speed) {
  const d = Math.hypot(tg.x - h.x, tg.y - h.y);
  const w = h.weapon;
  h.angle = Math.atan2(tg.y - h.y, tg.x - h.x);
  if (w.ranged && d < w.range && d > 2 && g.world.los(h.x, h.y, tg.x, tg.y)) {
    if (h.atkCd <= 0) {
      h.atkCd = w.cd;
      const a = h.angle + (Math.random() - 0.5) * 2 * w.spread;
      g.spawnProjectile(h.x, h.y, a, 26, w.dmg, w.range + 2, h.faction === 'raider' ? 'raider' : 'ally', 0);
      g.noise(h.x, h.y, 20);
      g.fx.push({ type: 'muzzle', x: h.x + Math.cos(a) * 0.5, y: h.y + Math.sin(a) * 0.5, t: 0.08 });
    }
    return;
  }
  if (d < w.range + tg.r + 0.15 && !w.ranged || (w.ranged && d < 1.3)) {
    if (h.atkCd <= 0) { h.atkCd = w.cd; h.swing = 0.25; g.damage(tg, w.dmg, h); }
    return;
  }
  steer(g, h, tg.x, tg.y, speed, dt, 'human');
}

// ---------- animals ----------
export const ATYPES = {
  rabbit: { name: 'Rabbit', hp: 10, speed: 4.6, flee: 5, r: 0.2, color: 0xb59a7a, drops: [['raw_meat', 1, 1], ['hide', 1, 1]] },
  deer: { name: 'Deer', hp: 45, speed: 5.0, flee: 9, r: 0.35, color: 0x9a6a3c, drops: [['raw_meat', 2, 4], ['hide', 2, 3]] },
  wolf: { name: 'Wolf', hp: 40, speed: 4.4, hostile: true, dmg: 10, r: 0.3, color: 0x6a6a72, drops: [['raw_meat', 2, 2], ['hide', 1, 2]] },
};

export function makeAnimal(x, y, type) {
  const t = ATYPES[type];
  return { id: newId(), kind: 'animal', type, x, y, r: t.r, hp: t.hp, maxHp: t.hp, angle: Math.random() * 6.28, timer: 0, tx: x, ty: y, atkCd: 0, hitFlash: 0 };
}

export function updateAnimal(g, a, dt) {
  const t = ATYPES[a.type];
  a.atkCd -= dt; a.hitFlash -= dt; a.moving = false;
  const p = g.player;
  if (t.hostile) {
    let tg = null, bd = g.darkness > 0.5 ? 12 : 7;
    for (const h of humansAndPlayer(g)) {
      const d = Math.hypot(h.x - a.x, h.y - a.y);
      if (d < bd) { bd = d; tg = h; }
    }
    if (a.hp < t.hp * 0.3) tg = null; // wounded wolves retreat
    if (tg) {
      if (bd < a.r + tg.r + 0.3) { if (a.atkCd <= 0) { a.atkCd = 1.0; a.swing = 0.25; g.damage(tg, t.dmg, a); } }
      else steer(g, a, tg.x, tg.y, t.speed, dt, 'animal');
      return;
    }
  } else {
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    const fleeR = p.crouch ? t.flee * 0.45 : t.flee;
    if ((d < fleeR || a.scared > 0) && !p.dead) {
      a.scared = (a.scared || 0) - dt;
      steer(g, a, a.x - (p.x - a.x) * 3, a.y - (p.y - a.y) * 3, t.speed, dt, 'animal');
      return;
    }
  }
  a.timer -= dt;
  if (a.timer <= 0) { a.timer = 2 + Math.random() * 5; a.tx = a.x + (Math.random() - 0.5) * 8; a.ty = a.y + (Math.random() - 0.5) * 8; }
  if (Math.hypot(a.tx - a.x, a.ty - a.y) > 0.3) steer(g, a, a.tx, a.ty, t.speed * 0.25, dt, 'animal');
}

// ---------- spawning ----------
function spawnPoint(g, minD, maxD, grounds) {
  const p = g.player;
  for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!g.world.inb(tx, ty) || g.world.blocked(tx, ty, 'zombie')) continue;
    const gr = g.world.g(tx, ty);
    if (gr === G.WATER || GROUND_INFO[gr].built) continue;
    if (grounds && !grounds.includes(gr)) continue;
    if (g.nearPlayerBase(tx, ty, 7)) continue;
    return [tx + 0.5, ty + 0.5];
  }
  return null;
}

export function spawnManager(g) {
  const p = g.player;
  if (p.dead) return;
  const night = g.darkness > 0.5;
  const day = g.day;
  const inTown = g.world.towns.some(t => Math.hypot(t.x - p.x, t.y - p.y) < t.r + 10);
  let target = Math.min(14 + day * 1.5, 40) * (night ? 1.7 : 1) * (inTown ? 1.4 : 1);
  if (p.sleeping) target *= 0.6;
  // despawn far zombies
  g.zombies = g.zombies.filter(z => z.horde || z.state === 'chase' || Math.hypot(z.x - p.x, z.y - p.y) < 55);
  if (g.zombies.length < target) {
    const n = Math.min(3, Math.ceil(target - g.zombies.length));
    for (let i = 0; i < n; i++) {
      const pt = spawnPoint(g, 22, 34);
      if (!pt) continue;
      const r = Math.random();
      let type = 'walker';
      if (day >= 2 && r < (night ? 0.3 : 0.12)) type = 'runner';
      else if (day >= 4 && r > 0.94) type = 'brute';
      g.zombies.push(makeZombie(pt[0], pt[1], type));
    }
  }
  // wildlife
  g.animals = g.animals.filter(a => Math.hypot(a.x - p.x, a.y - p.y) < 50);
  if (g.animals.length < 9) {
    const r = Math.random();
    const type = night && r < 0.35 ? 'wolf' : r < 0.6 ? 'rabbit' : r < 0.9 ? 'deer' : 'wolf';
    const pt = spawnPoint(g, 20, 34, type === 'wolf' ? [G.FOREST] : [G.GRASS, G.FOREST, G.DIRT]);
    if (pt) {
      g.animals.push(makeAnimal(pt[0], pt[1], type));
      if (type === 'wolf' && Math.random() < 0.6) g.animals.push(makeAnimal(pt[0] + 0.6, pt[1], 'wolf'));
    }
  }
}

export function spawnRaiders(g, rng) {
  const n = randInt(rng, 1, Math.min(4, 1 + Math.floor(g.day / 4)));
  const pt = spawnPoint(g, 26, 34);
  if (!pt) return;
  for (let i = 0; i < n; i++) {
    const h = makeHuman(rng, pt[0] + (rng() - 0.5), pt[1] + (rng() - 0.5), 'raider');
    h.tx = g.player.x; h.ty = g.player.y;
    g.humans.push(h);
  }
  g.msg('You hear voices in the distance... raiders.', 'bad');
}

export function spawnHorde(g) {
  const n = Math.min(18 + Math.floor(g.day * 1.3), 60);
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    const pt = spawnPoint(g, 24, 34);
    if (!pt) continue;
    const r = Math.random();
    const z = makeZombie(pt[0], pt[1], r < 0.3 ? 'runner' : r > 0.9 && g.day >= 7 ? 'brute' : 'walker');
    z.horde = true; z.state = 'chase'; z.target = g.player;
    g.zombies.push(z);
    made++;
  }
}

export const allyStatus = isAlly;
export const itemValue = (id) => {
  const d = ITEMS[id];
  if (d.use?.hunger) return Math.round(d.use.hunger / 3) + 2;
  if (d.cat === 'med') return 12;
  if (d.cat === 'weapon' || d.cat === 'tool') return 15;
  if (d.cat === 'gear') return 18;
  return 2;
};
