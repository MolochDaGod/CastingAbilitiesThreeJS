#!/usr/bin/env node
/**
 * Bake hero GLBs (already Bip001, Noesis _N suffixes) → rotation-only JSON.
 * Hip ROTATION kept (Bip001 Pelvis). Hip/root POSITION stripped (grounded Toon).
 * Play mesh never loads these hero bodies.
 *
 *   drake.glb          → sword_shield/drake_*   (1H)
 *   hero_old_clint.glb → pistol/clint_*         (pistol)
 *   hero_old_bane.glb  → 2h_melee/bane_*        (2H)
 *   hero_hayabusa.glb  → sword_shield/haya_*    (1H ninja)
 *
 *   node scripts/bake-hero-packs.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MIXAMO_CORE_TO_BIP001, BANDAI_TO_BIP001 } from '../src/animation/retargetToBip001.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(process.env.USERPROFILE || 'C:\\Users\\nugye', 'Documents');
const BAKED = join(ROOT, 'public', 'anims', 'baked');
const DROP_NODE = /rootjoint|footsteps|^e_|^b_bone|^p_|object_|sphere|weapon|nub$|headtop|xtra/i;

const JOBS = [
  { src: 'drake.glb', pack: 'sword_shield', prefix: 'drake', note: '1H' },
  { src: 'hero_old_clint.glb', pack: 'pistol', prefix: 'clint', note: 'pistol' },
  { src: 'hero_old_bane.glb', pack: '2h_melee', prefix: 'bane', note: '2H' },
  { src: 'hero_hayabusa.glb', pack: 'sword_shield', prefix: 'haya', note: '1H' },
];

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

function stem(name) {
  return String(name || 'clip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
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

function bakeAnim(json, bin, anim) {
  const nodes = json.nodes || [];
  const tracks = [];
  let duration = 0;
  let pelvis = false;
  let hands = 0;
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
    if (/Pelvis/i.test(bip)) pelvis = true;
    if (/Hand\.quaternion$/i.test(`${bip}.quaternion`)) hands += 1;
  }
  if (!tracks.length) throw new Error('no Bip001 rotation tracks');
  return { name: anim.name || 'clip', duration, tracks, pelvis, hands };
}

const manifest = { generated: new Date().toISOString(), clips: [] };

for (const job of JOBS) {
  const src = join(DOCS, job.src);
  const { json, bin } = readGlb(src);
  const anims = json.animations || [];
  console.log(`==== ${job.src} ${anims.length} clips → ${job.pack}/${job.prefix}_* (${job.note})`);
  mkdirSync(join(BAKED, job.pack), { recursive: true });
  for (const anim of anims) {
    const clip = bakeAnim(json, bin, anim);
    const fileStem = `${job.prefix}_${stem(anim.name)}`;
    clip.name = `${job.pack}/${fileStem}`;
    writeFileSync(join(BAKED, job.pack, `${fileStem}.json`), JSON.stringify(clip));
    console.log(
      `  ok ${fileStem} dur=${clip.duration.toFixed(2)} tracks=${clip.tracks.length} pelvis=${clip.pelvis} hands=${clip.hands}`
    );
    manifest.clips.push({
      src: job.src,
      pack: job.pack,
      file: `${job.pack}/${fileStem}.json`,
      role: stem(anim.name),
      duration: clip.duration,
      tracks: clip.tracks.length,
      pelvis: clip.pelvis,
      hands: clip.hands,
    });
  }
}

writeFileSync(join(BAKED, 'hero-packs-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('wrote hero-packs-manifest.json', manifest.clips.length, 'clips');
