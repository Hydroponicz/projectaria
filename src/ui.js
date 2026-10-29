// DOM user interface: HUD, grid inventory with drag & drop, crafting, building, dialogue, map, menus.
import { ITEMS, CAT_COLORS } from './data/items.js';
import { OBJ, BUILDABLES } from './data/objects.js';
import { RECIPES, STATIONS } from './data/recipes.js';
import { GROUND_INFO, WORLD_W as W, WORLD_H as H, HORDE_EVERY } from './config.js';
import { itemSize } from './inventory.js';
import { SKILLS, xpNeed } from './game.js';
import { TRAITS, allyStatus } from './ai.js';
import { uid } from './util.js';

const $ = (id) => document.getElementById(id);
const CELL = 42;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this.open = null;          // name of the open panel
    this.container = null;     // { o, x, y }
    this.giftTarget = null;
    this.dialogTarget = null;
    this.drag = null;
    this.craftTab = 'all';
    this.hudT = 0;
    this.lastInv = -1;
    this.mmCanvas = document.createElement('canvas');
    this.mmCanvas.width = W; this.mmCanvas.height = H;
    this.mmVersion = -1;
    this.bindGlobal();
  }

  setGame(g) {
    this.g = g;
    this.closeAll();
    this.mmVersion = -1;
    $('hud').classList.remove('hidden');
  }

  // ---------- panels ----------
  isOpen(name) { return this.open === name; }
  toggle(name) { if (this.open === name) this.closeAll(); else this.show(name); }
  show(name) {
    this.closeAll(name === 'inv');
    this.open = name;
    $('panel-' + name).classList.remove('hidden');
    this.renderPanel();
  }
  closeAll(keepContainer) {
    for (const n of ['inv', 'craft', 'build', 'char', 'dialog', 'map']) $('panel-' + n).classList.add('hidden');
    if (this.container && !keepContainer) { this.g?.closeContainer(this.container.o, this.container.x, this.container.y); this.container = null; }
    this.open = null; this.giftTarget = null;
    this.hideTooltip(); this.hideCtx();
  }
  renderPanel() {
    if (!this.open) return;
    const r = { inv: () => this.renderInventory(), craft: () => this.renderCraft(), build: () => this.renderBuild(),
      char: () => this.renderChar(), dialog: () => this.renderDialog(), map: () => this.renderBigMap() }[this.open];
    r && r();
  }

  openContainer(o, x, y) {
    if (this.container && this.container.o !== o) this.g.closeContainer(this.container.o, this.container.x, this.container.y);
    this.container = { o, x, y };
    this.closeAll(true);
    this.open = 'inv';
    $('panel-inv').classList.remove('hidden');
    this.renderInventory();
  }

  openDialog(h) { this.dialogTarget = h; this.show('dialog'); }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.g;
    if (!g) return;
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.updateHud(); }
    if (this.open && g.invVersion !== this.lastInv) {
      this.lastInv = g.invVersion;
      if (!this.drag && ['inv', 'craft', 'build'].includes(this.open)) this.renderPanel();
    }
    // close container when walking away
    if (this.container) {
      const p = g.player;
      const far = Math.hypot(this.container.x + 0.5 - p.x, this.container.y + 0.5 - p.y) > 2.6;
      const gone = g.world.o(this.container.x, this.container.y) !== this.container.o;
      if (far || gone) { this.container = null; if (this.open === 'inv') this.renderInventory(); }
    }
    if (this.open === 'dialog' && this.dialogTarget) {
      const h = this.dialogTarget;
      if (h.dead || Math.hypot(h.x - g.player.x, h.y - g.player.y) > 4 || h.faction === 'raider') this.closeAll();
    }
  }

  updateHud() {
    const g = this.g, p = g.player;
    $('char-line').innerHTML = `${esc(p.name)} <small>· age ${p.age} · gen ${g.dynasty.generation}</small>`;
    const bars = [
      ['❤', p.hp, p.maxHp, '#d04a4a'], ['🍖', p.hunger, 100, '#c99a4a'], ['💧', p.thirst, 100, '#4a9ad0'],
      ['💤', p.energy, 100, '#9a7ad0'], ['⚡', p.stamina, 100, '#d0c04a'],
    ];
    $('bars').innerHTML = bars.map(([l, v, m, c]) =>
      `<div class="bar"><span class="lbl">${l}</span><div class="track"><div class="fill" style="width:${Math.max(0, v / m * 100)}%;background:${c}"></div></div><span class="num">${Math.ceil(v)}</span></div>`).join('');
    const st = [];
    if (p.bleeding) st.push(['Bleeding', 'bad']);
    if (p.infection > 0) st.push([`Infected ${Math.floor(p.infection)}%`, 'bad']);
    if (p.sick > 0) st.push(['Sick', 'bad']);
    if (p.hunger < 20) st.push(['Starving', 'bad']); else if (p.hunger < 40) st.push(['Hungry', 'warn']);
    if (p.thirst < 20) st.push(['Parched', 'bad']); else if (p.thirst < 40) st.push(['Thirsty', 'warn']);
    if (p.energy < 15) st.push(['Exhausted', 'bad']); else if (p.energy < 35) st.push(['Tired', 'warn']);
    if (p.crouch) st.push(['Sneaking', 'good']);
    if (p.hunger > 80 && p.thirst > 80) st.push(['Well fed', 'good']);
    if (p.age >= 55) st.push(['Elderly', 'warn']);
    $('statuses').innerHTML = st.map(([t, c]) => `<span class="chip ${c}">${t}</span>`).join('');
    const horde = g.day % HORDE_EVERY === 0;
    const next = HORDE_EVERY - (g.day % HORDE_EVERY);
    $('clock').innerHTML = `Day ${g.day} · ${g.timeString()} ${g.darkness > 0.5 ? '🌙' : '☀️'}<br><small class="${horde ? 'moon' : ''}">${horde ? '🩸 Blood Moon tonight' : `Blood Moon in ${next} day${next > 1 ? 's' : ''}`}</small>`;
    // log
    const now = performance.now();
    $('log').innerHTML = g.log.slice(-7).map(m => {
      const age = (now - m.t) / 1000;
      return `<div class="${m.cls}" style="opacity:${age > 12 ? Math.max(0, 1 - (age - 12) / 4) : 1}">${esc(m.text)}</div>`;
    }).join('');
    // prompt
    const it = g.buildSel ? null : g.findInteract();
    this.interact = it;
    const pr = $('prompt');
    const screenUp = !document.getElementById('screen').classList.contains('hidden');
    if (it && !this.open && !screenUp && !g.over) { pr.innerHTML = `<kbd>E</kbd>${esc(it.label)}`; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
    // build hint
    const bh = $('build-hint');
    if (g.buildSel) {
      const name = g.buildSel === '__deconstruct' ? 'Deconstruct' : g.buildSel === '__repair' ? 'Repair' : OBJ[g.buildSel].name;
      const cost = OBJ[g.buildSel]?.build ? ' — ' + this.costStr(OBJ[g.buildSel].build.cost) : '';
      const ht = g.input.hoverTile;
      const why = ht && !g.buildSel.startsWith('__') ? g.canBuild(g.buildSel, ht[0], ht[1]) : { ok: true };
      bh.innerHTML = `<b>${esc(name)}</b>${cost}<br><span class="hint">Left click: place · Right click / Esc: stop${why.ok ? '' : ' · <span style="color:var(--bad)">' + esc(why.why) + '</span>'}</span>`;
      bh.classList.remove('hidden');
    } else bh.classList.add('hidden');
    this.renderHotbar();
    this.drawMinimap();
    // weapon
    const { it: wi, d, w } = g.playerWeapon();
    let wtxt = d ? d.name : 'Fists';
    if (w.type === 'ranged') wtxt += w.mag ? ` — ${wi.ammo}/${w.mag} (${p.inv.count(w.ammo)} spare)` : ` — ${p.inv.count(w.ammo)} ${ITEMS[w.ammo].name}s`;
    $('weapon-info').textContent = wtxt;
    // damage vignette & sleep fade
    const hurt = p.hitFlash > 0 ? 0.8 : p.hp < p.maxHp * 0.3 ? 0.45 : 0;
    $('vignette').style.boxShadow = `inset 0 0 ${120 + hurt * 120}px rgba(140,0,0,${hurt})`;
    $('sleep-fade').style.opacity = p.sleeping ? 0.75 : 0;
  }

  costStr(cost) {
    const inv = this.g.player.inv;
    return Object.entries(cost).map(([id, n]) => {
      const have = inv.count(id);
      return `<span class="${have >= n ? 'have' : 'miss'}" style="color:${have >= n ? 'var(--good)' : 'var(--bad)'}">${n} ${ITEMS[id].name}</span>`;
    }).join(', ');
  }

  // ---------- hotbar ----------
  renderHotbar() {
    const g = this.g, p = g.player;
    const hb = $('hotbar');
    if (!hb.children.length) {
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('div');
        s.className = 'hslot'; s.dataset.slot = i;
        s.addEventListener('mousedown', (e) => { if (e.button === 0) { p.sel = i; } if (e.button === 2) { p.hotbar[i] = null; g.resolveHotbar(); } });
        s.addEventListener('contextmenu', e => e.preventDefault());
        hb.appendChild(s);
      }
    }
    for (let i = 0; i < 5; i++) {
      const s = hb.children[i];
      const ref = p.hotbar[i];
      const it = ref != null ? p.inv.items.find(x => x.uid === ref) : null;
      const d = it && ITEMS[it.id];
      const key = `${i}|${it?.uid}|${it?.n}|${Math.round(it?.dur || 0)}|${it?.ammo}|${p.sel}`;
      if (s.dataset.key === key) continue;
      s.dataset.key = key;
      s.classList.toggle('sel', p.sel === i);
      s.innerHTML = `<span class="k">${i + 1}</span>${d ? d.icon : ''}${it && it.n > 1 ? `<span class="n">${it.n}</span>` : ''}${it?.ammo != null ? `<span class="n">${it.ammo}</span>` : ''}${it && it.dur != null && d.dur ? `<span class="dur"><i style="width:${it.dur / d.dur * 100}%"></i></span>` : ''}`;
      s.title = d ? d.name : 'Empty — drag an item here from your inventory';
    }
  }

  // ---------- minimap ----------
  paintMinimapBase() {
    const g = this.g, w = g.world;
    const ctx = this.mmCanvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c = GROUND_INFO[w.ground[i]].color;
      const o = w.objs[i];
      if (o) {
        const d = OBJ[o.t];
        if (d.kind === 'structure' || d.door) c = o.own ? [200, 150, 80] : [150, 140, 125];
        else if (o.t === 'tree' || o.t === 'pine') c = [40, 70, 36];
        else if (d.kind === 'resource' && d.solid) c = [130, 130, 130];
        else if (d.kind === 'container' && d.solid) c = [120, 100, 70];
        else if (d.build) c = [210, 170, 90];
      }
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  drawMinimap() {
    const g = this.g, p = g.player;
    if (g.world.version !== this.mmVersion && (performance.now() - (this.mmPaint || 0) > 1000 || this.mmVersion < 0)) {
      this.mmVersion = g.world.version; this.mmPaint = performance.now(); this.paintMinimapBase();
    }
    const c = $('minimap'), ctx = c.getContext('2d');
    const R = 34, S = c.width / (R * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.mmCanvas, p.x - R, p.y - R, R * 2, R * 2, 0, 0, c.width, c.height);
    if (g.darkness > 0) { ctx.fillStyle = `rgba(0,0,20,${g.darkness * 0.45})`; ctx.fillRect(0, 0, c.width, c.height); }
    const dot = (x, y, col, r = 2.5) => {
      const sx = (x - p.x + R) * S, sy = (y - p.y + R) * S;
      if (sx < 0 || sy < 0 || sx > c.width || sy > c.height) return;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
    };
    for (const z of g.zombies) if (z.state === 'chase' || Math.hypot(z.x - p.x, z.y - p.y) < 14) dot(z.x, z.y, '#ff4a3a', 2);
    for (const h of g.humans) dot(h.x, h.y, h.faction === 'raider' ? '#ff9a3a' : allyStatus(h) ? '#7aff7a' : '#ffffff', 2.8);
    // player arrow + camera direction
    const cx = c.width / 2, cy = c.height / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(p.angle);
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.fill();
    ctx.restore();
    const yaw = this.renderer?.yaw || 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - Math.sin(yaw) * 26, cy - Math.cos(yaw) * 26); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('N', cx, 10);
  }

  renderBigMap() {
    const g = this.g, p = g.player;
    this.paintMinimapBase();
    const c = $('bigmap'), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mmCanvas, 0, 0, c.width, c.height);
    const S = c.width / W;
    ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
    for (const t of g.world.towns) {
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t.name, t.x * S, (t.y - t.r) * S);
      ctx.fillStyle = '#ffe1a0'; ctx.fillText(t.name, t.x * S, (t.y - t.r) * S);
    }
    for (const h of g.humans) {
      if (!allyStatus(h)) continue;
      ctx.fillStyle = '#7aff7a'; ctx.beginPath(); ctx.arc(h.x * S, h.y * S, 3, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#ffd27a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x * S, p.y * S, 5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.textAlign = 'left';
    ctx.fillText('M to close · Towns hold loot, survivors — and the dead.', 10, c.height - 10);
  }

  // ---------- inventory ----------
  renderInventory() {
    const g = this.g, p = g.player;
    this.hideTooltip();
    const el = $('panel-inv');
    el.innerHTML = '';
    const left = document.createElement('div'); left.className = 'inv-col';
    left.innerHTML = `<h2>${esc(p.name)} <button class="close">✕</button></h2>`;
    left.querySelector('.close').onclick = () => this.closeAll();
    if (this.giftTarget) left.insertAdjacentHTML('beforeend', `<div class="gift-banner">Click an item to give it to <b>${esc(this.giftTarget.name)}</b>. <button id="gift-done">Done</button></div>`);
    const eq = document.createElement('div'); eq.className = 'equip';
    const slot = (key, label, id) => `<div class="eslot"><b>${label}</b>${id ? `${ITEMS[id].icon} ${ITEMS[id].name}<br><button data-uneq="${key}">Unequip</button>` : '<span class="hint">Empty — Use an item to equip</span>'}</div>`;
    eq.innerHTML = slot('pack', 'Backpack', p.pack) + slot('armor', 'Armor', p.armor);
    left.appendChild(eq);
    eq.querySelectorAll('[data-uneq]').forEach(b => b.onclick = () => { g.unequip(b.dataset.uneq); this.renderInventory(); });
    left.appendChild(this.gridEl(p.inv, 'player'));
    left.insertAdjacentHTML('beforeend', `<div class="hint">Drag to move · R rotates while dragging · Shift+click quick-transfer<br>Right-click for options · Drag onto hotbar slots to bind · Drag outside to drop</div>`);
    el.appendChild(left);
    if (this.giftTarget) left.querySelector('#gift-done').onclick = () => { const h = this.giftTarget; this.giftTarget = null; this.openDialog(h); };
    if (this.container) {
      const { o } = this.container;
      const right = document.createElement('div'); right.className = 'inv-col';
      const name = o.label || OBJ[o.t].name;
      right.innerHTML = `<h2>${esc(name)} <button id="take-all">Take all</button></h2>`;
      right.appendChild(this.gridEl(o.inv, 'container'));
      if (o.inv.isEmpty()) right.insertAdjacentHTML('beforeend', '<div class="hint">Empty.</div>');
      el.appendChild(right);
      right.querySelector('#take-all').onclick = () => {
        for (const it of o.inv.items.slice()) { if (p.inv.add(it) === 0) o.inv.remove(it); }
        g.resolveHotbar(); g.touchInv(); this.renderInventory();
      };
    }
  }

  gridEl(grid, key) {
    const g = this.g, p = g.player;
    const el = document.createElement('div');
    el.className = 'grid';
    el.dataset.grid = key;
    el.style.width = grid.w * CELL + 2 + 'px';
    el.style.height = grid.h * CELL + 2 + 'px';
    el._grid = grid;
    for (const it of grid.items) {
      const d = ITEMS[it.id];
      const [w, h] = itemSize(it);
      const ie = document.createElement('div');
      ie.className = 'item';
      ie.style.left = it.x * CELL + 1 + 'px'; ie.style.top = it.y * CELL + 1 + 'px';
      ie.style.width = w * CELL - 2 + 'px'; ie.style.height = h * CELL - 2 + 'px';
      ie.style.background = CAT_COLORS[d.cat] || '#444';
      const slotIdx = key === 'player' ? p.hotbar.indexOf(it.uid) : -1;
      if (slotIdx >= 0) { ie.classList.add('bound'); ie.dataset.slot = slotIdx + 1; }
      let extra = '';
      if (it.n > 1) extra += `<span class="ct">${it.n}</span>`;
      if (it.ammo != null) extra += `<span class="ct">${it.ammo}/${d.weapon.mag}</span>`;
      if (it.dur != null && d.dur) extra += `<span class="db"><i style="width:${Math.max(0, it.dur / d.dur * 100)}%;background:${it.dur / d.dur < 0.25 ? '#d05050' : '#8fd18f'}"></i></span>`;
      ie.innerHTML = `<span class="nm">${esc(d.name)}</span><span class="ic" style="font-size:${Math.min(w, h) > 1 ? 34 : 22}px">${d.icon}</span>${extra}`;
      ie.addEventListener('mousedown', (e) => this.itemDown(e, grid, it, key));
      ie.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showCtx(e, grid, it, key); });
      ie.addEventListener('mouseenter', (e) => this.showTooltip(e, it));
      ie.addEventListener('mousemove', (e) => this.moveTooltip(e));
      ie.addEventListener('mouseleave', () => this.hideTooltip());
      el.appendChild(ie);
    }
    return el;
  }

  otherGrid(key) {
    if (key === 'player') return this.container ? this.container.o.inv : null;
    return this.g.player.inv;
  }

  itemDown(e, grid, it, key) {
    if (e.button !== 0) return;
    e.preventDefault();
    const g = this.g;
    this.hideTooltip(); this.hideCtx();
    if (this.giftTarget && key === 'player') {
      g.social(this.giftTarget, 'gift', it);
      this.renderInventory();
      return;
    }
    if (e.shiftKey) {
      const other = this.otherGrid(key);
      if (other) {
        grid.remove(it);
        const left = other.add(it);
        if (left > 0) grid.add(it);
        g.resolveHotbar(); g.touchInv(); this.renderInventory();
      }
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    this.drag = {
      grid, it, key, rot: it.rot,
      offX: Math.floor((e.clientX - rect.left) / CELL), offY: Math.floor((e.clientY - rect.top) / CELL),
    };
    e.currentTarget.style.opacity = 0.3;
    this.updateGhost(e.clientX, e.clientY);
    $('drag-ghost').classList.remove('hidden');
  }

  updateGhost(mx, my) {
    const dr = this.drag;
    const d = ITEMS[dr.it.id];
    const [w, h] = itemSize(dr.it, dr.rot);
    const gh = $('drag-ghost');
    gh.style.width = w * CELL - 2 + 'px'; gh.style.height = h * CELL - 2 + 'px';
    gh.style.left = mx - dr.offX * CELL - CELL / 2 + 'px'; gh.style.top = my - dr.offY * CELL - CELL / 2 + 'px';
    gh.innerHTML = `<div class="item" style="position:static;width:100%;height:100%;background:${CAT_COLORS[d.cat]}"><span class="ic" style="font-size:${Math.min(w, h) > 1 ? 34 : 22}px">${d.icon}</span></div>`;
    // placement preview
    document.querySelectorAll('.hover-cell').forEach(n => n.remove());
    document.querySelectorAll('.hslot.drop-ok').forEach(n => n.classList.remove('drop-ok'));
    const t = this.dropTarget(mx, my);
    if (t?.type === 'grid') {
      const hc = document.createElement('div');
      hc.className = 'hover-cell';
      hc.style.left = t.x * CELL + 1 + 'px'; hc.style.top = t.y * CELL + 1 + 'px';
      hc.style.width = w * CELL - 2 + 'px'; hc.style.height = h * CELL - 2 + 'px';
      hc.style.background = t.ok ? 'rgba(120,220,120,0.25)' : 'rgba(220,80,80,0.3)';
      t.el.appendChild(hc);
    } else if (t?.type === 'hotbar') t.el.classList.add('drop-ok');
  }

  dropTarget(mx, my) {
    const dr = this.drag;
    const gh = $('drag-ghost');
    gh.style.display = 'none';
    const under = document.elementFromPoint(mx, my);
    gh.style.display = '';
    if (!under) return null;
    const hs = under.closest('.hslot');
    if (hs) return { type: 'hotbar', el: hs, slot: +hs.dataset.slot };
    const gel = under.closest('.grid');
    if (gel) {
      const grid = gel._grid;
      const r = gel.getBoundingClientRect();
      const cx = Math.floor((mx - r.left) / CELL), cy = Math.floor((my - r.top) / CELL);
      const x = cx - dr.offX, y = cy - dr.offY;
      const onto = grid.itemAt(cx, cy);
      if (onto && onto !== dr.it && onto.id === dr.it.id && ITEMS[onto.id].stack > 1) return { type: 'merge', el: gel, grid, onto };
      return { type: 'grid', el: gel, grid, x, y, ok: grid.fits(dr.it, x, y, dr.rot, dr.it) };
    }
    if (under.closest('.panel')) return { type: 'none' };
    return { type: 'ground' };
  }

  endDrag(mx, my) {
    const dr = this.drag;
    this.drag = null;
    document.querySelectorAll('.hover-cell').forEach(n => n.remove());
    document.querySelectorAll('.hslot.drop-ok').forEach(n => n.classList.remove('drop-ok'));
    $('drag-ghost').classList.add('hidden');
    const g = this.g, p = g.player;
    this.drag = dr; const t = this.dropTarget(mx, my); this.drag = null;
    if (t) {
      if (t.type === 'grid' && t.ok) {
        dr.grid.remove(dr.it);
        t.grid.place(dr.it, t.x, t.y, dr.rot);
      } else if (t.type === 'merge') {
        const max = ITEMS[t.onto.id].stack;
        const mv = Math.min(max - t.onto.n, dr.it.n);
        t.onto.n += mv; dr.it.n -= mv;
        if (dr.it.n <= 0) dr.grid.remove(dr.it);
      } else if (t.type === 'hotbar') {
        if (dr.grid === p.inv) g.bindHotbar(dr.it, t.slot);
        else g.msg('Move the item into your inventory first.', 'bad');
      } else if (t.type === 'ground') {
        g.dropFromInventory(dr.it, dr.grid);
        g.msg(`Dropped ${ITEMS[dr.it.id].name}.`, '');
      }
    }
    g.resolveHotbar(); g.touchInv();
    this.renderInventory();
  }

  showCtx(e, grid, it, key) {
    const g = this.g, p = g.player, d = ITEMS[it.id];
    const opts = [];
    if (key === 'player') {
      if (d.use) opts.push([d.cat === 'med' ? 'Use' : d.use.thirst > d.use.hunger || !d.use.hunger ? 'Drink' : 'Eat', () => g.useItem(it)]);
      if (d.fill) opts.push(['Fill at water', () => g.useItem(it)]);
      if (d.equip) opts.push(['Equip', () => g.useItem(it)]);
      if (d.weapon?.mag) opts.push(['Unload', () => { if (it.ammo > 0) { g.give(d.weapon.ammo, it.ammo, true); it.ammo = 0; g.touchInv(); } }]);
      for (let i = 0; i < 5; i++) opts.push([`Bind to hotbar ${i + 1}`, () => g.bindHotbar(it, i)]);
    } else opts.push(['Take', () => { grid.remove(it); if (p.inv.add(it) > 0) grid.add(it); g.resolveHotbar(); g.touchInv(); }]);
    if (d.scrap) opts.push([`Scrap → ${Object.entries(d.scrap).map(([k, n]) => `${n * it.n} ${ITEMS[k].name}`).join(', ')}`, () => g.scrapItem(it, grid)]);
    if (it.n > 1) opts.push(['Split stack', () => {
      const half = Math.floor(it.n / 2);
      const ni = { ...it, uid: uid(), n: half };
      const spot = grid.findSpot(ni);
      if (spot) { it.n -= half; grid.place(ni, spot.x, spot.y, spot.rot); g.touchInv(); } else g.msg('No room to split.', 'bad');
    }]);
    opts.push(['Drop', () => g.dropFromInventory(it, grid)]);
    const m = $('ctxmenu');
    m.innerHTML = '';
    for (const [label, fn] of opts) {
      const dv = document.createElement('div'); dv.textContent = label;
      dv.onmousedown = (ev) => { ev.stopPropagation(); fn(); this.hideCtx(); this.renderInventory(); };
      m.appendChild(dv);
    }
    m.classList.remove('hidden');
    m.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
    m.style.top = Math.min(e.clientY, window.innerHeight - opts.length * 30 - 10) + 'px';
  }
  hideCtx() { $('ctxmenu').classList.add('hidden'); }

  showTooltip(e, it) {
    if (this.drag) return;
    const d = ITEMS[it.id];
    const rows = [];
    if (d.desc) rows.push(esc(d.desc));
    if (d.use) {
      const u = d.use, parts = [];
      if (u.hunger) parts.push(`${u.hunger > 0 ? '+' : ''}${u.hunger} food`);
      if (u.thirst) parts.push(`${u.thirst > 0 ? '+' : ''}${u.thirst} water`);
      if (u.heal) parts.push(`+${u.heal} health`);
      if (u.cure) parts.push(`cures ${u.cure.join(', ')}`);
      if (u.sick) parts.push(`${Math.round(u.sick * 100)}% sickness risk`);
      rows.push(parts.join(' · '));
    }
    if (d.weapon) {
      const w = d.weapon;
      rows.push(`Damage ${w.dmg}${w.pellets ? '×' + w.pellets : ''} · ${(1 / w.cd).toFixed(1)} atk/s${w.mag ? ` · Mag ${w.mag}` : ''}${w.ammo ? ` · Uses ${ITEMS[w.ammo].name}` : ''}`);
      if (w.noise >= 15) rows.push('<span style="color:var(--bad)">Loud — attracts the dead</span>');
    }
    if (d.tool) rows.push(Object.entries(d.tool).map(([k, v]) => `${k === 'axe' ? 'Chopping' : 'Mining'} ×${v}`).join(' · '));
    if (it.dur != null && d.dur) rows.push(`Durability ${Math.ceil(it.dur)}/${d.dur}`);
    if (d.scrap) rows.push('Scraps into: ' + Object.entries(d.scrap).map(([k, n]) => `${n} ${ITEMS[k].name}`).join(', '));
    rows.push(`<span class="tt-row">Size ${d.w}×${d.h}${d.stack > 1 ? ` · Stack ${it.n}/${d.stack}` : ''}</span>`);
    const tt = $('tooltip');
    tt.innerHTML = `<b>${d.icon} ${esc(d.name)}</b><br>${rows.join('<br>')}`;
    tt.classList.remove('hidden');
    this.moveTooltip(e);
  }
  moveTooltip(e) {
    const tt = $('tooltip');
    tt.style.left = Math.min(e.clientX + 16, window.innerWidth - 300) + 'px';
    tt.style.top = Math.min(e.clientY + 14, window.innerHeight - tt.offsetHeight - 10) + 'px';
  }
  hideTooltip() { $('tooltip').classList.add('hidden'); }

  // ---------- crafting ----------
  renderCraft() {
    const g = this.g;
    const stations = g.nearStations();
    const el = $('panel-craft');
    const tabs = ['all', null, 'campfire', 'workbench', 'forge', 'machine_shop'];
    el.innerHTML = `<h2>Crafting <button class="close">✕</button></h2>
      <div class="hint" style="margin-bottom:8px">Nearby: ${[...stations].map(s => STATIONS[s]).join(', ')} · Crafting skill ${g.lvl('craft')}</div>
      <div class="tabs">${tabs.map(t => `<button data-tab="${t}" class="${String(this.craftTab) === String(t) ? 'on' : ''}">${t === 'all' ? 'All' : STATIONS[t]}</button>`).join('')}</div>
      <div id="recipes"></div>`;
    el.querySelector('.close').onclick = () => this.closeAll();
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.craftTab = b.dataset.tab === 'null' ? null : b.dataset.tab; this.renderCraft(); });
    const list = el.querySelector('#recipes');
    const inv = g.player.inv;
    const shown = RECIPES.filter(r => this.craftTab === 'all' || r.st === this.craftTab);
    shown.sort((a, b) => (g.canCraft(b, stations).ok - g.canCraft(a, stations).ok));
    for (const r of shown) {
      const d = ITEMS[r.out];
      const c = g.canCraft(r, stations);
      const row = document.createElement('div');
      row.className = 'recipe' + (c.ok ? '' : ' locked');
      const req = Object.entries(r.req).map(([id, n]) => `<span class="${inv.count(id) >= n ? 'have' : 'miss'}">${n} ${ITEMS[id].name} (${inv.count(id)})</span>`).join(', ');
      row.innerHTML = `<div class="ic">${d.icon}</div><div class="info"><div class="name">${esc(d.name)}${r.n > 1 ? ' ×' + r.n : ''} <span class="hint">· ${STATIONS[r.st]}${r.lvl > 1 ? ' · Lv ' + r.lvl : ''}</span></div>
        <div class="req">${req}</div>${c.ok ? '' : `<div class="why">${c.why}</div>`}</div>
        <button ${c.ok ? '' : 'disabled'} title="Shift+click to craft 5">Craft</button>`;
      row.querySelector('button').onclick = (e) => { g.craft(r, e.shiftKey ? 5 : 1); this.renderCraft(); };
      row.addEventListener('mouseenter', (e) => { const fake = { id: r.out, n: r.n, dur: d.dur }; this.showTooltip(e, fake); });
      row.addEventListener('mousemove', (e) => this.moveTooltip(e));
      row.addEventListener('mouseleave', () => this.hideTooltip());
      list.appendChild(row);
    }
  }

  // ---------- building ----------
  renderBuild() {
    const g = this.g;
    const el = $('panel-build');
    const cats = ['Stations', 'Defense', 'Utility', 'Floors'];
    let html = `<h2>Build <button class="close">✕</button></h2><div class="hint">Building skill ${g.lvl('build')}. Zombies smash through walls to reach you — they pick the weakest path. Doors keep them out only while closed.</div>`;
    html += `<div class="btn-row" style="margin:8px 0"><button data-b="__repair">🔧 Repair tool</button><button data-b="__deconstruct">🪓 Deconstruct tool</button></div>`;
    for (const cat of cats) {
      html += `<h3>${cat}</h3><div class="build-grid">`;
      for (const d of BUILDABLES.filter(b => b.build.cat === cat)) {
        const lockedLvl = g.lvl('build') < d.build.lvl;
        const have = g.player.inv.has(d.build.cost);
        html += `<div class="bcard ${lockedLvl ? 'locked' : ''}" data-b="${d.id}"><div class="name">${esc(d.name)}${d.hp ? ` <span class="hint">${d.hp}hp</span>` : ''}</div>
          <div class="req">${this.costStr(d.build.cost)}</div>${lockedLvl ? `<div class="why" style="color:#c99;font-size:11px">Requires Building ${d.build.lvl}</div>` : !have ? '<div class="hint" style="font-size:11px">Missing materials</div>' : ''}</div>`;
      }
      html += '</div>';
    }
    el.innerHTML = html;
    el.querySelector('.close').onclick = () => this.closeAll();
    el.querySelectorAll('[data-b]').forEach(b => b.onclick = () => {
      if (b.classList.contains('locked')) return;
      g.buildSel = b.dataset.b;
      this.closeAll();
    });
  }

  // ---------- character ----------
  renderChar() {
    const g = this.g, p = g.player;
    const el = $('panel-char');
    const skills = Object.entries(SKILLS).map(([k, name]) => {
      const s = p.skills[k];
      return `<div class="skill"><div class="row"><span>${name}</span><span>Lv ${s.lvl}</span></div><div class="track"><i style="width:${s.xp / xpNeed(s.lvl) * 100}%"></i></div></div>`;
    }).join('');
    const allies = g.humans.filter(h => allyStatus(h));
    const hist = g.legacy.history.slice(0, 8).map(h => `<div>Gen ${h.gen} · <b>${esc(h.name)}</b>, age ${h.age} — ${esc(h.cause)} (${h.days} days, +${h.points} legacy)</div>`).join('') || '<div>No ancestors yet. You are the first.</div>';
    el.innerHTML = `<h2>${esc(p.name)} <button class="close">✕</button></h2>
      <div class="kv"><span>House</span><span>${esc(g.dynasty.name)} · generation ${g.dynasty.generation}</span>
      <span>Age</span><span>${p.age}${p.age >= 55 ? ' (elderly — stamina declining)' : ''}</span>
      <span>Days survived</span><span>${Math.floor((g.time - (p.bornAt || 0)) / 600)}</span>
      <span>Zombies killed</span><span>${p.kills}</span>
      <span>Built / Crafted</span><span>${g.stats.built} / ${g.stats.crafted}</span>
      <span>Armor</span><span>${p.armor ? ITEMS[p.armor].name : 'None'}</span>
      <span>Legacy points banked</span><span>${g.legacy.points}</span></div>
      <h3>Skills</h3>${skills}
      <h3>Your people</h3>${allies.length ? allies.map(h => `<div>${esc(h.name)} — ${g.relationLabel(h)}, ${h.mode}, hunger ${Math.round(h.hunger)}</div>`).join('') : '<div class="hint">No companions. Befriend survivors in town (talk, gift, joke) then ask them to join.</div>'}
      <h3>Family history</h3><div class="history">${hist}</div>
      <div class="hint" style="margin-top:8px">When you die, your legacy points buy permanent perks for every future character. With a bonded partner alive, your heir continues in this same world.</div>`;
    el.querySelector('.close').onclick = () => this.closeAll();
  }

  // ---------- dialogue ----------
  renderDialog() {
    const g = this.g, h = this.dialogTarget;
    if (!h) return;
    const el = $('panel-dialog');
    const ally = allyStatus(h);
    const rel = g.relationLabel(h);
    const opCol = h.opinion >= 0 ? '#8fd18f' : '#d05050';
    const btn = (a, label, enabled = true, title = '') => `<button data-a="${a}" ${enabled ? '' : 'disabled'} title="${title}">${label}</button>`;
    let actions = btn('talk', '💬 Chat') + btn('joke', '😄 Joke') + btn('compliment', '🌹 Compliment') + btn('gift', '🎁 Gift');
    if (h.traits.includes('Romantic') || h.romance > 0 || h.opinion >= 40) actions += btn('flirt', '💕 Flirt', h.status !== 'family');
    if (!ally) actions += btn('recruit', '🤝 Ask to join', true, 'Needs opinion 35+');
    else {
      actions += btn('follow', '➡ Follow me') + btn('stay', '⏸ Hold here') + btn('work', '🪓 Gather here') + btn('dismiss', '✋ Dismiss');
      if (h.status !== 'partner' && h.status !== 'family') actions += btn('propose', '💍 Propose', h.romance >= 100 && h.opinion >= 70, 'Needs romance 100 and opinion 70');
    }
    el.innerHTML = `<h2>${esc(h.name)} <button class="close">✕</button></h2>
      <div class="hint">Age ${h.age} · ${rel}${ally ? ' · ' + h.mode : ''}${ally ? ` · hunger ${Math.round(h.hunger)}` : ''}</div>
      <div class="traits">${h.traits.map(t => `<span class="chip" title="${esc(TRAITS[t] || '')}">${t}</span>`).join('')}</div>
      <div>Opinion of you: ${Math.round(h.opinion)}</div>
      <div class="meter"><i style="width:${Math.abs(h.opinion)}%;background:${opCol}"></i></div>
      ${h.romance > 0 ? `<div>Romance: ${Math.round(h.romance)}</div><div class="meter"><i style="width:${h.romance}%;background:#ff9ad5"></i></div>` : ''}
      ${h.bubble ? `<div style="font-style:italic;margin:6px 0">"${esc(h.bubble.text)}"</div>` : ''}
      <div class="btn-row">${actions}</div>
      <div class="hint" style="margin-top:8px">Companions fight, gather into nearby storage crates, and eat food stored there. A partner lets your bloodline continue when you die.</div>`;
    el.querySelector('.close').onclick = () => this.closeAll();
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'gift') { this.closeAll(); this.giftTarget = h; this.dialogTarget = h; this.open = 'inv'; $('panel-inv').classList.remove('hidden'); this.renderInventory(); return; }
      g.social(h, a);
      this.renderDialog();
    });
  }

  // ---------- global input for drag ----------
  bindGlobal() {
    window.addEventListener('mousemove', (e) => { if (this.drag) this.updateGhost(e.clientX, e.clientY); });
    window.addEventListener('mouseup', (e) => { if (this.drag && e.button === 0) this.endDrag(e.clientX, e.clientY); });
    window.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxmenu')) this.hideCtx(); });
    window.addEventListener('keydown', (e) => {
      if (this.drag && e.code === 'KeyR') { this.drag.rot = !this.drag.rot; const [w, h] = [this.drag.offX, this.drag.offY]; this.drag.offX = h; this.drag.offY = w; this.updateGhost(this.lastMx || 0, this.lastMy || 0); e.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('mousemove', (e) => { this.lastMx = e.clientX; this.lastMy = e.clientY; });
  }
}
