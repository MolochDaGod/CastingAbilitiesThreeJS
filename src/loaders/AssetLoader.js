import { LoadingManager, TextureLoader, SRGBColorSpace } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import {
  bindKtx2,
  getGltfLoadingManager,
  getSharedDracoLoader,
  gltfPipelineStatus,
  isKtx2Bound,
  makeGltfLoader
} from './gltfPipeline.js';
import { DRACO_DECODER_PATH } from '../config/assets.js';

/**
 * A 1×1 opaque white PNG for broken absolute texture paths in legacy FBX.
 */
export const PLACEHOLDER_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const ABSOLUTE_LOCAL_PATH = /(^|\/)[A-Za-z]:[\\/]|^\\\\/;

/**
 * Central asset loading — fleet-aligned glTF pipeline:
 *  - **One** shared DRACOLoader (WASM worker pool)
 *  - MeshoptDecoder always
 *  - KTX2/Basis after {@link AssetLoader.bindRenderer}
 *  - shared LoadingManager for boot progress
 *
 * Draco and KTX2 do **not** conflict: different glTF extensions.
 *
 * @see gltfPipeline.js · docs/LOADER_DRACO_KTX2_AUDIT.md
 */
export class AssetLoader {
  constructor() {
    // Prefer shared manager so Draco/KTX2 share progress surface
    this.manager = getGltfLoadingManager();
    this.manager.setURLModifier((url) =>
      ABSOLUTE_LOCAL_PATH.test(url) ? PLACEHOLDER_TEXTURE_URL : url
    );

    // Shared Draco only — do not new DRACOLoader here again
    this.draco = getSharedDracoLoader(this.manager);
    this.gltf = makeGltfLoader({ manager: this.manager, shared: false });

    this.fbx = new FBXLoader(this.manager);
    this.hdr = new HDRLoader(this.manager);
    this.texture = new TextureLoader(this.manager);

    this._onProgress = null;
    this._loaded = 0;
    this._total = 0;
    this._settleWaiters = [];
    this._ktx2 = false;

    this.manager.onStart = (_url, loaded, total) => {
      this._loaded = loaded;
      this._total = total;
    };
    this.manager.onProgress = (url, loaded, total) => {
      this._loaded = loaded;
      this._total = total;
      this._onProgress?.(total ? loaded / total : 0, url);
    };
    this.manager.onLoad = () => {
      this._loaded = this._total;
      this._settleWaiters.splice(0).forEach((resolve) => resolve());
    };
    this.manager.onError = (url) => console.error(`[AssetLoader] failed: ${url}`);
  }

  /**
   * Call once after WebGLRenderer exists — enables KTX2 textures on GLBs.
   * @param {import('three').WebGLRenderer} renderer
   */
  bindRenderer(renderer) {
    this._ktx2 = bindKtx2(renderer);
    // Re-attach shared KTX2 to this loader instance
    if (this._ktx2) {
      this.gltf = makeGltfLoader({ manager: this.manager, shared: false, renderer });
    }
    return this._ktx2;
  }

  /** Pipeline diagnostics (boot / toast). */
  pipelineStatus() {
    return {
      ...gltfPipelineStatus(),
      ktx2Bound: isKtx2Bound() || this._ktx2,
      dracoPathConfig: DRACO_DECODER_PATH
    };
  }

  onProgress(callback) {
    this._onProgress = callback;
  }

  settled() {
    if (this._total === 0 || this._loaded >= this._total) return Promise.resolve();
    return new Promise((resolve) => this._settleWaiters.push(resolve));
  }

  /** @returns {Promise<THREE.Group>} */
  loadFBX(url) {
    return new Promise((resolve, reject) => {
      this.fbx.load(
        encodeURI(url),
        resolve,
        (event) => {
          if (event.lengthComputable) this._onProgress?.(event.loaded / event.total, url);
        },
        reject
      );
    });
  }

  /**
   * Load glTF / GLB (Draco / Meshopt / KTX2 when present on asset).
   * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>}
   */
  loadGLTF(url) {
    return new Promise((resolve, reject) => {
      this.gltf.load(
        url,
        resolve,
        (event) => {
          if (event.lengthComputable) this._onProgress?.(event.loaded / event.total, url);
        },
        reject
      );
    });
  }

  /**
   * Color texture — sRGB for albedo/atlas (not data/normal maps).
   * @param {string} url
   * @param {{ colorSpace?: boolean }} [opts]
   * @returns {Promise<import('three').Texture>}
   */
  loadTexture(url, opts = {}) {
    return new Promise((resolve, reject) => {
      this.texture.load(
        url,
        (tex) => {
          if (opts.colorSpace !== false) {
            tex.colorSpace = SRGBColorSpace;
          }
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  /** @returns {Promise<import('three').DataTexture>} */
  loadHDR(url) {
    return new Promise((resolve, reject) => {
      this.hdr.load(encodeURI(url), resolve, undefined, reject);
    });
  }

  dispose() {
    // Do not dispose process-wide Draco — other systems may still use it.
    // Tests: import { disposeGltfPipeline } from './gltfPipeline.js'
  }
}
