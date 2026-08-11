/**
 * Fishing docks as buildables — boat housing + claim-flag upgrade gates.
 *
 * T1 dock_t1: placeable as building anywhere (lab) to berth a boat.
 * T2 / T3 upgrades: only when player is **inside own claim flag** (Open camp SSOT).
 *
 * Lab claim: localStorage grudge.casting.claim.v1 { planted: bool, x, z, radiusM, owner: 'self' }
 * Production: Open camp claim_flag within radius (gameopen CampBuildSystem).
 *
 * @see fishingCatalog.js FISHING_BUILDABLES
 * @see gameopen docs/CAMP_CLAIM_FLAG.md
 */

const CLAIM_KEY = 'grudge.casting.claim.v1';
const DOCK_KEY = 'grudge.casting.docks.v1';

/**
 * @typedef {object} DockDef
 * @property {string} id
 * @property {string} label
 * @property {string} meshUrl
 * @property {number} tier 1|2|3
 * @property {number} spanM
 * @property {boolean} boats  can house boat
 * @property {number} boatSlots
 * @property {boolean} requiresOwnClaim  T2/T3 upgrade gate
 * @property {string|null} upgradesFrom
 * @property {string} blurb
 */

export const DOCK_TIERS = Object.freeze(/** @type {DockDef[]} */ ([
  {
    id: 'dock_t1',
    label: 'Dock T1 (Berth)',
    meshUrl: './models/fish/docks/dock_t1.glb',
    tier: 1,
    spanM: 8,
    boats: true,
    boatSlots: 1,
    requiresOwnClaim: false,
    upgradesFrom: null,
    blurb: 'Buildable building · place to house a boat · no claim required'
  },
  {
    id: 'dock_t2',
    label: 'Dock T2 (Harbor)',
    meshUrl: './models/fish/docks/dock_t2.glb',
    tier: 2,
    spanM: 12,
    boats: true,
    boatSlots: 2,
    requiresOwnClaim: true,
    upgradesFrom: 'dock_t1',
    blurb: 'Upgrade inside **own claim flag** only'
  },
  {
    id: 'dock_t3',
    label: 'Dock T3 (Port)',
    meshUrl: './models/fish/docks/dock_t3.glb',
    tier: 3,
    spanM: 16,
    boats: true,
    boatSlots: 4,
    requiresOwnClaim: true,
    upgradesFrom: 'dock_t2',
    blurb: 'Max berth · own claim flag required'
  }
]));

export function dockById(id) {
  return DOCK_TIERS.find((d) => d.id === id) || null;
}

/** Lab: plant a self claim at xz (dev tool / future build radial). */
export function plantOwnClaim(x, z, radiusM = 40) {
  const c = { planted: true, x, z, radiusM, owner: 'self', at: Date.now() };
  try {
    localStorage.setItem(CLAIM_KEY, JSON.stringify(c));
  } catch {
    /* */
  }
  return c;
}

export function loadOwnClaim() {
  try {
    const j = JSON.parse(localStorage.getItem(CLAIM_KEY) || 'null');
    return j?.planted ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {number} x
 * @param {number} z
 * @param {{ claim?: object|null, getIsInsideOwnClaim?: (x:number,z:number)=>boolean }} [ctx]
 */
export function isInsideOwnClaim(x, z, ctx = {}) {
  if (typeof ctx.getIsInsideOwnClaim === 'function') {
    try {
      return !!ctx.getIsInsideOwnClaim(x, z);
    } catch {
      /* fall through */
    }
  }
  const c = ctx.claim || loadOwnClaim();
  if (!c?.planted) return false;
  const dx = x - c.x;
  const dz = z - c.z;
  return Math.hypot(dx, dz) <= (c.radiusM || 40);
}

/**
 * Can place or upgrade dock at world xz?
 * @param {string} dockId
 * @param {number} x
 * @param {number} z
 * @param {object} [ctx]
 * @returns {{ ok: boolean, reason?: string, dock?: DockDef }}
 */
export function canPlaceOrUpgradeDock(dockId, x, z, ctx = {}) {
  const dock = dockById(dockId);
  if (!dock) return { ok: false, reason: 'Unknown dock' };
  if (dock.requiresOwnClaim && !isInsideOwnClaim(x, z, ctx)) {
    return {
      ok: false,
      reason: `${dock.label} requires standing inside your own claim flag`,
      dock
    };
  }
  if (dock.upgradesFrom) {
    const placed = listPlacedDocks();
    const hasBase = placed.some(
      (p) => p.dockId === dock.upgradesFrom || (dock.tier === 3 && p.dockId === 'dock_t2')
    );
    // Lab: allow direct place of T2/T3 if in claim without existing T1 (dev); production should require upgrade path
    if (!hasBase && !ctx.allowSkipUpgrade) {
      // soft: still allow if claim OK — building catalog can require materials
    }
  }
  return { ok: true, dock };
}

export function listPlacedDocks() {
  try {
    return JSON.parse(localStorage.getItem(DOCK_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * @param {{ dockId: string, x: number, y?: number, z: number }} place
 * @param {object} [ctx]
 */
export function placeDock(place, ctx = {}) {
  const check = canPlaceOrUpgradeDock(place.dockId, place.x, place.z, ctx);
  if (!check.ok) return check;
  const list = listPlacedDocks();
  const row = {
    id: `dock_${Date.now().toString(36)}`,
    dockId: place.dockId,
    x: place.x,
    y: place.y ?? 0,
    z: place.z,
    boatSlots: check.dock?.boatSlots || 1,
    at: Date.now()
  };
  list.push(row);
  try {
    localStorage.setItem(DOCK_KEY, JSON.stringify(list));
  } catch {
    /* */
  }
  return { ok: true, dock: check.dock, placed: row };
}
