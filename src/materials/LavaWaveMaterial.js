import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, Vector2 } from 'three';
import { commonGLSL } from '../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../core/FrameUniforms.js';
import { getFireSplineTexture } from './SpheringImpactMaterial.js';

/**
 * three.js lava dual-UV (webgl_shader_lava / VoxLavaShader) on a traveling mesh.
 * Noise + lava tile are the shared fire spline — not a second fire engine,
 * not a fetch of threejs.org lavatile.jpg.
 *
 * Used by SlashWaveSystem for AOE lava sheets (inferno / earth_surge).
 */
export class LavaWaveMaterial extends ShaderMaterial {
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
        uColorEdge: { value: new Color(opts.colorEdge ?? 0x4a0800) },
        uOpacity: { value: 1 },
        uFade: { value: 1 },
        uPulse: { value: 1 },
        uAge: { value: 0 },
        uUvScale: { value: new Vector2(opts.uvScaleX ?? 2.4, opts.uvScaleY ?? 2.4) }
      }),
      vertexShader: /* glsl */ `
        uniform vec2 uUvScale;
        uniform float uPulse;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vViewZ;

        void main() {
          vUv = uv * uUvScale;
          vec3 pos = position + normal * uPulse * 0.012;
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
        uniform float uAge;
        uniform vec2 uUvScale;
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

        ${commonGLSL}

        void main() {
          // Official lava recipe: dual-scroll UV, noise warps lava tile.
          // Fire spline .r stands in for cloud.png alpha (our tex is opaque).
          float noise = texture2D(uFireTex, vUv).r;
          vec2 T1 = vUv + vec2(1.5, -1.5) * uTime * 0.22;
          vec2 T2 = vUv + vec2(-0.5, 2.0) * uTime * 0.11;
          T1.x += noise * 2.0;
          T1.y += noise * 2.0;
          T2.x -= noise * 0.2;
          T2.y += noise * 0.2;

          float p = texture2D(uFireTex, T1 * 2.0).r;
          vec3 lava = texture2D(uFireTex, T2 * 2.0).rgb;
          vec3 temp = lava * (p * 2.0) + (lava * lava - 0.08);
          if (temp.r > 1.0) temp.gb += clamp(temp.r - 2.0, 0.0, 1.0);
          if (temp.g > 1.0) temp.rb += temp.g - 1.0;
          if (temp.b > 1.0) temp.rg += temp.b - 1.0;

          vec3 col = mix(uColorEdge, uColorMid, clamp(temp.r, 0.0, 1.0));
          col = mix(col, uColorCore, clamp(temp.g * temp.g, 0.0, 1.0));
          col *= 0.55 + temp * 1.15;
          col += uColorCore * fresnelTerm(vViewDir, vNormalW, 2.0, 0.9) * 0.35;

          float heat = clamp(temp.r * 0.65 + p * 0.35 + uPulse * 0.08, 0.0, 1.0);
          float rim = smoothstep(0.0, 0.12, vUv.x) * smoothstep(uUvScale.x, uUvScale.x - 0.18, vUv.x);
          rim *= smoothstep(0.0, 0.12, vUv.y) * smoothstep(uUvScale.y, uUvScale.y - 0.18, vUv.y);
          float alpha = (0.28 + heat * 0.72) * uOpacity * uFade * max(rim, 0.35);
          if (alpha < 0.014) discard;

          vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
          alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.32);

          gl_FragColor = vec4(col * alpha * uGlobalGlow * mix(0.6, 1.0, uShaderIntensity), alpha);
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
