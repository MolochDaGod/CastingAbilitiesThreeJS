import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { noiseGLSL } from '../shaders/lib/noise.glsl.js';
import { LAYER } from '../core/Layers.js';
import { WORLD } from '../config/worldScale.js';

/**
 * The stage floor.
 *
 * Kept perfectly flat (y = 0) on purpose: the path-drawing raycast, every
 * ability and the earth eruptions all assume a planar surface, and a flat plane
 * makes those interactions exact.
 *
 * Visually this is a dark polished slab rather than grass and soil — the whole
 * scene is lit like a stage, so the floor only has to hold shadows, catch a thin
 * specular sheen from the key light and then fall off into the fog colour. All
 * of that is procedural, so it still costs no geometry: broad mottling, fine
 * grain, a radial light pool centred on the stage, and a roughness break-up
 * that turns the sheen into scattered highlights instead of a mirror.
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
      uSheen: { value: settings.environment.floorSheen },
      uPool: { value: settings.environment.floorPool },
      uTime: { value: 0 }
    };

    environment.registerShadowCasterWithPatch(this.material, (shader) => {
      shader.uniforms.uFloorColor = this.uniforms.uFloorColor;
      shader.uniforms.uFloorTint = this.uniforms.uFloorTint;
      shader.uniforms.uSheen = this.uniforms.uSheen;
      shader.uniforms.uPool = this.uniforms.uPool;
      shader.uniforms.uTime = this.uniforms.uTime;

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
           uniform float uSheen;
           uniform float uPool;
           uniform float uTime;
           ${noiseGLSL}`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           {
             vec3 wp = vGroundWorld;

             // Broad, deliberately smooth variation — dark stone with a warmer
             // wash drifting through it. Anything higher frequency than this
             // reads as gravel and fights the clean stage look.
             float macro = fbm3(wp * 0.018);
             float tintMask = smoothstep(-0.5, 0.6, macro);
             vec3 base = mix(uFloorColor, uFloorTint, tintMask * 0.5);

             // Faint patina. Both terms are multiplicative and low frequency on
             // purpose: an additive or fine-grained term is a small number in
             // absolute terms but a *large* fraction of a floor this dark, and
             // it immediately reads as gravel.
             base *= 1.0 + fbm3(wp * 0.09 + 11.0) * 0.05;
             base *= 1.0 + (snoise01(wp * 0.7) - 0.5) * 0.06;

             // Radial light pool — extents from WORLD SI scale (2 m hero yardstick)
             float dist = length(wp.xz);
             float poolOuter = ${WORLD.floorPoolOuter.toFixed(1)};
             float poolInner = ${WORLD.floorPoolInner.toFixed(1)};
             float pool = mix(1.0, smoothstep(poolOuter, poolInner, dist), clamp(uPool, 0.0, 1.0));
             base *= mix(0.18, 1.0, pool);

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
    this.uniforms.uSheen.value = env.floorSheen;
    this.uniforms.uPool.value = env.floorPool;
    this.material.roughness = env.floorRoughness;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
