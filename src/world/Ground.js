import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { noiseGLSL } from '../shaders/lib/noise.glsl.js';
import { LAYER } from '../core/Layers.js';
import { WORLD } from '../config/worldScale.js';

/**
 * Stage island terrain pad (lab shell).
 *
 * **Hard (production-world aligned):** keep collision / raycast surface **planar y=0**.
 * Path draw, earth crust, CCT feet, and ability ground all require a flat field.
 * Do not raise mesh vertices for "hills" here — use visual shading only.
 *
 * **Visual island best practices (lab):**
 *  - Dark stone pad under hero / cast range
 *  - Shore band near WORLD.islandRadius → sand tint + foam grain (still flat)
 *  - Radial light pool; falloff matches fog so pad dissolves into void
 *  - StageWater cuts a hole under the pad so ocean rings the island
 *
 * @see docs/ISLAND_STAGE_SSOT.md · WORLD in worldScale.js
 */
export class Ground {
  constructor(environment) {
    this.environment = environment;

    this.material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: settings.environment.floorRoughness,
      metalness: 0.0,
      dithering: true
    });

    this.uniforms = {
      uFloorColor: { value: getColor(settings.environment.floorColor).clone() },
      uFloorTint: { value: getColor(settings.environment.floorTint).clone() },
      uShoreColor: { value: getColor(settings.environment.shoreColor || '#3d4a3a').clone() },
      uSheen: { value: settings.environment.floorSheen },
      uPool: { value: settings.environment.floorPool },
      uTime: { value: 0 },
      uIslandR: { value: WORLD.islandRadius },
      uShoreBand: { value: WORLD.shoreBand },
      uShoreTint: { value: WORLD.shoreTint }
    };

    environment.registerShadowCasterWithPatch(this.material, (shader) => {
      shader.uniforms.uFloorColor = this.uniforms.uFloorColor;
      shader.uniforms.uFloorTint = this.uniforms.uFloorTint;
      shader.uniforms.uShoreColor = this.uniforms.uShoreColor;
      shader.uniforms.uSheen = this.uniforms.uSheen;
      shader.uniforms.uPool = this.uniforms.uPool;
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uIslandR = this.uniforms.uIslandR;
      shader.uniforms.uShoreBand = this.uniforms.uShoreBand;
      shader.uniforms.uShoreTint = this.uniforms.uShoreTint;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vGroundWorld;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vGroundWorld;
           uniform vec3 uFloorColor;
           uniform vec3 uFloorTint;
           uniform vec3 uShoreColor;
           uniform float uSheen;
           uniform float uPool;
           uniform float uTime;
           uniform float uIslandR;
           uniform float uShoreBand;
           uniform float uShoreTint;
           ${noiseGLSL}`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           {
             vec3 wp = vGroundWorld;
             float dist = length(wp.xz);

             // Broad stone mottling (low frequency — not gravel)
             float macro = fbm3(wp * 0.018);
             float tintMask = smoothstep(-0.5, 0.6, macro);
             vec3 base = mix(uFloorColor, uFloorTint, tintMask * 0.5);

             base *= 1.0 + fbm3(wp * 0.09 + 11.0) * 0.05;
             base *= 1.0 + (snoise01(wp * 0.7) - 0.5) * 0.06;

             // Shore band: warm sand/stone toward water (island best practice, visual only)
             float shoreInner = max(0.0, uIslandR - uShoreBand);
             float shore = smoothstep(shoreInner, uIslandR * 0.98, dist);
             float foam = smoothstep(0.35, 0.95, snoise01(wp * 0.55 + uTime * 0.04)) * shore;
             base = mix(base, uShoreColor, shore * clamp(uShoreTint, 0.0, 1.0));
             base = mix(base, vec3(0.72, 0.78, 0.74), foam * 0.22);

             // Radial light pool — SI extents from WORLD
             float poolOuter = ${WORLD.floorPoolOuter.toFixed(1)};
             float poolInner = ${WORLD.floorPoolInner.toFixed(1)};
             float pool = mix(1.0, smoothstep(poolOuter, poolInner, dist), clamp(uPool, 0.0, 1.0));
             base *= mix(0.18, 1.0, pool);

             // Beyond island: darken into fog/water ring (StageWater owns ocean)
             float offIsland = smoothstep(uIslandR * 0.96, uIslandR * 1.12, dist);
             base *= mix(1.0, 0.42, offIsland);

             diffuseColor.rgb *= base;
           }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           {
             // Break the sheen up: broad patches of smoother stone catch the key
             // light and the elemental glows, the rest stays matte.
             float polish = smoothstep(0.3, 0.85, fbm3(vGroundWorld * 0.06 + 3.0) * 0.5 + 0.5);
             roughnessFactor *= mix(1.0, 0.45, polish * clamp(uSheen, 0.0, 1.0));
           }`
        );
    });

    const gSize = WORLD.groundSize;
    this.mesh = new Mesh(new PlaneGeometry(gSize, gSize, 1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'Ground';
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();

    this.group = this.mesh;
  }

  update(elapsed) {
    const env = settings.environment;
    this.uniforms.uTime.value = elapsed;
    this.uniforms.uFloorColor.value.copy(getColor(env.floorColor));
    this.uniforms.uFloorTint.value.copy(getColor(env.floorTint));
    this.uniforms.uShoreColor.value.copy(getColor(env.shoreColor || '#3d4a3a'));
    this.uniforms.uSheen.value = env.floorSheen;
    this.uniforms.uPool.value = env.floorPool;
    this.uniforms.uIslandR.value = WORLD.islandRadius;
    this.uniforms.uShoreBand.value = WORLD.shoreBand;
    this.uniforms.uShoreTint.value = WORLD.shoreTint;
    this.material.roughness = env.floorRoughness;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
