/**
 * Audit half-done / conflicting asset + catalog sources.
 * Run: node scripts/audit-asset-library.mjs
 */
async function head(u) {
  try {
    const r = await fetch(u, { method: 'HEAD' });
    return r.status;
  } catch (e) {
    return `err:${e.message?.slice(0, 30)}`;
  }
}
async function getStatus(u) {
  try {
    const r = await fetch(u);
    return r.status;
  } catch (e) {
    return `err`;
  }
}

const INFO = 'https://info.grudge-studio.com/api/v1';
const CDN = 'https://assets.grudge-studio.com';

const catalogs = [
  ['USE', 'game-library.json'],
  ['USE', 'canonical-items-manifest.json'],
  ['USE', 'master-weapon-prefabs.json'],
  ['USE', 'master-weaponSkills.json'],
  ['USE', 't0-weapons.json'],
  ['USE', 'master-armor.json'],
  ['USE', 'master-items.json'],
  ['USE', 'master-item-prefabs.json'],
  ['USE', 'master-relics.json'],
  ['USE', 'master-mounts.json'],
  ['USE', 'master-classRelics.json'],
  ['USE', 'master-consumables.json'],
  ['USE', 'master-materials.json'],
  ['USE', 'master-recipes.json'],
  ['USE', 'master-registry.json'],
  ['DESIGN_ONLY', 'weapons.json'],
  ['DESIGN_ONLY', 'armor.json'],
  ['DEPRECATED', 'master-weapons.json'],
  ['DEPRECATED', 'master-t0-items.json'],
  ['DEPRECATED', 'weapon-prefabs.json'],
  ['DEPRECATED', 'weaponSkills.json'],
  ['DEPRECATED', 'items-database.json'],
  ['PLANNED', 'master-armor-prefabs.json']
];

console.log('=== Catalog HTTP status (info.grudge-studio.com) ===');
for (const [role, f] of catalogs) {
  const st = await getStatus(`${INFO}/${f}`);
  console.log(`${String(st).padEnd(5)} ${role.padEnd(12)} ${f}`);
}

console.log('\n=== Family GLBs (prod/gltf/weapons) ===');
for (const fam of ['sword', 'axe', 'staff', 'bow', 'dagger', 'hammer', 'assault_rifle', 'wand', 'shield']) {
  const st = await head(`${CDN}/prod/gltf/weapons/${fam}.glb`);
  console.log(`${String(st).padEnd(5)} ${fam}.glb`);
}

const prefabs = await (await fetch(`${INFO}/master-weapon-prefabs.json`)).json();
console.log('\n=== master-weapon-prefabs meta ===');
console.log('total', prefabs.total, 'd1Table', prefabs.d1Table, 'd1Database', prefabs.d1Database);
console.log('r2Layout', JSON.stringify(prefabs.r2Layout));

let dropOk = 0,
  dropBad = 0,
  modelOk = 0,
  modelBad = 0;
const dropSamples = [];
const modelSamples = [];
for (const s of prefabs.prefabs) {
  if (s.assets?.dropPrefabR2Key && dropSamples.length < 6) dropSamples.push(s);
  if ((s.modelUrl || s.prodGltfUrl) && modelSamples.length < 6) modelSamples.push(s);
}
console.log('\n=== Sample dropPrefab HEAD ===');
for (const s of dropSamples) {
  const key = String(s.assets.dropPrefabR2Key).replace(/^\/+/, '');
  const st = await head(`${CDN}/${key}`);
  if (st === 200) dropOk++;
  else dropBad++;
  console.log(st, s.id, key.slice(-60));
}
console.log('\n=== Sample modelUrl HEAD ===');
for (const s of modelSamples) {
  const u = s.modelUrl || s.prodGltfUrl;
  const st = await head(u);
  if (st === 200) modelOk++;
  else modelBad++;
  console.log(st, s.id, u.split('/').pop());
}

const t0w = prefabs.prefabs.find((x) => x.id === 't0-wand');
const t0n = prefabs.prefabs.find((x) => x.id === 't0-nature-staff');
console.log('\n=== T0 in prefabs ===');
console.log(
  't0-wand',
  t0w
    ? { model: t0w.modelUrl || t0w.prodGltfUrl, icon: !!t0w.assets?.iconUrl }
    : 'NOT IN master-weapon-prefabs'
);
console.log(
  't0-nature-staff',
  t0n
    ? { model: t0n.modelUrl || t0n.prodGltfUrl, icon: !!t0n.assets?.iconUrl }
    : 'NOT IN master-weapon-prefabs'
);

const t0list = await (await fetch(`${INFO}/t0-weapons.json`)).json();
console.log(
  '\nt0-weapons.json count',
  (t0list.weapons || []).length,
  'ids',
  (t0list.weapons || []).map((w) => w.id).join(', ')
);

console.log('\n=== SUMMARY COUNTS (samples only) ===');
console.log({ dropOk, dropBad, modelOk, modelBad });
