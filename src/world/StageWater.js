import {
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  DoubleSide,
  Vector3
} from 'three';
import { noiseGLSL } from '../shaders/lib/noise.glsl.js';
import { frame } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';
import { WORLD } from '../config/worldScale.js';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';

/**
 * Stage water layer — real transparent water plane (not ability path volume).
 * SI metres; sits under the dark slab so the horizon reads as water + fog.
 * Uses scene env map for reflections when available.
 *
 * CPU sampleHeight for windsurf freeride (soft ocean body follow).
 */
export class StageWater {
  constructor() {
    const size = WORLD.waterSize;
    const segs = 96;

    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new Color(0.02, 0.08, 0.16) },
      uShallow: { value: new Color(0.08, 0.42, 0.52) },
      uFoam: { value: new Color(0.85, 0.95, 1.0) },
      uOpacity: { value: 0.78 },
      uWaveAmp: { value: 0.08 },
      uWaveFreq: { value: 0.35 },
      uFresnel: { value: 1.35 },
      uEnvIntensity: { value: 0.55 },
      uIslandRadius: { value: WORLD.islandRadius },
      uEnvMap: frame.uEnvMap,
      uSunDir: { value: new Vector3(-0.6, 0.75, -0.35).normalize() }
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
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vElev;
        ${noiseGLSL}
        void main() {
          vec3 p = position;
          float w1 = snoise(vec3(p.x * uWaveFreq, uTime * 0.22, p.y * uWaveFreq));
          float w2 = snoise(vec3(p.x * uWaveFreq * 2.1 + 3.0, uTime * 0.35, p.y * uWaveFreq * 1.7));
          float elev = (w1 * 0.65 + w2 * 0.35) * uWaveAmp;
          p.z += elev; // plane in XY before rotation; after rot X -90°, Z→Y
          vElev = elev;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          // Approximate normal from wave slope
          float e = 0.35;
          float hx = snoise(vec3((p.x + e) * uWaveFreq, uTime * 0.22, p.y * uWaveFreq))
                   - snoise(vec3((p.x - e) * uWaveFreq, uTime * 0.22, p.y * uWaveFreq));
          float hy = snoise(vec3(p.x * uWaveFreq, uTime * 0.22, (p.y + e) * uWaveFreq))
                   - snoise(vec3(p.x * uWaveFreq, uTime * 0.22, (p.y - e) * uWaveFreq));
          vec3 n = normalize(vec3(-hx * uWaveAmp * 2.0, 1.0, -hy * uWaveAmp * 2.0));
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
        uniform vec3 uSunDir;
        uniform sampler2D uEnvMap;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vElev;
        ${noiseGLSL}

        // equirect sample (safe when env not yet bound)
        vec3 sampleEnv(vec3 r) {
          if (uEnvIntensity < 0.01) return vec3(0.04, 0.07, 0.1);
          vec2 uv = vec2(atan(r.z, r.x), asin(clamp(r.y, -1.0, 1.0)));
          uv *= vec2(0.1591549, 0.3183099);
          uv += 0.5;
          return texture2D(uEnvMap, uv).rgb;
        }

        void main() {
          float dist = length(vWorld.xz);
          // Soft hole under stage island so ground shows through
          float islandMask = smoothstep(uIslandRadius * 0.92, uIslandRadius * 1.08, dist);
          if (islandMask < 0.02) discard;

          vec3 N = normalize(vNormalW);
          vec3 V = normalize(cameraPosition - vWorld);
          float ndv = max(0.0, dot(N, V));
          float fres = pow(1.0 - ndv, mix(2.0, 5.0, clamp(uFresnel * 0.5, 0.0, 1.0)));

          float depthT = smoothstep(uIslandRadius, uIslandRadius * 2.8, dist);
          vec3 base = mix(uShallow, uDeep, depthT);
          // Crest foam
          float foam = smoothstep(0.02, 0.07, vElev) * (1.0 - depthT * 0.5);
          foam *= snoise01(vWorld * 2.4) * 0.7 + 0.3;
          base = mix(base, uFoam, foam * 0.55);

          vec3 R = reflect(-V, N);
          vec3 env = sampleEnv(R) * uEnvIntensity;
          float sun = pow(max(0.0, dot(R, normalize(uSunDir))), 64.0) * 1.4;

          vec3 col = base * (0.55 + 0.45 * ndv) + env * fres + vec3(sun);
          float alpha = uOpacity * islandMask * mix(0.55, 0.92, fres);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    this.mesh = new Mesh(new PlaneGeometry(size, size, segs, segs), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = WORLD.waterY;
    this.mesh.name = 'StageWater';
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.renderOrder = -1;
    this.group = this.mesh;
  }

  /**
   * CPU wave height (m) for freeride board follow — mirrors vertex shader amp.
   * @param {number} x
   * @param {number} z
   * @param {number} [time]
   * @returns {number}
   */
  sampleHeight(x, z, time) {
    const t = time ?? this.uniforms.uTime.value ?? 0;
    const amp = this.uniforms.uWaveAmp?.value ?? 0.08;
    const freq = this.uniforms.uWaveFreq?.value ?? 0.35;
    // Approximate snoise with multi-sine (cheap, SI)
    const w1 = Math.sin(x * freq + t * 0.22) * Math.cos(z * freq + t * 0.18);
    const w2 = Math.sin(x * freq * 2.1 + 3 + t * 0.35) * Math.cos(z * freq * 1.7 + t * 0.3);
    const elev = (w1 * 0.65 + w2 * 0.35) * amp;
    return (WORLD.waterY || 0) + elev;
  }

  update(elapsed) {
    this.uniforms.uTime.value = elapsed;
    this.uniforms.uIslandRadius.value = WORLD.islandRadius;
    // Dim with global water-ish intensity if present
    const g = settings.global || {};
    this.uniforms.uOpacity.value = 0.72 * (g.opacity ?? 1);
    this.uniforms.uEnvIntensity.value = 0.45 + 0.4 * (g.glow ?? 1) * (settings.environment?.envIntensity ?? 0.3);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
