#!/usr/bin/env node
/**
 * Upload lab-baked rotation-only JSON clips to R2 grudge-assets.
 * Keys: prod/anims/{pack}/{stem}.json
 * Skips Mixamo FBX. HEAD 200 on CDN is left alone.
 *
 *   node scripts/upload-baked-anims-r2.mjs
 *   node scripts/upload-baked-anims-r2.mjs --dry-run
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OS = path.resolve('F:/GitHub/ObjectStore');
const BAKED = path.join(ROOT, 'public', 'anims', 'baked');
const CDN = 'https://assets.grudge-studio.com';
const DRY = process.argv.includes('--dry-run');

function resolveWrangler() {
  const candidates = [
    path.join(OS, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  ];
  return candidates.find((p) => p && existsSync(p)) || null;
}

function wrangler(args) {
  const js = resolveWrangler();
  const res = js
    ? spawnSync(process.execPath, [js, ...args], { stdio: 'inherit', shell: false, cwd: OS })
    : spawnSync('wrangler', args, { stdio: 'inherit', shell: true, cwd: OS });
  if (res.status !== 0) throw new Error(`wrangler failed (${res.status})`);
}

function walkJson(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJson(p, acc);
    else if (name.endsWith('.json') && !name.startsWith('_')) acc.push(p);
  }
  return acc;
}

async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.status === 200;
  } catch {
    return false;
  }
}

const files = walkJson(BAKED);
let skip = 0;
let put = 0;
let fail = 0;
console.log(`baked clips ${files.length} dry=${DRY}`);

for (const file of files) {
  const rel = path.relative(BAKED, file).split(path.sep).join('/');
  const key = `prod/anims/${rel}`;
  const url = `${CDN}/${key}`;
  if (await headOk(url)) {
    skip += 1;
    console.log('SKIP', key);
    continue;
  }
  if (DRY) {
    console.log('WOULD PUT', key);
    put += 1;
    continue;
  }
  try {
    console.log('PUT', key);
    wrangler([
      'r2',
      'object',
      'put',
      `grudge-assets/${key}`,
      `--file=${file}`,
      '--content-type=application/json',
      '--remote',
    ]);
    put += 1;
  } catch (e) {
    fail += 1;
    console.error('FAIL', key, e.message);
  }
}

console.log(JSON.stringify({ files: files.length, skip, put, fail, dry: DRY }));
if (fail) process.exit(1);
