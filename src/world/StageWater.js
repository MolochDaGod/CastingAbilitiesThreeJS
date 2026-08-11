import {
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  DoubleSide,
  Vector3,
  RepeatWrapping,
  TextureLoader
} from 'three';
import { noiseGLSL } from '../shaders/lib/noise.glsl.js';
import { frame } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';
import { WORLD } from '../config/worldScale.js';
import { settings } from '../config/settings.js';

/**
 * Open-sea stage water — freeride ring around Dev Island.
 *
 * Patterns aligned with water.grudge-studio.com open-ocean feel (waves, foam,
 * storm amp) while keeping lab hole under islandRadius for Ground pad + nodes.
 * CPU sampleHeight drives windsurf freeride Y follow.
 *
 * Optional normal map from fleet CDN / three examples (non-blocking).
 */
export class StageWater {
  constructor() {
    const size = WORLD.waterSize;
    const segs = Math.min(160, Math.max(96, Math.floor(size / 2.5)));

    this._storm = 0; // 0 calm → 1 storm (drives amp/freq)
    this._stormTarget = 0.35;

    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new Color(0.01, 0.06, 0.14) },
      uShallow: { value: new Color(0.07, 0.38, 0.48) },
      uFoam: { value: new Color(0.88, 0.96, 1.0) },
      uOpacity: { value: 0.82 },
      uWaveAmp: { value: 0.14 },
      uWaveFreq: { value: 0.28 },
      uStorm: { value: 0.35 },
      uFresnel: { value: 1.45 },
      uEnvIntensity: { value: 0.65 },
      uIslandRadius: { value: WORLD.islandRadius },
      uEnvMap: frame.uEnvMap,
      uSunDir: { value: new Vector3(-0.55, 0.72, -0.4).normalize() },
      uHasNormal: { value: 0 },
      uNormalMap: { value: null },
      uNormalScale: { value: 0.55 }
    };

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: true,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uWaveAmp;
        uniform float uWaveFreq;
        uniform float uStorm;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vElev;
        varying vec2 vUv;
        ${noiseGLSL}
        void main() {
          vUv = uv;
          vec3 p = position;
          float amp = uWaveAmp * mix(1.0, 2.8, uStorm);
          float freq = uWaveFreq * mix(1.0, 1.35, uStorm);
          float t = uTime * mix(1.0, 1.55, uStorm);
          float w1 = snoise(vec3(p.x * freq, t * 0.22, p.y * freq));
          float w2 = snoise(vec3(p.x * freq * 2.1 + 3.0, t * 0.35, p.y * freq * 1.7));
          float w3 = snoise(vec3(p.x * freq * 4.2, t * 0.55, p.y * freq * 3.8 + 1.7));
          float elev = (w1 * 0.55 + w2 * 0.3 + w3 * 0.15 * uStorm) * amp;
          p.z += elev;
          vElev = elev;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          float e = 0.4;
          float hx = snoise(vec3((p.x + e) * freq, t * 0.22, p.y * freq))
                   - snoise(vec3((p.x - e) * freq, t * 0.22, p.y * freq));
          float hy = snoise(vec3(p.x * freq, t * 0.22, (p.y + e) * freq))
                   - snoise(vec3(p.x * freq, t * 0.22, (p.y - e) * freq));
          vec3 n = normalize(vec3(-hx * amp * 2.2, 1.0, -hy * amp * 2.2));
          vNormalW = normalize(mat3(modelMatrix) * n);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform float uOpacity;
        uniform float uFresnel;
        uniform float uEnvIntensity;
        uniform float uIslandRadius;
        uniform float uStorm;
        uniform vec3 uSunDir;
        uniform sampler2D uEnvMap;
        uniform float uHasNormal;
        uniform sampler2D uNormalMap;
        uniform float uNormalScale;
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vElev;
        varying vec2 vUv;
        ${noiseGLSL}

        vec3 sampleEnv(vec3 r) {
          if (uEnvIntensity < 0.01) return vec3(0.04, 0.07, 0.1);
          vec2 uv = vec2(atan(r.z, r.x), asin(clamp(r.y, -1.0, 1.0)));
          uv *= vec2(0.1591549, 0.3183099);
          uv += 0.5;
          return texture2D(uEnvMap, uv).rgb;
        }

        void main() {
          float dist = length(vWorld.xz);
          float islandMask = smoothstep(uIslandRadius * 0.92, uIslandRadius * 1.08, dist);
          if (islandMask < 0.02) discard;

          vec3 N = normalize(vNormalW);
          if (uHasNormal > 0.5) {
            vec2 nuv = vUv * 28.0 + vec2(uTime * 0.03, uTime * -0.02);
            vec3 nt = texture2D(uNormalMap, nuv).xyz * 2.0 - 1.0;
            N = normalize(N + nt * uNormalScale * (0.5 + uStorm));
          }
          vec3 V = normalize(cameraPosition - vWorld);
          float ndv = max(0.0, dot(N, V));
          float fres = pow(1.0 - ndv, mix(2.0, 5.0, clamp(uFresnel * 0.5, 0.0, 1.0)));

          float depthT = smoothstep(uIslandRadius, uIslandRadius * 3.2, dist);
          vec3 deepStorm = mix(uDeep, uDeep * 0.55, uStorm);
          vec3 base = mix(uShallow, deepStorm, depthT);

          float foam = smoothstep(0.015, 0.09 * (1.0 + uStorm), vElev) * (1.0 - depthT * 0.45);
          foam *= snoise01(vWorld * 2.4) * 0.7 + 0.3;
          foam = mix(foam, foam * 1.4, uStorm);
          base = mix(base, uFoam, foam * mix(0.5, 0.75, uStorm));

          // Soft rain streaks when stormy
          float rain = uStorm * step(0.72, snoise01(vWorld * 8.0 + uTime * 3.0)) * 0.12;
          base += vec3(rain);

          vec3 R = reflect(-V, N);
          vec3 env = sampleEnv(R) * uEnvIntensity;
          float sun = pow(max(0.0, dot(R, normalize(uSunDir))), mix(72.0, 36.0, uStorm)) * mix(1.5, 0.7, uStorm);

          vec3 col = base * (0.5 + 0.5 * ndv) + env * fres + vec3(sun);
          float alpha = uOpacity * islandMask * mix(0.55, 0.94, fres);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    this.mesh = new Mesh(new PlaneGeometry(size, size, segs, segs), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    // Sea surface at 0 m — seafloor is a separate mesh at WORLD.seafloorY (−5)
    this.mesh.position.y = WORLD.waterY ?? 0;
    this.mesh.name = 'StageWater';
    this.mesh.userData.waterSurface = true;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.renderOrder = -1;
    this.group = this.mesh;

    // Non-blocking normal map (open-sea read) — fleet CDN or three.js example
    this._loadNormalMap();
  }

  _loadNormalMap() {
    // NEVER hit assets.grudge-studio.com or water.grudge-studio.com — both return
    // 403 without Access-Control-Allow-Origin (CORS noise + failed water look).
    // Prefer same-origin public copy, then jsDelivr / three.js examples (CORS OK).
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://casting.grudge.studio';
    const candidates = [
      `${origin}/textures/waternormals.jpg`,
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/waternormals.jpg',
      'https://threejs.org/examples/textures/waternormals.jpg',
    ];
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) {
        console.warn('[StageWater] no water normal map — flat water');
        return;
      }
      const url = candidates[i++];
      loader.load(
        url,
        (tex) => {
          tex.wrapS = tex.wrapT = RepeatWrapping;
          tex.needsUpdate = true;
          this.uniforms.uNormalMap.value = tex;
          this.uniforms.uHasNormal.value = 1;
          this._normalTex = tex;
          console.info('[StageWater] normal map', url);
        },
        undefined,
        () => tryNext()
      );
    };
    tryNext();
  }

  /**
   * 0 = calm glass · 1 = storm (higher waves, foam, rain grain).
   * @param {number} t
   */
  setStorm(t) {
    this._stormTarget = Math.max(0, Math.min(1, t));
  }

  /**
   * CPU wave height (m) — mirrors vertex amp/storm for freeride.
   */
  sampleHeight(x, z, time) {
    const t = time ?? this.uniforms.uTime.value ?? 0;
    const storm = this.uniforms.uStorm?.value ?? 0;
    const amp = (this.uniforms.uWaveAmp?.value ?? 0.14) * (1 + storm * 1.8);
    const freq = (this.uniforms.uWaveFreq?.value ?? 0.28) * (1 + storm * 0.35);
    const tt = t * (1 + storm * 0.55);
    const w1 = Math.sin(x * freq + tt * 0.22) * Math.cos(z * freq + tt * 0.18);
    const w2 = Math.sin(x * freq * 2.1 + 3 + tt * 0.35) * Math.cos(z * freq * 1.7 + tt * 0.3);
    const w3 = Math.sin(x * freq * 4.2 + tt * 0.55) * Math.cos(z * freq * 3.8 + 1.7);
    const elev = (w1 * 0.55 + w2 * 0.3 + w3 * 0.15 * storm) * amp;
    return (WORLD.waterY || 0) + elev;
  }

  update(elapsed) {
    this.uniforms.uTime.value = elapsed;
    this.uniforms.uIslandRadius.value = WORLD.islandRadius;
    // Soft breathe storm so freeride feels open ocean
    this._storm += (this._stormTarget - this._storm) * 0.02;
    // Mild automatic weather cycle (can override with setStorm)
    const cycle = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 0.04));
    if (settings.walk?.oceanStorm == null) {
      this._stormTarget = cycle;
    } else {
      this._stormTarget = settings.walk.oceanStorm;
    }
    this.uniforms.uStorm.value = this._storm;
    const g = settings.global || {};
    this.uniforms.uOpacity.value = 0.78 * (g.opacity ?? 1);
    this.uniforms.uEnvIntensity.value =
      0.5 + 0.45 * (g.glow ?? 1) * (settings.environment?.envIntensity ?? 0.3);
    this.uniforms.uWaveAmp.value = settings.walk?.oceanWaveAmp ?? 0.14;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this._normalTex?.dispose?.();
  }
}
