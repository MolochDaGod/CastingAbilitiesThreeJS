/**
 * Worge claw slot-4 form bind — Enchanting Bench contract.
 * Catalog: info master-enchants.json (enchant-claw-form-*).
 * Any class may equip unenchanted claws. Slot 4 stays empty until this bind.
 */
export const CLAW_FORM_BINDS = Object.freeze({
  bear: { enchantId: 'enchant-claw-form-bear', skillId: 'bear_form' },
  raptor: { enchantId: 'enchant-claw-form-raptor', skillId: 'raptor_form' },
  bird: { enchantId: 'enchant-claw-form-bird', skillId: 'bird_form' },
  wolf: { enchantId: 'enchant-claw-form-wolf', skillId: 'wolf_form' },
  cheetah: { enchantId: 'enchant-claw-form-cheetah', skillId: 'cheetah_form' },
  spider: { enchantId: 'enchant-claw-form-spider', skillId: 'spider_form' }
});

export const ENCHANTING_STATION = 'enchanting-table';

/**
 * @param {{ classId?: string, knownForms?: string[], stationId?: string }} ctx
 * @param {string} formId
 */
export function canBindClawForm(ctx, formId) {
  if ((ctx.classId || '') !== 'worge' && (ctx.classId || '') !== 'verduror') {
    return { ok: false, reason: 'Worge (or Verduror) must apply the bind' };
  }
  if ((ctx.stationId || ENCHANTING_STATION) !== ENCHANTING_STATION) {
    return { ok: false, reason: 'Must be at Enchanting Bench' };
  }
  const known = ctx.knownForms || [];
  if (!known.includes(formId)) {
    return { ok: false, reason: `Form not known: ${formId}` };
  }
  if (!CLAW_FORM_BINDS[formId]) return { ok: false, reason: 'Unknown claw form' };
  return { ok: true };
}

/**
 * Bind form skill into claw prefab slot 4. Mutates a copy.
 * @param {object} prefab master-weapon-prefabs claw row
 * @param {string} formId
 * @param {{ classId?: string, knownForms?: string[], stationId?: string }} ctx
 */
export function applyClawFormEnchant(prefab, formId, ctx = {}) {
  const gate = canBindClawForm(ctx, formId);
  if (!gate.ok) return { ok: false, reason: gate.reason, prefab };
  if ((prefab?.weaponType || '') !== 'CLAW') {
    return { ok: false, reason: 'Target is not a CLAW', prefab };
  }
  const bind = CLAW_FORM_BINDS[formId];
  const next = structuredClone(prefab);
  const ult = next.skills?.slots?.find((s) => s.type === 'ultimate');
  if (ult) {
    ult.skillIds = [bind.skillId];
    ult.enchantId = bind.enchantId;
    ult.formId = formId;
    ult.signature = bind.skillId;
  }
  next.formId = formId;
  next.signature = bind.skillId;
  return { ok: true, prefab: next, enchantId: bind.enchantId, skillId: bind.skillId };
}
