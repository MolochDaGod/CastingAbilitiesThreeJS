# Casting lab skill SFX

User-provided combat / cast one-shots wired by `src/audio/skillSfx.js`.

| File | Role | Used for |
|------|------|----------|
| `cast-ramp.wav` | `cast_ramp` | Cast start, channel ramp, light residual |
| `cast-chant.wav` | `cast_chant` | Long cast · arcane/blood flavor |
| `parry.wav` | `parry` | Melee **parry attempt** (C) — metal |
| `parry-magic.wav` | `parry_magic` | **Magical** parry attempt — staff/wand/ward (wizard lightning) |
| `impact-magic-a/b/c.wav` | `impact_magic` | **Magical impacts** (random) — path cast land · spell residual · fire/storm/arcane hit |
| `burn.wav` | `burn` | **Soft loop** while player has burn status (not fire impact) |
| `heal-a.wav` / `heal-b.wav` | `heal` | Heal tonic · holy (random variant) |

Sources (Documents): ramp-up cast, blood shaman chant, parry, burning, heal/regen ×2.

Runtime: `SkillSfx.play(role)` · auto on weapon skill cast / path cast / impact.
