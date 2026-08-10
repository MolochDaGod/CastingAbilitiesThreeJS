/**
 * Honest player identity for casting host (player frontend path).
 *
 * Priority:
 *   1. URL ?name= & ?race= & ?characterId=
 *   2. localStorage handoff (Foundry / heroes / Open)
 *   3. Race kit label from grudge6 SSOT — never invent "Hero" / "mage" as product name
 */
import { DEFAULT_RACE, raceDef, RACES } from '../config/grudge6SSOT.js';

const ROLE_LABEL = {
  mage: 'Mage',
  warrior: 'Warrior',
  ranger: 'Ranger',
  priest: 'Priest',
  rogue: 'Rogue',
  default: 'Warlord'
};

/**
 * @returns {{
 *   characterId: string|null,
 *   raceId: string,
 *   roleId: string,
 *   displayName: string,
 *   raceLabel: string,
 *   roleLabel: string,
 *   source: string
 * }}
 */
export function resolvePlayerIdentity() {
  const q = readQuery();
  const ls = readLocalStorageHandoff();

  const raceRaw = q.race || ls.raceId || DEFAULT_RACE;
  const raceId = normalizeRaceId(raceRaw);
  const def = raceDef(raceId);
  const roleId = String(q.role || q.class || ls.classId || ls.roleId || 'mage').toLowerCase();
  const roleLabel = ROLE_LABEL[roleId] || ROLE_LABEL.default;

  let displayName =
    (q.name && String(q.name).trim()) ||
    (ls.name && String(ls.name).trim()) ||
    '';

  const characterId = q.characterId || ls.characterId || null;
  let source = 'kit';

  if (q.name || q.race || q.characterId) source = 'url';
  else if (ls.name || ls.characterId || ls.raceId) source = 'handoff';

  if (!displayName) {
    // Honest default: race + role — not fake "Hero" or internal preset id alone
    displayName = `${def.short ? capitalize(def.short) : def.label} ${roleLabel}`;
    source = source === 'kit' ? 'kit-default' : source;
  }

  return {
    characterId,
    raceId,
    roleId,
    displayName,
    raceLabel: def.label,
    roleLabel,
    source
  };
}

/**
 * Frame-friendly portrait initials from race id.
 * @param {string} raceId
 */
export function racePortraitGlyph(raceId) {
  const id = normalizeRaceId(raceId);
  return String(id || 'WK').slice(0, 3).toUpperCase();
}

/**
 * @param {string} raceId
 * @param {string} [roleId]
 */
export function displayNameForKit(raceId, roleId = 'mage') {
  const def = raceDef(normalizeRaceId(raceId));
  const roleLabel = ROLE_LABEL[String(roleId).toLowerCase()] || ROLE_LABEL.default;
  return `${capitalize(def.short || def.label)} ${roleLabel}`;
}

function normalizeRaceId(raw) {
  const s = String(raw || DEFAULT_RACE).trim();
  const up = s.toUpperCase();
  if (RACES[up]) return up;
  // allow short names: human, elf, orc…
  const byShort = Object.values(RACES).find(
    (r) => r.short === s.toLowerCase() || r.label.toLowerCase() === s.toLowerCase()
  );
  return byShort?.id || DEFAULT_RACE;
}

function capitalize(s) {
  const t = String(s || '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function readQuery() {
  if (typeof window === 'undefined') return {};
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      name: p.get('name'),
      race: p.get('race') || p.get('raceId'),
      role: p.get('role') || p.get('class') || p.get('classId'),
      characterId: p.get('characterId') || p.get('char') || p.get('id')
    };
  } catch {
    return {};
  }
}

function readLocalStorageHandoff() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const characterId =
      localStorage.getItem('grudge_active_character') ||
      localStorage.getItem('gruda_active_character') ||
      localStorage.getItem('grudge.open.selectedCharacterId') ||
      null;

    let name = null;
    let raceId = null;
    let classId = null;

    // Foundry / heroes often stash last payload
    const raw =
      localStorage.getItem('grudge_character_handoff') ||
      localStorage.getItem('grudge_active_character_json') ||
      localStorage.getItem('grudge.open.selectedCharacter');
    if (raw) {
      try {
        const o = JSON.parse(raw);
        name = o.name || o.displayName || null;
        raceId = o.raceId || o.race || null;
        classId = o.classId || o.class || o.role || null;
      } catch {
        /* ignore */
      }
    }

    // era map may only have id
    try {
      const byEra = JSON.parse(localStorage.getItem('grudge.selectedCharacterByEra') || '{}');
      if (!characterId && byEra.warlords) {
        /* id only */
      }
    } catch {
      /* ignore */
    }

    return { characterId, name, raceId, classId };
  } catch {
    return {};
  }
}
