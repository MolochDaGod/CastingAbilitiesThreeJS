/**
 * /devnode entry — world node authoring (biomes · terrain · harvest · PvE drafts).
 * @see docs/DEVNODE_SSOT.md
 */

import {
  BIOME_PRESETS,
  NODE_FAMILIES,
  NODE_PALETTE,
  createEmptyNodeLayout,
  validateNodeLayout
} from '../world/nodePalette.js';
import { DevNodeEditor } from './DevNodeEditor.js';

const STORAGE_KEY = 'grudge.casting.devnode.layout.v1';

const el = {
  canvas: document.getElementById('dn-canvas'),
  biome: document.getElementById('dn-biome'),
  families: document.getElementById('dn-families'),
  palette: document.getElementById('dn-palette'),
  export: document.getElementById('dn-export'),
  import: document.getElementById('dn-import'),
  clear: document.getElementById('dn-clear'),
  file: document.getElementById('dn-file'),
  stats: document.getElementById('dn-stats'),
  hint: document.getElementById('dn-hint')
};

// Prevent browser context menu on canvas (RMB remove)
el.canvas?.addEventListener('contextmenu', (e) => e.preventDefault());

const editor = new DevNodeEditor(/** @type {HTMLCanvasElement} */ (el.canvas));

/** @type {string} */
let familyFilter = 'all';
/** @type {string} */
let selectedId = 'node.rock_boulder';

function fillBiomes() {
  el.biome.innerHTML = BIOME_PRESETS.map(
    (b) => `<option value="${b.id}">${b.label}</option>`
  ).join('');
}

function fillFamilies() {
  const ids = ['all', ...Object.keys(NODE_FAMILIES)];
  el.families.innerHTML = ids
    .map((id) => {
      const label = id === 'all' ? 'All' : NODE_FAMILIES[id]?.label || id;
      return `<button type="button" class="dn-chip ${familyFilter === id ? 'is-on' : ''}" data-fam="${id}">${label}</button>`;
    })
    .join('');
  el.families.querySelectorAll('[data-fam]').forEach((btn) => {
    btn.addEventListener('click', () => {
      familyFilter = btn.getAttribute('data-fam') || 'all';
      fillFamilies();
      fillPalette();
    });
  });
}

function fillPalette() {
  const list =
    familyFilter === 'all'
      ? NODE_PALETTE
      : NODE_PALETTE.filter((e) => e.family === familyFilter);
  el.palette.innerHTML = list
    .map((e) => {
      const fam = NODE_FAMILIES[e.family]?.label || e.family;
      const stub = e.ready === false ? 'is-stub' : '';
      const sel = e.id === selectedId ? 'is-sel' : '';
      return `<button type="button" class="dn-item ${stub} ${sel}" data-id="${e.id}">
        ${e.label}${e.ready === false ? ' · stub' : ''}
        <small>${fam}${e.note ? ` · ${e.note}` : ''}</small>
      </button>`;
    })
    .join('');
  el.palette.querySelectorAll('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedId = btn.getAttribute('data-id') || selectedId;
      editor.setSelectedPalette(selectedId);
      fillPalette();
      refreshStats();
    });
  });
}

function refreshStats() {
  const L = editor.exportLayout();
  el.stats.textContent = [
    `nodes: ${L.nodes.length}`,
    `biome: ${L.biomeId || '—'}`,
    `sel: ${selectedId}`,
    `amp: ${L.terrain?.amp ?? '—'} seed: ${L.terrain?.seed ?? '—'}`
  ].join('\n');
}

el.biome.addEventListener('change', () => {
  const b = BIOME_PRESETS.find((x) => x.id === el.biome.value) || BIOME_PRESETS[0];
  editor.layout.biomeId = b.id;
  editor.setBiomeTerrain(b.terrain);
  // Prefer families from biome
  if (b.families?.length) {
    familyFilter = b.families[0];
    fillFamilies();
    fillPalette();
  }
  refreshStats();
});

el.export.addEventListener('click', () => {
  const data = editor.exportLayout();
  data.biomeId = el.biome.value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ok */
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `devnode-${data.biomeId || 'layout'}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  el.hint.textContent = 'Exported layout JSON · also saved to localStorage';
  refreshStats();
});

el.import.addEventListener('click', () => el.file.click());
el.file.addEventListener('change', async () => {
  const f = el.file.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const raw = JSON.parse(text);
    const v = validateNodeLayout(raw);
    if (!v.ok) {
      el.hint.textContent = `Import failed: ${v.error}`;
      return;
    }
    editor.loadLayout(v.layout);
    if (v.layout.biomeId) el.biome.value = v.layout.biomeId;
    el.hint.textContent = `Imported ${editor.nodeCount} nodes`;
    refreshStats();
  } catch (err) {
    el.hint.textContent = `Import error: ${err?.message || err}`;
  }
});

el.clear.addEventListener('click', () => {
  editor.clearNodes();
  refreshStats();
});

// Boot
fillBiomes();
fillFamilies();
fillPalette();
editor.setSelectedPalette(selectedId);

// Restore last local draft if any
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const v = validateNodeLayout(JSON.parse(raw));
    if (v.ok) {
      editor.loadLayout(v.layout);
      if (v.layout.biomeId) el.biome.value = v.layout.biomeId;
      el.hint.textContent = `Restored ${editor.nodeCount} nodes from local draft`;
    }
  }
} catch {
  /* ok */
}

// Poll stats while placing
setInterval(refreshStats, 500);
refreshStats();

console.info('[DevNode] ready · palette', NODE_PALETTE.length, '· empty', createEmptyNodeLayout());
