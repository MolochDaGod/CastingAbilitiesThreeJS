import {
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  AdditiveBlending,
  NormalBlending,
  Color,
  Group
} from 'three';
import { noiseGLSL } from '../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';
import { ObjectPool } from '../utils/ObjectPool.js';

export const DecalType = Object.freeze({
  SCORCH: 0, // burnt ground with cooling embers  (fire)
  RIPPLE: 1, // expanding water ring              (water)
  CRACK: 2, // radial fractures with hot glow     (earth)
  SHOCKWAVE: 3, // thin expanding ring            (all impacts)
  DUSTRING: 4, // soft ground-hugging dust puff   (earth / wind)
  FOAM: 5, // spreading sea foam over wet stone    (water)
  /** Linear skillshot ice rime (LinearAbilityCasting) */
  FROST: 6,
  /** Linear skillshot electric burn (LinearAbilityCasting) */
  ARC: 7
});

const DECAL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DECAL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uAge;        // 0..1 normalised lifetime
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uWidth;      // crack / ring thickness
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float d = length(c);
    if (d > 1.0) discard;

    float alpha = 0.0;
    vec3 color = uColorA;
    float fadeOut = 1.0 - smoothstep(0.55, 1.0, uAge);

    #if DECAL == 0                                   /* SCORCH */
      float n = fbm3(vec3(c * 2.4, uSeed * 13.0));
      float burn = smoothstep(1.0, 0.15, d + n * 0.45);
      float embers = pow(max(0.0, snoise(vec3(c * 6.0, uSeed * 9.0 + uTime * 0.35))), 4.0);
      alpha = burn * (0.85 * fadeOut);
      color = mix(uColorA, uColorB, embers * (1.0 - uAge));
      color += embers * uColorB * 2.5 * (1.0 - smoothstep(0.0, 0.6, uAge));

    #elif DECAL == 1                                 /* RIPPLE */
      float radius = mix(0.05, 1.0, sqrt(uAge));
      float ring = smoothstep(uWidth, 0.0, abs(d - radius));
      float inner = smoothstep(radius, radius - 0.35, d) * 0.22;
      float wobble = 0.75 + 0.25 * snoise(vec3(c * 5.0, uSeed * 4.0 + uTime));
      alpha = (ring * wobble + inner) * fadeOut;
      color = mix(uColorA, uColorB, ring);

    #elif DECAL == 2                                 /* CRACK */
      float ang = atan(c.y, c.x);
      float branch = ridged(vec3(cos(ang), sin(ang), uSeed * 5.0) * 2.6, 4);
      float spread = smoothstep(0.0, 0.45, uAge);
      float radial = smoothstep(spread, spread * 0.35, d);
      float crack = smoothstep(0.55 - uWidth * 0.35, 0.85, branch) * radial;
      float glow = crack * (1.0 - smoothstep(0.1, 0.8, uAge));
      alpha = clamp(crack * 0.95 * fadeOut, 0.0, 1.0);
      color = mix(uColorA, uColorB, glow);
      color += uColorB * glow * 1.8;

    #elif DECAL == 3                                 /* SHOCKWAVE */
      float radius = mix(0.0, 1.0, pow(uAge, 0.55));
      float ring = smoothstep(uWidth, 0.0, abs(d - radius));
      alpha = ring * (1.0 - uAge) * 0.9;
      color = mix(uColorA, uColorB, ring);

    #elif DECAL == 4                                 /* DUSTRING */
      float radius = mix(0.1, 1.0, pow(uAge, 0.4));
      float n = fbm3(vec3(c * 3.1, uSeed * 7.0 + uTime * 0.2));
      float puff = smoothstep(radius, radius * 0.35, d) * (0.6 + n * 0.5);
      alpha = puff * (1.0 - uAge) * 0.7;
      color = mix(uColorA, uColorB, n * 0.5 + 0.5);

    #elif DECAL == 6                                 /* FROST — skillshot rime */
      float n = fbm3(vec3(c * 2.2, uSeed * 17.0));
      float crust = smoothstep(1.05, 0.2, d + n * 0.35);
      vec2 cell = voronoi2(c * 5.5 + uSeed * 9.0);
      float plates = smoothstep(0.45, 0.05, cell.x);
      float rim = smoothstep(0.12, 0.0, abs(d - mix(0.35, 0.95, sqrt(uAge))));
      alpha = clamp(crust * (0.45 + plates * 0.55) + rim * 0.35, 0.0, 1.0) * fadeOut;
      color = mix(uColorA, uColorB, plates * 0.6 + rim * 0.4);
      color += uColorB * plates * 0.35 * (1.0 - uAge);

    #elif DECAL == 7                                 /* ARC — electric burn */
      float ang = atan(c.y, c.x);
      float branch = ridged(vec3(cos(ang * 3.0), sin(ang * 2.0), uSeed * 11.0) * 3.2, 5);
      float n = snoise(vec3(c * 8.0, uSeed * 5.0 + uTime * 2.5));
      float burn = smoothstep(0.35, 0.9, branch + n * 0.2) * smoothstep(1.0, 0.15, d);
      float flash = pow(max(0.0, n), 3.0) * (1.0 - smoothstep(0.0, 0.5, uAge));
      alpha = clamp(burn * 0.9 + flash * 0.5, 0.0, 1.0) * fadeOut;
      color = mix(uColorA, uColorB, flash + burn * 0.5);
      color += uColorB * flash * 2.2;

    #else                                            /* FOAM */
      // A sheet of foam thrown outward by the impact, which then drains from
      // the middle and dries back into a ring, over wet stone that darkens and
      // slowly evaporates.
      float front = mix(0.12, 1.0, pow(uAge, 0.42));
      float n = fbm3(vec3(c * 2.6, uSeed * 17.0 + uTime * 0.12));
      // Water runs outward in fingers, so the front is never a clean circle.
      float ang = atan(c.y, c.x);
      float fingers = 0.68 + 0.32 * snoise(vec3(cos(ang), sin(ang), uSeed * 3.0) * 3.5);
      float edge = d + n * 0.26;
      float reach = front * fingers;

      float sheet = smoothstep(reach, reach - 0.3, edge);
      float drain = smoothstep(reach * uAge * 0.9 - 0.05, reach * uAge + 0.3, edge + n * 0.12);
      float foam = sheet * mix(1.0, drain, smoothstep(0.12, 0.85, uAge));

      // Cell noise turns the sheet into bubbles instead of flat white paint.
      vec2 cell = voronoi2(c * 9.0 + uSeed * 30.0);
      float bubbles = smoothstep(0.55, 0.04, cell.x);
      float rim = smoothstep(0.09, 0.0, abs(edge - reach)) * (1.0 - uAge);

      float wet = sheet * (1.0 - smoothstep(0.3, 1.0, uAge));
      float mask = clamp(foam * (0.5 + 0.65 * bubbles) + rim * 0.9, 0.0, 1.0);
      alpha = clamp(wet * 0.5 + mask, 0.0, 1.0) * fadeOut;
      color = mix(uColorA, uColorB, clamp(mask * 1.3, 0.0, 1.0));
    #endif

    alpha *= uIntensity;
    if (alpha < 0.004) discard;

    color *= uGlobalGlow;
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * Pooled ground decals: scorch marks, ripples, cracks, shockwaves and foam.
 *
 * Each decal is a single quad lying on the ground with a fully procedural
 * fragment shader, so there are no decal textures and no projection cost. One
 * material instance per decal keeps the uniforms independent while three's
 * program cache still compiles only one program per decal type.
 */
export class DecalSystem {
  constructor(scene) {
    this.group = new Group();
    this.group.name = 'GroundDecals';
    scene.add(this.group);

    this.geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.active = [];

    // One pool per type so the shader `#define` stays constant per material.
    this.pools = new Map();
  }

  _poolFor(type) {
    let pool = this.pools.get(type);
    if (!pool) {
      pool = new ObjectPool(() => this._createDecal(type), (decal) => {
        decal.mesh.visible = false;
        this.group.remove(decal.mesh);
      });
      this.pools.set(type, pool);
    }
    return pool;
  }

  _createDecal(type) {
    const additive = type === DecalType.RIPPLE || type === DecalType.SHOCKWAVE;
    const material = new ShaderMaterial({
      defines: { DECAL: type },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? AdditiveBlending : NormalBlending,
      toneMapped: false,
      uniforms: sharedUniforms({
        uAge: { value: 0 },
        uSeed: { value: Math.random() },
        uIntensity: { value: 1 },
        uWidth: { value: 0.12 },
        uColorA: { value: new Color(0.1, 0.06, 0.05) },
        uColorB: { value: new Color(1, 0.5, 0.15) }
      }),
      vertexShader: DECAL_VERTEX,
      fragmentShader: DECAL_FRAGMENT
    });

    const mesh = new Mesh(this.geometry, material);
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = additive ? 8 : 6;
    mesh.frustumCulled = false;

    return { mesh, material, type, age: 0, life: 1, radius: 1, growth: 0 };
  }

  /**
   * @param {number} type   DecalType.*
   * @param {THREE.Vector3} position
   * @param {object} options
   */
  spawn(type, position, options = {}) {
    const {
      radius = 2,
      life = 2,
      colorA = null,
      colorB = null,
      intensity = 1,
      width = 0.12,
      growth = 0,
      height = 0.02
    } = options;

    const decal = this._poolFor(type).acquire();
    const u = decal.material.uniforms;

    decal.age = 0;
    decal.life = Math.max(0.05, life);
    decal.radius = radius;
    decal.growth = growth;

    u.uAge.value = 0;
    u.uSeed.value = Math.random();
    u.uIntensity.value = intensity;
    u.uWidth.value = width;
    if (colorA) u.uColorA.value.copy(colorA);
    if (colorB) u.uColorB.value.copy(colorB);

    decal.mesh.position.set(position.x, height, position.z);
    decal.mesh.rotation.y = Math.random() * Math.PI * 2;
    decal.mesh.scale.setScalar(radius * 2);
    decal.mesh.visible = true;

    this.group.add(decal.mesh);
    this.active.push(decal);
    return decal;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const decal = this.active[i];
      decal.age += dt;
      const t = decal.age / decal.life;
      decal.material.uniforms.uAge.value = t;

      if (decal.growth !== 0) {
        decal.mesh.scale.setScalar(decal.radius * 2 * (1 + decal.growth * t));
      }

      if (t >= 1) {
        this.active.splice(i, 1);
        this._poolFor(decal.type).release(decal);
      }
    }
  }

  clear() {
    for (const decal of this.active) this._poolFor(decal.type).release(decal);
    this.active.length = 0;
  }

  dispose() {
    this.clear();
    for (const pool of this.pools.values()) pool.dispose((decal) => decal.material.dispose());
    this.pools.clear();
    this.geometry.dispose();
    this.group.parent?.remove(this.group);
  }
}
