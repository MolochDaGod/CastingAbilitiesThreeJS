/**
 * Split gd_orbs_pack.glb → 6 individual element orbs (sphere+torus each).
 * Normalize kamehameha_charging.glb → small charge shell (SI ~0.35 m).
 *
 * Never load whole multipacks as projectiles — use per-orb / charge files only.
 *
 * Usage: node scripts/split-gd-orbs-and-charge.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ORB_SRC = path.join(ROOT, 'public/models/vfx/orbs/gd_orbs_pack_src.glb');
const CHARGE_SRC = path.join(ROOT, 'public/models/vfx/charge/kamehameha_charging_src.glb');
const ORB_OUT = path.join(ROOT, 'public/models/vfx/orbs');
const CHARGE_OUT = path.join(ROOT, 'public/models/vfx/charge');

const ORB_DIAMETER_M = 0.45;
const CHARGE_DIAMETER_M = 0.35;

/** Sphere root + Torus ring pairs (inspected hierarchy). */
const ORB_DEFS = [
  {
    id: 'orb-fire',
    label: 'Fire Orb',
    element: 'fire',
    color: [1, 0.35, 0.08, 1],
    emissive: [1, 0.2, 0.02],
    roots: ['Sphere_0', 'Torus_1']
  },
  {
    id: 'orb-ice',
    label: 'Ice Orb',
    element: 'ice',
    color: [0.35, 0.82, 1, 1],
    emissive: [0.1, 0.45, 0.85],
    roots: ['Sphere.001_2', 'Torus.001_3']
  },
  {
    id: 'orb-nature',
    label: 'Nature Orb',
    element: 'nature',
    color: [0.35, 0.85, 0.28, 1],
    emissive: [0.08, 0.55, 0.12],
    roots: ['Sphere.002_4', 'Torus.002_5']
  },
  {
    id: 'orb-storm',
    label: 'Storm Orb',
    element: 'storm',
    color: [0.55, 0.85, 1, 1],
    emissive: [0.2, 0.55, 1],
    roots: ['Sphere.003_6', 'Torus.003_7']
  },
  {
    id: 'orb-holy',
    label: 'Holy Orb',
    element: 'holy',
    color: [1, 0.9, 0.45, 1],
    emissive: [0.95, 0.75, 0.2],
    roots: ['Sphere.004_8', 'Torus.004_9']
  },
  {
    id: 'orb-arcane',
    label: 'Arcane Orb',
    element: 'arcane',
    color: [0.7, 0.35, 1, 1],
    emissive: [0.45, 0.12, 0.9],
    roots: ['Sphere.005_10', 'Torus.005_11']
  }
];

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

function collectSubtree(nodes, rootIdx, out = new Set()) {
  if (out.has(rootIdx)) return out;
  out.add(rootIdx);
  for (const c of nodes[rootIdx].children || []) collectSubtree(nodes, c, out);
  return out;
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

function extractCluster(srcJson, srcBin, nodeIndices, world, clusterId, targetDiameter, colorDef) {
  const nodes = srcJson.nodes;
  const meshNodes = [...nodeIndices].filter((i) => nodes[i].mesh !== undefined);
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

  // Elemental materials (author pack is black — bake base color + emissive)
  const newMaterials = matList.map((mi, idx) => {
    const base = srcJson.materials?.[mi] || {};
    const isRing = idx > 0; // second+ mats get brighter ring look
    const col = colorDef?.color || [0.8, 0.8, 0.8, 1];
    const em = colorDef?.emissive || [0.2, 0.2, 0.2];
    const ringCol = isRing
      ? [Math.min(1, col[0] * 1.15), Math.min(1, col[1] * 1.15), Math.min(1, col[2] * 1.15), 0.92]
      : col;
    return {
      name: `${clusterId}_${base.name || 'mat'}_${idx}`,
      doubleSided: true,
      alphaMode: isRing ? 'BLEND' : 'OPAQUE',
      pbrMetallicRoughness: {
        baseColorFactor: ringCol,
        metallicFactor: isRing ? 0.15 : 0.05,
        roughnessFactor: isRing ? 0.25 : 0.35
      },
      emissiveFactor: isRing
        ? [Math.min(1, em[0] * 1.2), Math.min(1, em[1] * 1.2), Math.min(1, em[2] * 1.2)]
        : em
    };
  });

  // Flatten meshes under one root at origin with SI scale
  const newNodes = [
    {
      name: clusterId,
      children: meshNodes.map((_, i) => i + 1),
      translation: [0, 0, 0],
      scale: [scale, scale, scale]
    }
  ];
  for (const i of meshNodes) {
    const w = world[i];
    // Bake world position relative to center into translation
    const t = mat4TransformPoint(w, [0, 0, 0]);
    newNodes.push({
      name: nodes[i].name || `leaf_${i}`,
      mesh: meshMap.get(nodes[i].mesh),
      translation: [t[0] - center[0], t[1] - center[1], t[2] - center[2]]
    });
  }

  const outJson = {
    asset: { version: '2.0', generator: 'split-gd-orbs-and-charge' },
    scene: 0,
    scenes: [{ name: clusterId, nodes: [0] }],
    nodes: newNodes,
    meshes: newMeshes,
    materials: newMaterials,
    accessors: newAccessors,
    bufferViews: newViews,
    buffers: [{ byteLength: compact.length }]
  };

  return {
    glb: writeGlb(outJson, compact),
    maxDim,
    scale,
    center,
    size
  };
}

function nodeIndexByName(nodes, name) {
  const i = nodes.findIndex((n) => n.name === name);
  if (i < 0) throw new Error(`node not found: ${name}`);
  return i;
}

function main() {
  fs.mkdirSync(ORB_OUT, { recursive: true });
  fs.mkdirSync(CHARGE_OUT, { recursive: true });

  if (!fs.existsSync(ORB_SRC)) throw new Error('missing ' + ORB_SRC);
  if (!fs.existsSync(CHARGE_SRC)) throw new Error('missing ' + CHARGE_SRC);

  const { json: orbJson, bin: orbBin } = readGlb(ORB_SRC);
  const orbWorld = computeWorldMatrices(orbJson.nodes);
  const manifest = {
    source: 'gd_orbs_pack.glb',
    diameterM: ORB_DIAMETER_M,
    note: 'Individual orbs for staff attacks — never load gd_orbs_pack_src whole as projectile',
    orbs: []
  };

  for (const def of ORB_DEFS) {
    const indices = new Set();
    for (const rootName of def.roots) {
      const ri = nodeIndexByName(orbJson.nodes, rootName);
      collectSubtree(orbJson.nodes, ri, indices);
    }
    const { glb, maxDim, scale } = extractCluster(
      orbJson,
      orbBin,
      indices,
      orbWorld,
      def.id,
      ORB_DIAMETER_M,
      def
    );
    const outPath = path.join(ORB_OUT, `${def.id}.glb`);
    fs.writeFileSync(outPath, glb);
    console.log(
      `wrote ${def.id}.glb  rawMax=${maxDim.toFixed(3)} scale=${scale.toFixed(4)} → ${ORB_DIAMETER_M}m`
    );
    manifest.orbs.push({
      id: def.id,
      label: def.label,
      element: def.element,
      path: `models/vfx/orbs/${def.id}.glb`,
      diameterM: ORB_DIAMETER_M,
      color: def.color,
      emissive: def.emissive,
      staffUse: {
        projectileScale: 1,
        tipScale: 0.55,
        chargeScale: 0.8
      }
    });
  }
  fs.writeFileSync(path.join(ORB_OUT, 'orb-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('wrote orb-manifest.json');

  // Charge shell
  const { json: chJson, bin: chBin } = readGlb(CHARGE_SRC);
  const chWorld = computeWorldMatrices(chJson.nodes);
  const allCharge = new Set(chJson.nodes.map((_, i) => i));
  const chargeColor = {
    color: [0.55, 0.85, 1, 0.85],
    emissive: [0.25, 0.55, 1]
  };
  const { glb: chargeGlb, maxDim: cMax, scale: cScale } = extractCluster(
    chJson,
    chBin,
    allCharge,
    chWorld,
    'staff-charge',
    CHARGE_DIAMETER_M,
    chargeColor
  );
  fs.writeFileSync(path.join(CHARGE_OUT, 'staff-charge.glb'), chargeGlb);
  // Also keep a neutral alias for elemental tint at runtime
  fs.writeFileSync(path.join(CHARGE_OUT, 'kamehameha-charge.glb'), chargeGlb);
  console.log(
    `wrote staff-charge.glb  rawMax=${cMax.toFixed(3)} scale=${cScale.toFixed(4)} → ${CHARGE_DIAMETER_M}m`
  );

  const chargeManifest = {
    source: 'kamehameha_charging.glb',
    diameterM: CHARGE_DIAMETER_M,
    path: 'models/vfx/charge/staff-charge.glb',
    alias: 'models/vfx/charge/kamehameha-charge.glb',
    note: 'Small charge shell at staff tip / hand during cast — tint with elemental shaders'
  };
  fs.writeFileSync(
    path.join(CHARGE_OUT, 'charge-manifest.json'),
    JSON.stringify(chargeManifest, null, 2)
  );
  console.log('done');
}

main();
