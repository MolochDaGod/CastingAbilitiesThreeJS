/**
 * One-shot patch: cast channel helpers + wrap useSkill fire in cast bar.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '../src/combat/DrcCombatController.js');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('getCastBarState()')) {
  const anchor = '  /**\n   * Fire skill slot 0–3.\n   * @param {number} slot\n   * @returns {boolean}\n   */\n  useSkill(slot) {';
  const i = s.indexOf(anchor);
  if (i < 0) {
    console.error('useSkill anchor not found');
    process.exit(1);
  }
  const block = `  get isCasting() {
    return !!this._cast;
  }

  getCastBarState() {
    if (!this._cast) return null;
    const c = this._cast;
    const prog = MathUtils.clamp(
      (this.elapsed - c.startedAt) / Math.max(0.001, c.duration),
      0,
      1,
    );
    return {
      active: true,
      label: c.label,
      progress01: prog,
      duration: c.duration,
      remaining: Math.max(0, c.endsAt - this.elapsed),
      element: c.element || 'arcane',
    };
  }

  _beginCast(opts) {
    const duration = Math.max(0, Number(opts.duration) || 0);
    if (duration < 0.06) {
      opts.onComplete?.();
      return true;
    }
    if (this._cast) this._interruptCast('replaced', false);
    this._cast = {
      label: opts.label || 'Casting',
      element: opts.element || 'arcane',
      startedAt: this.elapsed,
      duration,
      endsAt: this.elapsed + duration,
      onComplete: opts.onComplete,
      interruptible: opts.interruptible !== false,
      aim: opts.aim || null,
    };
    this.character.setCasting?.(true, opts.aim || null);
    this.character.playWeaponCombat?.('cast') ||
      this.character.playCastFlourish?.() ||
      this.character.requestOneShot?.('cast');
    this.onCastBar?.(this.getCastBarState());
    return true;
  }

  _tickCast(dt, keys) {
    if (!this._cast) return;
    if (this._cast.interruptible && settings.drc?.castInterruptOnMove !== false) {
      const moving =
        keys?.has?.('KeyW') ||
        keys?.has?.('KeyA') ||
        keys?.has?.('KeyS') ||
        keys?.has?.('KeyD') ||
        keys?.has?.('ArrowUp') ||
        keys?.has?.('ArrowDown') ||
        keys?.has?.('ArrowLeft') ||
        keys?.has?.('ArrowRight');
      if (moving && this.elapsed - this._cast.startedAt > 0.12) {
        this._interruptCast('moved');
        return;
      }
    }
    if (this.elapsed >= this._cast.endsAt) {
      const done = this._cast.onComplete;
      this._clearCast();
      try {
        done?.();
      } catch (e) {
        console.warn('[DrcCombat] cast complete', e);
      }
      this.onCastBar?.(null);
      return;
    }
    this.character.setCasting?.(true, this._cast.aim || null);
    this.onCastBar?.(this.getCastBarState());
    void dt;
  }

  _interruptCast(reason = 'cancel', toast = true) {
    if (!this._cast) return;
    this._clearCast();
    this.character.setCasting?.(false);
    if (toast) this.onToast(reason === 'moved' ? 'Cast interrupted' : 'Cast cancelled');
    this.onCastBar?.({ active: false, interrupted: true });
  }

  _clearCast() {
    this._cast = null;
    this.character.setCasting?.(false);
  }

`;
  s = s.slice(0, i) + block + s.slice(i);
  console.log('inserted cast helpers');
}

const oldChunk = `    if (!this._spendResources(costs.mana, costs.stamina, skill.label)) return false;
    this._cdUntil.set(skill.id, this.elapsed + skill.cooldown);

    // Animation one-shot from equipped weapon pack (magic cast · sword attack · bow attack)
    const animRole = bound
      ? animRoleForSkill({
          labStyle: bound.labPack === 'magic' ? 'spell' : skill.style,
          animation: null,
          id: bound.skillId,
          name: bound.name,
          slotType: 'ability'
        })
      : skill.animRole;
    if (animRole === 'attack' || skill.animRole === 'attack') {
      this.character.playWeaponCombat?.('attack') ||
        this.character.playWeaponAttack?.() ||
        this.character.requestOneShot?.('attack');
    } else {
      this.character.playWeaponCombat?.('cast') ||
        this.character.requestOneShot?.(skill.animRole) ||
        this.character.playCastFlourish?.();
    }

    const yaw = this.character.facing;
    if (this.aim?.valid) _fwd.copy(this.aim.forward);
    else _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.character.getCastOrigin(_origin);
    const pose = {
      origin: this.character.position.clone(),
      forward: _fwd.clone(),
      aim: _end.copy(_origin).addScaledVector(_fwd, skill.rangeM * 0.65)
    };

    // Catalog VFX when bound; else DRC skill beauty
    if (bound) {`;

const newChunk = `    if (!this._spendResources(costs.mana, costs.stamina, skill.label)) return false;
    this._cdUntil.set(skill.id, this.elapsed + skill.cooldown);
    if (this._cast) {
      this.onToast('Already casting');
      return false;
    }

    const yaw = this.character.facing;
    if (this.aim?.valid) _fwd.copy(this.aim.forward);
    else _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.character.getCastOrigin(_origin);
    const pose = {
      origin: this.character.position.clone(),
      forward: _fwd.clone(),
      aim: _end.copy(_origin).addScaledVector(_fwd, skill.rangeM * 0.65)
    };
    const aimPt = { x: pose.aim.x, y: pose.aim.y, z: pose.aim.z };
    const castDur =
      skill.style === 'melee'
        ? 0
        : Math.max(0, Number(skill.castDuration ?? skill.castTime ?? 0.55));

    const releaseSpell = () => {
    // Catalog VFX when bound; else DRC skill beauty
    if (bound) {`;

if (!s.includes(oldChunk)) {
  console.error('oldChunk not found — already patched?');
} else {
  s = s.replace(oldChunk, newChunk);
  console.log('wrapped releaseSpell start');
}

const oldEnd = `    // Bound catalog skill on a spell-less bar slot — still fire residual / path
    if (bound) {
      this._fireMeleeResidual(skill, pose);
      this.onToast(\`\${boundName} · \${bound.skillId}\`);
      return true;
    }

    return false;
  }`;

const newEnd = `    // Bound catalog skill on a spell-less bar slot — still fire residual / path
    if (bound) {
      this._fireMeleeResidual(skill, pose);
      this.onToast(\`\${boundName} · \${bound.skillId}\`);
      return;
    }
    };

    // Instant melee / near-zero castDuration
    if (skill.style === 'melee' || castDur < 0.08) {
      const animRole = bound
        ? animRoleForSkill({
            labStyle: bound.labPack === 'magic' ? 'spell' : skill.style,
            animation: null,
            id: bound.skillId,
            name: bound.name,
            slotType: 'ability'
          })
        : skill.animRole;
      if (animRole === 'attack' || skill.animRole === 'attack' || skill.style === 'melee') {
        this.character.playWeaponCombat?.('attack') ||
          this.character.playWeaponAttack?.() ||
          this.character.requestOneShot?.('attack');
      } else {
        this.character.playWeaponCombat?.('cast') ||
          this.character.requestOneShot?.(skill.animRole) ||
          this.character.playCastFlourish?.();
      }
      releaseSpell();
      return true;
    }

    this._beginCast({
      label: skill.label,
      duration: castDur,
      element: skill.element || skill.abilityElement || 'arcane',
      interruptible: true,
      aim: aimPt,
      onComplete: releaseSpell
    });
    this.onToast(\`\${skill.label} · cast \${castDur.toFixed(1)}s\`);
    return true;
  }`;

if (!s.includes(oldEnd)) {
  console.error('oldEnd not found');
  // show nearby
  const j = s.indexOf('Bound catalog skill');
  console.log(JSON.stringify(s.slice(j, j + 250)));
  process.exit(1);
}
s = s.replace(oldEnd, newEnd);

// Path cast: channel before fire
const pathOld = `    const costs = pathCastCosts(holdSec, length, kind, element);
    if (!this._spendResources(costs.mana, costs.stamina, 'Path cast')) return null;
    this.lastCastIntensity = costs.intensity;
    const intensity = costs.intensity;

    // Signature VFX at high intensity (Inferno / Blizzard / etc.)
    const sig = signatureForElement(element === 'arcane' ? 'arcane' : element);
    if (intensity >= 2.4 && sig) {
      this.vfx?.deploy?.(sig.impactEffectId, {
        origin: this.character.position.clone(),
        forward: _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone(),
        intensity: intensity * 0.85
      });
    }

    const facing = _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone();
    const pathPose = {
      origin: this.character.position.clone(),
      forward: facing,
      aim: curve.getPoint(1),
      intensity
    };

    // AOE: compress path to short arc at endpoint for impact placement
    if (kind === 'aoe') {
      const end = curve.getPoint(1);
      const mid = end.clone();
      mid.y += 0.4;
      const start = end.clone().add(new Vector3(0.01, 0.8, 0.01));
      const short = new CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
      this.abilities.select(element);
      this.abilities.cast(short, element);
      this.vfx?.deployPresentation?.(element, { ...pathPose, aim: end.clone() }, {
        pathKind: 'aoe',
        meteor: element === 'fire' && intensity >= 2.2
      });
    } else {
      this.abilities.select(element);
      this.abilities.cast(curve, element);
      this.vfx?.deployPresentation?.(element, pathPose, {
        pathKind: kind,
        meteor: kind === 'stream' && element === 'fire' && intensity >= 2.4,
        volley: kind === 'stream' && (element === 'fire' || element === 'arcane'),
        shield: kind === 'wall' && element === 'storm'
      });
    }

    this.character.requestOneShot?.('cast') || this.character.playCastFlourish?.();
    const labels = { aoe: 'AOE place', spikes: 'Spikes', wall: 'Wall', stream: 'Stream' };
    const sigName = intensity >= 2.4 && sig ? \` · \${sig.label}\` : '';
    this.onToast(
      \`Staff · \${labels[kind]} (\${element}) · ×\${intensity.toFixed(1)} · −\${costs.mana}MP −\${costs.stamina}STA\${sigName}\`
    );
    return { kind, element, intensity, mana: costs.mana, stamina: costs.stamina };
  }
}`;

const pathNew = `    const costs = pathCastCosts(holdSec, length, kind, element);
    if (!this._spendResources(costs.mana, costs.stamina, 'Path cast')) return null;
    this.lastCastIntensity = costs.intensity;
    const intensity = costs.intensity;
    // Cast time scales with hold (min 0.35s, max 1.6s) — bar + cast anim before release
    const pathCastTime = MathUtils.clamp(0.35 + holdSec * 0.35 + length * 0.02, 0.35, 1.6);
    const endPt = curve.getPoint(1);
    const aimPt = { x: endPt.x, y: endPt.y + 0.2, z: endPt.z };
    const labels = { aoe: 'AOE place', spikes: 'Spikes', wall: 'Wall', stream: 'Stream' };

    const releasePath = () => {
      const sig = signatureForElement(element === 'arcane' ? 'arcane' : element);
      if (intensity >= 2.4 && sig) {
        this.vfx?.deploy?.(sig.impactEffectId, {
          origin: this.character.position.clone(),
          forward: _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone(),
          intensity: intensity * 0.85
        });
      }
      const facing = _fwd.set(Math.sin(this.character.facing), 0, Math.cos(this.character.facing)).clone();
      const pathPose = {
        origin: this.character.position.clone(),
        forward: facing,
        aim: curve.getPoint(1),
        intensity
      };
      if (kind === 'aoe') {
        const end = curve.getPoint(1);
        const mid = end.clone();
        mid.y += 0.4;
        const start = end.clone().add(new Vector3(0.01, 0.8, 0.01));
        const short = new CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
        this.abilities.select(element);
        this.abilities.cast(short, element);
        this.vfx?.deployPresentation?.(element, { ...pathPose, aim: end.clone() }, {
          pathKind: 'aoe',
          meteor: element === 'fire' && intensity >= 2.2
        });
      } else {
        this.abilities.select(element);
        this.abilities.cast(curve, element);
        this.vfx?.deployPresentation?.(element, pathPose, {
          pathKind: kind,
          meteor: kind === 'stream' && element === 'fire' && intensity >= 2.4,
          volley: kind === 'stream' && (element === 'fire' || element === 'arcane'),
          shield: kind === 'wall' && element === 'storm'
        });
      }
      const sigName = intensity >= 2.4 && sig ? \` · \${sig.label}\` : '';
      this.onToast(
        \`Staff · \${labels[kind]} (\${element}) · ×\${intensity.toFixed(1)} · −\${costs.mana}MP −\${costs.stamina}STA\${sigName}\`
      );
    };

    if (this._cast) this._interruptCast('replaced', false);
    this._beginCast({
      label: \`\${labels[kind]} · \${element}\`,
      duration: pathCastTime,
      element,
      interruptible: true,
      aim: aimPt,
      onComplete: releasePath
    });
    return { kind, element, intensity, mana: costs.mana, stamina: costs.stamina, castTime: pathCastTime };
  }
}`;

if (s.includes(pathOld)) {
  s = s.replace(pathOld, pathNew);
  console.log('patched path cast channel');
} else {
  console.warn('path cast block not matched (manual check)');
}

// Fix returns inside releaseSpell that still say return true (buff branches)
// They become return; already handled for end; buffs still return true inside releaseSpell which exits only the arrow - OK as return true from arrow is fine.

fs.writeFileSync(p, s);
console.log('wrote', p);
console.log('has getCastBarState', s.includes('getCastBarState'));
console.log('has releaseSpell', s.includes('releaseSpell'));
console.log('has pathCastTime', s.includes('pathCastTime'));
