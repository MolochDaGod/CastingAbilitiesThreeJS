import { LoadingManager, TextureLoader } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACO_DECODER_PATH } from '../config/assets.js';

/**
 * A 1×1 opaque white PNG for broken absolute texture paths in legacy FBX.
 */
export const PLACEHOLDER_TEXTURE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const ABSOLUTE_LOCAL_PATH = /(^|\/)[A-Za-z]:[\\/]|^\\\\/;

/**
 * Central asset loading — matches three.js GLTFLoader examples:
 *  - GLTFLoader + DRACOLoader (KHR_draco_mesh_compression)
 *  - MeshoptDecoder (EXT/KHR_meshopt_compression)
 *  - shared LoadingManager for boot progress
 *
 * @see https://threejs.org/examples/?q=loader%20gltf
 */
export class AssetLoader {
  constructor() {
    this.manager = new LoadingManager();
    this.manager.setURLModifier((url) =>
      ABSOLUTE_LOCAL_PATH.test(url) ? PLACEHOLDER_TEXTURE_URL : url
    );

    this.draco = new DRACOLoader(this.manager);
    // Official three.js GLTF example pattern — wasm decoder from gstatic.
    this.draco.setDecoderPath(DRACO_DECODER_PATH);
    this.draco.preload();

    this.gltf = new GLTFLoader(this.manager);
    this.gltf.setDRACOLoader(this.draco);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);

    this.fbx = new FBXLoader(this.manager);
    this.hdr = new HDRLoader(this.manager);
    this.texture = new TextureLoader(this.manager);

    this._onProgress = null;
    this._loaded = 0;
    this._total = 0;
    this._settleWaiters = [];

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
   * Load glTF / GLB (production kits may use Draco / Meshopt / WebP).
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

  /** @returns {Promise<THREE.Texture>} */
  loadTexture(url) {
    return new Promise((resolve, reject) => {
      this.texture.load(url, resolve, undefined, reject);
    });
  }

  /** @returns {Promise<THREE.DataTexture>} */
  loadHDR(url) {
    return new Promise((resolve, reject) => {
      this.hdr.load(encodeURI(url), resolve, undefined, reject);
    });
  }

  dispose() {
    this.draco?.dispose();
  }
}
