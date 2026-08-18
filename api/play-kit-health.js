/**
 * Play-kit health worker — HEAD production Toon kits + Bip001 clips.
 * Fail-closed for agents / deploy. Same CDN host as api/cdn-proxy.js.
 */
import https from 'node:https';

const CDN_HOST = 'assets.grudge-studio.com';
const CONTRACT_VERSION = '2026-08-18.play-kit.1';
const RACES = ['human', 'barbarian', 'elf', 'dwarf', 'orc', 'undead'];
const CLIPS = [
  'prod/anims/magic/standing-idle.json',
  'prod/anims/magic/standing-walk-forward.json',
  'prod/anims/magic/standing-1h-cast-spell-01.json',
  'prod/anims/sword_shield/sword-and-shield-idle.json',
  'prod/anims/sword_shield/sword-and-shield-attack.json'
];

function headCdn(key) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: CDN_HOST,
        path: `/${key}`,
        method: 'HEAD',
        headers: {
          Referer: `https://${CDN_HOST}/`,
          'User-Agent': 'grudge-play-kit-health/1'
        }
      },
      (res) => {
        res.resume();
        resolve({ key, status: res.statusCode || 0, ok: (res.statusCode || 0) < 400 });
      }
    );
    req.on('error', (err) => resolve({ key, status: 0, ok: false, error: err.message }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ key, status: 0, ok: false, error: 'timeout' });
    });
    req.end();
  });
}



export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Grudge-Play-Kit', CONTRACT_VERSION);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const kitKeys = RACES.map((r) => `asset-packs/toon-rts-characters/glb/characters/${r}.glb`);
  const results = await Promise.all([...kitKeys, ...CLIPS].map(headCdn));
  const kits = {};
  const clips = {};
  for (const r of results) {
    if (r.key.endsWith('.glb')) kits[r.key.split('/').pop().replace('.glb', '')] = r;
    else clips[r.key.replace('prod/anims/', '').replace('.json', '')] = r;
  }
  const kitFail = Object.values(kits).filter((x) => !x.ok);
  const clipFail = Object.values(clips).filter((x) => !x.ok);
  const ok = kitFail.length === 0 && clipFail.length === 0;
  const body = {
    ok,
    version: CONTRACT_VERSION,
    contract: CONTRACT_VERSION,
    mixer: 1,
    loader: 'loadRaceKit | deployToonPlayKit',
    kits,
    clips,
    fails: [...kitFail, ...clipFail].map((x) => `${x.status} ${x.key}`),
    rule: 'Toon GLB + one mixer + Bip001 /prod/anims + bone-box feet. Ban races-bake/Meshy/capsule play.'
  };
  res.statusCode = ok ? 200 : 503;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
