/**
 * Modular character pipeline — maps the Meshy-style brief onto Toon RTS play.
 *
 * Play body stays loadRaceKit / mesh_ids. Meshy is NOT a play hero.
 * Hair pilots reuse existing head_* variants (no isolated hair GLB on the kit).
 */
export const CLOTHING_LAYERS = Object.freeze([
  { layer_index: 0, id: 'base', slot: 'body', note: 'Skin / robe base — always one Body_*' },
  { layer_index: 1, id: 'under', slot: 'arms', note: 'Arms_* when body is not a onesie' },
  { layer_index: 1, id: 'under_legs', slot: 'legs', note: 'Legs_* when body is not a onesie' },
  { layer_index: 2, id: 'outer', slot: 'shoulders', note: 'Shoulderpads_* over body' },
  { layer_index: 3, id: 'accessories', slot: 'bag', note: 'Xtra_bag / quiver / wood on back sockets' }
]);

export const HEAD_SOCKET = 'Bip001 Head';
export const SCALP_SOCKET = 'scalp';

/**
 * 5 hair/head style pilots → existing Toon head letters.
 * Isolated hair toppers are not on the play GLB; these are named dressing-room presets.
 */
export const HAIR_STYLE_PILOTS = Object.freeze([
  {
    asset_name: 'hair_short_battle_crop',
    category: 'hair',
    layer_index: 3,
    socket_point: HEAD_SOCKET,
    scale_factor: 1,
    head_variant: 'A',
    raceHint: 'human',
    label: 'Short battle-crop',
    archetype: 'warrior'
  },
  {
    asset_name: 'hair_long_braid',
    category: 'hair',
    layer_index: 3,
    socket_point: HEAD_SOCKET,
    scale_factor: 1,
    head_variant: 'C',
    raceHint: 'elf',
    label: 'Long braid',
    archetype: 'ranger'
  },
  {
    asset_name: 'hair_bald_scalp_marks',
    category: 'hair',
    layer_index: 3,
    socket_point: HEAD_SOCKET,
    scale_factor: 1,
    head_variant: 'E',
    raceHint: 'undead',
    label: 'Bald / scalp marks',
    archetype: 'shaman'
  },
  {
    asset_name: 'hair_hood_only',
    category: 'hair',
    layer_index: 3,
    socket_point: HEAD_SOCKET,
    scale_factor: 1,
    head_variant: 'F',
    raceHint: 'human',
    label: 'Hood',
    archetype: 'rogue'
  },
  {
    asset_name: 'hair_wild_long',
    category: 'hair',
    layer_index: 3,
    socket_point: HEAD_SOCKET,
    scale_factor: 1,
    head_variant: 'B',
    raceHint: 'barbarian',
    label: 'Wild long',
    archetype: 'berserker'
  }
]);

export function hairPilotById(id) {
  return HAIR_STYLE_PILOTS.find((p) => p.asset_name === id) || null;
}

/** Apply a named hair pilot via existing EquipmentManager head slot. */
export function applyHairPilot(equipment, assetName) {
  const p = hairPilotById(assetName);
  if (!equipment?.setSlot || !p) return null;
  equipment.setSlot('head', p.head_variant);
  return p;
}
