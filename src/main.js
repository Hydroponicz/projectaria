// Entry point: menus, input, camera controls and the main loop.
import { Game } from './game.js';
import { Renderer } from './render3d.js';
import { UI } from './ui.js';
import { loadLegacy, PERKS, rank, buyPerk } from './legacy.js';
import { SURNAMES } from './ai.js';
import { initAudio, sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const legacy = loadLegacy();
const renderer = new Renderer($('gl'), $('overlay'));
const ui = new UI();
ui.renderer = renderer;
let game = null;
let paused = true;
const keys = new Set();
const mouse = { x: innerWidth / 2, y: innerHeight / 2, rDown: false, rMoved: 0, lastX: 0 };

// ---------- game lifecycle ----------
function attach(g) {
  game = g;
  window.game = g; // handy for debugging in the console
  g.hooks = {
    onContainer: (o, x, y) => ui.openContainer(o, x, y),
    onDialog: (h) => ui.openDialog(h),
    onCraft: () => ui.show('craft'),
    onDeath: (info) => setTimeout(() => showDeath(info), 1200),
    onHurt: () => { sfx.hurt(); renderer.shake = 0.25; },
    onShoot: (w) => (w.ammo === 'arrow' ? sfx.bow() : sfx.shot(w.noise > 30)),
    onHit: () => sfx.hit(),
    onSwing: () => sfx.swing(),
    onHarvestHit: (od) => (od.tool === 'pick' ? sfx.mine() : sfx.chop()),
    onGroan: () => { if (Math.random() < 0.5) sfx.groan(); },
    onDoor: (open) => sfx.door(open),
    onHorde: () => { sfx.horde(); renderer.shake = 1.2; },
  };
  renderer.setGame(g);
  ui.setGame(g);
  hideScreen();
  paused = false;
}

function newGame(dynasty) {
  const g = new Game(legacy);
  g.newWorld(dynasty);
  g.save();
  attach(g);
}

// ---------- screens ----------
function showScreen(html) { const s = $('screen'); s.innerHTML = html; s.classList.remove('hidden'); paused = true; }
function hideScreen() { $('screen').classList.add('hidden'); }

function titleScreen() {
  const has = Game.hasSave();
  showScreen(`<div class="card">
    <h1>PROJECT ARIA</h1>
    <div class="sub">Survive · Build · Endure · Pass it on</div>
    <div class="menu">
      ${has ? '<button class="primary" id="b-continue">Continue</button>' : ''}
      <button ${has ? '' : 'class="primary"'} id="b-new">New Bloodline</button>
      <button id="b-legacy">Legacy (${legacy.points} pts)</button>
      <button id="b-help">How to Play</button>
    </div>
    <div class="footnote">Permadeath. One save. When you die, your legacy lives on.</div>
  </div>`);
  if (has) $('b-continue').onclick = () => {
    initAudio();
    try {
      const g = Game.load(legacy);
      if (g) attach(g); else newScreen();
    } catch (e) { console.error(e); alert('Save could not be loaded.'); newScreen(); }
  };
  $('b-new').onclick = () => { initAudio(); if (Game.hasSave() && !confirm('Starting a new bloodline abandons your current world. Continue?')) return; newScreen(); };
  $('b-legacy').onclick = () => legacyScreen(titleScreen);
  $('b-help').onclick = () => helpScreen(titleScreen);
}

function newScreen() {
  const suggestion = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  showScreen(`<div class="card">
    <h1 style="font-size:40px">A NEW BLOODLINE</h1>
    <div class="sub">Name your family. Every heir will carry it.</div>
    <div class="menu">
      <input id="dyn" maxlength="18" value="${suggestion}" spellcheck="false">
      <button class="primary" id="b-start">Begin</button>
      <button id="b-back">Back</button>
    </div>
    <div class="box">${perkSummary()}</div>
  </div>`);
  $('dyn').focus(); $('dyn').select();
  const go = () => { const n = $('dyn').value.trim().replace(/[^\p{L}\p{N} '\-]/gu, '') || suggestion; newGame(n); };
  $('b-start').onclick = go;
  $('dyn').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  $('b-back').onclick = titleScreen;
}

function perkSummary() {
  const owned = PERKS.filter(p => rank(legacy, p.id) > 0);
  if (!owned.length) return '<div class="hint">No legacy perks yet. Die well and your descendants will be stronger.</div>';
  return '<b>Active legacy perks:</b><br>' + owned.map(p => `${p.name} ${'●'.repeat(rank(legacy, p.id))}`).join(' · ');
}

function legacyScreen(back) {
  const render = () => {
    showScreen(`<div class="card">
      <h1 style="font-size:40px">LEGACY</h1>
      <div class="sub">Permanent perks for every future character</div>
      <div class="points">${legacy.points} points</div><div class="hint">Lifetime earned: ${legacy.total}</div>
      <div class="box">${PERKS.map(p => {
        const r = rank(legacy, p.id), max = p.cost.length, cost = p.cost[r];
        return `<div class="perk"><div class="info"><b>${p.name}</b> <span class="pips">${'●'.repeat(r)}${'○'.repeat(max - r)}</span><br><span class="hint">${p.desc}</span></div>
          ${r < max ? `<button data-perk="${p.id}" ${legacy.points >= cost ? '' : 'disabled'}>Buy (${cost})</button>` : '<span class="hint">Maxed</span>'}</div>`;
      }).join('')}</div>
      <div class="box"><b>Family history</b><div class="history">${legacy.history.map(h => `<div>Gen ${h.gen} · <b>${esc(h.name)}</b>, age ${h.age} — ${esc(h.cause)} · ${h.days} days · ${h.kills} kills · +${h.points}</div>`).join('') || '<div>No one has died yet.</div>'}</div></div>
      <div class="menu" style="margin-top:16px"><button id="b-back">Back</button></div>
    </div>`);
    document.querySelectorAll('[data-perk]').forEach(b => b.onclick = () => { if (buyPerk(legacy, b.dataset.perk)) { sfx.ui(); render(); } });
    $('b-back').onclick = back;
  };
  render();
}

function helpScreen(back) {
  showScreen(`<div class="card"><h1 style="font-size:40px">HOW TO PLAY</h1>
    <div class="box"><div class="controls">
      <span>WASD</span><span>Move (relative to camera) · Shift sprint · C crouch/sneak</span>
      <span>Mouse</span><span>Aim · Left click attack / harvest / use · hold for automatic weapons</span>
      <span>Right drag · Z/X</span><span>Rotate camera · Mouse wheel zoom</span>
      <span>1–5</span><span>Select hotbar slot (drag items from inventory onto the hotbar)</span>
      <span>E</span><span>Interact: loot, open doors, talk, sleep, farm, drink</span>
      <span>Tab / I</span><span>Inventory — Tarkov-style grid. R rotates while dragging, Shift+click transfers</span>
      <span>Q</span><span>Crafting (stand near a campfire, workbench, forge or machine shop)</span>
      <span>B</span><span>Build menu · K character & skills · M map · R reload · Esc pause</span>
    </div></div>
    <div class="box">
      <b>Start with nothing.</b> Punch trees for sticks, pick up stones, pull tall grass for fiber. Craft a stone axe and pickaxe.<br><br>
      <b>The junk loop.</b> Loot towns and scrap junk (right-click → Scrap) into components: screws, springs, adhesive, electronics.<br><br>
      <b>Progression.</b> Primitive tools → workbench → forge (iron, gunpowder) → machined guns → machine shop industrial tools.<br><br>
      <b>Hardcore survival.</b> Watch hunger, thirst and energy. Bites can bleed or infect — infection kills unless treated with antibiotics. Boil murky water.<br><br>
      <b>The dead.</b> They hear noise and see light. At night they are faster. Every 7th night is a Blood Moon horde that hunts you and tears through walls.<br><br>
      <b>People.</b> Talk to survivors, earn their trust, recruit them, and find a partner. If your partner lives when you die, your heir carries on in the same world.<br><br>
      <b>Legacy.</b> Every death earns legacy points that buy permanent perks for all future characters.
    </div>
    <div class="menu" style="margin-top:16px"><button id="b-back">Back</button></div></div>`);
  $('b-back').onclick = back;
}

function pauseScreen() {
  showScreen(`<div class="card"><h1 style="font-size:44px">PAUSED</h1>
    <div class="sub">Day ${game.day} · ${esc(game.player.name)}</div>
    <div class="menu"><button class="primary" id="b-resume">Resume</button><button id="b-help">How to Play</button><button id="b-legacy">Legacy</button><button id="b-save">Save & Quit to Title</button></div></div>`);
  $('b-resume').onclick = () => { hideScreen(); paused = false; };
  $('b-help').onclick = () => helpScreen(pauseScreen);
  $('b-legacy').onclick = () => legacyScreen(pauseScreen);
  $('b-save').onclick = () => { game.save(); titleScreen(); };
}

function showDeath(info) {
  ui.closeAll();
  showScreen(`<div class="card death"><h1>${info.natural ? 'AT REST' : 'YOU DIED'}</h1>
    <div class="sub">${esc(info.name)} · age ${info.age} · generation ${info.generation}</div>
    <div style="font-size:18px">${esc(info.cause)}</div>
    <div class="box"><div class="kv">${info.score.parts.map(([k, v]) => `<span>${k}</span><span>+${v}</span>`).join('')}<span><b>Legacy earned</b></span><span class="points">+${info.score.total}</span></div>
    <div class="hint" style="margin-top:8px">Banked legacy points: ${legacy.points}</div></div>
    <div class="menu" style="margin-top:16px">
      ${info.partner ? `<button class="primary" id="b-heir">Continue as heir (with ${esc(info.partner.name)})</button>` : ''}
      <button id="b-legacy">Spend legacy points</button>
      <button ${info.partner ? '' : 'class="primary"'} id="b-new">${info.partner ? 'Abandon world — new bloodline' : 'New bloodline'}</button>
    </div>
    ${info.partner ? '' : '<div class="footnote">No partner survived you. The world and your bloodline end here.</div>'}</div>`);
  if (info.partner) $('b-heir').onclick = () => { if (game.continueAsHeir()) attach(game); };
  $('b-legacy').onclick = () => legacyScreen(() => showDeath(info));
  $('b-new').onclick = () => { game.deleteSave(); newScreen(); };
}

// ---------- input ----------
const canvas = $('gl');
const typing = () => document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

window.addEventListener('keydown', (e) => {
  if (typing()) return;
  if (e.code === 'Tab') e.preventDefault();
  if (!game || game.over) return;
  if (e.code === 'Escape') {
    if (ui.open) { ui.closeAll(); return; }
    if (game.buildSel) { game.buildSel = null; return; }
    if (!$('screen').classList.contains('hidden')) { hideScreen(); paused = false; return; }
    pauseScreen(); return;
  }
  if (paused) return;
  keys.add(e.code);
  if (game.player.sleeping && !['ShiftLeft', 'ShiftRight'].includes(e.code)) { game.wake(); return; }
  if (e.repeat) return;
  switch (e.code) {
    case 'Tab': case 'KeyI': ui.toggle('inv'); break;
    case 'KeyQ': ui.toggle('craft'); break;
    case 'KeyB': game.buildSel = null; ui.toggle('build'); break;
    case 'KeyK': ui.toggle('char'); break;
    case 'KeyM': ui.toggle('map'); break;
    case 'KeyC': game.player.crouch = !game.player.crouch; break;
    case 'KeyR': game.startReload(); break;
    case 'KeyE': if (ui.interact) { ui.interact.act(); sfx.ui(); } break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      game.player.sel = +e.code.slice(5) - 1; game.buildSel = null; break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (game) game.input.mouseDown = false; });

canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (!game || paused) return;
  if (e.button === 0) {
    if (ui.open && ui.open !== 'craft') { ui.closeAll(); return; }
    game.input.mouseDown = true; game.input.clicked = true;
  } else if (e.button === 2) { mouse.rDown = true; mouse.rMoved = 0; mouse.lastX = e.clientX; mouse.lastY = e.clientY; }
});
window.addEventListener('mouseup', (e) => {
  if (!game) return;
  if (e.button === 0) game.input.mouseDown = false;
  if (e.button === 2) {
    if (mouse.rDown && mouse.rMoved < 5 && game.buildSel) game.buildSel = null;
    mouse.rDown = false;
  }
});
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (mouse.rDown) {
    const dx = e.clientX - mouse.lastX, dy = e.clientY - mouse.lastY;
    mouse.rMoved += Math.abs(dx) + Math.abs(dy);
    renderer.yaw -= dx * 0.008;
    renderer.pitch = Math.min(1.35, Math.max(0.55, renderer.pitch + dy * 0.004));
    mouse.lastX = e.clientX; mouse.lastY = e.clientY;
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.targetDist = Math.min(32, Math.max(7, renderer.targetDist * (e.deltaY > 0 ? 1.1 : 0.9)));
}, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.over) game.save(); });
window.addEventListener('beforeunload', () => { if (game && !game.over) game.save(); });

function applyInput(dt) {
  const inp = game.input;
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (keys.has('KeyZ')) renderer.yaw += dt * 2;
  if (keys.has('KeyX')) renderer.yaw -= dt * 2;
  const y = renderer.yaw;
  const fx = -Math.sin(y), fz = -Math.cos(y);
  const rx = Math.cos(y), rz = -Math.sin(y);
  inp.mx = fx * f + rx * s; inp.my = fz * f + rz * s;
  inp.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const gp = renderer.screenToGround(mouse.x, mouse.y);
  if (gp) {
    inp.aimX = gp.x; inp.aimY = gp.y;
    inp.hoverTile = [Math.floor(gp.x), Math.floor(gp.y)];
  }
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game && !paused) {
    applyInput(dt);
    let sim = dt * game.timeScale;
    while (sim > 0) { const st = Math.min(sim, 0.05); game.update(st); sim -= st; if (game.over) break; }
    ui.update(dt);
  }
  if (game) renderer.render(paused ? 0 : dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

titleScreen();
