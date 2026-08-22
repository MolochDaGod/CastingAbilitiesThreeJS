import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';
import { noiseGLSL } from '../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../core/FrameUniforms.js';
import { getFireSplineTexture } from './SpheringImpactMaterial.js';

/**
 * RPG slash-wave energy — fire-textured crescent that rides a traveling mesh.
 * Used by SlashWaveSystem (melee residual), not a second VFX engine.
 */
export class SlashWaveMaterial extends ShaderMaterial {
  constructor(opts = {}) {
    super({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
      uniforms: sharedUniforms({
        uFireTex: { value: getFireSplineTexture() },
        uColorCore: { value: new Color(opts.colorCore ?? 0xfff1c2) },
        uColorMid: { value: new Color(opts.colorMid ?? 0xff4a14) },
        uColorEdge: { value: new Color(opts.colorEdge ?? 0x7a0500) },
        uOpacity: { value: 1 },
        uFade: { value: 1 },
        uPulse: { value: 1 },
        uScroll: { value: 2.4 },
        uAge: { value: 0 }
      }),
      vertexShader: /* glsl */ `
        uniform float uPulse;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vViewZ;

        void main() {
          vUv = uv;
          vec3 pos = position + normal * uPulse * 0.018;
          vec4 world = modelMatrix * vec4(pos, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = cameraPosition - world.xyz;
          vec4 mv = viewMatrix * world;
          vViewZ = mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uFireTex;
        uniform vec3 uColorCore;
        uniform vec3 uColorMid;
        uniform vec3 uColorEdge;
        uniform float uOpacity;
        uniform float uFade;
        uniform float uPulse;
        uniform float uScroll;
        uniform float uAge;
        uniform float uTime;
        uniform float uShaderIntensity;
        uniform float uGlobalGlow;
        uniform vec2 uResolution;
        uniform sampler2D uSceneDepth;
        uniform float uCameraNear;
        uniform float uCameraFar;

        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vViewZ;

        ${noiseGLSL}
        ${commonGLSL}

        void main() {
          // Along-arc (u) + across-blade (v) — scroll fire down the cut.
          vec2 fireUv = vec2(vUv.x * 2.6 - uTime * uScroll * 0.7, vUv.y * 1.8 + uTime * uScroll);
          vec3 fireTex = texture2D(uFireTex, fireUv).rgb;
          float n = fbm3(vec3(vUv.x * 4.0, vUv.y * 3.0, uTime * 1.8));

          float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
          float along = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
          float heat = clamp(fireTex.r * 0.7 + n * 0.35 + uPulse * 0.15, 0.0, 1.0);

          vec3 col = mix(uColorEdge, uColorMid, fireTex.r);
          col = mix(col, uColorCore, heat * heat);
          col *= 0.75 + fireTex * 1.35;

          float fres = fresnelTerm(vViewDir, vNormalW, 2.1, 1.2);
          col += uColorCore * fres * 0.55;

          float alpha = edge * along * (0.4 + heat * 0.55) * uOpacity * uFade;
          if (alpha < 0.012) discard;

          vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
          alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.28);

          gl_FragColor = vec4(col * alpha * uGlobalGlow * mix(0.55, 0.9, uShaderIntensity), alpha);
        }
      `
    });
  }

  setColors(core, mid, edge) {
    if (core) this.uniforms.uColorCore.value.set(core);
    if (mid) this.uniforms.uColorMid.value.set(mid);
    if (edge) this.uniforms.uColorEdge.value.set(edge);
  }

  sync(age, fade, pulse) {
    this.uniforms.uAge.value = age;
    this.uniforms.uFade.value = fade;
    this.uniforms.uPulse.value = pulse;
  }
}
