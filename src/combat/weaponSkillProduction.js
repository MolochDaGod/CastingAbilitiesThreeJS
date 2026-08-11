/**
 * Production weapon skill pattern — scriptable, repeatable, catalog-first.
 *
 * Compiles ObjectStore / master-weaponSkills / t0 rows into a full runtime
 * package: anim · VFX · delivery · physics · statuses · damage · readiness.
 *
 * Aligns with fleet FleetWeaponSkill (epicfight) without forking a second DB.
 *
 * Author loop:
 *  1. Catalog skill id exists (WEAPON_SKILLS / t0) — never invent ids
 *  2. Optional override JSON under skills/production/<id>.json
 *  3. compileProductionWeaponSkill(catalogRow, weaponCtx)
 *  4. assessProductionReadiness → green/yellow/red
 *  5. DRC / fleet host cast via compiled package
 *
 * Scaffold: node scripts/scaffold-weapon-skill.mjs --id staff_fire_bolt
 *
 * @see docs/WEAPON_SKILL_PRODUCTION_SSOT.md
 * @see gameopen/lib/epicfight/src/combat/fleet/weaponSkill.ts
 */

import { bindFromCatalogSkill } from './staffWeaponSkillsBind.js';
import { inferDeliveryPattern, enrichSkillDelivery } from './skillDelivery.js';
import { animRoleForSkill, vfxIdForSkill, labMapForWeaponType } from '../api/weaponSkillsCatalog.js';
import { parseCatalogEffects } from './skillStatusSystem.js';
import { planElementalLinearCast } from './elementalLinearCast.js';
import { isStaffNormalAttack, staffProjectileMeshUrl, STAFF_CHARGE } from '../vfx/staffOrbVfx.js';
import { inferElementAttackKind } from '../vfx/elementAttackVfx.js';
import { isPistolBulletSkill, PISTOL_BULLET } from '../vfx/pistolBulletVfx.js';

/**
 * @typedef {object} ProductionAnim
 * @property {string} pack           sword_shield|magic|longbow|pistol
 * @property {string} role           attack|cast|block|attack1|…
 * @property {string|null} clip      pack/clip path when known
 * @property {number} hitFrameDelay  s
 * @property {string[]} [comboStages]
 */

/**
 * @typedef {object} ProductionVfx
 * @property {string|null} castEffectId
 * @property {string|null} travelEffectId
 * @property {string|null} impactEffectId
 * @property {string|null} meshId
 * @property {string|null} projectileMeshUrl
 * @property {string|null} chargeMeshUrl
 * @property {number} [trailColor]
 * @property {number} intensity
 */

/**
 * @typedef {object} ProductionPhysics
 * @property {number} force
 * @property {number} knockbackMm
 * @property {number} knockupVy
 * @property {number} contactRadius
 * @property {number} aoeM
 * @property {number} speed
 * @property {number} life
 * @property {{ type: string, radius?: number, halfHeight?: number, halfExtents?: number[] }|null} collider
 */

/**
 * @typedef {object} ProductionWeaponSkill
 * @property {string} id
 * @property {string} label
 * @property {string} [uuid]
 * @property {string} weaponTypeId
 * @property {number} slot
 * @property {string} slotType
 * @property {string} style          melee|ranged|spell
 * @property {string} [element]
 * @property {number} damage
 * @property {string} damageType
 * @property {number} cooldown
 * @property {number} castDuration
 * @property {number} staminaCost
 * @property {number} manaCost
 * @property {number|null} rangeM
 * @property {string[]} effects
 * @property {object[]} statuses
 * @property {ProductionAnim} anim
 * @property {ProductionVfx} vfx
 * @property {ProductionPhysics} physics
 * @property {string} delivery
 * @property {object|null} castPlan
 * @property {object|null} meshKind
 * @property {boolean} useOrbProjectile
 * @property {boolean} isFocus
 * @property {boolean} isWard
 * @property {string} source
 * @property {object} [prefab]
 * @property {object} [overrides]
 */

/**
 * Default physics by style (SI).
 * @param {string} style
 * @param {object} skill
 */
export function defaultPhysicsForStyle(style, skill = {}) {
  const dmg = Number(skill.damage) || 0;
  const intensity = Math.min(2, 0.7 + dmg / 40);
  if (style === 'melee') {
    return {
      force: 7 * intensity,
      knockbackMm: 140 * intensity,
      knockupVy: 1.2,
      contactRadius: 0.65,
      aoeM: /sweep|aoe|cleave|wide/i.test(`${skill.id} ${skill.name}`) ? 1.8 : 0.9,
      speed: 12,
      life: 0.45,
      collider: { type: 'sphere', radius: 0.55 }
    };
  }
  if (style === 'ranged') {
    const gun =
      /gun|pistol|flint|t0-gun|handgun/i.test(
        `${skill.id || ''} ${skill.name || ''} ${skill.weaponTypeId || ''}`
      );
    return {
      force: gun ? 6 * intensity : 6 * intensity,
      knockbackMm: gun ? 80 * intensity : 100 * intensity,
      knockupVy: gun ? 0.4 : 0.6,
      contactRadius: gun ? 0.12 : 0.35,
      aoeM: gun ? 0.35 : 0.8,
      speed: gun ? 90 : 28,
      life: gun ? 1.2 : 2.2,
      collider: { type: 'sphere', radius: gun ? 0.12 : 0.28 }
    };
  }
  // spell
  return {
    force: 8 * intensity,
    knockbackMm: 160 * intensity,
    knockupVy: 2.0,
    contactRadius: 0.4,
    aoeM: skill.range ? Math.min(3, Number(skill.range) * 0.12) : 1.2,
    speed: 16,
    life: 2.5,
    collider: { type: 'sphere', radius: 0.4 }
  };
}

/**
 * Compile catalog skill + weapon context → production package.
 *
 * @param {object} catalogSkill  master-weaponSkills / t0 / WeaponSkillDef row
 * @param {{
 *   weaponTypeId?: string,
 *   animPack?: string,
 *   labStyle?: string,
 *   barSlot?: number,
 *   overrides?: object
 * }} [ctx]
 * @returns {ProductionWeaponSkill|null}
 */
export function compileProductionWeaponSkill(catalogSkill, ctx = {}) {
  if (!catalogSkill?.id) return null;
  const ov = ctx.overrides || catalogSkill.production || catalogSkill.prefab?.production || {};
  const weaponTypeId = String(
    ctx.weaponTypeId || catalogSkill.weaponTypeId || 'SWORD'
  ).toUpperCase();
  const lab = labMapForWeaponType(weaponTypeId);
  const labStyle = ctx.labStyle || lab.style || 'melee';
  const animPack = ctx.animPack || lab.pack || 'sword_shield';

  const nameId = `${catalogSkill.id} ${catalogSkill.name || catalogSkill.label || ''}`;
  const dmg = Number(catalogSkill.damage) || 0;
  const isHeal = dmg < 0 || /heal|sprout|radiant/i.test(nameId);
  const isBuff =
    !isHeal &&
    dmg === 0 &&
    /focus|stance|guard|ward|buff|shield|brace|aim|reload|cover|evade/i.test(nameId);
  const isFocus = isBuff && /focus|take.?aim|wind.?up|power.?stance/i.test(nameId);
  const isWard = isBuff && /ward|shield|guard|brace|cover/i.test(nameId);

  let style = labStyle === 'spell' ? 'spell' : labStyle === 'ranged' ? 'ranged' : 'melee';
  if (isBuff || isHeal) style = 'spell';
  if (labStyle === 'ranged' && !isBuff) style = 'ranged';

  // Staff school bind fills empty VFX
  const staffB =
    bindFromCatalogSkill({
      id: catalogSkill.id,
      name: catalogSkill.name || catalogSkill.label,
      description: catalogSkill.description,
      damageType: catalogSkill.damageType,
      effects: catalogSkill.effects,
      cooldown: catalogSkill.cooldown,
      castTime: catalogSkill.castTime ?? catalogSkill.castDuration,
      range: catalogSkill.range ?? catalogSkill.rangeM,
      damage: catalogSkill.damage,
      slotType: catalogSkill.slotType,
      resourceCost: catalogSkill.resourceCost
    }) || null;

  const element =
    ov.element ||
    staffB?.element ||
    lab.element ||
    inferElementFromDamageType(catalogSkill.damageType) ||
    (style === 'spell' ? 'arcane' : 'physical');

  const castRaw = catalogSkill.castTime ?? catalogSkill.castDuration;
  const castDuration =
    ov.castDuration ??
    (castRaw == null || castRaw === '' || castRaw === 'Instant'
      ? 0
      : Number(castRaw) || 0);

  const cooldown =
    ov.cooldown ??
    (catalogSkill.cooldown == null || catalogSkill.cooldown === ''
      ? 0
      : Number(catalogSkill.cooldown) || 0);

  const rangeM =
    ov.rangeM ??
    (catalogSkill.range != null && catalogSkill.range !== ''
      ? Number(catalogSkill.range)
      : staffB?.rangeM || (style === 'melee' ? 2.2 : style === 'ranged' ? 18 : 14));

  const effects = Array.isArray(catalogSkill.effects)
    ? catalogSkill.effects.slice()
    : [];

  const physicsBase = defaultPhysicsForStyle(style, catalogSkill);
  const physics = {
    ...physicsBase,
    ...(ov.physics || {}),
    force: ov.force ?? physicsBase.force,
    knockbackMm: ov.knockbackMm ?? physicsBase.knockbackMm,
    knockupVy: ov.knockupVy ?? physicsBase.knockupVy,
    contactRadius: ov.contactRadius ?? physicsBase.contactRadius,
    aoeM: ov.aoeM ?? ov.aoeRadius ?? physicsBase.aoeM,
    speed: ov.projectileSpeed ?? ov.speed ?? physicsBase.speed,
    life: ov.life ?? physicsBase.life,
    collider: ov.collider || physicsBase.collider
  };

  const statuses =
    ov.statuses ||
    parseCatalogEffects(effects, {
      damage: dmg,
      force: physics.force,
      knockbackMm: physics.knockbackMm,
      knockupVy: physics.knockupVy,
      element
    });

  const animRole =
    ov.animRole ||
    animRoleForSkill({
      ...catalogSkill,
      labStyle: style,
      labPack: animPack,
      slotType: catalogSkill.slotType
    });

  const castEffectId =
    ov.castEffectId ||
    catalogSkill.castEffectId ||
    catalogSkill.prefab?.castEffectId ||
    staffB?.castEffectId ||
    null;
  const travelEffectId =
    ov.travelEffectId ||
    catalogSkill.travelEffectId ||
    catalogSkill.prefab?.travelEffectId ||
    staffB?.travelEffectId ||
    null;
  const impactEffectId =
    ov.impactEffectId ||
    catalogSkill.impactEffectId ||
    catalogSkill.prefab?.impactEffectId ||
    staffB?.impactEffectId ||
    vfxIdForSkill({
      ...catalogSkill,
      labStyle: style,
      castEffectId,
      travelEffectId,
      impactEffectId: catalogSkill.impactEffectId
    });

  const delivery =
    ov.delivery ||
    staffB?.pathMode ||
    inferDeliveryPattern({
      ...catalogSkill,
      style,
      pathMode: staffB?.pathMode,
      isFocus,
      isWard,
      effects
    });

  const gunBlob = `${catalogSkill.id} ${catalogSkill.name || ''} ${weaponTypeId} ${animPack}`;
  const useBullet =
    ov.useBulletProjectile === true ||
    isPistolBulletSkill({
      ...catalogSkill,
      style,
      animPack,
      weaponTypeId,
      slot: ctx.barSlot ?? 0,
      slotType: catalogSkill.slotType
    }) ||
    (/t0-gun|flint|pistol|handgun/i.test(gunBlob) &&
      (catalogSkill.slotType === 'primary' || ctx.barSlot === 0));

  const useOrb =
    !useBullet &&
    (ov.useOrbProjectile ??
      staffB?.useOrbProjectile ??
      (style === 'spell' &&
        (isStaffNormalAttack({
          ...catalogSkill,
          style,
          slot: ctx.barSlot ?? 0,
          pathMode: staffB?.pathMode
        }) ||
          staffB?.pathMode === 'stream')));

  const meshKind = inferElementAttackKind({
    ...catalogSkill,
    element,
    pathMode: staffB?.pathMode,
    effects,
    style,
    slotType: catalogSkill.slotType
  });

  const castPlan = planElementalLinearCast(
    {
      ...catalogSkill,
      element,
      pathMode: staffB?.pathMode || 'stream',
      style,
      slotType: catalogSkill.slotType,
      isFocus,
      isWard,
      effects
    },
    { focusCombat: true, intensity: 1 }
  );

  const manaCost =
    ov.manaCost ??
    catalogSkill.resourceCost?.mana ??
    catalogSkill.manaCost ??
    (style === 'spell' ? 4 : 0);
  const staminaCost =
    ov.staminaCost ??
    catalogSkill.resourceCost?.stamina ??
    catalogSkill.staminaCost ??
    (style === 'melee' ? 8 : style === 'ranged' ? 6 : 4);

  /** @type {ProductionWeaponSkill} */
  const prod = {
    id: catalogSkill.id,
    uuid: catalogSkill.uuid || null,
    label: catalogSkill.name || catalogSkill.label || catalogSkill.id,
    description: catalogSkill.description || '',
    weaponTypeId,
    slot: ctx.barSlot ?? catalogSkill.slot ?? 0,
    slotType: catalogSkill.slotType || 'ability',
    style,
    skillKind: isBuff ? 'buff' : isHeal ? 'heal' : style,
    element,
    abilityElement: staffB?.element || element,
    damage: dmg,
    damageType: catalogSkill.damageType || (style === 'spell' ? element : 'physical'),
    cooldown,
    castDuration,
    staminaCost,
    manaCost,
    rangeM,
    effects,
    statuses,
    anim: {
      pack: animPack,
      role: animRole,
      clip:
        ov.animClip ||
        catalogSkill.animation ||
        catalogSkill.prefab?.animationClip ||
        staffB?.castClip ||
        null,
      hitFrameDelay: ov.hitFrameDelay ?? (style === 'melee' ? 0.18 : castDuration * 0.85),
      comboStages: ov.comboStages || null
    },
    vfx: {
      castEffectId,
      travelEffectId,
      impactEffectId,
      meshId:
        ov.meshId ||
        (useBullet ? 'bullet1' : useOrb ? `orb-${element === 'ice' ? 'ice' : element}` : null),
      projectileMeshUrl:
        ov.projectileMeshUrl ||
        (useBullet ? PISTOL_BULLET.meshUrl : null) ||
        staffB?.projectileMeshUrl ||
        (useOrb ? staffProjectileMeshUrl(element) : null),
      chargeMeshUrl: useBullet
        ? null
        : ov.chargeMeshUrl || staffB?.chargeMeshUrl || STAFF_CHARGE.path,
      trailColor: ov.trailColor || (useBullet ? PISTOL_BULLET.trailColor : undefined),
      intensity: ov.intensity ?? 1
    },
    physics,
    delivery,
    pathMode: staffB?.pathMode || (typeof delivery === 'string' && delivery.startsWith('path_')
      ? delivery.replace('path_', '')
      : style === 'spell'
        ? 'stream'
        : null),
    presentation: staffB?.presentation || null,
    castPlan,
    meshKind,
    useOrbProjectile: !!useOrb,
    useBulletProjectile: !!useBullet,
    projectileKind: useBullet ? 'bullet' : useOrb ? 'orb' : null,
    isFocus,
    isWard,
    isHeal,
    focusDurationSec: isFocus ? 3 : undefined,
    focusDamageMul: isFocus ? 1.35 : undefined,
    catalogSkillId: catalogSkill.id,
    source: catalogSkill.source || 'catalog',
    prefab: catalogSkill.prefab || null,
    overrides: ov,
    icon: catalogSkill.icon || null,
    iconUrl: catalogSkill.iconUrl || null,
    // DRC-compatible flat fields
    castEffectId,
    travelEffectId,
    impactEffectId,
    projectileMeshUrl:
      ov.projectileMeshUrl ||
      staffB?.projectileMeshUrl ||
      (useOrb ? staffProjectileMeshUrl(element) : null),
    chargeMeshUrl: ov.chargeMeshUrl || staffB?.chargeMeshUrl || STAFF_CHARGE.path,
    force: physics.force,
    knockbackMm: physics.knockbackMm,
    knockupVy: physics.knockupVy,
    aoe: physics.aoeM,
    projectileSpeed: physics.speed
  };

  // Enrich delivery mesh URLs
  const enriched = enrichSkillDelivery(prod);
  prod.delivery = enriched.delivery || prod.delivery;
  prod.summonMeshUrl = enriched.summonMeshUrl;
  if (enriched.projectileMeshUrl) prod.projectileMeshUrl = enriched.projectileMeshUrl;

  return prod;
}

/**
 * @param {string} [dt]
 */
function inferElementFromDamageType(dt) {
  const t = String(dt || '').toLowerCase();
  if (t === 'fire') return 'fire';
  if (t === 'frost' || t === 'ice' || t === 'water') return 'ice';
  if (t === 'nature' || t === 'earth') return 'nature';
  if (t === 'lightning' || t === 'storm' || t === 'wind') return 'storm';
  if (t === 'holy' || t === 'light') return 'holy';
  if (t === 'arcane') return 'arcane';
  if (t === 'physical') return 'physical';
  return null;
}

/**
 * Production readiness (fleet-aligned + casting layers).
 * @param {ProductionWeaponSkill} skill
 */
export function assessProductionReadiness(skill) {
  const missing = [];
  const warnings = [];
  if (!skill?.id) missing.push('id');
  if (!skill?.label) missing.push('label');
  if (skill?.cooldown == null) missing.push('cooldown');
  if (skill?.damage == null) missing.push('damage');
  if (skill?.staminaCost == null && skill?.manaCost == null) missing.push('resourceCost');
  if (!skill?.anim?.role && !skill?.anim?.clip) missing.push('anim.role|clip');
  if (!skill?.vfx?.castEffectId && !skill?.vfx?.impactEffectId && !skill?.vfx?.projectileMeshUrl) {
    warnings.push('no VFX ids / projectile mesh');
  }
  if (!skill?.physics?.collider && !skill?.vfx?.projectileMeshUrl && !skill?.physics?.aoeM) {
    warnings.push('no collider/projectile/aoe — pure buff?');
  }
  if (!skill?.statuses?.length && skill?.style !== 'spell') {
    warnings.push('no parsed statuses from effects[]');
  }
  if (skill?.style === 'spell' && !skill?.element) warnings.push('spell without element');
  if (!skill?.delivery) warnings.push('no delivery pattern');

  const score =
    missing.length === 0 ? (warnings.length === 0 ? 'green' : 'yellow') : 'red';

  return {
    id: skill?.id || 'unknown',
    ok: missing.length === 0,
    score,
    missing,
    warnings,
    layers: {
      anim: !!(skill?.anim?.role || skill?.anim?.clip),
      vfx: !!(skill?.vfx?.castEffectId || skill?.vfx?.impactEffectId),
      physics: !!skill?.physics,
      statuses: (skill?.statuses || []).map((s) => s.id),
      delivery: skill?.delivery || null,
      linear: skill?.castPlan?.linearId || null,
      meshKind: skill?.meshKind?.kind || null
    }
  };
}

/**
 * Convert production package → DRC hotbar skill shape (drop-in for useSkill).
 * @param {ProductionWeaponSkill} prod
 */
export function productionToDrcSkill(prod) {
  if (!prod) return null;
  return {
    id: prod.id,
    label: prod.label,
    slot: prod.slot,
    style: prod.style,
    skillKind: prod.skillKind,
    element: prod.element,
    abilityElement: prod.abilityElement,
    damage: prod.damage,
    damageType: prod.damageType,
    cooldown: prod.cooldown,
    castDuration: prod.castDuration,
    staminaCost: prod.staminaCost,
    manaCost: prod.manaCost,
    rangeM: prod.rangeM,
    effects: prod.effects,
    statuses: prod.statuses,
    animRole: prod.anim.role,
    animPack: prod.anim.pack,
    castClip: prod.anim.clip,
    castEffectId: prod.vfx.castEffectId,
    travelEffectId: prod.vfx.travelEffectId,
    impactEffectId: prod.vfx.impactEffectId,
    projectileMeshUrl: prod.projectileMeshUrl || prod.vfx.projectileMeshUrl,
    chargeMeshUrl: prod.chargeMeshUrl || prod.vfx.chargeMeshUrl,
    useOrbProjectile: prod.useOrbProjectile,
    useBulletProjectile: prod.useBulletProjectile,
    projectileKind: prod.projectileKind,
    pathMode: prod.pathMode,
    presentation: prod.presentation,
    delivery: prod.delivery,
    force: prod.physics.force,
    knockbackMm: prod.physics.knockbackMm,
    knockupVy: prod.physics.knockupVy,
    aoe: prod.physics.aoeM,
    projectileSpeed: prod.physics.speed,
    isFocus: prod.isFocus,
    isWard: prod.isWard,
    focusDurationSec: prod.focusDurationSec,
    focusDamageMul: prod.focusDamageMul,
    catalogSkillId: prod.catalogSkillId,
    icon: prod.icon,
    iconUrl: prod.iconUrl,
    production: prod,
    hitFrameDelay: prod.anim.hitFrameDelay
  };
}

/**
 * Batch compile + readiness report for a weapon hotbar.
 * @param {object[]} skills
 * @param {object} weaponCtx
 */
export function compileWeaponSkillBar(skills, weaponCtx = {}) {
  const compiled = [];
  const report = [];
  (skills || []).forEach((sk, i) => {
    const prod = compileProductionWeaponSkill(sk, { ...weaponCtx, barSlot: i });
    if (!prod) return;
    compiled.push(productionToDrcSkill(prod));
    report.push(assessProductionReadiness(prod));
  });
  return { skills: compiled, report };
}

/** Template for scaffold script / overrides JSON */
export const PRODUCTION_SKILL_OVERRIDE_TEMPLATE = Object.freeze({
  $schema: 'weapon-skill-production-override',
  id: 'catalog_skill_id',
  note: 'Optional overrides only — catalog remains SSOT for id/dmg/cd',
  animRole: null,
  animClip: null,
  hitFrameDelay: null,
  castEffectId: null,
  travelEffectId: null,
  impactEffectId: null,
  meshId: null,
  projectileMeshUrl: null,
  delivery: null,
  element: null,
  force: null,
  knockbackMm: null,
  knockupVy: null,
  aoeM: null,
  projectileSpeed: null,
  statuses: null,
  comboStages: null,
  intensity: 1
});

/** @type {Map<string, object|null>} */
const _overrideCache = new Map();

/**
 * Sync peek — only after warmProductionOverrides / loadProductionOverride.
 * @param {string} skillId
 */
export function getCachedProductionOverride(skillId) {
  if (!skillId || !_overrideCache.has(skillId)) return null;
  return _overrideCache.get(skillId);
}

/**
 * Load optional production override from `public/skills/production/<id>.json`.
 * @param {string} skillId
 * @returns {Promise<object|null>}
 */
export async function loadProductionOverride(skillId) {
  if (!skillId) return null;
  if (_overrideCache.has(skillId)) return _overrideCache.get(skillId);
  try {
    const url = `./skills/production/${skillId}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      _overrideCache.set(skillId, null);
      return null;
    }
    const json = await res.json();
    _overrideCache.set(skillId, json);
    return json;
  } catch {
    _overrideCache.set(skillId, null);
    return null;
  }
}

/**
 * Prefetch overrides for a hotbar (call on equip). Then skillDefToDrc can read cache.
 * @param {string[]} skillIds
 */
export async function warmProductionOverrides(skillIds) {
  const ids = [...new Set((skillIds || []).filter(Boolean))];
  await Promise.all(ids.map((id) => loadProductionOverride(id)));
  return ids.map((id) => ({ id, has: !!getCachedProductionOverride(id) }));
}

/**
 * Compile with optional public override JSON auto-load.
 * @param {object} catalogSkill
 * @param {object} [ctx]
 */
export async function compileProductionWeaponSkillAsync(catalogSkill, ctx = {}) {
  const ov =
    ctx.overrides ||
    (await loadProductionOverride(catalogSkill?.id)) ||
    {};
  return compileProductionWeaponSkill(catalogSkill, { ...ctx, overrides: ov });
}
