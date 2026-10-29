// Permanent progression that survives permadeath: legacy points, perks, family history.

const KEY = 'aria_legacy_v1';

export const PERKS = [
  { id: 'hardy', name: 'Hardy Bloodline', desc: '+10 max health per rank', cost: [10, 20, 35] },
  { id: 'iron_stomach', name: 'Iron Stomach', desc: '-10% hunger & thirst drain per rank', cost: [10, 20, 35] },
  { id: 'scavenger', name: "Scavenger's Eye", desc: '+20% chance of extra loot per rank', cost: [15, 30, 50] },
  { id: 'swift', name: 'Fleet Footed', desc: '+5% movement speed per rank', cost: [15, 35] },
  { id: 'scholar', name: 'Ancestral Knowledge', desc: '+15% skill XP per rank', cost: [15, 30, 50] },
  { id: 'immune', name: 'Resilient Blood', desc: '-25% chance a bite infects you per rank', cost: [20, 45] },
  { id: 'kit', name: 'Inheritance', desc: 'Start with stone tools, a torch, a spear and bandages', cost: [25] },
  { id: 'pack', name: 'Pack Mule', desc: 'Start with a Hide Backpack equipped', cost: [30] },
  { id: 'mentor', name: 'Family Mentor', desc: 'Every new character starts with all skills at level 2', cost: [40] },
];

export function loadLegacy() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const L = JSON.parse(raw);
      return { points: 0, total: 0, perks: {}, history: [], ...L };
    }
  } catch (e) { /* storage unavailable */ }
  return { points: 0, total: 0, perks: {}, history: [] };
}

export function saveLegacy(L) {
  try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* ignore */ }
}

export const rank = (L, id) => L.perks[id] || 0;

export function buyPerk(L, id) {
  const p = PERKS.find(p => p.id === id);
  const r = rank(L, id);
  if (!p || r >= p.cost.length) return false;
  const c = p.cost[r];
  if (L.points < c) return false;
  L.points -= c;
  L.perks[id] = r + 1;
  saveLegacy(L);
  return true;
}

export function perkMods(L) {
  return {
    maxHp: 100 + 10 * rank(L, 'hardy'),
    drain: 1 - 0.1 * rank(L, 'iron_stomach'),
    loot: 0.2 * rank(L, 'scavenger'),
    speed: 1 + 0.05 * rank(L, 'swift'),
    xp: 1 + 0.15 * rank(L, 'scholar'),
    infect: 1 - 0.25 * rank(L, 'immune'),
    kit: rank(L, 'kit') > 0,
    pack: rank(L, 'pack') > 0,
    mentor: rank(L, 'mentor') > 0,
  };
}

// Points earned for a finished life.
export function scoreLife(s) {
  const parts = [
    ['Days survived', Math.floor(s.days) * 8],
    ['Zombies slain', s.kills],
    ['Skill levels', s.skillLevels * 3],
    ['Structures built', Math.floor(s.built / 4)],
    ['Items crafted', Math.floor(s.crafted / 4)],
    ['Companions', s.followers * 5],
  ];
  if (s.partner) parts.push(['Bonded partner', 15]);
  if (s.natural) parts.push(['Died of old age', 40]);
  const total = parts.reduce((a, p) => a + p[1], 0);
  return { parts, total };
}
