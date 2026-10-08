/**
 * One-mixer skill playback for every weapon skill.
 * Hero body stays on CharacterController.mixer — this only resolves and crossfades.
 * Pack-prefixed keys (sword_shield:attack1) count. Gait keys are never stolen.
 */
const GAIT = /^(idle|walk|run|jump|walk[LR]|run[LR])$/i;

export function skillClipCandidates(skill, role) {
  const raw = [
    role,
    skill?.animRole,
    skill?.animation,
    skill?.prefab?.animationClip,
    skill?.prefab?.animRole
  ];
  const out = [];
  for (const value of raw) {
    if (!value || typeof value !== 'string') continue;
    if (/^https?:/i.test(value)) continue;
    const leaf = value.split('/').pop().replace(/\.(json|fbx|glb)$/i, '').split(':').pop();
    if (!leaf) continue;
    out.push(value, leaf);
  }
  const base = out[0] || 'attack';
  if (/^attack$/.test(base)) out.push('attack1', 'attack2', 'attack3');
  if (/cast|spell|bend/i.test(base)) out.push('cast', 'skill1', 'attack');
  if (base === 'block') out.push('parry', 'block');
  return [...new Set(out)];
}

function scoreKey(key, token) {
  const leaf = String(key).split(':').pop();
  const t = String(token).toLowerCase();
  const l = leaf.toLowerCase();
  if (l === t) return 3;
  if (l.startsWith(t) || t.startsWith(l)) return 2;
  if (l.includes(t) || t.includes(l)) return 1;
  return 0;
}

export function findSkillActionKey(actions, skill, role) {
  if (!actions) return null;
  const keys = [...actions.keys()];
  const cands = skillClipCandidates(skill, role);
  for (const cand of cands) {
    if (actions.has(cand) && !GAIT.test(cand)) return cand;
  }
  let best = null;
  let bestScore = 0;
  for (const cand of cands) {
    for (const key of keys) {
      if (GAIT.test(String(key).split(':').pop())) continue;
      const s = scoreKey(key, cand);
      if (s > bestScore) {
        bestScore = s;
        best = key;
      }
    }
  }
  return bestScore >= 2 ? best : null;
}

/**
 * Crossfade a resolved skill clip on the hero mixer.
 * @returns {boolean}
 */
export function playSkillOnMixer(character, skill, role, fade = 0.16) {
  if (!character?.actions || typeof character.play !== 'function') return false;
  const key = findSkillActionKey(character.actions, skill, role);
  if (!key) return false;
  const f = Math.max(0.08, Math.min(0.28, fade));
  character.play(key, f);
  const act = character.actions.get(key);
  if (act) {
    character._gaitLocked = true;
    character.animState = /cast|skill/i.test(key) ? 'cast_loop' : 'attack';
  }
  return true;
}

/** Widen requestOneShot so pack-prefixed and near-name clips still play. */
export function installSkillMixer(character) {
  if (!character || character._skillMixerInstalled) return;
  const orig = character.requestOneShot?.bind(character);
  if (!orig) return;
  character.requestOneShot = (role) => {
    if (playSkillOnMixer(character, { animRole: role }, role, 0.14)) return true;
    return orig(role);
  };
  character._skillMixerInstalled = true;
}
