/**
 * Split element attack meshes for Casting lab:
 *  - assorted_rock_pack → rock-0..7 (earth pull / linear / aim)
 *  - bubbles_2 → bubble-0..5 sample frames (water / freeze VFX) — NOT whole 37MB pack
 *  - teleport_arrow → arrow-path (linear attack path)
 *  - arrow_curved → arrow-loft (throw / place / trap / summon)
 *
 * Usage: node scripts/split-element-attack-meshes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public/models/vfx');

const ROCK_DIAM = 0.55;
const BUBBLE_DIAM = 0.28;
const ARROW_PATH_LEN = 1.1;
const ARROW_LOFT_LEN = 0.95;

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not glb: ' + file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen;
  while (off % 4 !== 0) off++;
  let bin = Buffer.alloc(0);
  if (off + 8 <= buf.length) {
    const chunkLen = buf.readUInt32LE(off);
    bin = buf.slice(off + 8, off + 8 + chunkLen);
  }
  return { json, bin };
}

function writeGlb(json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  let binBuf = bin || Buffer.alloc(0);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0)]);
  const totalLen = 12 + 8 + jsonBuf.length + (binBuf.length ? 8 + binBuf.length : 0);
  const out = Buffer.alloc(totalLen);
  out.write('glTF', 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.write('JSON', 16);
  jsonBuf.copy(out, 20);
  if (binBuf.length) {
    const bo = 20 + jsonBuf.length;
    out.writeUInt32LE(binBuf.length, bo);
    out.write('BIN\0', bo + 4);
    binBuf.copy(out, bo + 8);
  }
  return out;
}

function mat4Compose(t = [0, 0, 0], r = null, s = [1, 1, 1]) {
  const [tx, ty, tz] = t;
  const [sx, sy, sz] = s;
  let x = 0,
    y = 0,
    z = 0,
    w = 1;
  if (r && r.length === 4) {
    x = r[0];
    y = r[1];
    z = r[2];
    w = r[3];
  }
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1
  ];
}

function mat4Mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function mat4TransformPoint(m, p) {
  const x = p[0],
    y = p[1],
    z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  ];
}

function nodeLocalMatrix(n) {
  if (n.matrix && n.matrix.length === 16) return n.matrix.slice();
  return mat4Compose(n.translation, n.rotation, n.scale);
}

function computeWorldMatrices(nodes) {
  const world = new Array(nodes.length);
  const childOf = new Map();
  nodes.forEach((n, i) => {
    for (const c of n.children || []) childOf.set(c, i);
  });
  function worldOf(i) {
    if (world[i]) return world[i];
    const local = nodeLocalMatrix(nodes[i] || {});
    const p = childOf.get(i);
    world[i] = p === undefined ? local : mat4Mul(worldOf(p), local);
    return world[i];
  }
  for (let i = 0; i < nodes.length; i++) worldOf(i);
  return world;
}

function accessorBounds(json, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  if (!acc?.min || !acc?.max) return null;
  return { min: acc.min.slice(0, 3), max: acc.max.slice(0, 3) };
}

function transformBounds(min, max, world) {
  const outMin = [Infinity, Infinity, Infinity];
  const outMax = [-Infinity, -Infinity, -Infinity];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const p = mat4TransformPoint(world, [x, y, z]);
        for (let k = 0; k < 3; k++) {
          outMin[k] = Math.min(outMin[k], p[k]);
          outMax[k] = Math.max(outMax[k], p[k]);
        }
      }
  return { min: outMin, max: outMax };
}

function compactBin(srcJson, srcBin, usedViewIndices) {
  const sorted = [...usedViewIndices].sort((a, b) => a - b);
  const chunks = [];
  const viewMap = new Map();
  let cursor = 0;
  const newViews = [];
  for (const vi of sorted) {
    const bv = srcJson.bufferViews[vi];
    const offset = bv.byteOffset || 0;
    const length = bv.byteLength;
    const pad = (4 - (cursor % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad, 0));
      cursor += pad;
    }
    chunks.push(srcBin.slice(offset, offset + length));
    viewMap.set(vi, newViews.length);
    newViews.push({
      buffer: 0,
      byteOffset: cursor,
      byteLength: length,
      ...(bv.byteStride !== undefined ? { byteStride: bv.byteStride } : {}),
      ...(bv.target !== undefined ? { target: bv.target } : {})
    });
    cursor += length;
  }
  return { bin: Buffer.concat(chunks.length ? chunks : [Buffer.alloc(0)]), newViews, viewMap };
}

function extractCluster(srcJson, srcBin, meshNodeIndices, world, clusterId, targetDiameter, matTint) {
  const nodes = srcJson.nodes;
  const meshNodes = [...meshNodeIndices].filter((i) => nodes[i].mesh !== undefined);
  if (!meshNodes.length) throw new Error(`cluster ${clusterId}: no mesh nodes`);

  let gMin = [Infinity, Infinity, Infinity];
  let gMax = [-Infinity, -Infinity, -Infinity];
  for (const i of meshNodes) {
    const mesh = srcJson.meshes[nodes[i].mesh];
    for (const prim of mesh.primitives || []) {
      const pos = prim.attributes?.POSITION;
      if (pos === undefined) continue;
      const b = accessorBounds(srcJson, pos);
      if (!b) continue;
      const wb = transformBounds(b.min, b.max, world[i]);
      for (let k = 0; k < 3; k++) {
        gMin[k] = Math.min(gMin[k], wb.min[k]);
        gMax[k] = Math.max(gMax[k], wb.max[k]);
      }
    }
  }
  if (!Number.isFinite(gMin[0])) throw new Error(`cluster ${clusterId}: no bounds`);

  const center = [
    (gMin[0] + gMax[0]) / 2,
    (gMin[1] + gMax[1]) / 2,
    (gMin[2] + gMax[2]) / 2
  ];
  const size = [gMax[0] - gMin[0], gMax[1] - gMin[1], gMax[2] - gMin[2]];
  const maxDim = Math.max(...size);
  const scale = maxDim > 1e-6 ? targetDiameter / maxDim : 1;

  const usedMeshes = new Map();
  const usedMats = new Map();
  const usedAccessors = new Set();
  const usedViews = new Set();

  for (const i of meshNodes) {
    const mi = nodes[i].mesh;
    if (!usedMeshes.has(mi)) usedMeshes.set(mi, usedMeshes.size);
    const mesh = srcJson.meshes[mi];
    for (const prim of mesh.primitives || []) {
      if (prim.material !== undefined && !usedMats.has(prim.material)) {
        usedMats.set(prim.material, usedMats.size);
      }
      for (const key of Object.keys(prim.attributes || {})) {
        usedAccessors.add(prim.attributes[key]);
      }
      if (prim.indices !== undefined) usedAccessors.add(prim.indices);
    }
  }
  for (const ai of usedAccessors) {
    const acc = srcJson.accessors[ai];
    if (acc?.bufferView !== undefined) usedViews.add(acc.bufferView);
  }

  const { bin: compact, newViews, viewMap } = compactBin(srcJson, srcBin, usedViews);
  const accList = [...usedAccessors].sort((a, b) => a - b);
  const accMap = new Map(accList.map((a, i) => [a, i]));
  const meshList = [...usedMeshes.keys()];
  const meshMap = new Map(meshList.map((m, i) => [m, i]));
  const matList = [...usedMats.keys()];
  const matMap = new Map(matList.map((m, i) => [m, i]));

  const newAccessors = accList.map((ai) => {
    const a = { ...srcJson.accessors[ai] };
    if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
    return a;
  });

  const newMeshes = meshList.map((mi) => {
    const mesh = srcJson.meshes[mi];
    return {
      name: mesh.name || `mesh_${mi}`,
      primitives: (mesh.primitives || []).map((prim) => {
        const attrs = {};
        for (const [k, v] of Object.entries(prim.attributes || {})) {
          attrs[k] = accMap.get(v);
        }
        const out = { attributes: attrs, mode: prim.mode ?? 4 };
        if (prim.indices !== undefined) out.indices = accMap.get(prim.indices);
        if (prim.material !== undefined) out.material = matMap.get(prim.material);
        return out;
      })
    };
  });

  const newMaterials = matList.map((mi, idx) => {
    const base = srcJson.materials?.[mi] || {};
    if (matTint) {
      return {
        name: `${clusterId}_mat_${idx}`,
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: matTint.color || [0.55, 0.55, 0.55, 1],
          metallicFactor: matTint.metal ?? 0.05,
          roughnessFactor: matTint.rough ?? 0.75
        },
        emissiveFactor: matTint.emissive || [0, 0, 0]
      };
    }
    return { ...base, name: base.name || `${clusterId}_mat_${idx}`, doubleSided: true };
  });
  if (!newMaterials.length) {
    newMaterials.push({
      name: `${clusterId}_default`,
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: matTint?.color || [0.6, 0.6, 0.6, 1],
        metallicFactor: 0.05,
        roughnessFactor: 0.7
      }
    });
  }

  const newNodes = [
    {
      name: clusterId,
      children: meshNodes.map((_, i) => i + 1),
      translation: [0, 0, 0],
      scale: [scale, scale, scale]
    }
  ];
  for (const i of meshNodes) {
    const t = mat4TransformPoint(world[i], [0, 0, 0]);
    newNodes.push({
      name: nodes[i].name || `leaf_${i}`,
      mesh: meshMap.get(nodes[i].mesh),
      translation: [t[0] - center[0], t[1] - center[1], t[2] - center[2]]
    });
  }

  const outJson = {
    asset: { version: '2.0', generator: 'split-element-attack-meshes' },
    scene: 0,
    scenes: [{ name: clusterId, nodes: [0] }],
    nodes: newNodes,
    meshes: newMeshes,
    materials: newMaterials,
    accessors: newAccessors,
    bufferViews: newViews,
    buffers: [{ byteLength: compact.length }]
  };

  return { glb: writeGlb(outJson, compact), maxDim, scale };
}

function meshNodeIndices(json) {
  const out = [];
  json.nodes.forEach((n, i) => {
    if (n.mesh !== undefined) out.push(i);
  });
  return out;
}

function main() {
  // ── Rocks ──────────────────────────────────────────────
  const rockDir = path.join(PUB, 'rocks');
  fs.mkdirSync(rockDir, { recursive: true });
  const rockSrc = path.join(rockDir, 'assorted_rock_pack_src.glb');
  const { json: rockJson, bin: rockBin } = readGlb(rockSrc);
  const rockWorld = computeWorldMatrices(rockJson.nodes);
  const rockNodes = meshNodeIndices(rockJson);
  const rockManifest = { source: 'assorted_rock_pack.glb', diameterM: ROCK_DIAM, rocks: [] };
  rockNodes.forEach((ni, idx) => {
    const id = `rock-${idx}`;
    const { glb, maxDim, scale } = extractCluster(
      rockJson,
      rockBin,
      new Set([ni]),
      rockWorld,
      id,
      ROCK_DIAM,
      {
        color: [0.45 + idx * 0.03, 0.4, 0.35, 1],
        metal: 0.08,
        rough: 0.85
      }
    );
    fs.writeFileSync(path.join(rockDir, `${id}.glb`), glb);
    rockManifest.rocks.push({
      id,
      path: `models/vfx/rocks/${id}.glb`,
      diameterM: ROCK_DIAM,
      rawMax: maxDim,
      scale
    });
    console.log(`rock ${id} raw=${maxDim.toFixed(2)} scale=${scale.toFixed(5)}`);
  });
  fs.writeFileSync(path.join(rockDir, 'rock-manifest.json'), JSON.stringify(rockManifest, null, 2));

  // ── Bubbles (sample frames only — never ship whole pack as one VFX) ──
  const bubDir = path.join(PUB, 'bubbles');
  fs.mkdirSync(bubDir, { recursive: true });
  const bubSrc = path.join(bubDir, 'bubbles_2_src.glb');
  const { json: bubJson, bin: bubBin } = readGlb(bubSrc);
  const bubWorld = computeWorldMatrices(bubJson.nodes);
  const bubNodes = meshNodeIndices(bubJson);
  // Evenly sample 6 frames from 178
  const sampleCount = 6;
  const samples = [];
  for (let s = 0; s < sampleCount; s++) {
    const i = Math.round((s / Math.max(1, sampleCount - 1)) * (bubNodes.length - 1));
    samples.push(bubNodes[i]);
  }
  const bubManifest = {
    source: 'bubbles_2.glb',
    note: 'Sample frames only — do not load bubbles_2_src.glb whole at runtime',
    diameterM: BUBBLE_DIAM,
    bubbles: []
  };
  samples.forEach((ni, idx) => {
    const id = `bubble-${idx}`;
    const { glb, maxDim, scale } = extractCluster(
      bubJson,
      bubBin,
      new Set([ni]),
      bubWorld,
      id,
      BUBBLE_DIAM,
      {
        color: [0.55, 0.85, 1, 0.55],
        metal: 0.05,
        rough: 0.2,
        emissive: [0.1, 0.35, 0.55]
      }
    );
    fs.writeFileSync(path.join(bubDir, `${id}.glb`), glb);
    bubManifest.bubbles.push({
      id,
      path: `models/vfx/bubbles/${id}.glb`,
      diameterM: BUBBLE_DIAM,
      rawMax: maxDim,
      scale
    });
    console.log(`bubble ${id} raw=${maxDim.toFixed(2)} scale=${scale.toFixed(5)}`);
  });
  fs.writeFileSync(path.join(bubDir, 'bubble-manifest.json'), JSON.stringify(bubManifest, null, 2));

  // ── Arrows ─────────────────────────────────────────────
  const arrDir = path.join(PUB, 'arrows');
  fs.mkdirSync(arrDir, { recursive: true });

  // Linear path arrow (teleport_arrow — flatter long shape)
  {
    const src = path.join(arrDir, 'teleport_arrow_src.glb');
    const { json, bin } = readGlb(src);
    const world = computeWorldMatrices(json.nodes);
    const nodes = meshNodeIndices(json);
    const { glb, maxDim, scale } = extractCluster(
      json,
      bin,
      new Set(nodes),
      world,
      'arrow-path',
      ARROW_PATH_LEN,
      {
        color: [0.35, 0.75, 1, 1],
        metal: 0.35,
        rough: 0.35,
        emissive: [0.1, 0.4, 0.8]
      }
    );
    fs.writeFileSync(path.join(arrDir, 'arrow-path.glb'), glb);
    console.log(`arrow-path raw=${maxDim.toFixed(2)} scale=${scale.toFixed(5)}`);
  }

  // Lofted throw / place arrow (arrow_curved — more loft visual)
  {
    const src = path.join(arrDir, 'arrow_curved_src.glb');
    const { json, bin } = readGlb(src);
    const world = computeWorldMatrices(json.nodes);
    const nodes = meshNodeIndices(json);
    const { glb, maxDim, scale } = extractCluster(
      json,
      bin,
      new Set(nodes),
      world,
      'arrow-loft',
      ARROW_LOFT_LEN,
      {
        color: [1, 0.55, 0.2, 1],
        metal: 0.25,
        rough: 0.4,
        emissive: [0.6, 0.25, 0.05]
      }
    );
    fs.writeFileSync(path.join(arrDir, 'arrow-loft.glb'), glb);
    console.log(`arrow-loft raw=${maxDim.toFixed(2)} scale=${scale.toFixed(5)}`);
  }

  const arrowManifest = {
    systems: {
      path: {
        id: 'arrow-path',
        mesh: 'models/vfx/arrows/arrow-path.glb',
        source: 'teleport_arrow.glb',
        lengthM: ARROW_PATH_LEN,
        loft: 0,
        role: 'linear attack path — distance sets end event (explode/aoe/blink/return)',
        endEvents: ['impact', 'explode', 'aoe', 'blink', 'return']
      },
      loft: {
        id: 'arrow-loft',
        mesh: 'models/vfx/arrows/arrow-loft.glb',
        source: 'arrow_curved.glb',
        lengthM: ARROW_LOFT_LEN,
        loft: 0.42,
        role: 'throw / place device / trap / summon arrow',
        endEvents: ['throw', 'place_device', 'trap', 'summon']
      }
    }
  };
  fs.writeFileSync(path.join(arrDir, 'arrow-manifest.json'), JSON.stringify(arrowManifest, null, 2));
  console.log('done');
}

main();
