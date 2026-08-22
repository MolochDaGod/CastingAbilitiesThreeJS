/**
 * TPS pistol prop on R_hand_container.
 *
 * Minecraft TPS clips play on the pistol group via MeshMixer (vehicle law) —
 * never retargeted onto Bip001 / never a second mixer on the Toon kit.
 */
import { sameOriginFleetUrl } from '../config/fleetEnv.js';
import { MeshMixer } from './meshMixer.js';

export const TPS_PISTOL_MESH_URL = './models/weapons/t0-tps-pistol.glb';
export const TPS_PISTOL_CDN_URL = sameOriginFleetUrl(
  'https://assets.grudge-studio.com/models/weapons/t0-tps-pistol.glb'
);

const CLIP_BY_ROLE = Object.freeze({
  attack: 'fireaim',
  gunplay: 'fireaim',
  fireaim: 'fireaim',
  fire: 'fire',
  draw: 'draw',
  drawaim: 'drawaim',
  cast: 'drawnidle',
  idle: 'drawnidle',
  reload: 'draw'
});

export function isTpsPistolUrl(url) {
  return /t0-tps-pistol|minecraft_tps/i.test(String(url || ''));
}

/**
 * Bind TPS clips onto the attached pistol holder (prop mixer, not body mixer).
 * @param {import('three').Object3D} holder
 * @param {{ animations?: import('three').AnimationClip[] }} gltf
 */
export function bindTpsPistolProp(holder, gltf) {
  if (!holder || !gltf?.animations?.length) return null;
  const meshMixer = new MeshMixer(holder);
  for (const clip of gltf.animations) {
    const name = String(clip.name || '').toLowerCase();
    const once = /draw|fire/.test(name);
    meshMixer.addClip(clip, name, { once });
  }
  holder.userData.tpsPistol = {
    meshMixer,
    mixer: meshMixer.mixer,
    actions: meshMixer.actions
  };
  meshMixer.play('drawnidle', 0.08) || meshMixer.play('idle', 0.08);
  return holder.userData.tpsPistol;
}

export function playTpsPistolClip(holder, roleOrClip) {
  const tps = holder?.userData?.tpsPistol;
  if (!tps?.meshMixer) return false;
  const want = String(CLIP_BY_ROLE[roleOrClip] || roleOrClip || 'fireaim').toLowerCase();
  return tps.meshMixer.play(want, 0.06);
}

export function updateTpsPistolProp(holder, dt) {
  holder?.userData?.tpsPistol?.meshMixer?.update(dt);
}
