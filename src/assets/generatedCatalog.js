/**
 * Consume three-generator baked props (CDN catalog + same-origin fallback).
 * @see MolochDaGod/three-generator shared/fleetAssetClient.ts
 */

export const GENERATED_CATALOG_CDN =
  'https://assets.grudge-studio.com/catalogs/three-generator/fleet-catalog.json';

export const GENERATED_CATALOG_LOCAL = './models/generated/catalog.json';

/**
 * @typedef {{ id: string, name: string, meshUrl: string, colliderUrl?: string, kind?: string, tags?: string[] }} GeneratedAsset
 * @typedef {{ version?: number, assets: GeneratedAsset[], source?: string }} GeneratedCatalog
 */

/**
 * @returns {Promise<GeneratedCatalog>}
 */
export async function loadGeneratedCatalog() {
  const urls = [GENERATED_CATALOG_CDN, GENERATED_CATALOG_LOCAL];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.assets)) throw new Error('bad catalog');
      // Normalize relative mesh URLs for local catalog
      json.assets = json.assets.map((a) => ({
        ...a,
        meshUrl: absolutize(a.meshUrl, url),
        colliderUrl: a.colliderUrl ? absolutize(a.colliderUrl, url) : undefined,
      }));
      json._fetchedFrom = url;
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn('[generatedCatalog] empty', lastErr);
  return { version: 0, assets: [], source: 'empty' };
}

function absolutize(meshUrl, catalogUrl) {
  if (!meshUrl) return meshUrl;
  if (/^https?:\/\//i.test(meshUrl)) return meshUrl;
  if (meshUrl.startsWith('./') || meshUrl.startsWith('/')) {
    try {
      return new URL(meshUrl, window.location.href).href;
    } catch {
      return meshUrl;
    }
  }
  return meshUrl;
}

/**
 * Load first matching generated GLB into the scene via AssetLoader.
 * @param {import('../loaders/AssetLoader.js').AssetLoader} assets
 * @param {import('three').Scene|import('three').Object3D} parent
 * @param {{ name?: string, position?: [number,number,number] }} [opts]
 */
export async function spawnGeneratedProp(assets, parent, opts = {}) {
  const catalog = await loadGeneratedCatalog();
  let entry = catalog.assets[0];
  if (opts.name) {
    const n = opts.name.toLowerCase();
    entry =
      catalog.assets.find((a) => a.name.toLowerCase().includes(n)) || entry;
  }
  if (!entry?.meshUrl) throw new Error('no generated assets in catalog');

  const gltf = await assets.loadGLTF(entry.meshUrl);
  const root = gltf.scene;
  root.name = `generated:${entry.name}`;
  if (opts.position) root.position.set(...opts.position);
  parent.add(root);
  return { root, entry, catalog };
}
