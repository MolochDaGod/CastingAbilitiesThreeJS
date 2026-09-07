#!/usr/bin/env node
/**
 * Bake Mixamo / humanoid FBX onto the **one** play skeleton: Bip001.
 *
 * 1. Blender FBX → GLB (animations, no play mesh)
 * 2. Rotation channels only, mixamorig* renamed to Bip001
 * 3. JSON under public/anims/baked/{pack}/
 *
 * Runtime still uses SkeletonUtils.retargetClip in fbxClip.js when FBX is live.
 * Production prefers these JSON clips (one mixer, Toon loadRaceKit).
 *
 *   node scripts/bake-mixamo-to-bip001.mjs
 *   node scripts/bake-mixamo-to-bip001.mjs --pack rifle --force
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIXAMO_CORE_TO_BIP001, BANDAI_TO_BIP001 } from '../src/animation/retargetToBip001.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANIM = join(ROOT, 'public', 'anim');
const BAKED = join(ROOT, 'public', 'anims', 'baked');
const TMP = join(ROOT, 'tmp', 'mixamo-glb');
const BLENDER =
  process.env.BLENDER_PATH ||
  'C:\\Users\\nugye\\tools\\Blender\\blender.exe';
const FORCE = process.argv.includes('--force');
const PACK_ONLY = (() => {
  const i = process.argv.indexOf('--pack');
  return i >= 0 ? process.argv[i + 1] : '';
})();

const FOLDER_PACK = {
  rifle: 'rifle',
  pistol: 'pistol',
  unarmed: 'unarmed',
  greatsword: '2h_melee',
  melee: 'sword_shield',
  locomotion: 'locomotion',
};

function walkFbx(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFbx(p, acc);
    else if (name.toLowerCase().endsWith('.fbx')) acc.push(p);
  }
  return acc;
}

function stemOf(file) {
  return file
    .replace(/\.fbx$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toBip001Node(nodeName) {
  let n = String(nodeName || '').replace(/_\d+$/, '');
  if (BANDAI_TO_BIP001[n]) return BANDAI_TO_BIP001[n];
  const spaced = n.replace(/_/g, ' ');
  if (BANDAI_TO_BIP001[spaced]) return BANDAI_TO_BIP001[spaced];
  n = n.replace(/^mixamorig\d*:?/i, '');
  if (MIXAMO_CORE_TO_BIP001[n]) return MIXAMO_CORE_TO_BIP001[n];
  if (/^Bip001/i.test(n)) return n.replace(/_/g, ' ').replace(/^Bip001 /, 'Bip001 ');
  if (/^Bip001/i.test(n.replace(/_/g, ' '))) return n.replace(/_/g, ' ');
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
    const bip = toBip001Node(node?.name || '');
    if (!bip) continue;
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

function fbxToGlb(fbxPath, glbPath) {
  if (!existsSync(BLENDER)) throw new Error(`Blender missing: ${BLENDER}`);
  mkdirSync(dirname(glbPath), { recursive: true });
  const py = join(TMP, '_fbx2glb.py');
  writeFileSync(
    py,
    [
      'import bpy, sys',
      'fbx, glb = sys.argv[-2], sys.argv[-1]',
      'bpy.ops.wm.read_factory_settings(use_empty=True)',
      'bpy.ops.import_scene.fbx(filepath=fbx)',
      'bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_animations=True, export_skins=True)',
    ].join('\n')
  );
  const res = spawnSync(BLENDER, ['-b', '-P', py, '--', fbxPath, glbPath], {
    encoding: 'utf8',
    timeout: 120000,
  });
  if (res.status !== 0 || !existsSync(glbPath)) {
    throw new Error(`blender fbx2glb failed (${res.status}): ${(res.stderr || '').slice(-400)}`);
  }
}

const files = walkFbx(ANIM).filter((p) => {
  if (!PACK_ONLY) return true;
  return relative(ANIM, p).split(sep)[0] === PACK_ONLY;
});

console.log(`blender ${BLENDER}`);
console.log(`fbx ${files.length}`);
mkdirSync(TMP, { recursive: true });

let ok = 0;
let skip = 0;
let fail = 0;

for (const file of files) {
  const rel = relative(ANIM, file);
  const folder = rel.split(sep)[0];
  const pack = FOLDER_PACK[folder] || folder;
  const stem = stemOf(rel.split(sep).pop());
  const outDir = join(BAKED, pack);
  const out = join(outDir, `${stem}.json`);
  if (!FORCE && existsSync(out)) {
    skip += 1;
    console.log('SKIP', `${pack}/${stem}.json`);
    continue;
  }
  const glb = join(TMP, `${pack}-${stem}.glb`);
  try {
    fbxToGlb(file, glb);
    const { json, bin } = readGlb(glb);
    const clip = bakeClip(json, bin);
    clip.name = `${pack}/${stem}`;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(out, JSON.stringify(clip));
    const hands = clip.tracks.filter((t) => /Hand\.quaternion$/i.test(t.name)).length;
    console.log(
      'OK',
      `${pack}/${stem}.json`,
      `dur=${clip.duration.toFixed(2)} tracks=${clip.tracks.length} hands=${hands}`
    );
    ok += 1;
    try {
      unlinkSync(glb);
    } catch {
      /* keep */
    }
  } catch (e) {
    fail += 1;
    console.error('FAIL', rel, e.message || e);
  }
}

console.log(JSON.stringify({ files: files.length, ok, skip, fail, force: FORCE }));
if (fail && !ok) process.exit(1);
