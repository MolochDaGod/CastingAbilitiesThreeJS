/**
 * Play-kit deploy gate. Fail-closed.
 *   node scripts/play-kit-doctor.mjs
 *   node scripts/play-kit-doctor.mjs --live
 */
const LIVE = process.argv.includes('--live');
const HOST = 'https://casting.grudge.studio';
const VERSION = '2026-08-18.play-kit.1';

let fails = 0;
function ok(msg) {
  console.log(`  OK  ${msg}`);
}
function bad(msg) {
  fails += 1;
  console.log(`  BAD ${msg}`);
}

console.log('## play-kit contract');
const { readFileSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let contract;
try {
  contract = JSON.parse(
    readFileSync(join(root, 'public/api/v1/grudge6-warlords-play-contract.json'), 'utf8')
  );
} catch (e) {
  bad(`contract missing: ${e.message}`);
}
if (contract?.version === VERSION) ok(`version ${VERSION}`);
else bad(`version ${contract?.version} want ${VERSION}`);
if (contract?.mixer === 1) ok('one mixer');
else bad('mixer must be 1');
if (contract?.playMesh?.races?.length === 6) ok('6 Toon races');
else bad('playMesh.races incomplete');

if (!LIVE) {
  ok('skip live (pass --live)');
  console.log(fails ? `\nFAIL ${fails}` : '\nPASS');
  process.exit(fails ? 1 : 0);
}

console.log('\n## live health');
try {
  const res = await fetch(`${HOST}/api/play-kit-health`);
  const body = await res.json();
  if (res.ok && body.ok) ok(`play-kit-health ${res.status} v${body.version}`);
  else bad(`play-kit-health ${res.status} ${JSON.stringify(body.fails || body)}`);
} catch (e) {
  bad(`play-kit-health ${e.message}`);
}

console.log(fails ? `\nFAIL ${fails}` : '\nPASS');
process.exit(fails ? 1 : 0);
