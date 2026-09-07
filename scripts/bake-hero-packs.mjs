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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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
  { src: 'hero_miya_2016.glb', pack: 'longbow', prefix: 'miya', note: 'bow/crossbow/gun' },
  { src: 'the_ancient.glb', pack: 'magic', prefix: 'ancient', note: 'caster' },
  { src: 'hero_old_rafaela.glb', pack: 'magic', prefix: 'rafa', note: 'caster' },
  { src: 'zaraki_kenpachi.glb', pack: 'sword_shield', prefix: 'ken', note: 'melee/motion' },
  { src: 'quincy_ichigo.glb', pack: 'longbow', prefix: 'ichi', note: 'bow' },
  { src: 'hero_estes_old_2016.glb', pack: 'magic', prefix: 'estes', note: 'caster' },
  { src: 'longhai.glb', pack: 'sword_shield', prefix: 'longhai', note: 'melee' },
  {
    src: 'one_piece_bounty_rush_adio.glb',
    pack: 'reactions',
    prefix: 'op',
    note: 'one-piece dash/hit/knockback',
    keep: /dodge|boost|damage|blownback|down|stun|slammed/
  },
  {
    src: 'roronoa_zoro_post_timeskip.glb',
    pack: '2h_melee',
    prefix: 'zoro',
    note: 'dagger + 2H',
    keep: /^(3001|3003|3011|3012|3021|3022|3031|3032|3041|3042|3051|3052)_/
  },
];

/** Skip author hold-pose / transition stubs — they break blend if bound as attacks. */
const MIN_PLAY_DUR = 0.35;

/** 22 Toon play bones (public/api/v1/bip001-play-bones.json). */
const PLAY_CORE = [
  'Bip001 Pelvis',
  'Bip001 Spine',
  'Bip001 Spine1',
  'Bip001 Spine2',
  'Bip001 Neck',
  'Bip001 Head',
  'Bip001 L Clavicle',
  'Bip001 L UpperArm',
  'Bip001 L Forearm',
  'Bip001 L Hand',
  'Bip001 R Clavicle',
  'Bip001 R UpperArm',
  'Bip001 R Forearm',
  'Bip001 R Hand',
  'Bip001 L Thigh',
  'Bip001 L Calf',
  'Bip001 L Foot',
  'Bip001 L Toe0',
  'Bip001 R Thigh',
  'Bip001 R Calf',
  'Bip001 R Foot',
  'Bip001 R Toe0'
];

/** Extra play aliases (sanitize 22-bone). Keys = `${prefix}_${stem(anim.name)}`. */
const PLAY_ALIASES = {
  ken_commonattack: ['sword_shield/ken_strike', '2h_melee/ken_strike'],
  ken_strike_1: ['sword_shield/ken_slash', '2h_melee/ken_slash'],
  ken_attack_3: ['sword_shield/ken_hit3', '2h_melee/ken_hit3'],
  ken_run: ['sword_shield/ken_run', '2h_melee/ken_run'],
  ichi_commonattack: ['longbow/ichi_shot'],
  ichi_skill_1_1: ['magic/ichi_cast', 'magic/ichi_skill1'],
  ichi_skill_1_3: ['magic/ichi_skill'],
  estes_attack1: ['magic/estes_cast'],
  estes_attack2: ['magic/estes_attack'],
  estes_skill1: ['magic/estes_skill'],
  estes_skill2: ['magic/estes_skill2'],
  estes_skill3: ['magic/estes_skill3'],
  estes_fight_idle: ['magic/estes_idle'],
  estes_run: ['magic/estes_run'],
  estes_verigo: ['magic/estes_verigo'],
  longhai_attack: ['sword_shield/hai_strike'],
  longhai_wait: ['sword_shield/hai_idle'],
  longhai_walk: ['sword_shield/hai_walk'],
  longhai_use_skill: ['sword_shield/hai_skill'],
  longhai_use_skill2: ['sword_shield/hai_skill2'],
  longhai_use_magic: ['sword_shield/hai_cast'],
  op_pl_adio_orig01_dodge: ['combat_mobility/op_dash'],
  op_pl_adio_orig01_boost: ['combat_mobility/op_boost'],
  op_pl_adio_orig01_damage: ['reactions/op_hit'],
  op_pl_adio_orig01_blownback_end: ['reactions/op_knockback'],
  op_pl_adio_orig01_blownback_lp: ['reactions/op_blown'],
  op_pl_adio_orig01_down: ['reactions/op_down'],
  op_pl_adio_orig01_down_end: ['reactions/op_getup'],
  op_pl_adio_orig01_stun: ['reactions/op_stun'],
  op_pl_adio_orig01_slammed: ['reactions/op_slammed'],
  zoro_3021_low: ['sword_shield/zoro_dag1'],
  zoro_3022_low: ['sword_shield/zoro_dag2'],
  zoro_3031_low: ['sword_shield/zoro_dag3'],
  zoro_3042_low: ['sword_shield/zoro_dag_fast'],
  zoro_3001_low: ['2h_melee/zoro_strike'],
  zoro_3011_low: ['2h_melee/zoro_slash'],
  zoro_3003_low: ['2h_melee/zoro_hit3'],
  zoro_3041_low: ['2h_melee/zoro_heavy'],
  zoro_3052_low: ['2h_melee/zoro_skill']
};

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

function resolveSrc(name) {
  const cands = [
    join(DOCS, name),
    join('D:', 'Games', 'Models', name)
  ];
  return cands.find((p) => existsSync(p)) || join(DOCS, name);
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

function sanitizePlay(clip, playName) {
  const by = new Map();
  for (const t of clip.tracks || []) {
    if (t.type !== 'quaternion') continue;
    const b = String(t.name).replace(/\.quaternion$/, '');
    if (PLAY_CORE.includes(b) && !by.has(b)) {
      by.set(b, { ...t, name: `${b}.quaternion`, type: 'quaternion' });
    }
  }
  if (!by.has('Bip001 Spine2') && by.has('Bip001 Spine1')) {
    const s1 = by.get('Bip001 Spine1');
    by.set('Bip001 Spine2', { ...s1, name: 'Bip001 Spine2.quaternion' });
  }
  const tracks = PLAY_CORE.filter((b) => by.has(b)).map((b) => by.get(b));
  return { name: playName, duration: clip.duration, tracks };
}

function writeNamedClip(rel, clip) {
  const [pack, file] = rel.split('/');
  mkdirSync(join(BAKED, pack), { recursive: true });
  writeFileSync(join(BAKED, pack, `${file}.json`), JSON.stringify({ ...clip, name: rel }));
}

const manifest = { generated: new Date().toISOString(), clips: [] };

const only = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.mjs'));

for (const job of JOBS) {
  if (
    only.length &&
    !only.some((x) => job.src.toLowerCase().includes(x.toLowerCase()) || job.prefix === x)
  ) {
    continue;
  }
  const src = resolveSrc(job.src);
  const { json, bin } = readGlb(src);
  const anims = json.animations || [];
  console.log(`==== ${job.src} ${anims.length} clips → ${job.pack}/${job.prefix}_* (${job.note})`);
  mkdirSync(join(BAKED, job.pack), { recursive: true });
  for (const anim of anims) {
    const clip = bakeAnim(json, bin, anim);
    const roleStem = stem(anim.name);
    const fileStem = `${job.prefix}_${roleStem}`;
    if (job.keep && !job.keep.test(roleStem) && !PLAY_ALIASES[fileStem]) {
      continue;
    }
    if (clip.duration < MIN_PLAY_DUR) {
      console.log(`  skip stub ${fileStem} dur=${clip.duration.toFixed(2)}`);
      continue;
    }
    let pack = job.pack;
    if (job.prefix === 'ichi' && /^(skill|cast|take_001|fbx_)/.test(roleStem)) pack = 'magic';
    mkdirSync(join(BAKED, pack), { recursive: true });
    clip.name = `${pack}/${fileStem}`;
    writeFileSync(join(BAKED, pack, `${fileStem}.json`), JSON.stringify(clip));
    console.log(
      `  ok ${fileStem} → ${pack} dur=${clip.duration.toFixed(2)} tracks=${clip.tracks.length} pelvis=${clip.pelvis} hands=${clip.hands}`
    );
    manifest.clips.push({
      src: job.src,
      pack,
      file: `${pack}/${fileStem}.json`,
      role: roleStem,
      duration: clip.duration,
      tracks: clip.tracks.length,
      pelvis: clip.pelvis,
      hands: clip.hands,
    });
    const aliases = PLAY_ALIASES[fileStem];
    if (aliases) {
      for (const rel of aliases) {
        const play = sanitizePlay(clip, rel);
        if (play.tracks.length < 18) {
          console.log(`  skip alias ${rel} tracks=${play.tracks.length}`);
          continue;
        }
        writeNamedClip(rel, play);
        console.log(`  alias ${rel} tracks=${play.tracks.length}`);
      }
    }
  }
}

writeFileSync(join(BAKED, 'hero-packs-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('wrote hero-packs-manifest.json', manifest.clips.length, 'clips');
