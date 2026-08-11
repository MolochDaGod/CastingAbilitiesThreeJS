/**
 * Lab admin gates for casting stage (T0 catalog tiers, default weapon).
 * ?admin=1 or localStorage grudge_lab_admin=1 enables full tier smoke path.
 */

const STORAGE_KEY = 'grudge_lab_admin';

function queryFlag(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/**
 * @returns {{
 *   admin: boolean,
 *   defaultWeaponId: string|null,
 *   maxTier: number,
 *   playerLevel: number
 * }}
 */
export function loadLabAdmin() {
  let stored = false;
  try {
    stored = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /* ignore */
  }
  const q = queryFlag('admin');
  if (q === '1' || q === 'true') {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    stored = true;
  } else if (q === '0' || q === 'false') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    stored = false;
  }

  const maxTier = Number(queryFlag('maxTier') ?? queryFlag('tiers') ?? (stored ? 5 : 0)) || 0;
  const playerLevel = Number(queryFlag('level') ?? queryFlag('lv') ?? (stored ? 60 : 1)) || 1;
  const defaultWeaponId =
    queryFlag('t0') || queryFlag('weapon') || (stored ? 't0-sword' : null);

  return {
    admin: !!stored || maxTier > 0,
    defaultWeaponId,
    maxTier: Math.max(0, Math.min(10, maxTier)),
    playerLevel: Math.max(1, Math.min(100, playerLevel))
  };
}

export function isLabAdmin() {
  return loadLabAdmin().admin;
}

export function labMaxTier() {
  return loadLabAdmin().maxTier;
}

export function labPlayerLevel() {
  return loadLabAdmin().playerLevel;
}

export function labAdminStatusLine() {
  const a = loadLabAdmin();
  if (!a.admin) return 'lab admin: off (?admin=1)';
  return `lab admin: on · maxTier=${a.maxTier} · lv=${a.playerLevel} · default=${a.defaultWeaponId || '—'}`;
}

/**
 * Persist lab admin flags (AdminHub). Partial patch over loadLabAdmin().
 * @param {{ admin?: boolean, level?: number, maxTier?: number, classId?: string, defaultWeaponId?: string|null }} patch
 */
export function saveLabAdmin(patch = {}) {
  try {
    if (patch.admin === true) localStorage.setItem(STORAGE_KEY, '1');
    else if (patch.admin === false) localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private */
  }
  // Query overrides still win on next load; optional keys stashed for status
  try {
    if (patch.level != null) localStorage.setItem('grudge_lab_level', String(patch.level));
    if (patch.maxTier != null) localStorage.setItem('grudge_lab_max_tiers', String(patch.maxTier));
    if (patch.defaultWeaponId != null) {
      localStorage.setItem('grudge_lab_default_weapon', String(patch.defaultWeaponId));
    }
  } catch {
    /* */
  }
  return loadLabAdmin();
}
