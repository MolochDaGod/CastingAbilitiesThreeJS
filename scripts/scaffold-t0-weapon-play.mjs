/**
 * Scaffold a T0 weapon play-stack checklist manifest.
 *
 * Does NOT invent catalog weapons — writes skills/play-stack/<id>.json
 * so agents/authors track mesh · pack · loco · skills · VFX · deploy.
 *
 * Usage:
 *   node scripts/scaffold-t0-weapon-play.mjs --id t0-sword
 *   node scripts/scaffold-t0-weapon-play.mjs --list
 *
 * Docs: docs/T0_WEAPON_PLAY_STACK_SSOT.md · skill casting-t0-weapon-play
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'skills/play-stack');

const args = process.argv.slice(2);
function flag(name, def = null) {
  const i = args.indexOf(name);
  if (i < 0) return def;
  return args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
}

const weaponId = flag('--id');
const list = flag('--list');

/** Known T0 starters (catalog SSOT — do not invent beyond this without ObjectStore). */
const T0_KNOWN = [
  't0-sword',
  't0-axe1h',
  't0-dagger',
  't0-hammer1h',
  't0-spear',
  't0-greatsword',
  't0-greataxe',
  't0-hammer2h',
  't0-bow',
  't0-crossbow',
  't0-gun',
  't0-wand',
  't0-nature-staff',
  't0-tool',
  't0-offhand-tome'
];

function packHint(id) {
  const s = String(id || '').toLowerCase();
  if (/bow|crossbow/.test(s)) return 'longbow';
  if (/gun|pistol|rifle/.test(s)) return 'pistol';
  if (/wand|staff|tome|magic/.test(s)) return 'magic';
  return 'sword_shield';
}

if (!weaponId && !list) {
  console.log(`Usage:
  node scripts/scaffold-t0-weapon-play.mjs --id <t0-weapon-id>
  node scripts/scaffold-t0-weapon-play.mjs --list

Known T0: ${T0_KNOWN.join(', ')}
Doc: docs/T0_WEAPON_PLAY_STACK_SSOT.md
`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

if (list) {
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Play-stack manifests: ${files.length}`);
  for (const f of files) console.log(' ', f);
  process.exit(0);
}

const id = String(weaponId);
if (!T0_KNOWN.includes(id) && flag('--force') !== true) {
  console.warn(
    `Warning: ${id} not in known T0 list. Pass --force if catalog already has it.`
  );
}

const outPath = path.join(OUT_DIR, `${id}.play-stack.json`);
if (fs.existsSync(outPath) && flag('--force') !== true) {
  console.error(`Exists: ${outPath}  (pass --force to overwrite)`);
  process.exit(2);
}

const template = {
  $schema: 'casting-t0-weapon-play-stack',
  id,
  product: 'weapon',
  note:
    'Checklist only. Catalog rows + skill ids stay ObjectStore / t0-weapons SSOT. Do not invent skills.',
  docs: [
    'docs/T0_WEAPON_PLAY_STACK_SSOT.md',
    'docs/T0_WEAPONS_SSOT.md',
    'docs/WEAPON_SKILL_PRODUCTION_SSOT.md'
  ],
  catalog: {
    t0Url: 'https://info.grudge-studio.com/api/v1/t0-weapons.json',
    skillsBrowse: 'https://info.grudge-studio.com/WEAPON_SKILLS.html',
    verified: false
  },
  layers: {
    identity: { done: false, weaponType: null, tier: 0 },
    mesh: { done: false, modelUrl: null, meshSlot: null },
    icon: { done: false, iconUrl: null },
    animPack: { done: false, pack: packHint(id) },
    locomotion: {
      done: false,
      roles: ['idle', 'walk', 'run', 'jump', 'fall', 'roll', 'dodge']
    },
    traversal: {
      done: false,
      note: 'Usually N/A for T0; back/ride separate (windsurf / wings)'
    },
    skills: {
      done: false,
      slot1: null,
      slot2: null,
      slot3Options: [],
      scaffoldCmd:
        'node scripts/scaffold-weapon-skill.mjs --id <skillId> --weapon TYPE'
    },
    productionOverrides: { done: false, paths: [] },
    projectiles: { done: false, meshUrls: [] },
    dualLoadout: {
      done: false,
      note: 'Weapon 1/2 paperdoll · combat Tap Q swap'
    },
    prefabExport: { done: false },
    smoke: {
      done: false,
      url: `https://casting-abilities-threejs.vercel.app/?t0=${id}`
    },
    deploy: { done: false, vercel: false, skillDo: false }
  },
  checklist: {
    catalogIdVerified: false,
    equipLive: false,
    animPackBound: false,
    skillsFire: false,
    projectilesSI: false,
    dualQSwap: false,
    readinessGreen: false,
    smokeCastingLab: false
  }
};

fs.writeFileSync(outPath, JSON.stringify(template, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
console.log(`
Next:
  1. Open t0-weapons.json — verify ${id}
  2. Equip lab ?t0=${id}
  3. Scaffold each skill: node scripts/scaffold-weapon-skill.mjs --id …
  4. Tick layers in this JSON as you complete them
  5. Skill: casting-t0-weapon-play
`);
