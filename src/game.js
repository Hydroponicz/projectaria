// Core simulation: player, needs, combat, crafting, building, time, social, death & succession.
import { DAY_LEN, HOUR, START_HOUR, HORDE_EVERY, REACH, G, GROUND_INFO, WORLD_W } from './config.js';
import { ITEMS } from './data/items.js';
import { OBJ } from './data/objects.js';
import { RECIPES, STATIONS } from './data/recipes.js';
import { LOOT } from './data/loot.js';
import { World, generateWorld, findSpawn } from './world.js';
import { Grid, makeItem } from './inventory.js';
import { mulberry32, randInt, pick, weightedPick, angleDiff, clamp, MinHeap, bumpUid } from './util.js';
import {
  updateZombie, updateHuman, updateAnimal, spawnManager, spawnRaiders, spawnHorde, makeHuman, makeZombie,
  moveEntity, collides, say, allyStatus, itemValue, FIRST_NAMES, SURNAMES, ZTYPES, ATYPES, bumpId, newId,
} from './ai.js';
import { perkMods, scoreLife, saveLegacy } from './legacy.js';

export const SKILLS = { gather: 'Gathering', combat: 'Combat', craft: 'Crafting', build: 'Building', survival: 'Survival' };
export const xpNeed = (lvl) => Math.round(40 * Math.pow(lvl, 1.6));
const FISTS = { type: 'melee', dmg: 4, range: 1.0, cd: 0.5, stam: 4 };
const FLOW_R = 36;
const SAVE_KEY = 'aria_save_v1';

export class Game {
  constructor(legacy) {
    this.legacy = legacy;
    this.mods = perkMods(legacy);
    this.rng = mulberry32((Math.random() * 1e9) | 0);
    this.zombies = []; this.humans = []; this.animals = []; this.projectiles = [];
    this.fx = []; this.floaters = []; this.log = [];
    this.input = { mx: 0, my: 0, sprint: false, mouseDown: false, clicked: false, aimX: 0, aimY: 0, hoverTile: null };
    this.timeScale = 1; this.time = 0; this.over = false;
    this.buildSel = null; this.hooks = {};
    this.flow = null; this.flowTimer = 0; this.spawnTimer = 0; this.saveTimer = 0;
    this.stats = { kills: 0, built: 0, crafted: 0, looted: 0 };
    this.raidTimer = DAY_LEN * 0.6;
    this.hordeDone = {};
    this.invVersion = 0;
  }

  // ---------- setup ----------
  newWorld(dynasty) {
    const seed = (Math.random() * 1e9) | 0;
    this.world = generateWorld(seed);
    this.dynasty = { name: dynasty || pick(this.rng, SURNAMES), generation: 1 };
    const [sx, sy] = findSpawn(this.world, this.rng);
    this.player = this.makePlayer(sx, sy, 20, null);
    // survivors living in the towns
    for (const town of this.world.towns) {
      const n = randInt(this.rng, 1, 2);
      for (let i = 0; i < n; i++) {
        const b = pick(this.rng, town.buildings);
        const x = b.x + 1.5 + this.rng() * (b.w - 3), y = b.y + 1.5 + this.rng() * (b.h - 3);
        if (!collides(this.world, x, y, 0.3, 'human')) this.humans.push(makeHuman(this.rng, x, y, 'survivor'));
      }
    }
    this.lastDay = this.day;
    this.msg(`Day 1. ${this.player.name} wakes with nothing. Gather sticks, stones and fiber.`, 'info');
    this.msg('Press Q to craft, B to build, Tab for inventory. Survive.', 'info');
  }

  makePlayer(x, y, age, inherit) {
    const m = this.mods;
    const skills = {};
    for (const k of Object.keys(SKILLS)) {
      const base = m.mentor ? 2 : 1;
      skills[k] = { lvl: Math.max(base, inherit ? Math.floor(inherit[k].lvl * 0.4) : 1), xp: 0 };
    }
    const p = {
      kind: 'player', x, y, r: 0.3, angle: 0,
      name: pick(this.rng, FIRST_NAMES) + ' ' + this.dynasty.name,
      age, birthDay: this.day,
      hp: m.maxHp, maxHp: m.maxHp, hunger: 85, thirst: 85, stamina: 100, energy: 90,
      bleeding: false, infection: 0, sick: 0,
      inv: new Grid(6, 5), pack: null, armor: null,
      hotbar: [null, null, null, null, null], sel: 0,
      skills, atkCd: 0, reload: 0, crouch: false, sleeping: false, staminaDelay: 0, noiseTimer: 0, hitFlash: 0,
      kills: 0, bornAt: this.time,
    };
    if (m.pack) { p.pack = 'hide_backpack'; p.inv.resize(8, 6); }
    if (m.kit) {
      for (const id of ['stone_axe', 'stone_pick', 'wooden_spear', 'torch']) p.inv.add(makeItem(id));
      p.inv.addNew('bandage', 3);
      p.hotbar = p.inv.items.slice(0, 4).map(it => it.uid).concat([null]);
    }
    return p;
  }

  // ---------- time ----------
  get clock() { return START_HOUR * HOUR + this.time; }
  get day() { return Math.floor(this.clock / DAY_LEN) + 1; }
  get hour() { return (this.clock % DAY_LEN) / HOUR; }
  get darkness() {
    const h = this.hour;
    if (h >= 21 || h < 5) return 1;
    if (h >= 19) return (h - 19) / 2;
    if (h < 7) return 1 - (h - 5) / 2;
    return 0;
  }
  get hordeNight() { return this.day % HORDE_EVERY === 0 && (this.hour >= 20 || this.hour < 5); }
  timeString() {
    const h = Math.floor(this.hour), mi = Math.floor((this.hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }

  msg(text, cls = '') {
    this.log.push({ text, cls, t: performance.now() });
    if (this.log.length > 60) this.log.shift();
  }
  floater(x, y, text, color = '#fff') { this.floaters.push({ x, y, text, color, t: 1.4 }); }

  // ---------- skills ----------
  lvl(k) { return this.player.skills[k].lvl; }
  addXp(k, amt) {
    const s = this.player.skills[k];
    s.xp += amt * this.mods.xp;
    while (s.xp >= xpNeed(s.lvl)) {
      s.xp -= xpNeed(s.lvl); s.lvl++;
      this.msg(`${SKILLS[k]} increased to level ${s.lvl}!`, 'good');
    }
  }

  // ---------- inventory helpers ----------
  touchInv() { this.invVersion++; }
  selectedItem() {
    const p = this.player;
    const ref = p.hotbar[p.sel];
    if (ref == null) return null;
    return p.inv.items.find(it => it.uid === ref) || null;
  }
  resolveHotbar() {
    // keep stackable slots alive when a stack is used up (e.g. ammo, food)
    const p = this.player;
    for (let i = 0; i < p.hotbar.length; i++) {
      const ref = p.hotbar[i];
      if (ref == null || p.inv.items.some(it => it.uid === ref)) continue;
      const lastId = p.hotbarIds?.[i];
      const rep = lastId && p.inv.items.find(it => it.id === lastId);
      p.hotbar[i] = rep ? rep.uid : null;
    }
    p.hotbarIds = p.hotbar.map(ref => p.inv.items.find(it => it.uid === ref)?.id || null);
  }
  bindHotbar(it, slot) {
    const p = this.player;
    for (let i = 0; i < p.hotbar.length; i++) if (p.hotbar[i] === it.uid) p.hotbar[i] = null;
    p.hotbar[slot] = it.uid;
    this.resolveHotbar(); this.touchInv();
  }

  give(id, n, quiet) {
    const p = this.player;
    const left = p.inv.addNew(id, n);
    if (left > 0) {
      const tmp = makeItem(id, left);
      this.dropItems(p.x, p.y, [tmp]);
      this.msg(`Inventory full — dropped ${ITEMS[id].name}.`, 'bad');
    }
    if (!quiet) this.floater(p.x, p.y - 0.4, `+${n} ${ITEMS[id].name}`, '#cfe8a9');
    this.touchInv();
  }

  // Put item instances into a ground bag near (x,y). Returns the bag object.
  dropItems(x, y, items, label) {
    let pending = items.slice();
    let bag = null;
    let tries = 0;
    while (pending.length && tries++ < 6) {
      const spot = this.world.freeTileNear(Math.floor(x), Math.floor(y), 'bag');
      if (!spot) return null;
      const [tx, ty] = spot;
      let o = this.world.o(tx, ty);
      if (!o || o.t !== 'bag') { o = { t: 'bag', inv: new Grid(8, 8), label, created: this.time }; this.world.setO(tx, ty, o); }
      bag = bag || o;
      const rest = [];
      for (const it of pending) if (o.inv.add(it) > 0) rest.push(it);
      if (rest.length === pending.length) { x += 1; } // bag full, try next tile
      pending = rest;
    }
    return bag;
  }

  wear(it, amt = 1) {
    if (!it || it.dur == null) return;
    it.dur -= amt;
    if (it.dur <= 0) {
      this.player.inv.remove(it);
      this.msg(`Your ${ITEMS[it.id].name} broke!`, 'bad');
      this.resolveHotbar();
    }
    this.touchInv();
  }

  // ---------- item actions ----------
  useItem(it) {
    const p = this.player;
    const d = ITEMS[it.id];
    if (d.equip) return this.equipGear(it);
    if (d.fill) {
      if (!this.world.nearWater(p.x, p.y, 1.4)) { this.msg('You need to stand next to water to fill this.', 'bad'); return; }
      p.inv.remove(it);
      const w = makeItem('murky_water'); w.x = it.x; w.y = it.y; w.rot = it.rot;
      if (p.inv.fits(w, it.x, it.y, it.rot)) p.inv.place(w, it.x, it.y, it.rot); else this.give('murky_water', 1, true);
      this.msg('Filled the bottle with murky water. Boil it at a campfire.', '');
      this.touchInv(); this.resolveHotbar();
      return;
    }
    const u = d.use;
    if (!u) return;
    if (u.hunger) p.hunger = clamp(p.hunger + u.hunger, 0, 100);
    if (u.thirst) p.thirst = clamp(p.thirst + u.thirst, 0, 100);
    if (u.heal) p.hp = Math.min(p.maxHp, p.hp + u.heal);
    if (u.cure) {
      if (u.cure.includes('bleeding') && p.bleeding) { p.bleeding = false; this.msg('The bleeding stops.', 'good'); }
      if (u.cure.includes('infection') && p.infection > 0) { p.infection = 0; this.msg('The infection recedes. You feel human again.', 'good'); }
      if (u.cure.includes('sick')) p.sick = 0;
    }
    if (u.sick && this.rng() < u.sick) { p.sick = 90; this.msg('Your stomach turns. You feel sick.', 'bad'); }
    this.addXp('survival', 1);
    it.n--;
    const slot = { x: it.x, y: it.y, rot: it.rot };
    if (it.n <= 0) p.inv.remove(it);
    if (d.leaves) {
      const left = makeItem(d.leaves);
      if (it.n <= 0 && p.inv.fits(left, slot.x, slot.y, slot.rot)) p.inv.place(left, slot.x, slot.y, slot.rot);
      else this.give(d.leaves, 1, true);
    }
    this.floater(p.x, p.y - 0.4, d.cat === 'med' ? 'Treated' : 'Consumed ' + d.name, '#9fd7ff');
    this.resolveHotbar(); this.touchInv();
  }

  equipGear(it) {
    const p = this.player;
    const d = ITEMS[it.id];
    p.inv.remove(it);
    if (d.equip === 'pack') {
      const old = p.pack;
      p.pack = it.id;
      const overflow = p.inv.resize(d.grid[0], d.grid[1]);
      if (old) overflow.push(makeItem(old));
      for (const o of overflow) if (p.inv.add(o) > 0) this.dropItems(p.x, p.y, [o]);
      this.msg(`Equipped ${d.name}. Inventory is now ${d.grid[0]}x${d.grid[1]}.`, 'good');
    } else {
      const old = p.armor;
      p.armor = it.id;
      if (old) { const o = makeItem(old); if (p.inv.add(o) > 0) this.dropItems(p.x, p.y, [o]); }
      this.msg(`Equipped ${d.name}.`, 'good');
    }
    this.resolveHotbar(); this.touchInv();
  }

  unequip(slot) {
    const p = this.player;
    const id = slot === 'pack' ? p.pack : p.armor;
    if (!id) return;
    const it = makeItem(id);
    if (slot === 'pack') {
      p.pack = null;
      const overflow = p.inv.resize(6, 5);
      if (overflow.length) this.dropItems(p.x, p.y, overflow);
      if (overflow.length) this.msg('Some items fell to the ground.', 'bad');
    } else p.armor = null;
    if (p.inv.add(it) > 0) this.dropItems(p.x, p.y, [it]);
    this.resolveHotbar(); this.touchInv();
  }

  scrapItem(it, grid) {
    const d = ITEMS[it.id];
    if (!d.scrap) return;
    const p = this.player;
    const g = grid || p.inv;
    const n = it.n;
    g.remove(it);
    const bonus = this.lvl('craft') >= 4 ? 1 : 0;
    const got = [];
    for (const [id, k] of Object.entries(d.scrap)) {
      const total = (k + (bonus && this.rng() < 0.5 ? 1 : 0)) * n;
      const left = g.addNew(id, total);
      if (left > 0) this.give(id, left, true);
      got.push(`${total} ${ITEMS[id].name}`);
    }
    this.msg(`Scrapped ${d.name}: ${got.join(', ')}`, 'good');
    this.addXp('craft', 2 * n);
    this.resolveHotbar(); this.touchInv();
  }

  dropFromInventory(it, grid) {
    (grid || this.player.inv).remove(it);
    this.dropItems(this.player.x, this.player.y, [it]);
    this.resolveHotbar(); this.touchInv();
  }

  // ---------- crafting ----------
  nearStations() {
    const p = this.player, s = new Set([null]);
    const px = Math.floor(p.x), py = Math.floor(p.y);
    for (let y = py - 3; y <= py + 3; y++) for (let x = px - 3; x <= px + 3; x++) {
      const d = this.world.def(x, y);
      if (d?.station) s.add(d.station);
    }
    return s;
  }
  canCraft(r, stations = this.nearStations()) {
    if (!stations.has(r.st)) return { ok: false, why: `Requires ${STATIONS[r.st]}` };
    if (this.lvl('craft') < r.lvl) return { ok: false, why: `Requires Crafting ${r.lvl}` };
    if (!this.player.inv.has(r.req)) return { ok: false, why: 'Missing materials' };
    return { ok: true };
  }
  craft(r, times = 1) {
    let made = 0;
    for (let i = 0; i < times; i++) {
      if (!this.canCraft(r).ok) break;
      this.player.inv.takeAll(r.req);
      for (let k = 0; k < r.n; k++) {
        if (ITEMS[r.out].stack > 1) { this.give(r.out, r.n, true); break; }
        const it = makeItem(r.out);
        if (it.dur) it.dur = Math.round(it.dur * (1 + 0.05 * (this.lvl('craft') - 1)));
        if (this.player.inv.add(it) > 0) this.dropItems(this.player.x, this.player.y, [it]);
      }
      if (r.also) for (const [id, n] of Object.entries(r.also)) this.give(id, n, true);
      this.addXp('craft', r.xp);
      this.stats.crafted++; made++;
    }
    if (made) {
      this.msg(`Crafted ${ITEMS[r.out].name}${r.n * made > 1 ? ' x' + r.n * made : ''}.`, 'good');
      this.floater(this.player.x, this.player.y - 0.4, `Crafted ${ITEMS[r.out].name}`, '#ffd27a');
    }
    this.resolveHotbar(); this.touchInv();
    return made;
  }

  // ---------- building ----------
  canBuild(type, tx, ty) {
    const d = OBJ[type];
    const p = this.player;
    const w = this.world;
    if (!w.inb(tx, ty)) return { ok: false, why: 'Out of bounds' };
    if (Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) > 6) return { ok: false, why: 'Too far away' };
    if (this.lvl('build') < d.build.lvl) return { ok: false, why: `Requires Building ${d.build.lvl}` };
    const gr = w.g(tx, ty);
    if (GROUND_INFO[gr].water) return { ok: false, why: "Can't build on water" };
    const o = w.o(tx, ty);
    if (d.floor) {
      if (gr === d.floor) return { ok: false, why: 'Already floored' };
      if (o && OBJ[o.t].kind === 'resource' && OBJ[o.t].solid) return { ok: false, why: 'Blocked' };
    } else {
      if (o && o.t !== 'tallgrass') return { ok: false, why: 'Tile occupied' };
      if (d.solid || d.door) {
        const ents = [p, ...this.zombies, ...this.humans, ...this.animals];
        for (const e of ents) {
          const cx = clamp(e.x, tx, tx + 1), cy = clamp(e.y, ty, ty + 1);
          if ((cx - e.x) ** 2 + (cy - e.y) ** 2 < e.r * e.r) return { ok: false, why: 'Something is in the way' };
        }
      }
    }
    if (!p.inv.has(d.build.cost)) return { ok: false, why: 'Missing materials' };
    return { ok: true };
  }
  build(type, tx, ty) {
    const c = this.canBuild(type, tx, ty);
    if (!c.ok) { this.msg(c.why, 'bad'); return false; }
    const d = OBJ[type];
    this.player.inv.takeAll(d.build.cost);
    if (d.floor) {
      const o = this.world.o(tx, ty);
      if (o && o.t === 'tallgrass') this.world.setO(tx, ty, null);
      this.world.setG(tx, ty, d.floor);
    } else {
      const hp = Math.round(d.hp * (1 + 0.06 * (this.lvl('build') - 1)));
      const o = { t: type, hp, maxHp: hp, own: true };
      if (d.door) o.open = false;
      if (d.rain) o.last = this.time;
      this.world.setO(tx, ty, o);
    }
    this.addXp('build', 4 + d.build.lvl * 2);
    this.stats.built++;
    this.fx.push({ type: 'build', x: tx + 0.5, y: ty + 0.5, t: 0.4 });
    this.touchInv();
    return true;
  }
  deconstruct(tx, ty) {
    const o = this.world.o(tx, ty);
    const gr = this.world.g(tx, ty);
    let d = o ? OBJ[o.t] : null;
    if (!d?.build && GROUND_INFO[gr].built) {
      // pull up a floor
      const fd = Object.values(OBJ).find(x => x.floor === gr);
      this.world.setG(tx, ty, G.DIRT);
      for (const [id, n] of Object.entries(fd.build.cost)) if (Math.floor(n / 2)) this.give(id, Math.floor(n / 2), true);
      this.msg(`Removed ${fd.name}.`, '');
      return;
    }
    if (!d?.build) { this.msg('You can only deconstruct things you built.', 'bad'); return; }
    if (Math.hypot(tx + 0.5 - this.player.x, ty + 0.5 - this.player.y) > 6) { this.msg('Too far away', 'bad'); return; }
    const frac = 0.5 * (o.hp / (o.maxHp || d.hp));
    for (const [id, n] of Object.entries(d.build.cost)) { const k = Math.floor(n * frac + 0.5); if (k) this.give(id, k, true); }
    this.destroyObject(tx, ty, true);
    this.msg(`Deconstructed ${d.name}.`, '');
  }
  repair(tx, ty) {
    const o = this.world.o(tx, ty);
    const d = o && OBJ[o.t];
    if (!d?.build || d.floor) { this.msg('Nothing to repair there.', 'bad'); return; }
    const max = o.maxHp || d.hp;
    if (o.hp >= max) { this.msg(`${d.name} is in perfect condition.`, ''); return; }
    const [mat] = Object.entries(d.build.cost)[0];
    if (!this.player.inv.take(mat, 1)) { this.msg(`Repairing needs 1 ${ITEMS[mat].name}.`, 'bad'); return; }
    o.hp = Math.min(max, o.hp + max * 0.25);
    this.addXp('build', 1);
    this.fx.push({ type: 'build', x: tx + 0.5, y: ty + 0.5, t: 0.3 });
    this.floater(tx + 0.5, ty, 'Repaired', '#cfe8a9');
    this.touchInv();
  }

  // Remove an object; spills container contents.
  destroyObject(tx, ty, quiet) {
    const o = this.world.o(tx, ty);
    if (!o) return;
    const d = OBJ[o.t];
    this.world.setO(tx, ty, null);
    if (o.inv && !o.inv.isEmpty()) this.dropItems(tx + 0.5, ty + 0.5, o.inv.items.slice());
    if (o.own && !quiet) this.msg(`Your ${d.name} was destroyed!`, 'bad');
    this.fx.push({ type: 'debris', x: tx + 0.5, y: ty + 0.5, t: 0.6, color: d.kind === 'resource' ? 0x7a6a50 : 0x8a7055 });
    if (this.hooks.onObjectRemoved) this.hooks.onObjectRemoved(o);
  }
  damageObject(tx, ty, amt) {
    const o = this.world.o(tx, ty);
    if (!o) return;
    const d = OBJ[o.t];
    if (!d.breakable) return;
    o.hp -= amt;
    o.hitT = this.time;
    this.world.touch(tx, ty);
    this.fx.push({ type: 'debris', x: tx + 0.5, y: ty + 0.5, t: 0.25, color: 0x8a7055, small: true });
    this.noise(tx + 0.5, ty + 0.5, 8);
    if (o.hp <= 0) this.destroyObject(tx, ty);
  }
  nearPlayerBase(tx, ty, r) {
    for (let y = ty - r; y <= ty + r; y += 2) for (let x = tx - r; x <= tx + r; x += 2) {
      const o = this.world.o(x, y);
      if (o?.own) return true;
    }
    return false;
  }

  // ---------- loot ----------
  ensureLoot(o) {
    if (o.inv) return;
    const d = OBJ[o.t];
    o.inv = new Grid(d.size[0], d.size[1]);
    if (!d.loot) return;
    let rolls = randInt(this.rng, d.rolls[0], d.rolls[1]);
    if (this.rng() < this.mods.loot) rolls++;
    if (this.rng() < 0.15) rolls = Math.max(0, rolls - 1); // some places were picked clean
    for (let i = 0; i < rolls; i++) {
      const [id, , mn, mx] = weightedPick(this.rng, LOOT[d.loot]);
      const n = randInt(this.rng, mn, mx);
      const it = makeItem(id, Math.min(n, ITEMS[id].stack));
      if (it.dur) it.dur = Math.round(it.dur * (0.35 + this.rng() * 0.5));
      if (it.ammo != null && this.rng() < 0.5) it.ammo = randInt(this.rng, 0, ITEMS[id].weapon.mag);
      o.inv.add(it);
    }
    this.stats.looted++;
    this.addXp('survival', 2);
  }
  lootBagFrom(table, rolls) {
    const items = [];
    for (let i = 0; i < rolls; i++) {
      const [id, , mn, mx] = weightedPick(this.rng, LOOT[table]);
      const it = makeItem(id, Math.min(randInt(this.rng, mn, mx), ITEMS[id].stack));
      if (it.dur) it.dur = Math.round(it.dur * (0.3 + this.rng() * 0.4));
      items.push(it);
    }
    return items;
  }

  // ---------- noise ----------
  noise(x, y, r) {
    for (const z of this.zombies) {
      if (z.state === 'chase') continue;
      if (Math.hypot(z.x - x, z.y - y) < r) { z.state = 'investigate'; z.tx = x + (Math.random() - 0.5) * 2; z.ty = y + (Math.random() - 0.5) * 2; }
    }
    for (const a of this.animals) if (Math.hypot(a.x - x, a.y - y) < r * 1.5) a.scared = 3;
  }
  groan(z) { if (this.hooks.onGroan) this.hooks.onGroan(z); }

  // ---------- flow field (zombie pathing toward the player) ----------
  computeFlow() {
    const p = this.player, w = this.world;
    const size = FLOW_R * 2 + 1;
    const ox = Math.floor(p.x) - FLOW_R, oy = Math.floor(p.y) - FLOW_R;
    const dist = this.flow && this.flow.size === size ? this.flow.dist : new Float32Array(size * size);
    dist.fill(Infinity);
    const smash = new Uint8Array(size * size);
    const heap = new MinHeap();
    const start = FLOW_R * size + FLOW_R;
    dist[start] = 0; heap.push(0, start);
    const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    const costAt = (lx, ly) => {
      const tx = lx + ox, ty = ly + oy;
      if (!w.inb(tx, ty)) return Infinity;
      const gi = GROUND_INFO[w.ground[ty * WORLD_W + tx]];
      if (!gi.pass) return Infinity;
      const o = w.objs[ty * WORLD_W + tx];
      let c = gi.water ? 2 : 1;
      if (o) {
        const d = OBJ[o.t];
        const solid = d.door ? !o.open : d.solid;
        if (solid) {
          if (!d.breakable) return Infinity;
          smash[ly * size + lx] = 1;
          c += 2 + o.hp / 40;
        }
      }
      return c;
    };
    while (heap.size) {
      const cur = heap.pop();
      const cd = dist[cur];
      if (cd > 60) break;
      const cx = cur % size, cy = (cur / size) | 0;
      for (const [dx, dy, m] of N) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (dx && dy) { // no corner cutting through solid tiles
          if (w.blocked(cx + dx + ox, cy + oy, 'zombie') || w.blocked(cx + ox, cy + dy + oy, 'zombie')) continue;
        }
        const c = costAt(nx, ny);
        if (c === Infinity) continue;
        const nd = cd + c * m;
        const ni = ny * size + nx;
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(nd, ni); }
      }
    }
    this.flow = { ox, oy, size, dist, smash };
  }

  flowStep(z) {
    const f = this.flow;
    if (!f) return null;
    const lx = Math.floor(z.x) - f.ox, ly = Math.floor(z.y) - f.oy;
    if (lx < 1 || ly < 1 || lx >= f.size - 1 || ly >= f.size - 1) return null;
    let best = null, bd = f.dist[ly * f.size + lx];
    if (bd === Infinity) bd = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const i = (ly + dy) * f.size + lx + dx;
      if (f.dist[i] < bd) { bd = f.dist[i]; best = [dx, dy, i]; }
    }
    if (!best) return null;
    const x = lx + best[0] + f.ox, y = ly + best[1] + f.oy;
    const o = this.world.o(x, y);
    const d = o && OBJ[o.t];
    const solid = d && (d.door ? !o.open : d.solid);
    return { x, y, smash: !!solid };
  }

  // ---------- combat ----------
  enemiesOf(team) {
    if (team === 'raider') return [this.player, ...this.humans.filter(h => h.faction !== 'raider'), ...this.zombies];
    return [...this.zombies, ...this.humans.filter(h => h.faction === 'raider'), ...this.animals];
  }

  spawnProjectile(x, y, a, speed, dmg, range, team, pierce) {
    this.projectiles.push({ x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, range, traveled: 0, team, pierce: pierce || 0, hit: new Set() });
  }

  updateProjectiles(dt) {
    const out = [];
    for (const pr of this.projectiles) {
      pr.px = pr.x; pr.py = pr.y;
      const sp = Math.hypot(pr.vx, pr.vy);
      const steps = Math.ceil(sp * dt / 0.2);
      let alive = true;
      const targets = this.enemiesOf(pr.team);
      for (let s = 0; s < steps && alive; s++) {
        pr.x += pr.vx * dt / steps; pr.y += pr.vy * dt / steps;
        pr.traveled += sp * dt / steps;
        if (pr.traveled > pr.range) { alive = false; break; }
        const tx = Math.floor(pr.x), ty = Math.floor(pr.y);
        if (this.world.opaque(tx, ty)) {
          alive = false;
          this.fx.push({ type: 'spark', x: pr.x, y: pr.y, t: 0.15 });
          break;
        }
        for (const e of targets) {
          if (e.dead || pr.hit.has(e)) continue;
          if ((e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 < (e.r + 0.08) ** 2) {
            pr.hit.add(e);
            this.damage(e, pr.dmg, pr.team === 'player' ? 'player' : pr.team);
            if (e.kind === 'zombie' || e.kind === 'animal') { e.kb = { x: pr.vx / sp * 0.4, y: pr.vy / sp * 0.4 }; }
            if (pr.pierce-- <= 0) { alive = false; break; }
          }
        }
      }
      if (alive) out.push(pr);
    }
    this.projectiles = out;
  }

  damage(t, amt, src) {
    if (t.dead) return;
    const fromPlayer = src === 'player';
    if (t.kind === 'player') {
      if (t.sleeping) this.wake('You wake up screaming!');
      const armor = t.armor ? ITEMS[t.armor].armor : 0;
      amt *= 1 - armor;
      t.hp -= amt; t.hitFlash = 0.25;
      this.fx.push({ type: 'blood', x: t.x, y: t.y, t: 0.5 });
      if (this.hooks.onHurt) this.hooks.onHurt(amt);
      const zombie = src && src.kind === 'zombie';
      if ((zombie || src?.kind === 'animal' || src?.kind === 'human') && !t.bleeding && this.rng() < 0.22 * (1 - armor)) {
        t.bleeding = true; this.msg('You are bleeding! Apply a bandage.', 'bad');
      }
      if (zombie && t.infection <= 0 && this.rng() < 0.06 * this.mods.infect * (1 - armor * 1.5) * (1 - 0.04 * this.lvl('survival'))) {
        t.infection = 1; this.msg('You were bitten. The wound burns... you are INFECTED. Find antibiotics.', 'bad');
      }
      if (t.hp <= 0) {
        const cause = zombie ? `Torn apart by a ${ZTYPES[src.type].name}` : src?.kind === 'animal' ? `Mauled by a ${ATYPES[src.type].name}`
          : src?.kind === 'human' ? `Killed by ${src.name}` : 'Succumbed to wounds';
        this.die(cause);
      }
      return;
    }
    if (fromPlayer) amt *= 1 + 0.06 * (this.lvl('combat') - 1);
    t.hp -= amt; t.hitFlash = 0.15;
    this.fx.push({ type: t.kind === 'zombie' ? 'gore' : 'blood', x: t.x, y: t.y, t: 0.5 });
    if (fromPlayer || src === 'ally') this.floater(t.x, t.y - 0.5, Math.round(amt) + '', '#ffdf6b');
    if (t.kind === 'zombie' && (fromPlayer || src === 'trap') && t.state !== 'chase') { t.state = 'chase'; t.target = this.player; }
    if (t.kind === 'animal') t.scared = 4;
    if (t.kind === 'human' && fromPlayer && t.faction === 'survivor') {
      this.changeOpinion(t, -20);
      say(t, 'What are you doing?!');
      if (t.opinion <= -40) this.turnHostile(t);
    }
    if (t.hp <= 0) this.kill(t, src);
  }

  kill(t, src) {
    t.dead = true;
    const byPlayer = src === 'player' || src === 'trap';
    if (t.kind === 'zombie') {
      this.zombies = this.zombies.filter(z => z !== t);
      if (byPlayer) {
        this.stats.kills++; this.player.kills++;
        this.addXp('combat', ZTYPES[t.type].xp);
        // survivors nearby are grateful
        for (const h of this.humans) {
          if (h.faction === 'survivor' && Math.hypot(h.x - t.x, h.y - t.y) < 8) this.changeOpinion(h, 1.5);
        }
      }
      if (this.rng() < (t.type === 'brute' ? 0.7 : 0.18)) this.dropItems(t.x, t.y, this.lootBagFrom('zombie', t.type === 'brute' ? 3 : 1), 'Zombie Remains');
      this.fx.push({ type: 'corpse', x: t.x, y: t.y, angle: t.angle, t: 25, color: ZTYPES[t.type].color, scale: ZTYPES[t.type].scale });
    } else if (t.kind === 'animal') {
      this.animals = this.animals.filter(a => a !== t);
      const items = ATYPES[t.type].drops.map(([id, a, b]) => makeItem(id, randInt(this.rng, a, b)));
      this.dropItems(t.x, t.y, items, `${ATYPES[t.type].name} Carcass`);
      if (byPlayer) this.addXp('survival', 4);
    } else if (t.kind === 'human') {
      this.humans = this.humans.filter(h => h !== t);
      if (t.faction === 'raider') {
        this.dropItems(t.x, t.y, this.lootBagFrom('raider', randInt(this.rng, 2, 4)), `${t.name}'s Belongings`);
        if (byPlayer) { this.addXp('combat', 20); this.msg(`You killed the raider ${t.name}.`, ''); }
      } else {
        if (t.items?.length) this.dropItems(t.x, t.y, t.items, `${t.name}'s Belongings`);
        this.msg(`${t.name} has died.`, 'bad');
        if (t.status === 'partner') this.msg('Your partner is gone. Your bloodline has no heir...', 'bad');
      }
      this.fx.push({ type: 'corpse', x: t.x, y: t.y, angle: t.angle, t: 40, color: t.color, scale: 1, human: true });
    }
  }

  turnHostile(h) {
    h.faction = 'raider'; h.status = 'stranger'; h.mode = 'wander';
    h.traits = ['Hostile']; h.color = 0x7a2a2a;
    say(h, "You'll pay for that!", 4);
    this.msg(`${h.name} has turned against you!`, 'bad');
  }

  playerWeapon() {
    const it = this.selectedItem();
    const d = it && ITEMS[it.id];
    return { it, d, w: d?.weapon || FISTS };
  }

  primary() {
    const p = this.player, inp = this.input;
    if (this.buildSel) {
      if (!inp.clicked || !inp.hoverTile) return;
      const [tx, ty] = inp.hoverTile;
      if (this.buildSel === '__deconstruct') this.deconstruct(tx, ty);
      else if (this.buildSel === '__repair') this.repair(tx, ty);
      else this.build(this.buildSel, tx, ty);
      return;
    }
    if (p.atkCd > 0 || p.reload > 0) return;
    const { it, d, w } = this.playerWeapon();
    if (d && (d.use || d.fill || d.equip)) { if (inp.clicked) this.useItem(it); return; }
    if (w.type === 'ranged') { if (inp.clicked || w.auto) this.fire(it, w); return; }

    // harvesting takes priority when aiming at a resource in reach
    const ht = inp.hoverTile;
    if (ht) {
      const [tx, ty] = ht;
      const o = this.world.o(tx, ty);
      const od = o && OBJ[o.t];
      if (od?.kind === 'resource' && Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) <= REACH + 0.3) {
        this.harvest(tx, ty, o, od, it);
        return;
      }
    }
    this.melee(it, w);
  }

  harvest(tx, ty, o, od, it) {
    const p = this.player;
    const tool = it ? ITEMS[it.id].tool : null;
    const mult = tool?.[od.tool] || 0;
    p.angle = Math.atan2(ty + 0.5 - p.y, tx + 0.5 - p.x);
    p.swing = 0.25;
    if (od.needTool && !mult) { this.msg(`You need a pickaxe to mine ${od.name}.`, 'bad'); p.atkCd = 0.6; return; }
    const dmg = od.handOk ? 10 : mult ? 10 * mult : 3;
    o.hp -= dmg * (1 + 0.05 * (this.lvl('gather') - 1));
    o.hitT = this.time;
    p.atkCd = ITEMS[it?.id]?.weapon?.cd || 0.6;
    p.stamina -= 4;
    this.fx.push({ type: 'chop', x: tx + 0.5, y: ty + 0.5, t: 0.3, color: od.tool === 'pick' ? 0x999999 : 0x9a7a4a });
    this.noise(p.x, p.y, od.tool === 'pick' ? 6 : 4);
    if (mult) this.wear(it, 1);
    if (!mult && od.hand && this.rng() < 0.35) this.give(od.hand[0][0], 1);
    if (this.hooks.onHarvestHit) this.hooks.onHarvestHit(od);
    if (o.hp > 0) return;
    // depleted
    const drops = mult || od.handOk ? od.drops : od.hand;
    const bonus = 1 + 0.08 * (this.lvl('gather') - 1);
    for (const [id, a, b] of drops) {
      const n = Math.round(randInt(this.rng, a, b) * bonus);
      if (n > 0) this.give(id, n);
    }
    if (od.seedChance && this.rng() < od.seedChance) this.give('seeds', 1);
    this.addXp('gather', od.xp);
    this.destroyObject(tx, ty, true);
  }

  melee(it, w) {
    const p = this.player;
    const aim = p.angle;
    const weak = p.stamina < w.stam;
    p.atkCd = w.cd * (weak ? 1.5 : 1);
    p.stamina = Math.max(0, p.stamina - w.stam);
    p.staminaDelay = 0.8;
    p.swing = 0.25;
    let hits = 0;
    for (const t of this.enemiesOf('player')) {
      if (t.dead) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > w.range + t.r) continue;
      if (Math.abs(angleDiff(aim, Math.atan2(t.y - p.y, t.x - p.x))) > (w.arc || 0.9) && d > t.r + 0.3) continue;
      this.damage(t, w.dmg * (weak ? 0.5 : 1), 'player');
      const k = (w.knock || 0.4) / (t.kind === 'zombie' ? ZTYPES[t.type].scale : 1);
      t.kb = { x: Math.cos(aim) * k, y: Math.sin(aim) * k };
      hits++;
    }
    // swinging at an ally
    for (const h of this.humans) {
      if (h.faction === 'raider' || h.dead) continue;
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < w.range + h.r && Math.abs(angleDiff(aim, Math.atan2(h.y - p.y, h.x - p.x))) < 0.5) { this.damage(h, w.dmg, 'player'); hits++; }
    }
    this.fx.push({ type: 'swing', x: p.x, y: p.y, angle: aim, range: w.range, t: 0.18 });
    this.noise(p.x, p.y, w.noise || 4);
    if (hits) { this.wear(it, 1); this.addXp('combat', 1); if (this.hooks.onHit) this.hooks.onHit(); }
    else if (this.hooks.onSwing) this.hooks.onSwing();
  }

  fire(it, w) {
    const p = this.player;
    if (w.mag) {
      if (it.ammo <= 0) {
        if (p.inv.count(w.ammo) > 0) this.startReload();
        else { if (this.input.clicked) this.msg(`Out of ${ITEMS[w.ammo].name}.`, 'bad'); p.atkCd = 0.4; }
        return;
      }
      it.ammo--;
    } else {
      if (!p.inv.take(w.ammo, 1)) { if (this.input.clicked) this.msg(`No ${ITEMS[w.ammo].name}s.`, 'bad'); p.atkCd = 0.4; return; }
    }
    const pellets = w.pellets || 1;
    const spread = w.spread * (p.crouch ? 0.6 : 1) * (p.moving ? 1.4 : 1) * (1 - 0.04 * (this.lvl('combat') - 1));
    for (let i = 0; i < pellets; i++) {
      const a = p.angle + (this.rng() - 0.5) * 2 * spread;
      this.spawnProjectile(p.x + Math.cos(a) * 0.4, p.y + Math.sin(a) * 0.4, a, w.speed, w.dmg, w.range, 'player', w.pierce);
    }
    p.atkCd = w.cd;
    this.wear(it, 1);
    this.noise(p.x, p.y, w.noise);
    this.fx.push({ type: 'muzzle', x: p.x + Math.cos(p.angle) * 0.6, y: p.y + Math.sin(p.angle) * 0.6, t: 0.06, big: w.noise > 20 });
    if (this.hooks.onShoot) this.hooks.onShoot(w);
    this.touchInv();
  }

  startReload() {
    const p = this.player;
    const { it, w } = this.playerWeapon();
    if (!it || !w.mag || p.reload > 0) return;
    if (it.ammo >= w.mag) return;
    if (p.inv.count(w.ammo) <= 0) { this.msg(`No ${ITEMS[w.ammo].name} to reload.`, 'bad'); return; }
    p.reload = w.reload; p.reloadItem = it.uid;
    this.msg('Reloading...', '');
  }
  finishReload() {
    const p = this.player;
    const it = p.inv.items.find(i => i.uid === p.reloadItem);
    if (!it) return;
    const w = ITEMS[it.id].weapon;
    const n = Math.min(w.mag - it.ammo, p.inv.count(w.ammo));
    p.inv.take(w.ammo, n);
    it.ammo += n;
    this.resolveHotbar(); this.touchInv();
  }

  // ---------- interaction ----------
  findInteract() {
    const p = this.player, w = this.world;
    if (p.dead || p.sleeping) return null;
    const cands = [];
    const aimBias = (x, y) => Math.abs(angleDiff(p.angle, Math.atan2(y - p.y, x - p.x))) * 0.35;
    for (const h of this.humans) {
      if (h.faction !== 'survivor') continue;
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < 2.0) cands.push({ score: d + aimBias(h.x, h.y) - 0.9, label: `Talk to ${h.name}`, act: () => this.hooks.onDialog?.(h) });
    }
    const px = Math.floor(p.x), py = Math.floor(p.y);
    for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) {
      const o = w.o(x, y);
      if (!o) continue;
      const d = OBJ[o.t];
      const dd = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
      if (dd > 1.6) continue;
      let label = null, act = null;
      if (d.kind === 'container') { label = `Search ${o.label || d.name}`; act = () => this.openContainer(o, x, y); }
      else if (d.door) { label = `${o.open ? 'Close' : 'Open'} ${d.name}`; act = () => this.toggleDoor(o, x, y); }
      else if (d.station) { label = `Use ${d.name}`; act = () => this.hooks.onCraft?.(); }
      else if (d.bed) { label = `Sleep in ${d.name}`; act = () => this.sleep(d.bed); }
      else if (d.farm) { const f = this.farmState(o); label = f.label; act = () => this.useFarm(o, x, y); }
      else if (d.rain) { const water = this.rainWater(o); label = `Rain Collector (${water.toFixed(1)} water)`; act = () => this.useRain(o); }
      if (label) cands.push({ score: dd + aimBias(x + 0.5, y + 0.5), label, act });
    }
    if (w.nearWater(p.x, p.y, 1.2)) {
      const bottle = p.inv.items.find(it => it.id === 'empty_bottle');
      cands.push({ score: 1.5, label: bottle ? 'Fill Bottle' : 'Drink Water', act: () => bottle ? this.useItem(bottle) : this.drinkWater() });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.score - b.score);
    return cands[0];
  }

  openContainer(o, x, y) {
    this.ensureLoot(o);
    if (this.hooks.onContainer) this.hooks.onContainer(o, x, y);
  }
  closeContainer(o, x, y) {
    if (OBJ[o.t]?.temp && o.inv.isEmpty() && this.world.o(x, y) === o) this.world.setO(x, y, null);
  }

  toggleDoor(o, x, y) {
    if (o.open) {
      // don't close on someone
      const ents = [this.player, ...this.zombies, ...this.humans, ...this.animals];
      for (const e of ents) {
        const cx = clamp(e.x, x, x + 1), cy = clamp(e.y, y, y + 1);
        if ((cx - e.x) ** 2 + (cy - e.y) ** 2 < e.r * e.r) { this.msg('Something is in the way.', 'bad'); return; }
      }
    }
    o.open = !o.open;
    this.world.touch(x, y);
    this.noise(x + 0.5, y + 0.5, 3);
    if (this.hooks.onDoor) this.hooks.onDoor(o.open);
  }

  drinkWater() {
    const p = this.player;
    p.thirst = Math.min(100, p.thirst + 25);
    this.floater(p.x, p.y - 0.4, 'Gulp', '#9fd7ff');
    if (this.rng() < 0.3) { p.sick = Math.max(p.sick, 70); this.msg('That water tasted foul. You feel sick.', 'bad'); }
  }

  farmState(o) {
    if (!o.crop) return { label: 'Plant Seeds (Farm Plot)', ready: false };
    const g = Math.min(1, (this.time - o.planted) / (DAY_LEN * 0.8));
    return g >= 1 ? { label: 'Harvest Potatoes', ready: true } : { label: `Potatoes growing (${Math.floor(g * 100)}%)`, ready: false };
  }
  useFarm(o, x, y) {
    const f = this.farmState(o);
    this.world.touch(x, y);
    if (!o.crop) {
      if (!this.player.inv.take('seeds', 1)) { this.msg('You need seeds. Search bushes and grass.', 'bad'); return; }
      o.crop = 'potato'; o.planted = this.time;
      this.msg('Planted seeds.', 'good'); this.addXp('survival', 2); this.touchInv();
    } else if (f.ready) {
      o.crop = null;
      this.give('potato', randInt(this.rng, 3, 5) + Math.floor(this.lvl('survival') / 3));
      this.give('seeds', randInt(this.rng, 1, 2));
      this.addXp('survival', 6);
    }
  }
  rainWater(o) { return Math.min(3, (this.time - (o.last ?? 0)) / (DAY_LEN / 4)); }
  useRain(o) {
    const water = this.rainWater(o);
    if (water < 1) { this.msg('Not enough water collected yet.', ''); return; }
    const bottle = this.player.inv.items.find(it => it.id === 'empty_bottle');
    if (bottle) {
      this.player.inv.remove(bottle);
      this.give('water_bottle', 1);
    } else {
      this.player.thirst = Math.min(100, this.player.thirst + 40);
      this.floater(this.player.x, this.player.y - 0.4, 'Clean water', '#9fd7ff');
    }
    o.last = (o.last ?? 0) + DAY_LEN / 4;
    if (this.time - o.last > DAY_LEN / 4 * 2) o.last = this.time - DAY_LEN / 4 * 2;
    this.resolveHotbar(); this.touchInv();
  }

  // ---------- sleep ----------
  sleep(quality) {
    const p = this.player;
    if (p.energy > 85 && this.darkness < 0.5) { this.msg("You're not tired enough to sleep.", ''); return; }
    if (this.zombies.some(z => Math.hypot(z.x - p.x, z.y - p.y) < 10)) { this.msg("You can't sleep with the dead nearby.", 'bad'); return; }
    p.sleeping = true; p.sleepQ = quality; this.timeScale = 18;
    this.msg('You drift off to sleep...', '');
    this.save();
  }
  wake(reason) {
    const p = this.player;
    if (!p.sleeping) return;
    p.sleeping = false; this.timeScale = 1;
    if (reason) this.msg(reason, 'bad'); else this.msg('You wake up.', '');
  }

  // ---------- social ----------
  changeOpinion(h, v) { h.opinion = clamp(h.opinion + v, -100, 100); }
  relationLabel(h) {
    if (h.faction === 'raider') return 'Hostile';
    if (h.status === 'partner') return 'Partner';
    if (h.status === 'family') return 'Family';
    if (h.opinion >= 70) return 'Close Friend';
    if (h.opinion >= 35) return 'Friend';
    if (h.opinion >= 10) return 'Acquaintance';
    if (h.opinion > -20) return 'Stranger';
    return 'Disliked';
  }

  social(h, action, item) {
    const t = this.time, tr = h.traits;
    const cdOk = (k, hours) => {
      if ((h.cd[k] || -1e9) > t) { say(h, pick(this.rng, ["Let's talk later.", 'Not now.', "I'm busy."])); return false; }
      h.cd[k] = t + HOUR * hours; return true;
    };
    const ally = allyStatus(h);
    switch (action) {
      case 'talk': {
        if (!cdOk('talk', 2)) return;
        let gain = 3 + this.rng() * 4;
        if (tr.includes('Friendly')) gain *= 1.5;
        if (tr.includes('Grumpy')) gain *= 0.5;
        this.changeOpinion(h, gain);
        say(h, pick(this.rng, TALK_LINES));
        this.addXp('survival', 1);
        break;
      }
      case 'joke': {
        if (!cdOk('joke', 3)) return;
        const chance = tr.includes('Funny') ? 1 : tr.includes('Grumpy') ? 0.3 : 0.6;
        if (this.rng() < chance) { this.changeOpinion(h, 7); say(h, pick(this.rng, ['Ha! Good one.', "*laughs* I needed that.", "You're terrible. I love it."])); }
        else { this.changeOpinion(h, -4); say(h, pick(this.rng, ['...', 'Not funny.', 'Read the room.'])); }
        break;
      }
      case 'compliment': {
        if (!cdOk('compliment', 4)) return;
        this.changeOpinion(h, tr.includes('Grumpy') ? 2 : 5);
        say(h, pick(this.rng, ['Oh... thanks.', 'That means a lot out here.', "You're not so bad yourself."]));
        break;
      }
      case 'flirt': {
        if (!cdOk('flirt', 4)) return;
        if (h.opinion < 40 || (h.status === 'family')) { this.changeOpinion(h, -6); say(h, 'Whoa. Slow down.'); break; }
        let gain = 10 + this.rng() * 10;
        if (tr.includes('Romantic')) gain *= 1.5;
        h.romance = clamp(h.romance + gain, 0, 100);
        this.changeOpinion(h, 2);
        say(h, pick(this.rng, ['*blushes*', 'Is that so?', 'You always know what to say.', 'Careful, I might start liking you.']));
        break;
      }
      case 'propose': {
        if (h.romance >= 100 && h.opinion >= 70 && ally) {
          for (const o of this.humans) if (o.status === 'partner') o.status = 'follower';
          h.status = 'partner';
          say(h, "Yes. Whatever comes, we face it together.", 5);
          this.msg(`${h.name} is now your partner. Your bloodline will continue through them.`, 'good');
        } else { this.changeOpinion(h, -5); say(h, "I... I'm not ready for that."); }
        break;
      }
      case 'gift': {
        if (!item) return;
        const d = ITEMS[item.id];
        let v = itemValue(item.id);
        if (tr.includes('Glutton') && d.use?.hunger) v *= 2;
        this.changeOpinion(h, v);
        if (d.use?.hunger) h.hunger = Math.min(100, h.hunger + d.use.hunger);
        if (d.weapon?.type === 'melee' && d.weapon.dmg > h.weapon.dmg) {
          h.weapon = { name: d.name, dmg: d.weapon.dmg, range: d.weapon.range, cd: d.weapon.cd };
          say(h, `A ${d.name}! I'll put it to good use.`);
        } else say(h, pick(this.rng, ['Thank you!', 'You shouldn\'t have.', 'This is a real help.']));
        if (item.n > 1) item.n--; else this.player.inv.remove(item);
        this.resolveHotbar(); this.touchInv();
        break;
      }
      case 'recruit': {
        if (h.opinion >= 35) {
          h.status = 'follower'; h.mode = 'follow'; h.hunger = Math.max(h.hunger, 60);
          say(h, "Alright. I'm with you.", 4);
          this.msg(`${h.name} joined you. Keep them fed — they'll eat from nearby storage crates.`, 'good');
        } else { this.changeOpinion(h, -2); say(h, "I don't know you well enough."); }
        break;
      }
      case 'follow': h.mode = 'follow'; say(h, 'Right behind you.'); break;
      case 'stay': h.mode = 'stay'; h.stay = { x: h.x, y: h.y }; say(h, "I'll hold this spot."); break;
      case 'work': h.mode = 'work'; h.stay = { x: h.x, y: h.y }; say(h, "I'll gather around here and stock the nearest crate."); break;
      case 'dismiss':
        h.status = 'stranger'; h.mode = 'wander'; h.home = { x: h.x, y: h.y };
        this.changeOpinion(h, -10); say(h, 'Fine. Good luck out there.');
        break;
    }
  }

  nearestCrate(x, y, r) {
    let best = null, bd = r;
    for (let ty = Math.floor(y - r); ty <= y + r; ty++) for (let tx = Math.floor(x - r); tx <= x + r; tx++) {
      const o = this.world.o(tx, ty);
      if (!o || (o.t !== 'storage_crate' && o.t !== 'storage_locker')) continue;
      const d = Math.hypot(tx - x, ty - y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  npcEatFromStorage(h) {
    const c = this.nearestCrate(h.x, h.y, 10);
    if (!c) return false;
    this.ensureLoot(c);
    const food = c.inv.items.find(it => ITEMS[it.id].use?.hunger > 5 && !ITEMS[it.id].use.sick);
    if (!food) return false;
    h.hunger = Math.min(100, h.hunger + ITEMS[food.id].use.hunger * 1.5);
    if (food.n > 1) food.n--; else c.inv.remove(food);
    this.touchInv();
    return true;
  }
  npcWork(h) {
    const c = this.nearestCrate(h.stay.x, h.stay.y, 10);
    if (!c) { say(h, "I need a storage crate nearby to stash what I gather."); return; }
    this.ensureLoot(c);
    if (h.traits.includes('Lazy') && this.rng() < 0.5) { say(h, '*yawns*'); return; }
    const mult = h.traits.includes('Hardworking') ? 2 : 1;
    const [id, n] = pick(this.rng, [['wood', 3], ['stone', 3], ['fiber', 4], ['stick', 3], ['berries', 2]]);
    c.inv.addNew(id, n * mult);
    if (this.rng() < 0.3) say(h, `Stashed some ${ITEMS[id].name.toLowerCase()}.`);
    this.touchInv();
  }

  onScreen(e) { return Math.hypot(e.x - this.player.x, e.y - this.player.y) < 16; }

  // ---------- main update ----------
  update(dt) {
    if (this.over) return;
    this.time += dt;
    const p = this.player;

    // day rollover
    const day = this.day;
    if (day !== this.lastDay) { this.lastDay = day; this.newDay(); if (this.over) return; }
    if (this.day % HORDE_EVERY === 0 && this.hour >= 21 && !this.hordeDone[this.day]) {
      this.hordeDone[this.day] = true;
      spawnHorde(this);
      this.wake('The ground trembles. The Blood Moon horde is here!');
      this.msg('BLOOD MOON: the horde has your scent. Hold out until dawn!', 'bad');
      if (this.hooks.onHorde) this.hooks.onHorde();
    }

    this.updatePlayer(dt);
    if (this.over) return;

    this.flowTimer -= dt;
    if (this.flowTimer <= 0) { this.flowTimer = 0.4; this.computeFlow(); }

    for (const z of this.zombies.slice()) updateZombie(this, z, dt);
    for (const h of this.humans.slice()) updateHuman(this, h, dt);
    for (const a of this.animals.slice()) updateAnimal(this, a, dt);
    this.separate();
    this.updateProjectiles(dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 1.5; spawnManager(this); }
    this.raidTimer -= dt;
    if (this.raidTimer <= 0) {
      this.raidTimer = DAY_LEN * (0.4 + this.rng() * 0.5);
      if (this.day >= 3 && this.darkness < 0.5 && this.rng() < 0.5 && !p.sleeping) spawnRaiders(this, this.rng);
    }
    // remove raiders that wandered too far
    this.humans = this.humans.filter(h => h.faction !== 'raider' || Math.hypot(h.x - p.x, h.y - p.y) < 70);

    for (const f of this.fx) f.t -= dt;
    this.fx = this.fx.filter(f => f.t > 0);
    for (const f of this.floaters) f.t -= dt;
    this.floaters = this.floaters.filter(f => f.t > 0);

    this.saveTimer += dt / this.timeScale;
    if (this.saveTimer > 45) { this.saveTimer = 0; this.save(); }
  }

  separate() {
    const list = [...this.zombies, ...this.humans, ...this.animals];
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < rr) {
          const push = (rr - d) * 0.5;
          const kx = (dx / d) * push, ky = (dy / d) * push;
          if (!collides(this.world, a.x - kx, a.y - ky, a.r, 'zombie')) { a.x -= kx; a.y -= ky; }
          if (!collides(this.world, b.x + kx, b.y + ky, b.r, 'zombie')) { b.x += kx; b.y += ky; }
        }
      }
    }
  }

  newDay() {
    const p = this.player;
    p.age++;
    if (this.day % HORDE_EVERY === 0) this.msg(`Day ${this.day}. The moon will rise red tonight. Fortify your base.`, 'bad');
    else this.msg(`Day ${this.day} dawns. ${p.name} is now ${p.age}.`, 'info');
    if (this.hordeDone[this.day - 1]) {
      this.msg('You survived the Blood Moon.', 'good');
      for (const z of this.zombies) z.horde = false;
      this.addXp('survival', 30);
    }
    if (p.age >= 60 && this.rng() < (p.age - 58) * 0.04) { this.die(`Passed away peacefully at age ${p.age}`, true); return; }
    if (p.age === 55) this.msg('Your joints ache. Age is catching up with you.', '');
    // nature regrows
    const w = this.world;
    for (let i = 0; i < 120; i++) {
      const x = randInt(this.rng, 2, w.w - 3), y = randInt(this.rng, 2, w.h - 3);
      if (w.o(x, y) || Math.hypot(x - p.x, y - p.y) < 14) continue;
      const g = w.g(x, y);
      if (g === G.FOREST) w.setO(x, y, { t: this.rng() < 0.6 ? 'pine' : 'bush', hp: 50 });
      else if (g === G.GRASS) w.setO(x, y, { t: pick(this.rng, ['tallgrass', 'tallgrass', 'bush', 'tree']), hp: 40 });
    }
    // occasionally a new wandering survivor arrives
    if (this.humans.filter(h => h.faction === 'survivor' && h.status === 'stranger').length < 5 && this.rng() < 0.5) {
      const t = pick(this.rng, w.towns);
      if (t) {
        const x = t.x + (this.rng() - 0.5) * 20, y = t.y + (this.rng() - 0.5) * 20;
        if (!collides(w, x, y, 0.3, 'human')) this.humans.push(makeHuman(this.rng, x, y, 'survivor'));
      }
    }
  }

  updatePlayer(dt) {
    const p = this.player, inp = this.input, m = this.mods;
    p.hitFlash -= dt; p.atkCd -= dt; p.swing = (p.swing || 0) - dt;
    const drain = m.drain * (1 - 0.03 * (this.lvl('survival') - 1));

    if (p.sleeping) {
      p.energy = Math.min(100, p.energy + dt * 100 / (7 * HOUR) * p.sleepQ);
      p.hunger -= dt * 0.08 * drain; p.thirst -= dt * 0.1 * drain;
      if (!p.bleeding && p.infection <= 0) p.hp = Math.min(p.maxHp, p.hp + dt * 0.15);
      const h = this.hour;
      if (p.energy >= 100 && h >= 6 && h < 19) this.wake();
      else if (this.zombies.some(z => Math.hypot(z.x - p.x, z.y - p.y) < 8)) this.wake('A noise startles you awake!');
      else if (p.hunger < 5 || p.thirst < 5) this.wake('Hunger gnaws you awake.');
      if (!p.sleeping) this.save();
    } else {
      // movement
      let mx = inp.mx, my = inp.my;
      const ml = Math.hypot(mx, my);
      p.moving = ml > 0.01;
      const exhausted = p.energy < 15;
      p.sprinting = p.moving && inp.sprint && p.stamina > 1 && !p.crouch;
      const gi = GROUND_INFO[this.world.g(Math.floor(p.x), Math.floor(p.y))];
      let speed = 3.9 * m.speed * (gi.speed || 1) * (p.sprinting ? 1.6 : p.crouch ? 0.55 : 1) * (exhausted ? 0.8 : 1) * (p.age > 60 ? 0.9 : 1);
      if (p.reload > 0) speed *= 0.7;
      if (p.moving) {
        mx /= ml; my /= ml;
        moveEntity(this.world, p, mx * speed * dt, my * speed * dt, 'player');
      }
      p.angle = Math.atan2(inp.aimY - p.y, inp.aimX - p.x);

      // stamina
      const maxSt = 100 - Math.max(0, p.age - 50) * 1.5 - (p.infection > 50 ? 25 : 0);
      if (p.sprinting) { p.stamina -= 16 * dt; p.staminaDelay = 1; }
      else if ((p.staminaDelay -= dt) <= 0 && p.hunger > 0) p.stamina += (exhausted ? 7 : 15) * dt;
      p.stamina = clamp(p.stamina, 0, maxSt);

      // movement noise
      p.noiseTimer -= dt;
      if (p.moving && p.noiseTimer <= 0) { p.noiseTimer = 0.5; this.noise(p.x, p.y, p.sprinting ? 8 : p.crouch ? 0.5 : 3); }

      // needs
      const act = p.sprinting ? 1.5 : 1;
      p.hunger -= dt * 0.17 * drain * act;
      p.thirst -= dt * 0.22 * drain * act;
      p.energy -= dt * 0.11 * (p.sprinting ? 1.3 : 1);

      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.reload = 0; this.finishReload(); } }
      if (inp.mouseDown || inp.clicked) this.primary();

      // held torch burns down
      const sel = this.selectedItem();
      p.lightOn = !!(sel && ITEMS[sel.id].light);
      if (sel && ITEMS[sel.id].burns) {
        sel.dur -= dt;
        if (sel.dur <= 0) { p.inv.remove(sel); this.msg('Your torch burned out.', 'bad'); this.resolveHotbar(); this.touchInv(); }
      }
    }
    inp.clicked = false;

    p.hunger = Math.max(0, p.hunger); p.thirst = Math.max(0, p.thirst); p.energy = Math.max(0, p.energy);
    // conditions
    let hpd = 0;
    if (p.bleeding) hpd -= 0.6;
    if (p.infection > 0) {
      p.infection += dt * 100 / (DAY_LEN * 1.4);
      if (p.infection >= 100) { p.infection = 100; hpd -= 1.5; }
    }
    if (p.sick > 0) { p.sick -= dt; p.thirst -= dt * 0.25; hpd -= 0.12; }
    if (p.hunger <= 0) hpd -= 0.35;
    if (p.thirst <= 0) hpd -= 0.6;
    if (!hpd && p.hunger > 50 && p.thirst > 50 && p.infection <= 0) hpd += 0.1 + 0.02 * this.lvl('survival');
    p.hp = Math.min(p.maxHp, p.hp + hpd * dt);
    if (p.hp <= 0) {
      const cause = p.infection >= 100 ? 'Turned by the infection' : p.thirst <= 0 ? 'Died of dehydration' : p.hunger <= 0 ? 'Starved to death' : p.bleeding ? 'Bled out' : 'Died of illness';
      this.die(cause);
    }
  }

  // ---------- death & succession ----------
  die(cause, natural = false) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true; p.sleeping = false; this.timeScale = 1; this.over = true;
    // drop everything as a corpse container
    const items = p.inv.items.slice();
    if (p.pack) items.push(makeItem(p.pack));
    if (p.armor) items.push(makeItem(p.armor));
    const spot = this.world.freeTileNear(Math.floor(p.x), Math.floor(p.y));
    if (spot) {
      const inv = new Grid(10, 10);
      for (const it of items) inv.add(it);
      this.world.setO(spot[0], spot[1], { t: 'corpse', inv, label: `Remains of ${p.name}` });
    }
    const partner = this.humans.find(h => h.status === 'partner' && !h.dead);
    const followers = this.humans.filter(h => allyStatus(h)).length;
    const skillLevels = Object.values(p.skills).reduce((a, s) => a + s.lvl, 0);
    const daysLived = (this.time - (p.bornAt || 0)) / DAY_LEN;
    const score = scoreLife({ days: daysLived, kills: p.kills, skillLevels, built: this.stats.built, crafted: this.stats.crafted, followers, partner: !!partner, natural });
    this.legacy.points += score.total;
    this.legacy.total += score.total;
    this.legacy.history.unshift({ name: p.name, gen: this.dynasty.generation, age: p.age, days: Math.floor(daysLived), cause, kills: p.kills, points: score.total, date: Date.now() });
    this.legacy.history = this.legacy.history.slice(0, 30);
    saveLegacy(this.legacy);
    const info = { name: p.name, age: p.age, cause, natural, score, partner, days: daysLived, generation: this.dynasty.generation };
    if (partner) this.save(); else this.deleteSave();
    if (this.hooks.onDeath) this.hooks.onDeath(info);
  }

  continueAsHeir() {
    const partner = this.humans.find(h => h.status === 'partner' && !h.dead);
    if (!partner) return false;
    const old = this.player;
    this.dynasty.generation++;
    this.mods = perkMods(this.legacy);
    const np = this.makePlayer(partner.x + 0.6, partner.y, 18, old.skills);
    np.bornAt = this.time;
    this.player = np;
    partner.status = 'family'; partner.mode = 'follow'; partner.romance = 0;
    say(partner, `Your ${old.name.split(' ')[0]} would be proud. Let's carry on.`, 6);
    this.over = false;
    this.stats = { kills: 0, built: 0, crafted: 0, looted: 0 };
    this.msg(`Generation ${this.dynasty.generation}: ${np.name}, age 18, takes up the family's struggle.`, 'good');
    this.msg(`Your parent's remains hold their belongings.`, 'info');
    this.save();
    return true;
  }

  // ---------- persistence ----------
  toJSON() {
    const p = this.player;
    return {
      v: 1, time: this.time, dynasty: this.dynasty, stats: this.stats, hordeDone: this.hordeDone, raidTimer: this.raidTimer,
      world: this.world.toJSON(),
      player: { ...p, inv: p.inv.toJSON() },
      humans: this.humans.map(h => ({ ...h, bubble: null })),
      zombies: this.zombies.map(z => ({ ...z, target: null, state: z.state === 'chase' ? 'investigate' : z.state })),
    };
  }
  save() {
    if (this.player.dead && !this.humans.some(h => h.status === 'partner')) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON())); } catch (e) { console.warn('save failed', e); }
  }
  deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  static load(legacy) {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const g = new Game(legacy);
    g.time = d.time; g.dynasty = d.dynasty; g.stats = d.stats; g.hordeDone = d.hordeDone || {}; g.raidTimer = d.raidTimer || DAY_LEN / 2;
    g.world = World.from(d.world);
    g.player = { ...d.player, inv: Grid.from(d.player.inv) };
    g.humans = d.humans; g.zombies = d.zombies;
    for (const e of [...g.humans, ...g.zombies]) bumpId(e.id);
    g.lastDay = g.day;
    if (g.player.dead) {
      // died with an heir available but closed the tab before choosing
      g.over = true;
      if (!g.continueAsHeir()) return null;
    }
    g.player.sleeping = false;
    g.resolveHotbar();
    g.msg(`Welcome back. Day ${g.day}, ${g.timeString()}.`, 'info');
    return g;
  }
}

const TALK_LINES = [
  'I used to be an accountant. Funny how none of that matters now.',
  'Heard the dead get restless when the moon goes red.',
  "Keep your blade sharp and your water clean. That's all the wisdom I've got.",
  'Some nights I can still hear the sirens.',
  'Found a can of peaches last week. Best day of my life.',
  'Raiders hit the town east of here. Watch yourself.',
  "If you get bit... don't wait. Find antibiotics fast.",
  'Walls. Build walls. Then build more walls.',
  'I miss coffee more than I miss people. Present company excluded.',
  'The forests have wolves now. Bigger than I remember.',
  'My grandmother farmed. Never thought I would.',
  'Every scrap of junk is worth something if you take it apart.',
];
