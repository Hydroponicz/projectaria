// Tarkov-style grid inventory. Items occupy w x h cells and can be rotated.
import { ITEMS } from './data/items.js';
import { uid, bumpUid } from './util.js';

export function makeItem(id, n = 1) {
  const d = ITEMS[id];
  if (!d) throw new Error('Unknown item ' + id);
  const it = { uid: uid(), id, n, x: 0, y: 0, rot: false };
  if (d.dur) it.dur = d.dur;
  if (d.weapon && d.weapon.mag) it.ammo = 0;
  return it;
}

export function itemSize(it, rot = it.rot) {
  const d = ITEMS[it.id];
  return rot ? [d.h, d.w] : [d.w, d.h];
}

export class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.items = []; }

  fits(it, x, y, rot, ignore) {
    const [w, h] = itemSize(it, rot);
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    for (const o of this.items) {
      if (o === ignore) continue;
      const [ow, oh] = itemSize(o);
      if (x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y) return false;
    }
    return true;
  }

  findSpot(it) {
    for (const rot of [it.rot, !it.rot]) {
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++)
          if (this.fits(it, x, y, rot, it)) return { x, y, rot };
    }
    return null;
  }

  itemAt(x, y) {
    for (const o of this.items) {
      const [w, h] = itemSize(o);
      if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) return o;
    }
    return null;
  }

  place(it, x, y, rot) {
    it.x = x; it.y = y; it.rot = rot;
    if (!this.items.includes(it)) this.items.push(it);
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
  }

  // Add an item instance, merging stacks first. Returns the leftover count not added.
  add(it) {
    const d = ITEMS[it.id];
    if (d.stack > 1) {
      for (const o of this.items) {
        if (o.id !== it.id || o === it || o.n >= d.stack) continue;
        const mv = Math.min(d.stack - o.n, it.n);
        o.n += mv; it.n -= mv;
        if (it.n <= 0) return 0;
      }
    }
    while (it.n > 0) {
      const piece = it.n > d.stack ? { ...makeItem(it.id, d.stack) } : it;
      if (piece !== it) piece.dur = it.dur;
      const spot = this.findSpot(piece);
      if (!spot) return it.n;
      this.place(piece, spot.x, spot.y, spot.rot);
      if (piece === it) return 0;
      it.n -= piece.n;
    }
    return 0;
  }

  addNew(id, n) {
    const d = ITEMS[id];
    let left = n;
    // merge into existing stacks, then create new stacks
    while (left > 0) {
      const it = makeItem(id, Math.min(left, d.stack));
      const before = it.n;
      const rest = this.add(it);
      left -= before - rest;
      if (rest > 0) return left;
    }
    return 0;
  }

  count(id) {
    let c = 0;
    for (const o of this.items) if (o.id === id) c += o.n;
    return c;
  }

  has(req) {
    for (const [id, n] of Object.entries(req)) if (this.count(id) < n) return false;
    return true;
  }

  // Remove n units of id across stacks (smallest stacks first).
  take(id, n) {
    if (this.count(id) < n) return false;
    const stacks = this.items.filter(o => o.id === id).sort((a, b) => a.n - b.n);
    for (const o of stacks) {
      const t = Math.min(o.n, n);
      o.n -= t; n -= t;
      if (o.n <= 0) this.remove(o);
      if (n <= 0) break;
    }
    return true;
  }

  takeAll(req) {
    if (!this.has(req)) return false;
    for (const [id, n] of Object.entries(req)) this.take(id, n);
    return true;
  }

  // Resize and repack. Returns items that no longer fit.
  resize(w, h) {
    const old = this.items.slice().sort((a, b) => {
      const [aw, ah] = itemSize(a), [bw, bh] = itemSize(b);
      return bw * bh - aw * ah;
    });
    this.w = w; this.h = h; this.items = [];
    const overflow = [];
    for (const it of old) {
      if (this.fits(it, it.x, it.y, it.rot)) { this.place(it, it.x, it.y, it.rot); continue; }
      const s = this.findSpot(it);
      if (s) this.place(it, s.x, s.y, s.rot); else overflow.push(it);
    }
    return overflow;
  }

  isEmpty() { return this.items.length === 0; }

  toJSON() { return { w: this.w, h: this.h, items: this.items }; }

  static from(data) {
    const g = new Grid(data.w, data.h);
    for (const it of data.items) {
      if (!ITEMS[it.id]) continue;
      bumpUid(it.uid);
      g.items.push(it);
    }
    return g;
  }
}
