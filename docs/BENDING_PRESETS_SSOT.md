# Bending presets → Casting attacks

**Author JSON:** `D:\Games\Models\bending-presets.json` (`My preset`)  
**How to bake variants:** `docs/BENDER_AUTHOR_SSOT.md` — **JSON** presets + `skills/production/<catalog_id>.json`. Body clips = baked JSON from FBX/GLB.  
**Live knobs:** `src/config/settings.js` · FireAbility / Water / Earth / Wind already read these.  
**Do not** invent a second fire engine. Paste author numbers onto the existing blocks.

## Combat pack (`bending-presets (1).json` · `bulletspoisonaoesturf3n turnado`)

Attach: `src/vfx/bendingSkillAttach.js` · start = weapon **spine** (barrel/cast/tip) · end = aim.

| Pattern | Look | Combat |
|---------|------|--------|
| **Fire bullet / orbit** | Small fire projectile (`settings.fire` 38.2 m/s · 0.12 m) | 5 orbs circle caster, next 5 hits send one |
| **Poison** | Water volume **green + misty** (`#012e00` / `#53e93f`) | mist · trap · shot · bomb · proc |
| **Tornado** | Existing WindAbility funnel (r 3.5 · 5.1 s) | AoE + **pull** to center (WoW cyclone) |
| **Holy** (was earth) | Gold `moon_beam` + shockwave | AoE stun + damage ring |
| **Arrows** | `arrow-path` / `arrow-loft` meshes | linear or loft projectile |
| **Fire rain** | Sky fireballs + inferno drops | meteor shower in radius |
| **Shockwave** | Per-element ring (fire/ice/holy/storm/poison/arcane) | `_shockwave` + sparks |
| **Outline beam** | DodgeAfterimage ghosts + moon_beam | blur dash along own silhouette |
| **Smoke blink** | ParticleShape.SMOKE (threejs-games smoke) | jump → hide → blast out → implode behind target |
| **Ranger invis** | Light green smoke bomb at **feet** | Hidden from players / monsters / bosses; **self sees green outline only** |

Catalog `effects[]` text triggers the pattern (poison, tornado, cyclone, stun aoe, orbit). No invented skill ids.

## Learned trail (`learn_bending_path_trail`)

Same preset’s **LMB-held mouse trail** (`settings.trail` + `PathTrail` + `TrailMaterial`). One learn, three uses — not a second ribbon engine.

| Use | Spine | When |
|-----|-------|------|
| **tail** | barrel / cast | Fire-bending PathTrail (`settings.fire`) follows bullets **and** all projectile families until they die, then dissolve |
| **slash** | blade | Attack swing paints the blade path (residual still at apex) |
| **blunt** | blunt | Hammer / mace / crush |
| **special** | special | Finisher / flourish |
| **kick** | effect | Kick / stomp / uppercut anim |

Compile: `compileWeaponTrail(skill)` on every production skill. Runtime: `WeaponTipTrailSystem.beginSwing` / `beginFollow`. Ready API: `startWeaponTrail(tipTrail, skill, { follow })`.

Knobs stay the preset trail: width 0.55 · glow 1.4 · dissolve 1.5 · `#eafcff` / `#4fb9ff`. Weapon paint is a thinner billboard of that same stroke.

### Saved fire / air trail looks

`public/vfx/trail-saves/catalog.json` · `effectVariants.js` `FIRE_TRAIL_VARIANTS` / `AIR_TRAIL_VARIANTS`.

| Use | Fire save | Air save | Where |
|-----|-----------|----------|--------|
| **dash** | — | `air_dash` | AA/DD dodge + jump-attack dash (silk gust + afterimage) |
| **jump2** | — | `air_jump2` | Space in air (frontflip tell) |
| **backflip** | — | `air_backflip` | S+Space hang (slower fall stays `backflipHangGravity`) |
| **arrow** | `fire_blue_arrow` / ember-core-flare | `air_arrow` | PathTrail tail + arrow mesh |
| **slash** | `fire_gold_slash` | `air_slash` | Blade residual / slashblue–yellow |
| **splash** | `fire_white_splash` | `air_splash` | Impact AOE |

Wind **field stamps** live on `OceanWindIndicators.sampleWind(pos)` for future Yuka / pathfinding. Do not add a second wind physics.

## Fire (placed)

| Knob | Bending | Role |
|------|---------|------|
| speed | **38.2** m/s | travel |
| flameWidth | **0.12** m | stream radius |
| headSize | **1.0** × width | bolt head |
| streamLength | **1.5** m | burning tail |
| colorCore / Mid / Edge | `#fff6d8` / `#ffb02e` / `#000000` | heat + soot edge |
| explosionSize | **0.3** m | impact |
| explosionBrightness / shake / flash | 0.2 / 0.34 / 0.21 | hit punch |
| glow / volumeDensity | 3.06 / 0.69 | look |

Path-cast **Fire staff (1)** and catalog fire skills use `settings.fire` mid-flight.

Water / earth / wind in the same JSON map 1:1 onto `settings.water` · `settings.earth` · `settings.wind` (already close). Tune in Editor → Fire / Water / Earth / Wind.

## Attacks this unlocks

Reuse those knobs on:

- Staff fire path (draw)  
- T0 wand / staff catalog fire skills  
- Knight / Barbarian **pistol + tome** (tome can path-cast staff fire while flintlock uses barrel)

## Pistol + tome loadout

| Who | Main | Off |
|-----|------|-----|
| Barbarian | `t0-gun` | `t0-offhand-tome` |
| Knight | `t0-gun` | `t0-offhand-tome` |
| Dwarf | `t0-rifle` | — |
