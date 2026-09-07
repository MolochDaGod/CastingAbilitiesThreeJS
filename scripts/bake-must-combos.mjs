#!/usr/bin/env node
/**
 * Must-have basic attacks → Bip001 rotation JSON (play body stays Toon).
 *
 *   C:\Users\nugye\Documents\attackcombo01.glb  Mixamo 3-hit melee
 *   C:\Users\nugye\Documents\attack_combo_2.glb Mixamo 2H basic
 *   C:\Users\nugye\Documents\attack3.glb        Bip01 spear attack
 *
 *   node scripts/bake-must-combos.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MIXAMO_CORE_TO_BIP001, BANDAI_TO_BIP001 } from '../src/animation/retargetToBip001.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(process.env.USERPROFILE || 'C:\\Users\\nugye', 'Documents');
const BAKED = join(ROOT, 'public', 'anims', 'baked');
const DROP_NODE = /rootjoint|footsteps|^e_|^b_bone|^p_|object_|sphere|weapon|nub$|headtop/i;

function toBip001Node(nodeName) {
  let n = String(nodeName || '').replace(/_\d+$/, '');
  if (BANDAI_TO_BIP001[n] || BANDAI_TO_BIP001[n.replace(/_/g, ' ')]) {
    return BANDAI_TO_BIP001[n] || BANDAI_TO_BIP001[n.replace(/_/g, ' ')];
  }
  n = n.replace(/^mixamorig\d*:?/i, '');
  if (MIXAMO_CORE_TO_BIP001[n]) return MIXAMO_CORE_TO_BIP001[n];
  if (/^Bip001/i.test(n)) return n.replace(/_/g, ' ');
  if (/^Bip01(?!\d)/i.test(n)) return n.replace(/^Bip01/i, 'Bip001').replace(/_/g, ' ');
  return '';
}

function readGlb(filePath) {
  const buf = readFileSync(filePath);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`Not GLB: ${filePath}`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binOff);
  const bin = buf.subarray(binOff + 8, binOff + 8 + binLen);
  return { json, bin };
}

function accessorArray(json, bin, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  const view = json.bufferViews[acc.bufferView];
  const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const componentType = acc.componentType;
  const comps = { 5126: 4, 5123: 2, 5121: 1, 5125: 4 }[componentType] || 4;
  const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type] || 1;
  const count = acc.count;
  const stride = view.byteStride || comps * nComp;
  const out = new Array(count * nComp);
  for (let i = 0; i < count; i++) {
    const o = offset + i * stride;
    for (let c = 0; c < nComp; c++) {
      if (componentType === 5126) out[i * nComp + c] = bin.readFloatLE(o + c * 4);
      else if (componentType === 5123) out[i * nComp + c] = bin.readUInt16LE(o + c * 2);
      else if (componentType === 5125) out[i * nComp + c] = bin.readUInt32LE(o + c * 4);
      else out[i * nComp + c] = bin[o + c];
    }
  }
  return { values: out, count, type: acc.type };
}

function continuityQuat(values) {
  const n = Math.floor(values.length / 4);
  for (let i = 1; i < n; i++) {
    const o = (i - 1) * 4;
    const c = i * 4;
    const dot =
      values[o] * values[c] +
      values[o + 1] * values[c + 1] +
      values[o + 2] * values[c + 2] +
      values[o + 3] * values[c + 3];
    if (dot < 0) {
      values[c] *= -1;
      values[c + 1] *= -1;
      values[c + 2] *= -1;
      values[c + 3] *= -1;
    }
  }
}

function bakeClip(json, bin) {
  const anim = (json.animations || [])[0];
  if (!anim) throw new Error('no animation');
  const nodes = json.nodes || [];
  const tracks = [];
  let duration = 0;
  for (const ch of anim.channels || []) {
    if (ch.target?.path !== 'rotation') continue;
    const node = nodes[ch.target.node];
    const rawName = node?.name || '';
    if (DROP_NODE.test(rawName.replace(/_\d+$/, ''))) continue;
    const bip = toBip001Node(rawName);
    if (!bip || !/^Bip001/i.test(bip)) continue;
    const samp = anim.samplers[ch.sampler];
    const timesA = accessorArray(json, bin, samp.input);
    const valsA = accessorArray(json, bin, samp.output);
    continuityQuat(valsA.values);
    duration = Math.max(duration, timesA.values[timesA.values.length - 1] || 0);
    tracks.push({
      name: `${bip}.quaternion`,
      times: timesA.values,
      values: valsA.values,
      type: 'quaternion',
    });
  }
  if (!tracks.length) throw new Error('no Bip001 rotation tracks');
  return { name: anim.name || 'clip', duration, tracks };
}

function slerp(a, b, t) {
  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot;
  }
  if (dot > 0.9995) {
    const ox = ax + t * (bx - ax);
    const oy = ay + t * (by - ay);
    const oz = az + t * (bz - az);
    const ow = aw + t * (bw - aw);
    const len = Math.hypot(ox, oy, oz, ow) || 1;
    return [ox / len, oy / len, oz / len, ow / len];
  }
  const th0 = Math.acos(Math.min(1, dot));
  const th = th0 * t;
  const s0 = Math.sin(th0 - th) / Math.sin(th0);
  const s1 = Math.sin(th) / Math.sin(th0);
  return [s0 * ax + s1 * bx, s0 * ay + s1 * by, s0 * az + s1 * bz, s0 * aw + s1 * bw];
}

function sampleQuat(times, values, t) {
  const n = times.length;
  if (t <= times[0]) return values.slice(0, 4);
  if (t >= times[n - 1]) return values.slice((n - 1) * 4, n * 4);
  for (let i = 1; i < n; i++) {
    if (t <= times[i]) {
      const u = (t - times[i - 1]) / Math.max(1e-6, times[i] - times[i - 1]);
      return slerp(values.slice((i - 1) * 4, i * 4), values.slice(i * 4, (i + 1) * 4), u);
    }
  }
  return values.slice(-4);
}

function sliceClip(clip, t0, t1, name) {
  const dur = Math.max(0.05, t1 - t0);
  const fps = 30;
  const frames = Math.max(2, Math.round(dur * fps) + 1);
  const tracks = [];
  for (const tr of clip.tracks) {
    const times = [];
    const values = [];
    for (let i = 0; i < frames; i++) {
      const u = i / (frames - 1);
      const t = t0 + u * dur;
      times.push(u * dur);
      values.push(...sampleQuat(tr.times, tr.values, t));
    }
    continuityQuat(values);
    tracks.push({ name: tr.name, times, values, type: 'quaternion' });
  }
  return { name, duration: dur, tracks };
}

function writeClip(pack, stem, clip) {
  const dir = join(BAKED, pack);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${stem}.json`);
  writeFileSync(dest, JSON.stringify(clip));
  const hands = clip.tracks.filter((t) => /Hand\.quaternion$/i.test(t.name)).length;
  console.log(
    `ok ${pack}/${stem} dur=${clip.duration.toFixed(2)} tracks=${clip.tracks.length} hands=${hands}`
  );
}

function bakeFile(srcName, pack, stem) {
  const { json, bin } = readGlb(join(DOCS, srcName));
  const clip = bakeClip(json, bin);
  clip.name = `${pack}/${stem}`;
  writeClip(pack, stem, clip);
  return clip;
}

function bakeThirds(srcName, pack, stemBase) {
  const full = bakeFile(srcName, pack, stemBase);
  const d = full.duration;
  const cuts = [0, d / 3, (2 * d) / 3, d];
  for (let i = 0; i < 3; i++) {
    const part = sliceClip(full, cuts[i], cuts[i + 1], `${pack}/${stemBase}-hit${i + 1}`);
    writeClip(pack, `${stemBase}-hit${i + 1}`, part);
  }
}

bakeThirds('attackcombo01.glb', 'sword_shield', 'combo01');
bakeThirds('attack_combo_2.glb', '2h_melee', 'combo2');
bakeFile('attack3.glb', 'spear', 'attack3');
bakeFile('attack3.glb', 'polearm', 'spear-attack3');
bakeFile('attack3.glb', '2h_melee', 'attack3');
console.log('must-combos baked onto Bip001');
