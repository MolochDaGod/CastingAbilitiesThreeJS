#!/usr/bin/env node
/**
 * Dump ANIM_PACKS → public/api/v1/anim-packs.json (definitions JSON).
 * Clip binaries stay R2 prod/anims/{pack}/{clip}.json.
 *   node scripts/export-anim-packs.mjs
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ANIM_PACKS, ANIM_PACK_META } from '../src/config/assets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(ROOT, 'public', 'api', 'v1', 'anim-packs.json');
const doc = {
  id: 'anim-packs',
  version: new Date().toISOString().slice(0, 10),
  law: 'Role -> clip candidates (first URL that loads wins). Clips are R2 prod/anims/{rel}.json. This JSON is definitions (info.* / lab /api/v1). D1 indexes clip files, not the role table. Railway is player bag, not animations.',
  mixer: 1,
  skeleton: 'bip001-play-bones',
  packs: ANIM_PACKS,
  meta: ANIM_PACK_META
};
writeFileSync(out, JSON.stringify(doc, null, 2));
console.log('wrote', out, Object.keys(ANIM_PACKS).length, 'packs');
