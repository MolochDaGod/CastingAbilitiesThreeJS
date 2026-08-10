/**
 * Local draft save/load for deployable prefabs (weapons, buildables, enemies…).
 *
 * Lab storage only — not player SSOT (Railway) and not catalog mint (ObjectStore).
 * Export JSON → hand off to ObjectStore pipelines for real UUIDs.
 *
 * @see docs/ADMIN_HUB_F1_F5_SSOT.md
 */

import { createDeployableDraft, validateDeployableDraft, exportDeployableSnapshot } from './deployableContract.js';
import { downloadJson } from './prefabScaffold.js';

const STORAGE_KEY = 'grudge.casting.deployableDrafts.v1';
const MAX_DRAFTS = 80;

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @returns {{ version: number, drafts: object[] }}
 */
export function loadDraftLibrary() {
  if (typeof localStorage === 'undefined') return { version: 1, drafts: [] };
  const data = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!data || !Array.isArray(data.drafts)) return { version: 1, drafts: [] };
  return { version: data.version || 1, drafts: data.drafts };
}

function persist(lib) {
  if (typeof localStorage === 'undefined') return false;
  const drafts = (lib.drafts || []).slice(0, MAX_DRAFTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, drafts }));
  return true;
}

/**
 * List drafts, optional filter by kind or adminTab.
 * @param {{ kind?: string, adminTab?: string }} [filter]
 */
export function listDrafts(filter = {}) {
  const { drafts } = loadDraftLibrary();
  return drafts
    .filter((d) => {
      if (filter.kind && d.kind !== filter.kind) return false;
      if (filter.adminTab && d.adminTab !== filter.adminTab) return false;
      return true;
    })
    .sort((a, b) => String(b._savedAt || b._createdAt || '').localeCompare(String(a._savedAt || a._createdAt || '')));
}

/**
 * @param {string} id
 */
export function getDraft(id) {
  return loadDraftLibrary().drafts.find((d) => d.id === id) || null;
}

/**
 * Save or update a draft. Returns saved draft.
 * @param {object} draft
 */
export function saveDraft(draft) {
  if (!draft?.id) throw new Error('draft.id required');
  const lib = loadDraftLibrary();
  const now = new Date().toISOString();
  const next = {
    ...draft,
    _local: true,
    _savedAt: now,
    _createdAt: draft._createdAt || now
  };
  const idx = lib.drafts.findIndex((d) => d.id === next.id);
  if (idx >= 0) lib.drafts[idx] = next;
  else lib.drafts.unshift(next);
  persist(lib);
  return next;
}

/**
 * @param {string} id
 */
export function deleteDraft(id) {
  const lib = loadDraftLibrary();
  lib.drafts = lib.drafts.filter((d) => d.id !== id);
  persist(lib);
  return true;
}

/**
 * Create + save a new draft of a kind.
 * @param {string} kindId
 * @param {object} [fields]
 */
export function createAndSaveDraft(kindId, fields = {}) {
  const draft = createDeployableDraft(kindId, fields);
  return saveDraft(draft);
}

/**
 * Duplicate draft under new id.
 * @param {string} id
 */
export function duplicateDraft(id) {
  const src = getDraft(id);
  if (!src) return null;
  const copy = createDeployableDraft(src.kind, {
    ...src,
    name: `${src.name} (copy)`,
    id: undefined,
    uuid: null
  });
  // preserve layers where useful
  if (src.layers) copy.layers = JSON.parse(JSON.stringify(src.layers));
  if (src.assets) copy.assets = { ...src.assets };
  copy.id = `draft-${src.kind}-${Date.now().toString(36)}`;
  copy.uuid = null;
  return saveDraft(copy);
}

/**
 * Download full export pack for one draft.
 * @param {string|object} idOrDraft
 */
export function downloadDraftExport(idOrDraft) {
  const draft = typeof idOrDraft === 'string' ? getDraft(idOrDraft) : idOrDraft;
  if (!draft) return false;
  const snap = exportDeployableSnapshot(draft);
  const name = String(draft.id || 'draft').replace(/[^a-z0-9_-]+/gi, '-');
  return downloadJson(snap, `deployable-${name}.json`);
}

/**
 * Import a draft JSON (from file or paste). Saves locally.
 * @param {object} data export snapshot or raw draft
 */
export function importDraftJson(data) {
  const draft = data?.draft || data;
  if (!draft?.kind || !draft?.id) throw new Error('Invalid draft JSON (need kind + id)');
  const cleaned = {
    ...draft,
    uuid: draft.uuid || null,
    _local: true
  };
  // avoid clobbering: new id if already exists
  if (getDraft(cleaned.id)) {
    cleaned.id = `${cleaned.id}-import-${Date.now().toString(36)}`;
  }
  return saveDraft(cleaned);
}

/**
 * Stats for admin hub header.
 */
export function draftStats() {
  const drafts = listDrafts();
  const byKind = {};
  const byTab = {};
  for (const d of drafts) {
    byKind[d.kind] = (byKind[d.kind] || 0) + 1;
    byTab[d.adminTab] = (byTab[d.adminTab] || 0) + 1;
  }
  return { total: drafts.length, byKind, byTab, max: MAX_DRAFTS };
}

export { validateDeployableDraft, exportDeployableSnapshot, createDeployableDraft };
