/**
 * Resolve master-weapon-prefab presentation assets for world drops.
 *
 * SSOT: info…/api/v1/master-weapon-prefabs.json
 * Layers:
 *   icon   — 2D bag + ground sprite
 *   model  — equip / world 3D (prod/gltf or models/weapons)
 *   drop   — optional loot VFX / dropPrefab key (may 404 → sprite+model fallback)
 */

export const PREFAB_CATALOG_URL =
  'https://info.grudge-studio.com/api/v1/master-weapon-prefabs.json';
export const PREFAB_CATALOG_MIRROR =
  'https://objectstore.grudge-studio.com/api/v1/master-weapon-prefabs.json';
export const CDN = 'https://assets.grudge-studio.com';

/**
 * Tier border / glow — full prefab pattern T0–T8.
 * Natural loot only rolls ≤T5; T6–T8 still present on corpse / special / dungeon.
 */
export const TIER_PRESENT = Object.freeze({
  0: { border: '#9aa3ad', glow: 0x8a93a0, label: 'T0' },
  1: { border: '#e8eef6', glow: 0xd0d8e4, label: 'T1' },
  2: { border: '#5dcf7a', glow: 0x3db85c, label: 'T2' },
  3: { border: '#5eb0ff', glow: 0x3a8fe0, label: 'T3' },
  4: { border: '#c48bff', glow: 0xa060e8, label: 'T4' },
  5: { border: '#ffb84d', glow: 0xff9a1a, label: 'T5' },
  6: { border: '#ff6b9d', glow: 0xff3d7a, label: 'T6 Mythic' },
  7: { border: '#ff4d4d', glow: 0xe02020, label: 'T7 Ancient' },
  8: { border: '#ffe566', glow: 0xffd000, label: 'T8 Divine' }
});

export function tierPresent(tier) {
  const t = Math.max(0, Math.min(8, Number(tier) || 0));
  return TIER_PRESENT[t] || TIER_PRESENT[0];
}

/**
 * Absolute CDN URL from path or full URL.
 * @param {string|null|undefined} path
 */
export function cdnUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const p = String(path).replace(/^\/+/, '');
  return `${CDN}/${p}`;
}

/**
 * Normalize one catalog prefab into world-drop presentation.
 * @param {object} prefab master-weapon-prefabs entry
 */
export function presentPrefab(prefab) {
  if (!prefab) return null;
  // Full catalog tiers T0–T8 (presentation always; natural loot still caps at T5)
  const tier = Math.max(0, Math.min(8, Number(prefab.tier) ?? 0));
  const iconUrl =
    prefab.assets?.iconUrl ||
    cdnUrl(prefab.assets?.iconR2Key) ||
    cdnUrl(prefab.icon?.cdnUrl || prefab.icon?.path) ||
    cdnUrl('icons/pack/weapons/Sword_01.png');

  const wt = String(prefab.weaponType || prefab.category || '').toUpperCase();
  const id = String(prefab.id || '');
  // Authored T0 meshes (R2) before family fallbacks
  let familyFallback = 'prod/gltf/weapons/sword.glb';
  if (/WAND|STAFF|TOME|MAGIC|NATURE_STAFF|FIRE_STAFF|FROST|HOLY|LIGHTNING|ARCANE/i.test(wt + id)) {
    familyFallback = 'prod/gltf/weapons/staff.glb';
  } else if (/BOW|CROSSBOW|GUN|RIFLE|PISTOL/i.test(wt)) {
    familyFallback = 'prod/gltf/weapons/bow.glb';
  } else if (/AXE|GREATAXE/i.test(wt)) {
    familyFallback = 'prod/gltf/weapons/axe.glb';
  } else if (/HAMMER|MACE/i.test(wt)) {
    familyFallback = 'prod/gltf/weapons/hammer.glb';
  } else if (/DAGGER/i.test(wt)) {
    familyFallback = 'prod/gltf/weapons/dagger.glb';
  } else if (/SHIELD/i.test(wt)) {
    // shield.glb not on CDN yet — axe body as temporary offhand silhouette
    familyFallback = 'prod/gltf/weapons/axe.glb';
  }
  if (id === 't0-wand') familyFallback = 'prod/gltf/weapons/t0-wand.glb';
  if (id === 't0-nature-staff') familyFallback = 'prod/gltf/weapons/t0-nature-staff.glb';

  const modelUrl =
    prefab.modelUrl ||
    prefab.prodGltfUrl ||
    prefab.mesh?.prodGltfUrl ||
    prefab.assets?.modelUrl ||
    cdnUrl(prefab.assets?.modelR2Key || prefab.modelPath || prefab.prodGltfKey) ||
    cdnUrl(familyFallback);

  const dropPrefabUrl = prefab.assets?.dropPrefabR2Key
    ? cdnUrl(prefab.assets.dropPrefabR2Key)
    : null;
  const lootVfxUrl = prefab.assets?.worldDropVfxR2Key
    ? cdnUrl(prefab.assets.worldDropVfxR2Key)
    : null;

  const present = tierPresent(tier);

  return {
    id: prefab.id || prefab.uuid,
    uuid: prefab.uuid || null,
    name: prefab.name || prefab.baseName || prefab.id || 'Item',
    tier,
    weaponType: prefab.weaponType || prefab.category || 'SWORD',
    category: prefab.category || 'weapons',
    iconUrl,
    modelUrl,
    dropPrefabUrl,
    lootVfxUrl,
    borderColor: present.border,
    glowColor: present.glow,
    tierLabel: present.label,
    /** World state — never equipped */
    state: 'world',
    equipped: false,
    raw: prefab
  };
}

/**
 * Minimal bag / throw item from presentation.
 * @param {ReturnType<presentPrefab>} p
 * @param {number} [qty]
 */
export function bagItemFromPresent(p, qty = 1) {
  if (!p) return null;
  return {
    id: p.id,
    uuid: p.uuid,
    name: p.name,
    tier: p.tier,
    qty,
    iconUrl: p.iconUrl,
    modelUrl: p.modelUrl,
    weaponType: p.weaponType,
    category: p.category,
    borderColor: p.borderColor,
    glowColor: p.glowColor
  };
}

let _cache = null;
let _loading = null;

/**
 * Load prefab catalog (cached). Large file — keep in memory once.
 */
export async function loadPrefabCatalog() {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = (async () => {
    let data = null;
    for (const url of [PREFAB_CATALOG_URL, PREFAB_CATALOG_MIRROR]) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) continue;
        data = await res.json();
        break;
      } catch {
        /* next */
      }
    }
    if (!data?.prefabs?.length) {
      _loading = null;
      throw new Error('master-weapon-prefabs unreachable');
    }
    const byId = new Map();
    const list = [];
    for (const raw of data.prefabs) {
      const p = presentPrefab(raw);
      if (!p) continue;
      list.push(p);
      byId.set(p.id, p);
      if (p.uuid) byId.set(p.uuid, p);
    }
    _cache = {
      version: data.version || '1.0.0',
      total: list.length,
      list,
      byId,
      /** Raw master-weapon-prefabs entries (skills, stats, assets) for equip/export */
      _rawPrefabs: data.prefabs,
      prodGltfWeaponMap: data.prodGltfWeaponMap || null,
      cdnBase: data.cdnBase || CDN,
      r2Layout: data.r2Layout || null
    };
    _loading = null;
    return _cache;
  })();
  return _loading;
}

/**
 * Pick a sample prefab for lab (tier-capped for drops).
 * @param {Awaited<ReturnType<loadPrefabCatalog>>} cat
 * @param {{ weaponType?: string, maxTier?: number }} [opts]
 */
export function pickSamplePrefab(cat, opts = {}) {
  const maxTier = opts.maxTier ?? 5;
  const type = opts.weaponType ? String(opts.weaponType).toUpperCase() : null;
  let pool = cat.list.filter((p) => p.tier <= maxTier);
  if (type) pool = pool.filter((p) => p.weaponType === type);
  if (!pool.length) pool = cat.list.filter((p) => p.tier <= maxTier);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
