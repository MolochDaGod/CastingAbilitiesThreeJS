/**
 * Sail / cloth material practice — fleet texture + physics rules.
 *
 * **Textures (GLTF embed / CDN):**
 *  - baseColor → colorSpace = SRGBColorSpace, flipY = false (GLTF)
 *  - metalnessRoughness → no colorSpace convert (linear data)
 *  - normal → linear, typically OpenGL convention from glTF
 *
 * **Physics / SI:**
 *  - Mesh scale from BackSlotEquip stow length (not 100× author cm)
 *  - Cloth is **visual only** (vertex wind) — no second soft-body engine
 *  - Mass/air feel via amplitude + frequency, not Rapier cloth
 *
 * **Look:** double-sided sail, low metal, high roughness, wind wave along UV height.
 *
 * @see BackSlotEquip.js · docs/WINDSURF_RIDE_SSOT.md
 */

import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector2
} from 'three';

/**
 * Normalize glTF materials for cloth/sail production rules.
 * @param {import('three').Object3D} root
 * @param {{ clothTint?: string, forceCloth?: boolean }} [opts]
 */
export function applySailClothMaterials(root, opts = {}) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const name = `${m.name || ''} ${o.name || ''}`.toLowerCase();
      const isCloth =
        opts.forceCloth ||
        m.side === DoubleSide ||
        m.transparent ||
        m.alphaMode === 'BLEND' ||
        /sail|cloth|canvas|fabric|para|coat|wing|flag/i.test(name);

      // Texture color-space hygiene (glTF embeds)
      if (m.map) {
        m.map.colorSpace = SRGBColorSpace;
        m.map.flipY = false;
        m.map.needsUpdate = true;
      }
      if (m.metalnessMap) {
        m.metalnessMap.colorSpace = undefined; // linear
        m.metalnessMap.flipY = false;
      }
      if (m.roughnessMap) {
        m.roughnessMap.colorSpace = undefined;
        m.roughnessMap.flipY = false;
      }
      if (m.normalMap) {
        m.normalMap.colorSpace = undefined;
        m.normalMap.flipY = false;
      }
      if (m.aoMap) {
        m.aoMap.colorSpace = undefined;
        m.aoMap.flipY = false;
      }

      if (isCloth) {
        // Cloth PBR: not metal, rough fabric, double-sided for thin sail
        m.metalness = Math.min(m.metalness ?? 0, 0.08);
        m.roughness = Math.max(m.roughness ?? 0.75, 0.72);
        m.side = DoubleSide;
        if (m.transparent || m.opacity < 0.99) {
          m.transparent = true;
          m.depthWrite = false;
        }
        if (opts.clothTint) m.color = new Color(opts.clothTint);
        m.userData.sailCloth = true;
        // Install wind-wave shader patch once
        patchMaterialWithClothWind(m);
        n++;
      } else {
        // Board / hard parts: keep embeds, clamp extreme metal
        if (typeof m.metalness === 'number' && m.metalness > 0.85) m.metalness = 0.45;
        m.userData.sailCloth = false;
      }
      m.needsUpdate = true;
    }
  });
  return n;
}

/**
 * Patch MeshStandardMaterial with a subtle vertex wind (no second cloth engine).
 * @param {import('three').Material} material
 */
export function patchMaterialWithClothWind(material) {
  if (!material || material.userData._clothWindPatched) return material;
  material.userData._clothWindPatched = true;
  material.userData.clothWind = {
    time: 0,
    /** metres peak displace — SI, small for back stow */
    amp: 0.028,
    /** waves along sail height */
    freq: 3.2,
    /** phase speed */
    speed: 2.4,
    /** secondary ripple */
    ripAmp: 0.012,
    ripFreq: 7.5
  };

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof prev === 'function') prev(shader, renderer);
    shader.uniforms.uClothTime = { value: 0 };
    shader.uniforms.uClothAmp = { value: material.userData.clothWind.amp };
    shader.uniforms.uClothFreq = { value: material.userData.clothWind.freq };
    shader.uniforms.uClothSpeed = { value: material.userData.clothWind.speed };
    shader.uniforms.uClothRipAmp = { value: material.userData.clothWind.ripAmp };
    shader.uniforms.uClothRipFreq = { value: material.userData.clothWind.ripFreq };
    material.userData.clothShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uClothTime;
uniform float uClothAmp;
uniform float uClothFreq;
uniform float uClothSpeed;
uniform float uClothRipAmp;
uniform float uClothRipFreq;
`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
// Sail cloth wind — displace along normal, stronger toward top of UV.y
{
  float h = uv.y;
  float flap = sin(h * uClothFreq + uClothTime * uClothSpeed)
             + 0.45 * sin(uv.x * uClothRipFreq + uClothTime * (uClothSpeed * 1.35));
  float rip = sin((uv.x + uv.y) * uClothRipFreq * 1.7 + uClothTime * 3.1);
  float w = uClothAmp * (0.25 + 0.75 * h) * flap
          + uClothRipAmp * h * rip;
  transformed += normalize(objectNormal) * w;
}
`
      );
  };
  material.customProgramCacheKey = () => 'sail_cloth_wind_v1';
  return material;
}

/**
 * Drive cloth wind uniforms each frame (call from character / ride update).
 * @param {import('three').Object3D} root
 * @param {number} dt
 * @param {{ wind?: number, speed?: number }} [opts] wind 0..2 intensity
 */
export function updateSailCloth(root, dt, opts = {}) {
  if (!root || !(dt > 0)) return;
  const wind = Number.isFinite(opts.wind) ? opts.wind : 1;
  const speedMul = Number.isFinite(opts.speed) ? opts.speed : 1;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m?.userData?.sailCloth || !m.userData.clothWind) continue;
      const cw = m.userData.clothWind;
      cw.time += dt * speedMul * (0.85 + 0.4 * wind);
      const sh = m.userData.clothShader;
      if (sh?.uniforms) {
        sh.uniforms.uClothTime.value = cw.time;
        sh.uniforms.uClothAmp.value = cw.amp * wind;
        sh.uniforms.uClothSpeed.value = cw.speed * (0.9 + 0.3 * wind);
        sh.uniforms.uClothRipAmp.value = cw.ripAmp * wind;
      }
    }
  });
}

/**
 * Tune cloth amp for stow (smaller) vs full vehicle sail (larger SI).
 * @param {import('three').Object3D} root
 * @param {'stow'|'ride'} mode
 */
export function setSailClothMode(root, mode) {
  if (!root) return;
  const stow = mode === 'stow';
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m?.userData?.clothWind) continue;
      m.userData.clothWind.amp = stow ? 0.018 : 0.06;
      m.userData.clothWind.ripAmp = stow ? 0.008 : 0.022;
      m.userData.clothWind.freq = stow ? 4.0 : 2.6;
      m.userData.clothWind.speed = stow ? 2.8 : 2.1;
    }
  });
}
