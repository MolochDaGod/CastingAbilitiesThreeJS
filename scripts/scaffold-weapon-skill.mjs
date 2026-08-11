/**
 * Scaffold a production override for one catalog weapon skill.
 *
 * Does NOT invent catalog skill ids — only writes optional override JSON
 * so agents can perfect anim/VFX/physics/status per skill.
 *
 * Usage:
 *   node scripts/scaffold-weapon-skill.mjs --id staff_fire_bolt
 *   node scripts/scaffold-weapon-skill.mjs --id t0_sword_practice_slash --weapon SWORD
 *   node scripts/scaffold-weapon-skill.mjs --id staff_ice_nova --list-ready
 *
 * Output: skills/production/<id>.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'skills/production');
const PUBLIC_DIR = path.join(ROOT, 'public/skills/production');

const args = process.argv.slice(2);
function flag(name, def = null) {
  const i = args.indexOf(name);
  if (i < 0) return def;
  return args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
}

const skillId = flag('--id');
const weapon = flag('--weapon', 'STAFF');
const listReady = flag('--list-ready');

if (!skillId && !listReady) {
  console.log(`Usage:
  node scripts/scaffold-weapon-skill.mjs --id <catalog_skill_id> [--weapon SWORD|STAFF|BOW|…]
  node scripts/scaffold-weapon-skill.mjs --list-ready

Catalog browse: https://info.grudge-studio.com/WEAPON_SKILLS.html
Pattern doc:    docs/WEAPON_SKILL_PRODUCTION_SSOT.md
`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

if (listReady) {
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Production overrides: ${files.length}`);
  for (const f of files) console.log(' ', f);
  process.exit(0);
}

const outPath = path.join(OUT_DIR, `${skillId}.json`);
const publicPath = path.join(PUBLIC_DIR, `${skillId}.json`);
if (fs.existsSync(outPath) && flag('--force') !== true) {
  console.error(`Exists: ${outPath}  (pass --force to overwrite)`);
  process.exit(2);
}

const template = {
  $schema: 'weapon-skill-production-override',
  id: skillId,
  weaponTypeId: String(weapon).toUpperCase(),
  note:
    'Optional overrides only. Catalog id/dmg/cd/effects stay SSOT from master-weaponSkills / t0-weapons.',
  catalogUrl: 'https://info.grudge-studio.com/WEAPON_SKILLS.html',
  // ── Animation (perfect this skill’s cast) ──
  animRole: null,
  animClip: null,
  hitFrameDelay: 0.18,
  comboStages: null,
  // ── VFX layers ──
  castEffectId: null,
  travelEffectId: null,
  impactEffectId: null,
  meshId: null,
  projectileMeshUrl: null,
  chargeMeshUrl: null,
  intensity: 1,
  // ── Delivery ──
  delivery: null,
  element: null,
  // ── Physics (SI) ──
  force: null,
  knockbackMm: null,
  knockupVy: null,
  aoeM: null,
  projectileSpeed: null,
  contactRadius: null,
  collider: null,
  // ── Statuses (or leave null to parse catalog effects[]) ──
  statuses: null,
  // Example statuses when authoring freeze/stun/push:
  // statuses: [
  //   { id: 'freeze', durationSec: 2.5, magnitude: 1 },
  //   { id: 'push', durationSec: 0.35, magnitude: 200 },
  //   { id: 'stun', durationSec: 1.0, magnitude: 1 }
  // ],
  checklist: {
    catalogIdVerified: false,
    animClipVerified: false,
    vfxCastTravelImpact: false,
    physicsSI: false,
    statusesMapped: false,
    readinessGreen: false,
    smokeCastingLab: false
  }
};

const body = JSON.stringify(template, null, 2) + '\n';
fs.writeFileSync(outPath, body);
fs.writeFileSync(publicPath, body);
console.log(`Wrote ${outPath}`);
console.log(`Wrote ${publicPath}  (runtime fetch ./skills/production/${skillId}.json)`);
console.log(`
Next:
  1. Open https://info.grudge-studio.com/WEAPON_SKILLS.html — verify id ${skillId}
  2. Fill animRole/clip + VFX ids + physics SI in BOTH copies (or edit skills/ then re-copy)
  3. Map statuses (freeze/stun/push/slow/burn/root)
  4. Runtime: loadProductionOverride + compileProductionWeaponSkill
  5. Smoke casting lab: equip weapon · Q · digit skill
  6. assessProductionReadiness → green
`);
