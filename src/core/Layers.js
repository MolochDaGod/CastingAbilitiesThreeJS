/**
 * Three.js **render** layers (camera mask bits). One system only.
 *
 * | Bit | Name        | Who |
 * |-----|-------------|-----|
 * | 0   | WORLD       | Terrain, water, props, character body |
 * | 1   | VFX         | Abilities, particles, trails |
 * | 2   | DISTORTION  | Heat/refraction proxies (distortion prepass only) |
 * | 3   | CONTACT     | Character flag for contact-shadow pass |
 *
 * Camera default sees 0; CameraRig also enables VFX (1).
 * Character = WORLD + CONTACT (mask 9). Depth prepass = WORLD only.
 *
 * **Not the same as** `TERRAIN_LAYER` L0–L3 in `terrainLayers.js`
 * (authoring labels: height / surface / vegetation / detail — not camera bits).
 * **Not** HTML dummy overhead bars (`OverheadNameplates`) — those are DOM, not layers.
 *
 * Do not invent a second Layer enum or dual cameras for combat.
 */
export const LAYER = Object.freeze({
  WORLD: 0,
  VFX: 1,
  DISTORTION: 2,
  CONTACT: 3
});

/** Put an object and all of its descendants on a single layer. */
export function setLayerRecursive(object, layer) {
  object.traverse((node) => node.layers.set(layer));
  return object;
}

/** Enable WORLD+VFX on a camera (main combat / lab view). */
export function enableMainCameraLayers(camera) {
  if (!camera?.layers) return camera;
  camera.layers.enable(LAYER.WORLD);
  camera.layers.enable(LAYER.VFX);
  return camera;
}
