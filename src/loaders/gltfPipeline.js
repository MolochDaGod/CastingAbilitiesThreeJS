/**
 * Shared glTF decode pipeline — one Draco worker pool · Meshopt · optional KTX2.
 *
 * **No conflict between Draco and KTX2:** they are different glTF extensions.
 * A plain GLB needs neither. Compressed geometry uses Draco and/or Meshopt;
 * GPU-compressed *textures* use KTX2/Basis (only after bindKtx2(renderer)).
 *
 * Conflicts we *do* avoid:
 *  - Multiple DRACOLoader instances → multiple WASM workers (memory thrash)
 *  - Wrong decoder path major vs three
 *  - KTX2 without detectSupport(renderer) → silent missing textures
 *  - KTX2 transcoder pinned to wrong three version
 *
 * @see docs/LOADER_DRACO_KTX2_AUDIT.md
 * @see gameopen artifacts/animator/src/three/loaders/gltf.ts (fleet twin)
 */

import { LoadingManager, REVISION } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Google versioned Draco (recommended). Matches three r185 examples.
 * Unversioned `…/draco/v1/decoders/` is legacy and can drift.
 */
export const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

/**
 * Basis transcoder path pinned to the **installed** three major.
 * three r185 → package 0.185.x on jsDelivr (same as node_modules/three).
 */
export const KTX2_TRANSCODER_PATH = `https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/libs/basis/`;

/** @type {LoadingManager|null} */
let sharedManager = null;
/** @type {DRACOLoader|null} */
let sharedDraco = null;
/** @type {KTX2Loader|null} */
let sharedKtx2 = null;
/** @type {GLTFLoader|null} */
let sharedGltf = null;
let ktx2Bound = false;

export function getGltfLoadingManager() {
  if (!sharedManager) sharedManager = new LoadingManager();
  return sharedManager;
}

/**
 * Process-wide Draco (expensive WASM — never new DRACOLoader per projectile).
 * @param {LoadingManager} [manager]
 */
export function getSharedDracoLoader(manager) {
  if (!sharedDraco) {
    sharedDraco = new DRACOLoader(manager || getGltfLoadingManager());
    sharedDraco.setDecoderPath(DRACO_DECODER_PATH);
    // Preload only in browser (ProgressEvent is window-only)
    if (typeof window !== 'undefined' && typeof ProgressEvent !== 'undefined') {
      try {
        sharedDraco.preload();
      } catch {
        /* optional */
      }
    }
  }
  return sharedDraco;
}

/**
 * Bind KTX2/Basis to the shared GLTF loader. Requires a live WebGLRenderer
 * for GPU support detection. Safe to call multiple times.
 * @param {import('three').WebGLRenderer} renderer
 */
export function bindKtx2(renderer) {
  if (!renderer) return false;
  const manager = getGltfLoadingManager();
  if (ktx2Bound && sharedKtx2) {
    try {
      sharedKtx2.detectSupport(renderer);
    } catch {
      /* ignore */
    }
    return true;
  }
  try {
    sharedKtx2 = new KTX2Loader(manager)
      .setTranscoderPath(KTX2_TRANSCODER_PATH)
      .detectSupport(renderer);
    ktx2Bound = true;
    if (sharedGltf) sharedGltf.setKTX2Loader(sharedKtx2);
    console.info(
      `[gltfPipeline] KTX2 bound · three r${REVISION} · basis ${KTX2_TRANSCODER_PATH}`
    );
    return true;
  } catch (e) {
    console.warn('[gltfPipeline] KTX2 bind failed (non-fatal; WebP/PNG still load)', e);
    return false;
  }
}

export function isKtx2Bound() {
  return ktx2Bound;
}

/**
 * Build or return shared GLTFLoader with Draco + Meshopt (+ KTX2 if bound).
 * @param {{
 *   manager?: LoadingManager,
 *   renderer?: import('three').WebGLRenderer,
 *   shared?: boolean
 * }} [opts]
 */
export function makeGltfLoader(opts = {}) {
  if (opts.renderer) bindKtx2(opts.renderer);

  if (opts.shared !== false && !opts.manager) {
    if (!sharedGltf) {
      sharedGltf = new GLTFLoader(getGltfLoadingManager());
      sharedGltf.setDRACOLoader(getSharedDracoLoader());
      sharedGltf.setMeshoptDecoder(MeshoptDecoder);
      if (sharedKtx2) sharedGltf.setKTX2Loader(sharedKtx2);
    }
    return sharedGltf;
  }

  const manager = opts.manager || getGltfLoadingManager();
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(getSharedDracoLoader(manager));
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (sharedKtx2) loader.setKTX2Loader(sharedKtx2);
  return loader;
}

/** @returns {GLTFLoader} */
export function sharedGltfLoader() {
  return makeGltfLoader({ shared: true });
}

/**
 * Diagnostics for HUD / boot toast.
 * @returns {{
 *   threeRevision: string,
 *   dracoPath: string,
 *   ktx2Path: string,
 *   ktx2Bound: boolean,
 *   meshopt: boolean,
 *   sharedDraco: boolean
 * }}
 */
export function gltfPipelineStatus() {
  return {
    threeRevision: String(REVISION),
    dracoPath: DRACO_DECODER_PATH,
    ktx2Path: KTX2_TRANSCODER_PATH,
    ktx2Bound,
    meshopt: !!MeshoptDecoder,
    sharedDraco: !!sharedDraco
  };
}

/**
 * Dispose process-wide decoders (tests / HMR only — rare).
 */
export function disposeGltfPipeline() {
  try {
    sharedDraco?.dispose?.();
  } catch {
    /* */
  }
  try {
    sharedKtx2?.dispose?.();
  } catch {
    /* */
  }
  sharedDraco = null;
  sharedKtx2 = null;
  sharedGltf = null;
  ktx2Bound = false;
  sharedManager = null;
}
