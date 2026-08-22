/**
 * info.* 8 ATTR-* + 37 derived stats + combatFormulas.
 * Catalog: https://info.grudge-studio.com/api/v1/master-attributes.json
 * Do not invent a 9th ATTR. Need pools (O2/hunger/thirst) are not attributes.
 */
import { catalogJsonUrls } from '../config/fleetEnv.js';

/** @type {object|null} */
let _catalog = null;
/** @type {Promise<object>|null} */
let _load = null;

export const PRIMARY_ATTR_IDS = Object.freeze([
  'strength',
  'vitality',
  'endurance',
  'intellect',
  'wisdom',
  'dexterity',
  'agility',
  'tactics'
]);

export async function loadAttributeCatalog() {
  if (_catalog) return _catalog;
  if (_load) return _load;
  _load = (async () => {
    const urls = catalogJsonUrls('master-attributes.json');
    for (const u of urls) {
      try {
        const r = await fetch(u, { mode: 'cors' });
        if (!r.ok) continue;
        const j = await r.json();
        if (j?.attributes && (j.totalDerivedStats === 37 || j.statDescriptions)) {
          _catalog = j;
          return j;
        }
      } catch {
        /* next */
      }
    }
    _catalog = { attributes: [], statDescriptions: {}, combatFormulas: {}, statCaps: {}, allocation: {} };
    return _catalog;
  })();
  return _load;
}

export function getAttributeCatalog() {
  return _catalog;
}

/**
 * Diminishing returns on allocated points (catalog.allocation.diminishingReturns).
 * @param {number} raw
 * @param {object} [dr]
 */
export function effectivePoints(raw, dr) {
  const p = Math.max(0, Number(raw) || 0);
  if (!dr?.enabled) return p;
  const t = dr.threshold ?? 25;
  if (p <= t) return p;
  const t1 = dr.tier1Efficiency ?? 0.5;
  const t2 = dr.tier2Efficiency ?? 0.25;
  const over = p - t;
  const band = t;
  if (over <= band) return t + over * t1;
  return t + band * t1 + (over - band) * t2;
}

/**
 * @param {Record<string, number>} alloc  8 primary ids
 * @param {object} [catalog]
 */
export function computeDerivedStats(alloc = {}, catalog = _catalog) {
  const desc = catalog?.statDescriptions || {};
  /** @type {Record<string, number>} */
  const stats = {};
  for (const k of Object.keys(desc)) stats[k] = 0;
  stats.health = stats.health || 100;
  stats.mana = stats.mana || 40;
  stats.stamina = stats.stamina || 70;
  stats.damage = stats.damage || 8;
  stats.defense = stats.defense || 4;
  stats.criticalDamage = stats.criticalDamage || 1.5;
  const dr = catalog?.allocation?.diminishingReturns;
  const attrs = catalog?.attributes || [];
  for (const a of attrs) {
    const p = effectivePoints(alloc[a.id] || 0, dr);
    if (p <= 0) continue;
    const gains = a.gains || {};
    for (const [k, g] of Object.entries(gains)) {
      const flat = Number(g.flat) || 0;
      const pct = Number(g.percent) || 0;
      stats[k] = (stats[k] || 0) + flat * p + (pct / 100) * p;
    }
  }
  const caps = catalog?.statCaps || {};
  for (const [k, cap] of Object.entries(caps)) {
    if (stats[k] != null && Number.isFinite(cap.value)) {
      stats[k] = Math.min(stats[k], cap.value);
    }
  }
  return stats;
}

/** Default 20 starting points on the class primary. */
export function defaultAllocForClass(classId) {
  const id = String(classId || 'warrior');
  const map = {
    warrior: 'strength',
    raider: 'strength',
    mage: 'intellect',
    priest: 'wisdom',
    ranger: 'dexterity',
    thief: 'agility',
    worge: 'vitality',
    verduror: 'wisdom'
  };
  const key = map[id] || 'strength';
  /** @type {Record<string, number>} */
  const alloc = {};
  for (const p of PRIMARY_ATTR_IDS) alloc[p] = 0;
  alloc[key] = 20;
  return alloc;
}

/**
 * Catalog combatFormulas:
 *  mitigation: Incoming × (100 - √Defense) / 100
 *  block: if roll < block → × (1 - blockEffect)
 *  crit: if roll < crit && !blocked → × critFactor
 *
 * @param {{
 *   incoming: number,
 *   attacker?: Record<string, number>,
 *   defender?: Record<string, number>,
 *   blocked?: boolean
 * }} opts
 */
export function resolveCombatDamage(opts) {
  const incoming = Math.max(0, Number(opts.incoming) || 0);
  const atk = opts.attacker || {};
  const def = opts.defender || {};
  const caps = _catalog?.statCaps || {};
  const defn = Math.max(0, Number(def.defense) || 0);
  let dmg = incoming * (100 - Math.sqrt(defn)) / 100;
  const blockChance = Math.min(Number(def.block) || 0, caps.block?.value ?? 0.75);
  let blocked = !!opts.blocked;
  if (!blocked && blockChance > 0 && Math.random() < blockChance) blocked = true;
  if (blocked) {
    const fac = Math.min(Number(def.blockEffect) || 0, caps.blockEffect?.value ?? 0.9);
    dmg *= 1 - fac;
    return { damage: Math.max(0, dmg), blocked: true, crit: false };
  }
  const critC = Math.min(Number(atk.criticalChance) || 0, caps.criticalChance?.value ?? 0.75);
  let crit = false;
  if (critC > 0 && Math.random() < critC) {
    crit = true;
    const mul = Math.min(Number(atk.criticalDamage) || 1.5, caps.criticalDamage?.value ?? 3);
    dmg *= mul;
  }
  return { damage: Math.max(0, dmg), blocked: false, crit };
}

/**
 * Apply HP fraction on a target mesh. maxHp from userData or 100.
 * @param {import('three').Object3D|null} mesh
 * @param {number} damage
 * @param {number} [maxHp]
 */
export function applyHpDamage(mesh, damage, maxHp = 100) {
  if (!mesh?.userData) return 1;
  const max = Number(mesh.userData.maxHp) > 0 ? mesh.userData.maxHp : maxHp;
  const cur = Number.isFinite(mesh.userData.hp) ? mesh.userData.hp : max * (mesh.userData.hp01 ?? 1);
  const next = Math.max(0, cur - damage);
  mesh.userData.hp = next;
  mesh.userData.hp01 = next / max;
  mesh.userData.maxHp = max;
  return mesh.userData.hp01;
}
