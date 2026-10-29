// Three.js renderer. The simulation runs on a 2D tile grid (x, y); here x -> world X, y -> world Z.
import * as THREE from 'three';
import { WORLD_W as W, WORLD_H as H, GROUND_INFO, G, HORDE_EVERY } from './config.js';
import { OBJ } from './data/objects.js';
import { ITEMS } from './data/items.js';
import { ZTYPES, ATYPES } from './ai.js';
import { hash2, clamp } from './util.js';

const CH = 16;
const VIEW_R = 46;

// ---------- shared geometry & materials ----------
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  dodec: new THREE.DodecahedronGeometry(0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 8, 6),
};

// Materials that dither-out fragments near the player so walls/trees never hide them.
const fadeUniforms = { uPlayer: { value: new THREE.Vector3() }, uCut: { value: 2.4 } };
function cutaway(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPlayer = fadeUniforms.uPlayer;
    sh.uniforms.uCut = fadeUniforms.uCut;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 aWP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        aWP = instanceMatrix * aWP;
      #endif
      vWP = (modelMatrix * aWP).xyz;`);
    sh.fragmentShader = 'uniform vec3 uPlayer;\nuniform float uCut;\nvarying vec3 vWP;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      vec2 dd = vWP.xz - uPlayer.xz;
      float ahead = dot(dd, normalize(cameraPosition.xz - uPlayer.xz));
      if (vWP.y > 0.55 && length(dd) < uCut && ahead > -0.6) {
        if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0 || vWP.y > 1.1) discard;
      }`);
  };
  mat.customProgramCacheKey = () => 'cutaway';
  return mat;
}

const MAT = {
  std: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  fade: cutaway(new THREE.MeshLambertMaterial({ color: 0xffffff })),
  glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};

// ---------- object visuals ----------
// Each returns parts: [geo, mat, x, y, z, sx, sy, sz, rotY, color]
function shade(color, k) {
  const c = new THREE.Color(color);
  c.multiplyScalar(k);
  return c.getHex();
}

function doorAxis(world, x, y) {
  const solid = (tx, ty) => { const d = world.def(tx, ty); return d && (d.kind === 'structure' || d.door); };
  return solid(x - 1, y) || solid(x + 1, y) ? 'x' : 'z';
}

function objectParts(world, o, x, y, game) {
  const d = OBJ[o.t];
  const cx = x + 0.5, cz = y + 0.5;
  const h1 = hash2(x, y, 7), h2 = hash2(x, y, 13), h3 = hash2(x, y, 29);
  const P = [];
  const add = (geo, mat, px, py, pz, sx, sy, sz, ry, color) => P.push([geo, mat, px, py, pz, sx, sy, sz, ry, color]);
  const dmg = o.maxHp || d.hp ? clamp(0.55 + 0.45 * (o.hp / (o.maxHp || d.hp)), 0.55, 1) : 1;
  const jx = (h1 - 0.5) * 0.3, jz = (h2 - 0.5) * 0.3;
  switch (o.t) {
    case 'tree': {
      const h = 0.9 + h1 * 0.5, k = 0.85 + h2 * 0.4;
      add('cyl', 'std', cx + jx, h / 2, cz + jz, 0.22, h, 0.22, 0, 0x6b4a2b);
      const g = new THREE.Color().setHSL(0.27 + h3 * 0.06, 0.45, 0.28 + h2 * 0.08).getHex();
      add('ico', 'fade', cx + jx, h + 0.45, cz + jz, 1.35 * k, 1.1 * k, 1.35 * k, h1 * 6, g);
      add('ico', 'fade', cx + jx + 0.2, h + 0.95, cz + jz - 0.1, 0.9 * k, 0.8 * k, 0.9 * k, h2 * 6, shade(g, 1.15));
      break;
    }
    case 'pine': {
      const k = 0.85 + h1 * 0.4;
      add('cyl', 'std', cx + jx, 0.35, cz + jz, 0.2, 0.7, 0.2, 0, 0x5a3d24);
      const g = new THREE.Color().setHSL(0.36 + h3 * 0.04, 0.4, 0.2 + h2 * 0.06).getHex();
      add('cone', 'fade', cx + jx, 0.6 + 0.9 * k, cz + jz, 1.25 * k, 1.8 * k, 1.25 * k, h1 * 6, g);
      add('cone', 'fade', cx + jx, 0.6 + 1.9 * k, cz + jz, 0.8 * k, 1.2 * k, 0.8 * k, h2 * 6, shade(g, 1.15));
      break;
    }
    case 'rock': case 'iron_deposit': case 'coal_deposit': case 'nitrate_deposit': {
      const k = 0.7 + h1 * 0.35;
      const base = { rock: 0x8a8a86, iron_deposit: 0x7d6a5c, coal_deposit: 0x4a4a4e, nitrate_deposit: 0xb8b8aa }[o.t];
      add('dodec', 'std', cx + jx * 0.5, 0.28 * k, cz + jz * 0.5, 0.95 * k, 0.65 * k, 0.85 * k, h2 * 6, shade(base, 0.9 + h3 * 0.2));
      if (o.t !== 'rock') {
        const spec = { iron_deposit: 0xd0702a, coal_deposit: 0x111111, nitrate_deposit: 0xf4f4f4 }[o.t];
        add('ico', 'std', cx + 0.2, 0.42 * k, cz - 0.1, 0.22, 0.18, 0.22, 0, spec);
        add('ico', 'std', cx - 0.2, 0.36 * k, cz + 0.18, 0.18, 0.15, 0.18, 1, spec);
        add('ico', 'std', cx + 0.05, 0.55 * k, cz + 0.12, 0.15, 0.12, 0.15, 2, spec);
      }
      break;
    }
    case 'bush': {
      add('sphere', 'std', cx + jx, 0.3, cz + jz, 0.8, 0.6, 0.8, 0, new THREE.Color().setHSL(0.28, 0.45, 0.3 + h3 * 0.06).getHex());
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + h1 * 6;
        add('sphere', 'std', cx + jx + Math.cos(a) * 0.3, 0.38 + (i % 2) * 0.12, cz + jz + Math.sin(a) * 0.3, 0.1, 0.1, 0.1, 0, 0x5a2a7a);
      }
      break;
    }
    case 'tallgrass': {
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6 + h1 * 6, r = 0.15 + hash2(x, y, i) * 0.2;
        add('cone', 'std', cx + Math.cos(a) * r, 0.22, cz + Math.sin(a) * r, 0.1, 0.45 + hash2(x, y, i + 9) * 0.25, 0.1, 0, shade(0x8aa04a, 0.85 + h3 * 0.3));
      }
      break;
    }
    case 'ruin_wall': case 'wood_wall': case 'stone_wall': case 'metal_wall': {
      const col = { ruin_wall: 0x8d8274, wood_wall: 0x8b5a2b, stone_wall: 0x8c8c8c, metal_wall: 0x5d656e }[o.t];
      const h = o.t === 'ruin_wall' ? 1.25 + h1 * 0.45 : 1.7;
      add('box', 'fade', cx, h / 2, cz, 1, h, 1, 0, shade(col, (0.9 + h2 * 0.15) * dmg));
      if (o.t === 'wood_wall') add('box', 'fade', cx, 1.2, cz, 1.04, 0.1, 1.04, 0, shade(0x6a4220, dmg));
      if (o.t === 'metal_wall') add('box', 'fade', cx, 0.85, cz, 1.03, 0.12, 1.03, 0, 0x8a9098);
      break;
    }
    case 'ruin_door': case 'wood_door': case 'metal_door': {
      const col = { ruin_door: 0x6b5038, wood_door: 0x9b6a3b, metal_door: 0x6a7078 }[o.t];
      const ax = doorAxis(world, x, y);
      const c = shade(col, dmg);
      if (!o.open) {
        if (ax === 'x') add('box', 'fade', cx, 0.7, cz, 1, 1.4, 0.16, 0, c);
        else add('box', 'fade', cx, 0.7, cz, 0.16, 1.4, 1, 0, c);
      } else {
        if (ax === 'x') add('box', 'fade', x + 0.08, 0.7, cz + 0.45, 0.12, 1.4, 0.9, 0, c);
        else add('box', 'fade', cx + 0.45, 0.7, y + 0.08, 0.9, 1.4, 0.12, 0, c);
      }
      const frame = o.t === 'ruin_door' ? 0x8d8274 : o.t === 'wood_door' ? 0x6a4220 : 0x4a5058;
      if (ax === 'x') add('box', 'fade', cx, 1.55, cz, 1, 0.3, 0.3, 0, frame);
      else add('box', 'fade', cx, 1.55, cz, 0.3, 0.3, 1, 0, frame);
      break;
    }
    case 'cabinet': add('box', 'std', cx, 0.45, cz, 0.85, 0.9, 0.7, 0, 0xa58b6a); add('box', 'std', cx, 0.92, cz, 0.9, 0.06, 0.75, 0, 0xd8d0c0); break;
    case 'fridge': add('box', 'fade', cx, 0.8, cz, 0.75, 1.6, 0.75, 0, 0xdcdcdc); add('box', 'std', cx + 0.3, 0.9, cz + 0.39, 0.05, 0.4, 0.03, 0, 0x888888); break;
    case 'wardrobe': add('box', 'fade', cx, 0.85, cz, 0.9, 1.7, 0.6, 0, 0x6b4a2b); break;
    case 'desk': add('box', 'std', cx, 0.72, cz, 0.95, 0.08, 0.65, 0, 0x7a5a3a); add('box', 'std', cx - 0.3, 0.35, cz, 0.3, 0.7, 0.6, 0, 0x6a4a2a); add('box', 'std', cx + 0.1, 0.85, cz, 0.3, 0.2, 0.2, 0, 0x3a3a3a); break;
    case 'shelf': add('box', 'fade', cx, 0.7, cz, 0.95, 1.4, 0.5, 0, 0x8a8a8a); for (let i = 0; i < 3; i++) add('box', 'std', cx + (hash2(x, y, i) - 0.5) * 0.6, 0.3 + i * 0.45, cz, 0.2, 0.2, 0.3, 0, [0xc04040, 0x40a0c0, 0xd0b040][i]); break;
    case 'toolbox': add('box', 'std', cx, 0.18, cz, 0.6, 0.35, 0.35, h1, 0xb03030); add('box', 'std', cx, 0.4, cz, 0.3, 0.06, 0.06, h1, 0x222222); break;
    case 'shed_crate': add('box', 'std', cx, 0.38, cz, 0.85, 0.75, 0.85, h1 * 0.5, 0x8a6a3a); break;
    case 'med_cabinet': add('box', 'std', cx, 0.55, cz, 0.7, 1.1, 0.45, 0, 0xe8e8e8); add('box', 'std', cx, 0.75, cz + 0.23, 0.3, 0.08, 0.02, 0, 0xcc2222); add('box', 'std', cx, 0.75, cz + 0.23, 0.08, 0.3, 0.02, 0, 0xcc2222); break;
    case 'locker': add('box', 'fade', cx, 0.9, cz, 0.8, 1.8, 0.6, 0, 0x5a6a7a); add('box', 'std', cx, 0.9, cz + 0.31, 0.02, 1.6, 0.02, 0, 0x2a3a4a); break;
    case 'car': {
      const vert = world.g(x, y - 1) === G.ROAD && world.g(x, y + 1) === G.ROAD && world.g(x - 2, y) !== G.ROAD;
      const ry = (vert ? Math.PI / 2 : 0) + (h2 - 0.5) * 0.4;
      const col = [0x7a3a2a, 0x3a4a6a, 0x5a5a5a, 0x6a6a3a, 0x2a2a2a][Math.floor(h1 * 5)];
      add('box', 'std', cx, 0.42, cz, 1.9, 0.55, 0.95, ry, col);
      add('box', 'std', cx, 0.88, cz, 1.0, 0.42, 0.85, ry, shade(col, 0.8));
      for (const [ox, oz] of [[-0.6, 0.45], [0.6, 0.45], [-0.6, -0.45], [0.6, -0.45]]) {
        const rx = ox * Math.cos(ry) + oz * Math.sin(ry), rz = -ox * Math.sin(ry) + oz * Math.cos(ry);
        add('cyl', 'std', cx + rx, 0.2, cz + rz, 0.4, 0.15, 0.4, 0, 0x1a1a1a);
      }
      break;
    }
    case 'trash': for (let i = 0; i < 4; i++) add(i % 2 ? 'box' : 'ico', 'std', cx + (hash2(x, y, i) - 0.5) * 0.7, 0.12, cz + (hash2(x, y, i + 5) - 0.5) * 0.7, 0.3, 0.22, 0.3, i, [0x5a5a4a, 0x3a4a3a, 0x6a5a4a, 0x4a4a5a][i]); break;
    case 'bag': add('box', 'std', cx, 0.15, cz, 0.45, 0.3, 0.35, h1 * 3, 0x7a6038); add('box', 'std', cx, 0.32, cz, 0.2, 0.06, 0.2, h1 * 3, 0x5a4028); break;
    case 'corpse': add('box', 'std', cx, 0.1, cz, 0.45, 0.2, 1.2, h1 * 3, 0x4a3030); add('sphere', 'std', cx, 0.15, cz, 0.3, 0.3, 0.3, 0, 0x8a7060); break;
    case 'campfire':
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add('dodec', 'std', cx + Math.cos(a) * 0.32, 0.06, cz + Math.sin(a) * 0.32, 0.18, 0.12, 0.18, a, 0x777777); }
      add('box', 'std', cx, 0.1, cz, 0.6, 0.1, 0.1, 0.5, 0x4a3018); add('box', 'std', cx, 0.1, cz, 0.6, 0.1, 0.1, -0.7, 0x4a3018);
      add('cone', 'glow', cx, 0.35, cz, 0.3, 0.5, 0.3, 0, 0xff8a2a); add('cone', 'glow', cx, 0.3, cz, 0.18, 0.35, 0.18, 1, 0xffd060);
      break;
    case 'workbench':
      add('box', 'std', cx, 0.78, cz, 1.0, 0.12, 0.7, 0, 0x9a6a3a);
      for (const [ox, oz] of [[-0.42, -0.28], [0.42, -0.28], [-0.42, 0.28], [0.42, 0.28]]) add('box', 'std', cx + ox, 0.36, cz + oz, 0.08, 0.72, 0.08, 0, 0x6a4a2a);
      add('box', 'std', cx + 0.3, 0.9, cz, 0.18, 0.14, 0.2, 0, 0x555a60); add('box', 'std', cx - 0.2, 0.86, cz + 0.1, 0.3, 0.04, 0.06, 0.4, 0x777777);
      break;
    case 'forge':
      add('box', 'std', cx, 0.45, cz, 0.95, 0.9, 0.95, 0, 0x6a6a6a); add('box', 'glow', cx, 0.4, cz + 0.48, 0.45, 0.3, 0.02, 0, 0xff5a1a);
      add('box', 'std', cx - 0.2, 1.25, cz - 0.2, 0.3, 0.8, 0.3, 0, 0x555555);
      break;
    case 'machine_shop':
      add('box', 'std', cx, 0.5, cz, 0.95, 1.0, 0.8, 0, 0x4a5a6a); add('box', 'glow', cx + 0.25, 0.75, cz + 0.41, 0.2, 0.15, 0.02, 0, 0x4ac0ff);
      add('cyl', 'std', cx - 0.2, 1.15, cz, 0.25, 0.3, 0.25, 0, 0x8a8a8a); add('box', 'std', cx - 0.2, 0.95, cz + 0.2, 0.1, 0.3, 0.1, 0, 0x8a8a8a);
      break;
    case 'storage_crate': add('box', 'std', cx, 0.38, cz, 0.9, 0.75, 0.75, 0, shade(0x9a7040, dmg)); add('box', 'std', cx, 0.38, cz, 0.94, 0.1, 0.79, 0, 0x6a4a28); break;
    case 'storage_locker': add('box', 'fade', cx, 0.8, cz, 0.9, 1.6, 0.7, 0, shade(0x707a84, dmg)); add('box', 'std', cx, 0.8, cz + 0.36, 0.02, 1.4, 0.02, 0, 0x30383f); break;
    case 'bedroll': add('box', 'std', cx, 0.05, cz, 0.6, 0.08, 1.3, 0, 0x6a8a5a); add('box', 'std', cx, 0.1, cz - 0.5, 0.5, 0.1, 0.25, 0, 0xc8c0a0); break;
    case 'bed': add('box', 'std', cx, 0.2, cz, 0.9, 0.35, 1.0, 0, 0x7a5030); add('box', 'std', cx, 0.42, cz + 0.05, 0.84, 0.1, 0.88, 0, 0xd0d0c8); add('box', 'std', cx, 0.5, cz - 0.32, 0.6, 0.1, 0.22, 0, 0xf0f0f0); break;
    case 'farm_plot': {
      add('box', 'std', cx, 0.06, cz, 0.95, 0.12, 0.95, 0, 0x5a3e24);
      if (o.crop && game) {
        const g = Math.min(1, (game.time - o.planted) / (600 * 0.8));
        const s = 0.3 + g * 0.7;
        for (let i = 0; i < 4; i++) add('cone', 'std', cx + (i % 2 - 0.5) * 0.45, 0.12 + 0.2 * s, cz + ((i >> 1) - 0.5) * 0.45, 0.2 * s, 0.4 * s, 0.2 * s, 0, g >= 1 ? 0x6aaa3a : 0x8acc5a);
      }
      break;
    }
    case 'rain_collector': add('cyl', 'std', cx, 0.45, cz, 0.7, 0.9, 0.7, 0, 0x4a6a8a); add('cone', 'std', cx, 1.05, cz, 0.95, 0.3, 0.95, 0, 0x8a8a8a); break;
    case 'torch_stand': add('cyl', 'std', cx, 0.65, cz, 0.08, 1.3, 0.08, 0, 0x6a4a2a); add('cone', 'glow', cx, 1.42, cz, 0.18, 0.3, 0.18, 0, 0xffa040); break;
    case 'spike_trap':
      add('box', 'std', cx, 0.03, cz, 0.9, 0.06, 0.9, 0, 0x6a4a2a);
      for (let i = 0; i < 5; i++) add('cone', 'std', cx + (hash2(x, y, i) - 0.5) * 0.65, 0.2, cz + (hash2(x, y, i + 3) - 0.5) * 0.65, 0.09, 0.38, 0.09, 0, 0x9a8a6a);
      break;
    default:
      add('box', 'std', cx, 0.4, cz, 0.8, 0.8, 0.8, 0, 0xff00ff);
  }
  return P;
}

// ---------- humanoid models ----------
function makeHumanoid(opts) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants });
  const mats = [skin, shirt, pants];
  const mk = (geo, mat, sx, sy, sz) => { const m = new THREE.Mesh(GEO[geo], mat); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
  const body = new THREE.Group(); body.position.y = 0.72; g.add(body);
  const torso = mk('box', shirt, 0.42, 0.55, 0.26); torso.position.y = 0.28; body.add(torso);
  const head = mk('box', skin, 0.26, 0.28, 0.26); head.position.y = 0.72; body.add(head);
  if (opts.hair != null) { const hair = mk('box', new THREE.MeshLambertMaterial({ color: opts.hair }), 0.28, 0.1, 0.28); hair.position.y = 0.88; body.add(hair); mats.push(hair.material); }
  const limb = (mat, w, h, px, py) => {
    const pivot = new THREE.Group(); pivot.position.set(px, py, 0);
    const m = mk('box', mat, w, h, w); m.position.y = -h / 2; pivot.add(m);
    return pivot;
  };
  const armL = limb(shirt, 0.12, 0.5, -0.28, 0.52), armR = limb(shirt, 0.12, 0.5, 0.28, 0.52);
  body.add(armL); body.add(armR);
  const legL = limb(pants, 0.15, 0.72, -0.11, 0.72), legR = limb(pants, 0.15, 0.72, 0.11, 0.72);
  g.add(legL); g.add(legR);
  const hand = new THREE.Group(); hand.position.set(0, -0.5, 0.05); armR.add(hand);
  g.scale.setScalar(opts.scale || 1);
  return { group: g, body, head, armL, armR, legL, legR, hand, mats, phase: Math.random() * 6 };
}

function makeAnimalModel(type) {
  const t = ATYPES[type];
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: t.color });
  const mk = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(GEO.box, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const legs = [];
  if (type === 'rabbit') {
    mk(0.25, 0.22, 0.38, 0, 0.16, 0); mk(0.18, 0.18, 0.18, 0, 0.3, 0.2);
    mk(0.05, 0.18, 0.04, -0.05, 0.47, 0.2); mk(0.05, 0.18, 0.04, 0.05, 0.47, 0.2);
  } else {
    const big = type === 'deer';
    mk(0.36, 0.34, 0.85, 0, big ? 0.75 : 0.5, 0);
    mk(0.22, 0.24, 0.32, 0, big ? 1.05 : 0.65, big ? 0.5 : 0.48);
    if (big) { mk(0.04, 0.3, 0.04, -0.08, 1.3, 0.48); mk(0.04, 0.3, 0.04, 0.08, 1.3, 0.48); }
    else mk(0.08, 0.08, 0.35, 0, 0.55, -0.55);
    const lh = big ? 0.6 : 0.34;
    for (const [x, z] of [[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, lh, z);
      const m = new THREE.Mesh(GEO.box, mat); m.scale.set(0.09, lh, 0.09); m.position.y = -lh / 2; m.castShadow = true;
      pivot.add(m); g.add(pivot); legs.push(pivot);
    }
  }
  return { group: g, legs, mats: [mat], phase: 0 };
}

function heldModel(id) {
  const g = new THREE.Group();
  if (!id) return g;
  const d = ITEMS[id];
  const m = (color, sx, sy, sz, x, y, z, glow) => {
    const mesh = new THREE.Mesh(GEO.box, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
    mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z); mesh.castShadow = !glow; g.add(mesh);
  };
  if (d.weapon?.type === 'ranged') {
    const long = d.w >= 4;
    m(0x2a2a2a, 0.07, 0.1, long ? 0.9 : 0.38, 0, 0, long ? 0.3 : 0.12);
    if (long) m(0x6a4a2a, 0.08, 0.12, 0.3, 0, -0.03, -0.12);
  } else if (id === 'torch') {
    m(0x6a4a2a, 0.05, 0.05, 0.5, 0, 0, 0.2); m(0xffa030, 0.12, 0.12, 0.14, 0, 0, 0.48, true);
  } else if (d.tool || d.weapon) {
    const len = d.h >= 3 ? 0.85 : 0.55;
    m(0x6a4a2a, 0.05, 0.05, len, 0, 0, len / 2 - 0.05);
    const head = d.tool?.axe ? 0x8a8a8a : d.tool?.pick ? 0x9a9a9a : id.includes('machete') || id.includes('knife') ? 0xc8c8c8 : 0x7a5a3a;
    if (d.tool?.axe || d.tool?.pick || id === 'sledgehammer') m(head, 0.22, 0.08, 0.1, 0, 0, len - 0.05);
    else if (id.includes('spear')) m(0x9a9a9a, 0.05, 0.05, 0.18, 0, 0, len + 0.05);
    else if (id.includes('machete') || id.includes('knife')) m(head, 0.03, 0.1, len * 0.7, 0, 0, len * 0.6);
  } else {
    m(0xb0a080, 0.12, 0.12, 0.12, 0, 0, 0.08);
  }
  g.rotation.x = Math.PI / 2;
  return g;
}

// ---------- renderer ----------
export class Renderer {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 200);
    this.yaw = 0.6; this.pitch = 0.95; this.dist = 17; this.targetDist = 17;
    this.camTarget = new THREE.Vector3();

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4a5a3a, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(0x9fb4c8, 35, 75);

    this.lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 12, 1.6);
      this.scene.add(l); this.lights.push(l);
    }

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // particles: one instanced mesh of small cubes
    this.pMax = 400;
    this.pMesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshLambertMaterial({ color: 0xffffff }), this.pMax);
    this.pMesh.frustumCulled = false;
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.setColorAt(0, new THREE.Color());
    this.scene.add(this.pMesh);
    this.particles = [];
    this.dummy = new THREE.Object3D();

    // decals (blood pools)
    this.decals = [];
    this.decalGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);

    // projectiles
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
    this.tracers = [];

    // build ghost & tile highlight
    this.ghost = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost.visible = false; this.scene.add(this.ghost);
    const ring = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.02, 1));
    this.hl = new THREE.LineSegments(ring, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    this.hl.visible = false; this.scene.add(this.hl);

    // swing arcs
    this.swingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.swings = [];

    this.entMeshes = new Map();
    this.corpses = new Map();
    this.chunks = new Map();
    this.lightScanT = 0; this.lightSources = [];
    this.farmT = 0;
    this.seenFx = new WeakSet();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.overlay.width = w * dpr; this.overlay.height = h * dpr;
    this.overlay.style.width = w + 'px'; this.overlay.style.height = h + 'px';
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }

  setGame(game) {
    this.game = game;
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    for (const m of this.entMeshes.values()) this.scene.remove(m.group);
    this.entMeshes.clear();
    for (const c of this.corpses.values()) this.scene.remove(c.group);
    this.corpses.clear();
    for (const d of this.decals) this.scene.remove(d.mesh);
    this.decals = [];
    this.particles = [];
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh.geometry.dispose(); this.groundTex.dispose(); }
    this.buildGround();
    this.camTarget.set(game.player.x, 0, game.player.y);
  }

  // ---------- ground ----------
  buildGround() {
    const S = 4; // texels per tile
    const data = new Uint8Array(W * S * H * S * 4);
    this.groundData = data; this.groundS = S;
    this.groundTex = new THREE.DataTexture(data, W * S, H * S, THREE.RGBAFormat);
    this.groundTex.magFilter = THREE.NearestFilter;
    this.groundTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.groundTex.generateMipmaps = true;
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.paintGround();
    const geo = new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2);
    geo.translate(W / 2, 0, H / 2);
    this.groundMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.groundTex }));
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);
  }

  paintGround(region) {
    const w = this.game.world, S = this.groundS, data = this.groundData;
    const x0 = region ? region[0] : 0, y0 = region ? region[1] : 0, x1 = region ? region[2] : W - 1, y1 = region ? region[3] : H - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const g = w.ground[y * W + x];
      const base = GROUND_INFO[g].color;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = x * S + sx, py = (H - 1 - y) * S + (S - 1 - sy);
        let n = 0.9 + hash2(px, py, 3) * 0.2;
        if (g === G.WOODFLOOR) n *= sy === 0 ? 0.75 : 1;
        if (g === G.STONEFLOOR || g === G.FLOOR) n *= (sx === 0 || sy === 0) ? 0.82 : 1;
        if (g === G.ROAD && hash2(x, y, 5) < 0.08) n *= 0.8; // cracks
        if (g === G.WATER || g === G.DEEP) n = 0.95 + hash2(px, py, 3) * 0.1;
        const i = (py * W * S + px) * 4;
        data[i] = Math.min(255, base[0] * n); data[i + 1] = Math.min(255, base[1] * n); data[i + 2] = Math.min(255, base[2] * n); data[i + 3] = 255;
      }
    }
    this.groundTex.needsUpdate = true;
  }

  // ---------- chunks ----------
  disposeChunk(c) {
    if (c.group) { this.scene.remove(c.group); for (const m of c.group.children) m.dispose(); }
    c.group = null;
  }

  buildChunk(cx, cy) {
    const key = (cy << 8) | cx;
    let c = this.chunks.get(key);
    if (!c) { c = { cx, cy, group: null, farms: [] }; this.chunks.set(key, c); }
    this.disposeChunk(c);
    const world = this.game.world;
    const buckets = new Map();
    c.farms = [];
    for (let y = cy * CH; y < Math.min(H, cy * CH + CH); y++) for (let x = cx * CH; x < Math.min(W, cx * CH + CH); x++) {
      const o = world.objs[y * W + x];
      if (!o) continue;
      if (o.t === 'farm_plot') c.farms.push([x, y, this.farmStage(o)]);
      for (const p of objectParts(world, o, x, y, this.game)) {
        const k = p[0] + '|' + p[1];
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(p);
      }
    }
    const group = new THREE.Group();
    const dm = this.dummy, col = new THREE.Color();
    for (const [k, parts] of buckets) {
      const [geo, mat] = k.split('|');
      const mesh = new THREE.InstancedMesh(GEO[geo], MAT[mat], parts.length);
      parts.forEach((p, i) => {
        dm.position.set(p[2], p[3], p[4]); dm.scale.set(p[5], p[6], p[7]); dm.rotation.set(0, p[8], 0);
        dm.updateMatrix(); mesh.setMatrixAt(i, dm.matrix);
        mesh.setColorAt(i, col.setHex(p[9]));
      });
      mesh.castShadow = mat !== 'glow'; mesh.receiveShadow = mat !== 'glow';
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    this.scene.add(group);
    c.group = group;
  }

  farmStage(o) { return o.crop ? Math.min(4, Math.floor((this.game.time - o.planted) / 120)) : -1; }

  updateChunks() {
    const world = this.game.world, p = this.game.player;
    if (world.groundDirty) { world.groundDirty = false; this.paintGround(); }
    const pcx = p.x / CH, pcy = p.y / CH;
    // rebuild dirty
    for (const key of world.dirty) {
      const cx = key & 255, cy = key >> 8;
      if (this.chunks.has(key) && this.chunks.get(key).group) this.buildChunk(cx, cy);
    }
    world.dirty.clear();
    let built = 0;
    for (let cy = 0; cy < Math.ceil(H / CH); cy++) for (let cx = 0; cx < Math.ceil(W / CH); cx++) {
      const key = (cy << 8) | cx;
      const d = Math.hypot((cx + 0.5) * CH - p.x, (cy + 0.5) * CH - p.y);
      const c = this.chunks.get(key);
      if (d < VIEW_R) {
        if (!c || !c.group) { if (built < 4) { this.buildChunk(cx, cy); built++; } }
        else c.group.visible = true;
      } else if (c?.group) {
        if (d > VIEW_R + 30) this.disposeChunk(c); else c.group.visible = false;
      }
    }
    void pcx; void pcy;
    // farms change visually as crops grow
    this.farmT -= 1;
    if (this.farmT <= 0) {
      this.farmT = 60;
      for (const c of this.chunks.values()) {
        if (!c.group || !c.farms.length) continue;
        if (c.farms.some(([x, y, s]) => { const o = world.o(x, y); return o && this.farmStage(o) !== s; })) this.buildChunk(c.cx, c.cy);
      }
    }
  }

  // ---------- entities ----------
  entityModel(e) {
    let m = this.entMeshes.get(e);
    if (m) return m;
    if (e.kind === 'player') m = makeHumanoid({ skin: 0xd8a888, shirt: 0x3a5a7a, pants: 0x3a3a46, hair: 0x3a2a1a });
    else if (e.kind === 'zombie') {
      const t = ZTYPES[e.type];
      const rot = hash2(e.id, 1, 1);
      m = makeHumanoid({ skin: t.color, shirt: [0x5a4a3a, 0x3a4a5a, 0x6a3a3a, 0x4a4a4a][Math.floor(rot * 4)], pants: 0x2a2a30, scale: t.scale });
      m.zombie = true;
    } else if (e.kind === 'human') {
      m = makeHumanoid({ skin: [0xd8a888, 0xb07850, 0x8a5a3a, 0xe8c0a0][e.id % 4], shirt: e.color, pants: 0x3a3a3a, hair: [0x1a1a1a, 0x6a4a2a, 0xc0a060, 0x8a3a1a][e.id % 4] });
    } else {
      m = makeAnimalModel(e.type);
    }
    m.lastX = e.x; m.lastY = e.y;
    this.entMeshes.set(e, m);
    this.scene.add(m.group);
    return m;
  }

  animateEntity(e, m, dt) {
    const g = m.group;
    const moved = Math.hypot(e.x - m.lastX, e.y - m.lastY);
    m.lastX = e.x; m.lastY = e.y;
    const speed = dt > 0 ? moved / dt : 0;
    g.position.set(e.x, 0, e.y);
    const target = Math.PI / 2 - e.angle;
    let cur = g.rotation.y;
    let diff = target - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.rotation.y = cur + diff * Math.min(1, dt * 14);
    // hit flash
    const flash = (e.hitFlash || 0) > 0;
    for (const mat of m.mats) mat.emissive.setHex(flash ? 0x661111 : 0x000000);
    if (m.legs) { // quadruped
      m.phase += speed * dt * 6;
      m.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.phase + (i % 2 ? Math.PI : 0)) * Math.min(0.7, speed * 0.2); });
      return;
    }
    m.phase += speed * dt * (m.zombie ? 2.8 : 3.2);
    const amp = Math.min(0.8, speed * 0.22);
    m.legL.rotation.x = Math.sin(m.phase) * amp;
    m.legR.rotation.x = -Math.sin(m.phase) * amp;
    const swing = (e.swing || 0) > 0 ? Math.sin((e.swing / 0.25) * Math.PI) : 0;
    if (m.zombie) {
      m.armL.rotation.x = -1.35 + Math.sin(m.phase * 0.7) * 0.15 - swing * 0.4;
      m.armR.rotation.x = -1.35 + Math.cos(m.phase * 0.7) * 0.15 - swing * 0.6;
      m.body.rotation.x = 0.18;
      m.body.rotation.z = Math.sin(m.phase * 0.5) * 0.08;
    } else {
      const aiming = e.kind === 'player' && this.game.playerWeapon().w.type === 'ranged';
      m.armL.rotation.x = aiming ? -1.4 : Math.sin(m.phase) * amp * 0.8;
      m.armR.rotation.x = aiming ? -1.5 : -Math.sin(m.phase) * amp * 0.8 - swing * 1.8;
      m.armR.rotation.z = swing * 0.4;
      m.body.rotation.x = e.crouch ? 0.35 : 0;
      m.body.position.y = e.crouch ? 0.6 : 0.72;
    }
    if (e.sleeping) { g.rotation.z = Math.PI / 2; g.position.y = 0.25; } else g.rotation.z = 0;
  }

  updateEntities(dt) {
    const g = this.game;
    const live = new Set();
    const all = [g.player, ...g.zombies, ...g.humans, ...g.animals];
    for (const e of all) {
      if (e.dead) continue;
      if (e !== g.player && Math.hypot(e.x - g.player.x, e.y - g.player.y) > VIEW_R) continue;
      live.add(e);
      const m = this.entityModel(e);
      this.animateEntity(e, m, dt);
      if (e.kind === 'human') {
        const id = e.weapon?.ranged ? 'pipe_pistol' : 'kitchen_knife';
        if (m.heldId !== id) { m.hand.clear(); m.hand.add(heldModel(id)); m.heldId = id; }
      }
    }
    // player held item
    const pm = this.entMeshes.get(g.player);
    if (pm) {
      const sel = g.selectedItem();
      const id = sel ? sel.id : null;
      if (pm.heldId !== id) { pm.hand.clear(); pm.hand.add(heldModel(id)); pm.heldId = id; }
      pm.group.visible = !g.player.dead;
    }
    for (const [e, m] of this.entMeshes) {
      if (!live.has(e)) { this.scene.remove(m.group); this.entMeshes.delete(e); }
    }
  }

  // ---------- effects ----------
  spawnParticles(x, y, z, n, color, spread = 1, up = 2) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.pMax) this.particles.shift();
      this.particles.push({ x, y, z, vx: (Math.random() - 0.5) * spread * 3, vy: Math.random() * up + 0.5, vz: (Math.random() - 0.5) * spread * 3,
        life: 0.5 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.06, color: new THREE.Color(color) });
    }
  }

  addDecal(x, y, color, size) {
    const mesh = new THREE.Mesh(this.decalGeo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    mesh.position.set(x + (Math.random() - 0.5) * 0.3, 0.01 + Math.random() * 0.005, y + (Math.random() - 0.5) * 0.3);
    mesh.scale.setScalar(size);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.decals.push({ mesh, t: 40 });
    if (this.decals.length > 120) { const d = this.decals.shift(); this.scene.remove(d.mesh); d.mesh.material.dispose(); }
  }

  processFx(dt) {
    const g = this.game;
    for (const f of g.fx) {
      if (this.seenFx.has(f)) continue;
      this.seenFx.add(f);
      switch (f.type) {
        case 'blood': this.spawnParticles(f.x, 0.9, f.y, 8, 0x8a1010, 0.8, 2); this.addDecal(f.x, f.y, 0x5a0a0a, 0.35 + Math.random() * 0.3); break;
        case 'gore': this.spawnParticles(f.x, 0.9, f.y, 10, 0x4a3a1a, 0.9, 2); this.addDecal(f.x, f.y, 0x3a2a10, 0.3 + Math.random() * 0.4); break;
        case 'chop': this.spawnParticles(f.x, 0.6, f.y, 6, f.color, 0.8, 2.5); break;
        case 'debris': this.spawnParticles(f.x, 0.6, f.y, f.small ? 4 : 14, f.color, 1.2, 3); break;
        case 'spark': this.spawnParticles(f.x, 0.9, f.y, 4, 0xffd080, 0.6, 1.5); break;
        case 'build': this.spawnParticles(f.x, 0.2, f.y, 12, 0xb0a080, 1.2, 1.5); break;
        case 'muzzle': this.muzzle = { x: f.x, y: f.y, t: 0.06 }; this.spawnParticles(f.x, 1.1, f.y, 3, 0xffe080, 0.4, 0.5); break;
        case 'swing': {
          const geo = new THREE.RingGeometry(f.range * 0.5, f.range, 12, 1, -0.9, 1.8).rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(geo, this.swingMat);
          mesh.position.set(f.x, 0.9, f.y);
          mesh.rotation.y = -f.angle;
          this.scene.add(mesh);
          this.swings.push({ mesh, t: 0.15 });
          break;
        }
        case 'corpse': {
          const m = f.human ? makeHumanoid({ skin: 0xc09070, shirt: f.color, pants: 0x333333 })
            : makeHumanoid({ skin: f.color, shirt: 0x4a3a2a, pants: 0x2a2a30, scale: f.scale });
          m.group.position.set(f.x, 0.15, f.y);
          m.group.rotation.order = 'YXZ';
          m.group.rotation.set(-Math.PI / 2, Math.PI / 2 - f.angle, 0);
          m.armL.rotation.x = -2.5; m.armR.rotation.x = -0.4;
          this.scene.add(m.group);
          this.corpses.set(f, m);
          this.addDecal(f.x, f.y, 0x4a0808, 0.7);
          break;
        }
      }
    }
    for (const [f, m] of this.corpses) {
      if (f.t <= 0 || !g.fx.includes(f)) { this.scene.remove(m.group); this.corpses.delete(f); }
      else if (f.t < 2) m.group.position.y = 0.15 - (2 - f.t) * 0.2;
    }
    // particles
    const dm = this.dummy;
    let n = 0;
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      dm.position.set(p.x, p.y, p.z); dm.scale.setScalar(p.size * Math.min(1, p.life * 3)); dm.rotation.set(p.life * 5, p.life * 3, 0);
      dm.updateMatrix(); this.pMesh.setMatrixAt(n, dm.matrix); this.pMesh.setColorAt(n, p.color); n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
    // decals fade
    for (const d of this.decals) { d.t -= dt; if (d.t < 5) d.mesh.material.opacity = Math.max(0, d.t / 5 * 0.8); }
    this.decals = this.decals.filter(d => { if (d.t <= 0) { this.scene.remove(d.mesh); d.mesh.material.dispose(); return false; } return true; });
    // swings
    this.swings = this.swings.filter(s => {
      s.t -= dt;
      if (s.t <= 0) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); return false; }
      return true;
    });
    // tracers
    while (this.tracers.length < g.projectiles.length) {
      const m = new THREE.Mesh(GEO.box, this.tracerMat); this.scene.add(m); this.tracers.push(m);
    }
    this.tracers.forEach((m, i) => {
      const pr = g.projectiles[i];
      m.visible = !!pr;
      if (!pr) return;
      m.position.set(pr.x, 1.0, pr.y);
      m.rotation.set(0, Math.atan2(pr.vx, pr.vy), 0);
      m.scale.set(0.04, 0.04, 0.6);
    });
  }

  // ---------- lighting ----------
  updateLighting(dt) {
    const g = this.game, p = g.player;
    const dark = g.darkness;
    const horde = g.day % HORDE_EVERY === 0 && dark > 0.3;
    const h = g.hour;
    // sun path east -> west
    const sunA = ((h - 6) / 12) * Math.PI;
    const night = dark > 0.5;
    const dir = night ? new THREE.Vector3(-0.4, 1, 0.3) : new THREE.Vector3(Math.cos(sunA), Math.max(0.25, Math.sin(sunA)), 0.35);
    dir.normalize();
    this.sun.position.set(p.x + dir.x * 50, dir.y * 50, p.y + dir.z * 50);
    this.sun.target.position.set(p.x, 0, p.y);
    const dayI = 1 - dark;
    this.sun.intensity = dayI * 1.9 + 0.15;
    this.sun.color.setHex(night ? (horde ? 0xff5040 : 0x8090c0) : h < 8 || h > 17.5 ? 0xffc890 : 0xfff2dd);
    this.hemi.intensity = dayI * 0.9 + 0.12;
    this.hemi.color.setHex(night ? (horde ? 0x803030 : 0x405070) : 0xcfe0ff);
    const fogDay = new THREE.Color(0x9fb4c8), fogNight = new THREE.Color(horde ? 0x200606 : 0x080c14);
    const fc = fogDay.clone().lerp(fogNight, dark);
    this.scene.fog.color.copy(fc);
    this.scene.fog.near = 30 - dark * 18; this.scene.fog.far = 75 - dark * 40;
    this.gl.setClearColor(fc);
    // point lights: campfires, torches, muzzle flashes
    this.lightScanT -= dt;
    if (this.lightScanT <= 0) {
      this.lightScanT = 0.5;
      this.lightSources = [];
      const px = Math.floor(p.x), py = Math.floor(p.y);
      for (let y = py - 22; y <= py + 22; y++) for (let x = px - 22; x <= px + 22; x++) {
        const d = g.world.def(x, y);
        if (d?.light) this.lightSources.push({ x: x + 0.5, y: y + 0.5, h: d.id === 'torch_stand' ? 1.5 : 0.6, r: d.light, fire: true });
      }
    }
    const srcs = this.lightSources.slice();
    if (p.lightOn && !p.dead) srcs.push({ x: p.x + Math.cos(p.angle) * 0.3, y: p.y + Math.sin(p.angle) * 0.3, h: 1.3, r: 7, fire: true, prio: true });
    srcs.push({ x: p.x, y: p.y, h: 2.5, r: 5, color: 0x8899bb, int: 0.6 * dark, prio: true }); // faint night vision
    if (this.muzzle && this.muzzle.t > 0) { this.muzzle.t -= dt; srcs.push({ x: this.muzzle.x, y: this.muzzle.y, h: 1.1, r: 9, color: 0xffd080, int: 30, prio: true }); }
    srcs.sort((a, b) => (b.prio ? 1 : 0) - (a.prio ? 1 : 0) || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const t = performance.now() / 1000;
    this.lights.forEach((l, i) => {
      const s = srcs[i];
      if (!s) { l.intensity = 0; return; }
      l.position.set(s.x, s.h, s.y);
      l.distance = s.r * 1.8;
      l.color.setHex(s.color || 0xff9a40);
      const flick = s.fire ? 0.85 + Math.sin(t * 13 + i) * 0.08 + Math.sin(t * 29 + i * 3) * 0.06 : 1;
      l.intensity = (s.int != null ? s.int : (4 + dark * 10)) * flick;
    });
  }

  // ---------- camera & picking ----------
  updateCamera(dt) {
    const p = this.game.player;
    this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 8);
    const tgt = new THREE.Vector3(p.x, 0, p.y);
    this.camTarget.lerp(tgt, Math.min(1, dt * 10));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    let shake = 0;
    if (this.shake > 0) { this.shake -= dt; shake = this.shake * 0.4; }
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * cp * this.dist + (Math.random() - 0.5) * shake,
      sp * this.dist,
      this.camTarget.z + Math.cos(this.yaw) * cp * this.dist + (Math.random() - 0.5) * shake);
    this.camera.lookAt(this.camTarget.x, 0.8, this.camTarget.z);
    fadeUniforms.uPlayer.value.set(p.x, 0, p.y);
  }

  screenToGround(sx, sy) {
    const v = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const out = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, out)) return null;
    return { x: out.x, y: out.z };
  }

  project(x, y, h) {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h };
  }

  // ---------- frame ----------
  render(dt) {
    const g = this.game;
    if (!g) return;
    this.updateCamera(dt);
    this.updateChunks();
    this.updateEntities(dt);
    this.processFx(dt);
    this.updateLighting(dt);
    this.updateGhost();
    this.gl.render(this.scene, this.camera);
    this.drawOverlay();
  }

  updateGhost() {
    const g = this.game, ht = g.input.hoverTile;
    this.ghost.visible = false; this.hl.visible = false;
    if (!ht || g.player.dead) return;
    const [tx, ty] = ht;
    if (g.buildSel) {
      const sel = g.buildSel;
      if (sel.startsWith('__')) {
        this.hl.visible = true; this.hl.position.set(tx + 0.5, 0.05, ty + 0.5);
        this.hl.material.color.setHex(sel === '__deconstruct' ? 0xff6655 : 0x66ccff);
        return;
      }
      const d = OBJ[sel];
      const ok = g.canBuild(sel, tx, ty).ok;
      const hgt = d.floor ? 0.05 : d.kind === 'structure' || d.door ? 1.6 : d.solid ? 0.9 : 0.3;
      this.ghost.visible = true;
      this.ghost.position.set(tx + 0.5, hgt / 2, ty + 0.5);
      this.ghost.scale.set(0.98, hgt, 0.98);
      this.ghost.material.color.setHex(ok ? 0x66ff88 : 0xff5544);
      return;
    }
    const o = g.world.o(tx, ty);
    if (o && OBJ[o.t].kind === 'resource' && Math.hypot(tx + 0.5 - g.player.x, ty + 0.5 - g.player.y) <= 2.2) {
      this.hl.visible = true; this.hl.position.set(tx + 0.5, 0.05, ty + 0.5);
      this.hl.material.color.setHex(0xffffff);
    }
  }

  drawOverlay() {
    const c = this.octx, g = this.game, p = g.player;
    c.clearRect(0, 0, this.w, this.h);
    c.textAlign = 'center';
    c.font = '600 12px system-ui, sans-serif';
    const bar = (s, frac, col) => {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(s.x - 20, s.y, 40, 5);
      c.fillStyle = col; c.fillRect(s.x - 20, s.y, 40 * clamp(frac, 0, 1), 5);
    };
    for (const z of g.zombies) {
      if (z.hp >= z.maxHp || Math.hypot(z.x - p.x, z.y - p.y) > 25) continue;
      const s = this.project(z.x, z.y, 2.1 * ZTYPES[z.type].scale); if (s) bar(s, z.hp / z.maxHp, '#c04040');
    }
    for (const a of g.animals) {
      if (a.hp >= a.maxHp) continue;
      const s = this.project(a.x, a.y, 1.2); if (s) bar(s, a.hp / a.maxHp, '#c08040');
    }
    for (const h of g.humans) {
      if (Math.hypot(h.x - p.x, h.y - p.y) > 22) continue;
      const s = this.project(h.x, h.y, 2.15);
      if (!s) continue;
      const rel = g.relationLabel(h);
      const col = h.faction === 'raider' ? '#ff6b6b' : rel === 'Partner' ? '#ff9ad5' : rel === 'Family' ? '#ffd27a' : ['Friend', 'Close Friend'].includes(rel) || h.status === 'follower' ? '#8fe08f' : '#e8e8e8';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)';
      const label = h.faction === 'raider' ? `${h.name} (Raider)` : `${h.name} · ${rel}`;
      c.strokeText(label, s.x, s.y); c.fillStyle = col; c.fillText(label, s.x, s.y);
      if (h.hp < h.maxHp) bar({ x: s.x, y: s.y + 4 }, h.hp / h.maxHp, h.faction === 'raider' ? '#c04040' : '#50c050');
      if (h.bubble) {
        c.font = '13px system-ui, sans-serif';
        const tw = Math.min(260, c.measureText(h.bubble.text).width + 16);
        const by = s.y - 34;
        c.fillStyle = 'rgba(250,248,240,0.93)';
        roundRect(c, s.x - tw / 2, by - 4, tw, 24, 8); c.fill();
        c.beginPath(); c.moveTo(s.x - 6, by + 20); c.lineTo(s.x, by + 28); c.lineTo(s.x + 6, by + 20); c.fill();
        c.fillStyle = '#222'; c.fillText(h.bubble.text, s.x, by + 12, 244);
        c.font = '600 12px system-ui, sans-serif';
      }
    }
    // floaters
    c.font = '700 13px system-ui, sans-serif';
    for (const f of g.floaters) {
      const s = this.project(f.x, f.y, 2.0 + (1.4 - f.t) * 0.8);
      if (!s) continue;
      c.globalAlpha = Math.min(1, f.t * 1.5);
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(f.text, s.x, s.y);
      c.fillStyle = f.color; c.fillText(f.text, s.x, s.y);
      c.globalAlpha = 1;
    }
    // reload indicator
    if (p.reload > 0) {
      const s = this.project(p.x, p.y, 2.3);
      if (s) { c.fillStyle = '#fff'; c.fillText('Reloading...', s.x, s.y); }
    }
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
