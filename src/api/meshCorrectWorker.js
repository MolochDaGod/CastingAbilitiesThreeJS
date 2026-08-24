/**
 * Lab AI worker — verify / correct mesh swap + blend (no second kit loader).
 * Prompt: docs/ai/MESH_CORRECT_WORKER.md
 */
import { verifyPlayKit, verifyMeshSwap, verifyClipBind } from '../character/meshSwapGuard.js';
import { stripPositionTracks } from '../animation/blendCorrect.js';
import { applyMeshIdsExclusive } from '../character/toonKitPlay.js';
import { reGroundToonKit } from '../character/toonKitPlay.js';

export const MESH_CORRECT_WORKER_ID = 'casting-mesh-correct';

export const MESH_CORRECT_TOOLS = [
  {
    name: 'verify_kit',
    description: 'Audit current Toon play kit: Bip001, contract, SI height, no Mixamo.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'verify_mesh_swap',
    description: 'Reject impossible equip: no .glb URL, no mixamorig, mesh_ids on SAME kit only.',
    input_schema: {
      type: 'object',
      properties: { meshIds: { type: 'array', items: { type: 'string' } } },
    },
  },
  {
    name: 'apply_safe_mesh_ids',
    description: 'Apply mesh_ids only if verify_mesh_swap ok. Visibility swap — never a second body.',
    input_schema: {
      type: 'object',
      properties: { meshIds: { type: 'array', items: { type: 'string' } } },
      required: ['meshIds'],
    },
  },
  {
    name: 'verify_clip',
    description: 'Clip must be Bip001 rotation tracks. Warns leftover .position (shake / hip-float).',
    input_schema: { type: 'object', properties: { clipName: { type: 'string' } } },
  },
];

/**
 * @param {string} name
 * @param {Record<string, unknown>} input
 * @param {{ character?: object }} ctx
 */
export function runMeshCorrectTool(name, input = {}, ctx = {}) {
  const model = ctx.character?.model || ctx.character?.root || null;
  if (name === 'verify_kit') return verifyPlayKit(model);
  if (name === 'verify_mesh_swap') return verifyMeshSwap(model, input.meshIds || []);
  if (name === 'apply_safe_mesh_ids') {
    const gate = verifyMeshSwap(model, input.meshIds || []);
    if (!gate.ok) return { ok: false, applied: false, ...gate };
    const report = applyMeshIdsExclusive(model, input.meshIds || []);
    if (model && typeof reGroundToonKit === 'function') {
      try {
        reGroundToonKit(model, 0);
      } catch {
        /* */
      }
    }
    return { ok: true, applied: true, ...report, errors: gate.errors, warnings: gate.warnings };
  }
  if (name === 'verify_clip') {
    const clipName = String(input.clipName || 'idle');
    const act = ctx.character?.actions?.get?.(clipName);
    const clip = act?._clip || act?.getClip?.();
    return verifyClipBind(model, clip);
  }
  return { ok: false, errors: [`unknown-tool ${name}`], warnings: [] };
}

export function attachMeshCorrectWorker(character) {
  const api = {
    id: MESH_CORRECT_WORKER_ID,
    tools: MESH_CORRECT_TOOLS,
    run: (name, input) => runMeshCorrectTool(name, input, { character }),
    verify: () => verifyPlayKit(character?.model),
  };
  if (typeof window !== 'undefined') {
    window.__castingMeshCorrect = api;
  }
  return api;
}

export { stripPositionTracks, verifyPlayKit, verifyMeshSwap, verifyClipBind };
