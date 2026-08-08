# Element presentation SSOT (Casting lab)

**Host:** casting.grudge-studio.com  
**Code:** `src/combat/elementPresentation.js` · `VfxDirector.deployPresentation` · `settings.presentation`  
**Shake:** `settings.global.cameraShake` (default **0.32**) · soft flash · low explosionShake

Product elements reuse **existing** Ability pools + catalog VFX. Creative looks are **recipes**, not new engines.

## Product → ability → presentation

| Element | Ability pool | Style | What you see |
|---------|--------------|-------|----------------|
| **Fire** | FireAbility | `volley` + `meteor` | Micro fire bolts (first = bullet size); high intensity / Meteor skill = sky shards + small ground infernos |
| **Storm** | WindAbility | `shieldAura` | Defensive wind ring + spark rim; offensive bolt = chain lightning |
| **Ice** | WaterAbility | `groundFlood` | Frost plate crawls like earth pave, then erupts / frost_wave swallow |
| **Nature** | EarthAbility | `vineLash` | Green earth palette; vines rise underground and lash; heal aura ring |
| **Holy** | WindAbility | `radiance` | Moon beam + soft heal aura |
| **Arcane** | WindAbility | `voidBolt` | Purple + void black; micro first bullet then void impact |

## Hybrid spikes (path cast `spikes`)

EarthAbility (or water) motion + beauty overlay:

| Element | Overlay beauty | Read |
|---------|----------------|------|
| fire | inferno | magma spikes |
| ice | frost_wave | ice spears |
| storm | ice_lightning_burst | air-cut spikes |
| nature | earth_surge (green) | vine spears |
| holy | moon_beam | light pillars |
| arcane | arcane_swirl | void spines |

## Knobs (`settings.presentation`)

| Field | Default | Role |
|-------|---------|------|
| fireVolleyCount | 5 | micro bolts per fire/arcane cast |
| fireVolleyDelayMs | 65 | stagger |
| fireVolleySize | 0.32 | body shot scale |
| microBulletSize | 0.14 | first projectile |
| meteorHeight | 14 | sky spawn (m) |
| meteorShards | 4 | small falling hits |
| iceFloodRadius | 4.2 | ground crawl radius |
| iceEruptDelayMs | 280 | flood → erupt |
| natureVineCount | 3 | lash count |
| natureHealAura | true | green ring |
| stormShieldRadius | 2.4 | defensive ring |
| arcaneCore / arcaneGlow | black / purple | void palette |

## Shake policy

| Layer | Before | Now |
|-------|--------|-----|
| global.cameraShake | 1.0 | **0.32** |
| CameraShake pos scale | 0.55 | **0.28** |
| VFX deploy trauma | 0.08–0.20 | **~0.03–0.06** |
| Ability explosionShake | 0.4–1.0 | **~0.12–0.28** |
| flashStrength | 1.0 | **0.4** |

Editor: **Global → cameraShake** still live-tunes.

## Agent rules

1. Extend `elementPresentation` / `settings.presentation` — do not invent Ability2.
2. Prefer **many small** projectiles/shards over one huge volume (GPU + clarity).
3. Nature = green + earth motion + vines + heal; do not rebrand as brown-only earth.
4. Storm shield is valid defense presentation, not only tornado offense.
5. Arcane = purple + near-black secondary always.
6. Smoke after change on casting.grudge-studio.com.

## Future (same files)

- Arrow-shaped residual mesh for fire/ice/wind bolts (`meshId` orb/slash)
- True knockback once combat hit targets exist
- Dedicated HolyAbility / ArcaneAbility materials when art ships
