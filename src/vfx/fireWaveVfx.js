/**
 * Isolated splash meshes from waveanimation.glb.
 * Never load the fused pack. Skip Icosphere junk.
 *
 * Shader fire  = SlashWaveMaterial (getFireSplineTexture)
 * Shader lava  = LavaWaveMaterial (three.js lava dual-UV on the same fire tex)
 *
 * Bind onto existing catalog ids — no new skill rows:
 *   attack  → getsuga_slash residual
 *   aoe     → inferno / earth_surge / frost_wave / hammer_shockwave
 *   impact  → inferno + SkillProjectileSystem explode
 *
 * Prefab weapons already in the kit (do not invent a second catalog):
 *   t0-wand / staffs → inferno impact
 *   t0-sword         → getsuga residual
 *   t0-hammer / axe  → earth_surge / hammer_shockwave
 */

import { BufferAttribute, Box3 } from 'three';

export const FIRE_WAVE_R2_PREFIX = 'models/vfx/waves/';
export const FIRE_WAVE_CDN = 'https://assets.grudge-studio.com';

/** @typedef {'attack'|'aoe'|'impact'} FireWaveRole */
/** @typedef {'fire'|'lava'} FireWaveShader */

/**
 * @typedef {object} FireWaveDef
 * @property {string} id
 * @property {string} sourceMesh  author mesh / material name
 * @property {string} path
 * @property {string} cdn
 * @property {FireWaveRole} role
 * @property {FireWaveShader} shader
 * @property {number} sizeM
 * @property {string[]} use  existing VfxDirector / skill effect ids
 */

/** @type {readonly FireWaveDef[]} */
export const FIRE_WAVES = Object.freeze([
  {
    id: 'fire-wave-attack',
    sourceMesh: 'splash',
    path: './models/vfx/waves/fire-wave-attack.glb',
    cdn: 'models/vfx/waves/fire-wave-attack.glb',
    role: 'attack',
    shader: 'fire',
    sizeM: 2.2,
    use: ['getsuga_slash']
  },
  {
    id: 'lava-wave-aoe',
    sourceMesh: 'water',
    path: './models/vfx/waves/lava-wave-aoe.glb',
    cdn: 'models/vfx/waves/lava-wave-aoe.glb',
    role: 'aoe',
    shader: 'lava',
    sizeM: 3.2,
    use: ['inferno', 'earth_surge', 'hammer_shockwave', 't0_hammer_shockwave']
  },
  {
    id: 'fire-wave-aoe',
    sourceMesh: 'splash2',
    path: './models/vfx/waves/fire-wave-aoe.glb',
    cdn: 'models/vfx/waves/fire-wave-aoe.glb',
    role: 'aoe',
    shader: 'fire',
    sizeM: 2.4,
    use: ['inferno', 'frost_wave']
  },
  {
    id: 'fire-wave-impact',
    sourceMesh: 'splash3',
    path: './models/vfx/waves/fire-wave-impact.glb',
    cdn: 'models/vfx/waves/fire-wave-impact.glb',
    role: 'impact',
    shader: 'fire',
    sizeM: 1.6,
    use: ['inferno']
  },
  {
    id: 'fire-wave-drop',
    sourceMesh: 'Drop',
    path: './models/vfx/waves/fire-wave-drop.glb',
    cdn: 'models/vfx/waves/fire-wave-drop.glb',
    role: 'impact',
    shader: 'fire',
    sizeM: 0.8,
    use: ['inferno']
  }
]);

export const FIRE_WAVE_MESH_IDS = Object.freeze(FIRE_WAVES.map((w) => w.id));

const BY_ID = Object.freeze(Object.fromEntries(FIRE_WAVES.map((w) => [w.id, w])));

/** @param {string} [id] */
export function fireWaveById(id) {
  return BY_ID[id] || null;
}

export function isFireWaveId(id) {
  return Boolean(BY_ID[id]);
}

/** Shared GPU geos — one copy per isolate, many shots. */
const geoCache = new Map();
/** @type {Map<string, Promise<import('three').BufferGeometry|null>>} */
const loadPromises = new Map();

/** @param {string} id */
export function fireWaveGeo(id) {
  return geoCache.get(id) || null;
}

function ensureUv(geo) {
  if (geo.attributes.uv) return geo;
  const pos = geo.attributes.position;
  if (!pos) return geo;
  geo.computeBoundingBox();
  const box = geo.boundingBox || new Box3();
  const sx = box.max.x - box.min.x || 1;
  const sz = box.max.z - box.min.z || 1;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - box.min.x) / sx;
    uv[i * 2 + 1] = (pos.getZ(i) - box.min.z) / sz;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

async function loadGltf(url, assets) {
  if (assets?.loadGLTF) return assets.loadGLTF(url);
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  return loader.loadAsync(url);
}

async function loadOne(def, assets) {
  try {
    const gltf = await loadGltf(def.path, assets);
    const src = gltf.scene || gltf.scenes?.[0];
    let geo = null;
    src?.traverse((o) => {
      if (!geo && o.isMesh && o.geometry) geo = o.geometry;
    });
    if (!geo) {
      console.warn('[FireWave] empty isolate', def.id, def.path);
      return null;
    }
    ensureUv(geo);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
  } catch (err) {
    console.warn('[FireWave] miss', def.path, err?.message || err);
    return null;
  }
}

/**
 * Warm all five isolates. Safe to call more than once.
 * @param {{ loadGLTF?: (url: string) => Promise<object> }|null} [assets]
 */
export async function preloadFireWaves(assets) {
  for (const def of FIRE_WAVES) {
    if (geoCache.has(def.id)) continue;
    if (!loadPromises.has(def.id)) {
      loadPromises.set(
        def.id,
        loadOne(def, assets).then((geo) => {
          if (geo) geoCache.set(def.id, geo);
          return geo;
        })
      );
    }
  }
  await Promise.all(loadPromises.values());
  return geoCache;
}

/** Palettes for existing catalog ids — reuse SlashWave / lava color knobs. */
export const FIRE_WAVE_PALETTE = Object.freeze({
  fire: { core: 0xfff1c2, mid: 0xff4a14, edge: 0x7a0500 },
  lava: { core: 0xffe08a, mid: 0xff3a0a, edge: 0x3a0400 },
  ice: { core: 0xf0fbff, mid: 0x5fd6ff, edge: 0x0a3a6a },
  earth: { core: 0xf2d4a0, mid: 0xc45a18, edge: 0x3a1808 }
});
