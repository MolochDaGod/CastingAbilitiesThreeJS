# Casting lab skill SFX

User-provided combat / cast one-shots wired by `src/audio/skillSfx.js`.

| File | Role | Used for |
|------|------|----------|
| `cast-ramp.wav` | `cast_ramp` | **Default** cast start · path cast · light residual |
| `cast-chant.wav` | `cast_chant` | **Only** explicit blood/shaman/void skill ids (not normal spells) |
| `parry.wav` | `parry` | Melee **parry attempt** (C) — metal |
| `parry-magic.wav` | `parry_magic` | **Magical** parry attempt — staff/wand/ward |
| `impact-magic-a/b/c.wav` | `impact_magic` | Spell land / residual hit (random) |
| `burn.wav` | `burn` | Soft **loop** while player has burn status (not fire impact) |
| `heal-a.wav` / `heal-b.wav` | `heal` | Heal tonic · holy (random variant) |

**Do not** wire `cast_chant` on every long cast / arcane / storm — it reads as a death moan.  
Default spell path = `cast_ramp` → impact = `impact_magic`.

Runtime: `SkillSfx.play(role)` · auto on weapon skill cast / path cast / impact.
