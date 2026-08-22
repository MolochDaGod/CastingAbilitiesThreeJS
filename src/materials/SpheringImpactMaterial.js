import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector3
} from 'three';
import { noiseGLSL } from '../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../core/FrameUniforms.js';

/**
 * Hide the Sphering cage (dark metal ring-tubes) and run a red fire-textured
 * spline along the tube lines. UV.x is around each thin tube (0.375–0.625);
 * UV.y runs along the ring — that V is the spline parameter.
 *
 * Author mesh: public/models/vfx/impact/sphering.glb (tamminen, CC-BY-4.0).
 */
export const SPHERING_SOURCE_MAX_M = 0.4415;

let _sharedFireTex = null;

/** Tileable fire ramp used as uFireTex. One GPU texture, shared. */
export function getFireSplineTexture() {
  if (_sharedFireTex) return _sharedFireTex;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const oct = (x, y, freq, seed) => {
    const ix = Math.floor(x * freq);
    const iy = Math.floor(y * freq);
    const fx = x * freq - ix;
    const fy = y * freq - iy;
    const h = (i, j) => {
      const n = Math.sin((i + seed * 17.13) * 127.1 + (j + seed * 9.7) * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let n = 0;
      n += oct(u, v, 3, 1.1) * 0.5;
      n += oct(u, v, 7, 2.4) * 0.28;
      n += oct(u, v, 15, 3.8) * 0.14;
      n += oct(u, v, 31, 5.2) * 0.08;
      // Stretch into vertical tongues so it reads as fire when scrolled on V.
      const tongue = oct(u * 0.6, v, 5, 8.1);
      n = Math.min(1, Math.max(0, n * 0.72 + tongue * 0.38));
      const t = n * n * (1.4 - 0.4 * n);
      const r = Math.min(255, 40 + t * 255);
      const g = Math.min(255, t * t * 210 + t * 20);
      const b = Math.min(255, t * t * t * 70);
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  tex.userData.ownedByMaterial = false;
  _sharedFireTex = tex;
  return tex;
}

/** Optional canvas fallback if DataTexture path is ever blocked. */
export function makeFireSplineCanvasTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  img.data.set(getFireSplineTexture().image.data);
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = tex.magFilter = LinearFilter;
  return tex;
}

export class SpheringImpactMaterial extends ShaderMaterial {
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
        uColorCore: { value: new Color(opts.colorCore ?? 0xfff2c4) },
        uColorMid: { value: new Color(opts.colorMid ?? 0xff4a12) },
        uColorEdge: { value: new Color(opts.colorEdge ?? 0x8a0600) },
        uOpacity: { value: 1 },
        uHide: { value: 0.985 },
        uGhost: { value: 0.018 },
        uLineWidth: { value: 0.12 },
        uSlashWidth: { value: 0.11 },
        uSplineLen: { value: 0.09 },
        uHead: { value: 0 },
        uAge: { value: 0 },
        uFade: { value: 1 },
        uPulse: { value: 0 },
        uScroll: { value: 1.8 },
        uSlashAxis: {
          value: opts.slashAxis?.isVector3
            ? opts.slashAxis.clone()
            : new Vector3(0.28, 0.62, 0.73)
        },
        uSlashDir: {
          value: opts.slashDir?.isVector3
            ? opts.slashDir.clone()
            : new Vector3(0.86, 0.12, -0.5)
        },
        uSeed: { value: Math.random() * 20 }
      }),
      vertexShader: /* glsl */ `
        uniform float uPulse;
        uniform float uAge;
        uniform float uTime;

        varying vec3 vPosL;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying vec2 vUv;
        varying float vViewZ;

        void main() {
          vUv = uv;
          vPosL = position;
          float breathe = uPulse * (0.55 + 0.45 * sin(uTime * 22.0 + uAge * 6.283));
          vec3 pos = position + normal * breathe * 0.012;
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
        uniform float uHide;
        uniform float uGhost;
        uniform float uLineWidth;
        uniform float uSlashWidth;
        uniform float uSplineLen;
        uniform float uHead;
        uniform float uAge;
        uniform float uFade;
        uniform float uScroll;
        uniform vec3 uSlashAxis;
        uniform vec3 uSlashDir;
        uniform float uSeed;
        uniform float uTime;
        uniform float uShaderIntensity;
        uniform float uGlobalGlow;
        uniform vec2 uResolution;
        uniform sampler2D uSceneDepth;
        uniform float uCameraNear;
        uniform float uCameraFar;

        varying vec3 vPosL;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying vec2 vUv;
        varying float vViewZ;

        ${noiseGLSL}
        ${commonGLSL}

        void main() {
          // Tube cross-section: author UV.x lives in ~0.375–0.625.
          float around = (vUv.x - 0.5) / 0.125;
          float line = 1.0 - smoothstep(uLineWidth, uLineWidth + 0.35, abs(around));
          if (line < 0.004 && uGhost < 0.001) discard;

          vec3 p = normalize(vPosL);
          vec3 axis = normalize(uSlashAxis);
          vec3 sdir = normalize(uSlashDir);
          float plane = abs(dot(p, axis));
          float onSlash = 1.0 - smoothstep(0.0, max(uSlashWidth, 0.02), plane);
          // Crescent: only the cut facing the swing, not a full equator tunnel.
          float crescent = smoothstep(0.05, 0.55, dot(p, sdir));
          float slashMask = onSlash * crescent;

          // Hide the cage; keep only the slash-aligned ring lines.
          float visible = mix(slashMask, 1.0, 1.0 - clamp(uHide, 0.0, 1.0));
          float ghost = uGhost * line * slashMask;

          // Travelling spline along each ring (UV.y).
          float along = fract(vUv.y);
          float headDist = abs(fract(along - uHead + 0.5) - 0.5);
          float spline = 1.0 - smoothstep(0.0, max(uSplineLen, 0.02), headDist);
          spline *= spline;
          // Secondary spark that races a bit behind the head.
          float trailDist = abs(fract(along - uHead + 0.1 + 0.5) - 0.5);
          float trail = 1.0 - smoothstep(0.0, uSplineLen * 1.35, trailDist);

          vec2 fireUv = vec2(
            vUv.y * 3.4 + uTime * uScroll * 0.55 + uSeed,
            around * 0.85 - uTime * uScroll * 0.9
          );
          vec3 fireTex = texture2D(uFireTex, fireUv).rgb;
          float n = fbm3(vec3(vUv.y * 5.5, around * 3.0, uTime * 1.6 + uSeed));
          float heat = clamp(spline * 1.25 + trail * 0.35 + n * 0.12, 0.0, 1.0);

          vec3 fire = mix(uColorEdge, uColorMid, fireTex.r);
          fire = mix(fire, uColorCore, heat * heat * max(fireTex.g, 0.35));
          fire *= 0.85 + fireTex * 1.4;

          float fres = fresnelTerm(vViewDir, vNormalW, 2.4, 1.15);
          fire += uColorCore * fres * spline * 0.85;

          float pop = 1.0 - smoothstep(0.0, 0.1, uAge);
          float die = 1.0 - smoothstep(0.58, 1.0, uAge);
          float alpha = line * (ghost + visible * (spline * 1.35 + trail * 0.28));
          alpha *= (0.85 + pop * 0.7) * die * uFade * uOpacity;
          if (alpha < 0.008) discard;

          vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
          alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.35);

          vec3 color = fire * alpha * uGlobalGlow * mix(0.7, 1.15, uShaderIntensity);
          gl_FragColor = vec4(color, alpha);
        }
      `
    });
  }

  /**
   * Drive one-shot playback. age01 is 0 at spawn, 1 at death.
   * @param {number} age01
   * @param {{ hide?: number, ghost?: number, lineWidth?: number, slashWidth?: number, splineLen?: number, scroll?: number, pulse?: number, fade?: number }} [knobs]
   */
  sync(age01, knobs = {}) {
    const u = this.uniforms;
    const a = Math.max(0, Math.min(1, age01));
    u.uAge.value = a;
    // Head races the ring in the first half, then holds while it burns out.
    const race = a < 0.48 ? a / 0.48 : 1;
    u.uHead.value = race * 0.92 + 0.04;
    u.uPulse.value = knobs.pulse ?? (a < 0.2 ? 1.2 - a * 3.0 : Math.max(0, 0.55 - a * 0.55));
    u.uFade.value = knobs.fade ?? 1;
    if (knobs.hide != null) u.uHide.value = knobs.hide;
    if (knobs.ghost != null) u.uGhost.value = knobs.ghost;
    if (knobs.lineWidth != null) u.uLineWidth.value = knobs.lineWidth;
    if (knobs.slashWidth != null) u.uSlashWidth.value = knobs.slashWidth;
    if (knobs.splineLen != null) u.uSplineLen.value = knobs.splineLen;
    if (knobs.scroll != null) u.uScroll.value = knobs.scroll;
    if (knobs.opacity != null) u.uOpacity.value = knobs.opacity;
  }

  setSlash(axis, dir) {
    if (axis) {
      const v = this.uniforms.uSlashAxis.value;
      if (axis.isVector3) v.copy(axis);
      else v.set(axis[0], axis[1], axis[2]);
    }
    if (dir) {
      const v = this.uniforms.uSlashDir.value;
      if (dir.isVector3) v.copy(dir);
      else v.set(dir[0], dir[1], dir[2]);
    }
  }

  setColors(core, mid, edge) {
    if (core) this.uniforms.uColorCore.value.set(core);
    if (mid) this.uniforms.uColorMid.value.set(mid);
    if (edge) this.uniforms.uColorEdge.value.set(edge);
  }
}
