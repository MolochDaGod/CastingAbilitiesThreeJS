/**
 * Warlords locomotion debug — graphical laterality + math blend/bone log.
 *
 * One mixer only. Toggle: settings.character.rigDebug (Editor → Character).
 * Does not invent a second controller, mixer, or combat hotkey.
 *
 * @see docs/ANIM_LIBRARY_SSOT.md · skill grudge-warlords-laterality
 */
import {
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  SkeletonHelper,
  SphereGeometry,
  Vector3
} from 'three';
import { settings } from '../config/settings.js';
import { diagnoseCharacterLook } from '../character/toonKitPlay.js';
import { classifyRole } from '../config/animLibrary.js';
import '../ui/anim-rig-debug.css';

const _w = new Vector3();
const _local = new Vector3();

const BONE_MARKS = [
  { names: ['Bip001 Pelvis', 'Bip001_Pelvis', 'Pelvis'], id: 'pelvis', color: 0xf5c518 },
  { names: ['Bip001 Head', 'Bip001_Head', 'Head'], id: 'head', color: 0xffffff },
  { names: ['Bip001 L Foot', 'Bip001_L_Foot'], id: 'footL', color: 0x5ec8ff },
  { names: ['Bip001 R Foot', 'Bip001_R_Foot'], id: 'footR', color: 0x5ec8ff },
  { names: ['R_hand_container', 'Bip001 R Hand', 'Bip001_R_Hand'], id: 'handR', color: 0x62e07a },
  { names: ['L_hand_container', 'Bip001 L Hand', 'Bip001_L_Hand'], id: 'handL', color: 0x62e07a }
];

function findNamed(root, names) {
  if (!root) return null;
  for (const n of names) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

function worldOf(obj, out = _w) {
  if (!obj) return null;
  obj.getWorldPosition(out);
  return { x: out.x, y: out.y, z: out.z };
}

function localOf(root, obj) {
  if (!root || !obj) return null;
  obj.getWorldPosition(_w);
  root.worldToLocal(_local.copy(_w));
  return { x: _local.x, y: _local.y, z: _local.z };
}

function fmt(v, n = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(n);
}

/** Directional-box laterality (character local +X right / −X left / +Z forward). */
export function lateralityReport(root, bones = {}) {
  const rObj =
    bones.rHand ||
    findNamed(root, ['R_hand_container', 'Bip001 R Hand', 'Bip001_R_Hand']);
  const lObj =
    bones.lHand ||
    findNamed(root, ['L_hand_container', 'Bip001 L Hand', 'Bip001_L_Hand']);
  const R = localOf(root, rObj);
  const L = localOf(root, lObj);
  const okR = !!R && R.x > 0.06;
  const okL = !!L && L.x < -0.06;
  const gut = !!(R && L && Math.abs(R.x) < 0.04 && Math.abs(L.x) < 0.04);
  const swapped = !!(R && L && R.x < 0 && L.x > 0);
  const errors = [];
  if (!R) errors.push('no-r-hand');
  if (!L) errors.push('no-l-hand');
  if (swapped) errors.push('hands-swapped');
  if (gut) errors.push('gut-collapse');
  if (R && !okR && !swapped) errors.push('r-hand-not-right');
  if (L && !okL && !swapped) errors.push('l-hand-not-left');
  return {
    R,
    L,
    ok: okR && okL && !gut && !swapped,
    okR,
    okL,
    gut,
    swapped,
    errors
  };
}

/** Running mixer actions — name, weight, time, duration. */
export function blendSnapshot(actions) {
  const rows = [];
  let weightSum = 0;
  if (!actions) return { rows, weightSum, fighting: false };
  for (const [name, act] of actions) {
    let w = 0;
    let running = false;
    try {
      w = act.getEffectiveWeight?.() ?? act.weight ?? 0;
      running = !!(act.isRunning?.() || w > 0.02);
    } catch {
      continue;
    }
    if (!running) continue;
    const clip = act.getClip?.();
    weightSum += w;
    rows.push({
      name,
      family: classifyRole(name).family,
      channel: classifyRole(name).channel,
      weight: w,
      time: act.time || 0,
      duration: clip?.duration || 0,
      timeScale: act.timeScale || 1,
      loop: act.loop
    });
  }
  rows.sort((a, b) => b.weight - a.weight);
  return { rows, weightSum, fighting: weightSum > 2.2 };
}

export function boneTable(root) {
  const out = {};
  for (const m of BONE_MARKS) {
    const o = findNamed(root, m.names);
    const w = worldOf(o);
    out[m.id] = w
      ? { name: o.name, x: w.x, y: w.y, z: w.z, local: localOf(root, o) }
      : null;
  }
  return out;
}

/**
 * Breaking-anim flags: hip-float, laterality, blend fight, inverted rig.
 */
export function diagnoseBreaking(character, terrainY = 0) {
  const root = character?.model || character?.root;
  const look = root ? diagnoseCharacterLook(root, terrainY) : { ok: false, errors: ['no-root'] };
  const lat = lateralityReport(root, character?.bones || {});
  const blend = blendSnapshot(character?.actions);
  const bones = boneTable(root);
  const flags = [];
  if (!look.ok) flags.push(...(look.errors || ['look']));
  if (!lat.ok) flags.push(...lat.errors);
  if (blend.fighting) flags.push(`blend-fight sum=${blend.weightSum.toFixed(2)}`);
  const footY = Math.min(bones.footL?.y ?? Infinity, bones.footR?.y ?? Infinity);
  if (Number.isFinite(footY) && Math.abs(footY - terrainY) > 0.12) {
    flags.push(`hip-float feetY=${footY.toFixed(3)} terrain=${terrainY.toFixed(3)}`);
  }
  return {
    ok: flags.length === 0,
    flags,
    look,
    laterality: lat,
    blend,
    bones,
    pack: character?.animPackId || null,
    state: character?.animState || null,
    gait: character?._gait ?? null,
    terrainY,
    footY: Number.isFinite(footY) ? footY : null
  };
}

function wireBox(w, h, d, color, opacity = 0.12) {
  const mesh = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      wireframe: true
    })
  );
  mesh.frustumCulled = false;
  mesh.userData.rigDebug = true;
  return mesh;
}

function marker(color) {
  const m = new Mesh(
    new SphereGeometry(0.035, 10, 8),
    new MeshBasicMaterial({ color, depthTest: true })
  );
  m.frustumCulled = false;
  m.userData.rigDebug = true;
  return m;
}

/**
 * Graphical helpers + HUD math overlay. Attach after kit load.
 */
export class AnimRigDebug {
  /**
   * @param {import('./CharacterController.js').CharacterController} character
   */
  constructor(character) {
    this.character = character;
    this.enabled = false;
    this._helper = null;
    this._boxes = null;
    this._markers = [];
    this._hud = null;
    this._logAcc = 0;
    this._lastFlags = '';
    this._groupParent = null;
  }

  syncEnabled() {
    if (typeof location !== 'undefined' && /[?&]rigDebug=1/.test(location.search)) {
      settings.character = settings.character || {};
      settings.character.rigDebug = true;
    }
    const on = !!settings.character?.rigDebug;
    if (on !== this.enabled) this.setEnabled(on);
    return this.enabled;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.enabled) this._mount();
    else this._unmount();
  }

  _mount() {
    const kit = this.character?.model;
    const root = this.character?.root;
    if (!kit || !root) return;
    this._unmount();

    const scene = root.parent || root;
    this._groupParent = scene;
    try {
      this._helper = new SkeletonHelper(kit);
      this._helper.name = 'AnimRigSkeleton';
      this._helper.frustumCulled = false;
      scene.add(this._helper);
    } catch {
      this._helper = null;
    }

    // Local laterality boxes on the kit (character space)
    this._boxes = {
      right: wireBox(0.39, 1.3, 1.1, 0x3cff7a, 0.22),
      left: wireBox(0.39, 1.3, 1.1, 0x5ec8ff, 0.22),
      gut: wireBox(0.08, 0.8, 0.25, 0xff4d4d, 0.35)
    };
    this._boxes.right.position.set(0.255, 1.2, 0.3);
    this._boxes.left.position.set(-0.255, 1.2, 0.3);
    this._boxes.gut.position.set(0, 1.0, 0.02);
    kit.add(this._boxes.right, this._boxes.left, this._boxes.gut);

    this._markers = [];
    for (const spec of BONE_MARKS) {
      const bone = findNamed(kit, spec.names);
      if (!bone) continue;
      const s = marker(spec.color);
      s.name = `rigMark_${spec.id}`;
      bone.add(s);
      this._markers.push({ spec, bone, mesh: s });
    }

    this._ensureHud();
  }

  _unmount() {
    if (this._helper) {
      this._helper.parent?.remove(this._helper);
      this._helper.geometry?.dispose?.();
      this._helper.material?.dispose?.();
      this._helper = null;
    }
    if (this._boxes) {
      for (const m of Object.values(this._boxes)) {
        m.parent?.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
      }
      this._boxes = null;
    }
    for (const mk of this._markers) {
      mk.mesh.parent?.remove(mk.mesh);
      mk.mesh.geometry?.dispose?.();
      mk.mesh.material?.dispose?.();
    }
    this._markers = [];
    if (this._hud) {
      this._hud.remove();
      this._hud = null;
    }
  }

  _ensureHud() {
    if (this._hud || typeof document === 'undefined') return;
    const el = document.createElement('pre');
    el.id = 'anim-rig-debug';
    el.className = 'anim-rig-debug';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this._hud = el;
  }

  /**
   * Call after mixer.update + hold-pose.
   * @param {number} dt
   * @param {{ terrainY?: number }} [opts]
   */
  update(dt, opts = {}) {
    this.syncEnabled();
    if (!this.enabled) return;
    const terrainY = Number.isFinite(opts.terrainY) ? opts.terrainY : 0;
    const report = diagnoseBreaking(this.character, terrainY);
    this._paintMarkers(report);
    this._paintHud(report);
    this._maybeLog(dt, report);
  }

  _paintMarkers(report) {
    const latOk = report.laterality.ok;
    for (const mk of this._markers) {
      if (mk.spec.id === 'handR' || mk.spec.id === 'handL') {
        mk.mesh.material.color = new Color(latOk ? 0x62e07a : 0xff3344);
      }
    }
    if (this._boxes?.gut) {
      this._boxes.gut.material.opacity = report.laterality.gut || report.laterality.swapped ? 0.55 : 0.18;
    }
  }

  _paintHud(report) {
    if (!this._hud) return;
    const b = report.blend;
    const lines = [
      `ANIM RIG  ${report.ok ? 'OK' : 'BREAK'}  pack=${report.pack}  state=${report.state}  gait=${report.gait}`,
      `blend Σ=${fmt(b.weightSum)}${b.fighting ? '  FIGHT' : ''}  clips=${b.rows.length}`
    ];
    for (const r of b.rows.slice(0, 8)) {
      lines.push(
        `  ${r.name.padEnd(22)} w=${fmt(r.weight)}  t=${fmt(r.time)}/${fmt(r.duration)}  ${r.family}/${r.channel}`
      );
    }
    const R = report.laterality.R;
    const L = report.laterality.L;
    lines.push(
      `R hand local ${R ? `${fmt(R.x, 3)} ${fmt(R.y, 3)} ${fmt(R.z, 3)}` : '—'}  ${report.laterality.okR ? 'RIGHT' : 'FAIL'}`
    );
    lines.push(
      `L hand local ${L ? `${fmt(L.x, 3)} ${fmt(L.y, 3)} ${fmt(L.z, 3)}` : '—'}  ${report.laterality.okL ? 'LEFT' : 'FAIL'}`
    );
    const pel = report.bones.pelvis;
    lines.push(
      `pelvisY ${fmt(pel?.y, 3)}  feetY ${fmt(report.footY, 3)}  terrain ${fmt(report.terrainY, 3)}  Δ ${fmt((report.footY ?? 0) - report.terrainY, 3)}`
    );
    if (report.flags.length) lines.push(`FLAGS  ${report.flags.join(' · ')}`);
    this._hud.textContent = lines.join('\n');
    this._hud.classList.toggle('is-break', !report.ok);
  }

  _maybeLog(dt, report) {
    if (!settings.character?.blendLog) return;
    this._logAcc += dt;
    const key = report.flags.join('|') || 'ok';
    if (key !== this._lastFlags || this._logAcc > 2.5) {
      this._lastFlags = key;
      this._logAcc = 0;
      console.info('[animRig]', {
        ok: report.ok,
        flags: report.flags,
        pack: report.pack,
        state: report.state,
        blend: report.blend.rows.map((r) => `${r.name}:${r.weight.toFixed(2)}`),
        laterality: report.laterality.errors,
        feetY: report.footY,
        terrainY: report.terrainY
      });
    }
  }

  dispose() {
    this.setEnabled(false);
  }
}
