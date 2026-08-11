# T0 Flintlock pistol · grudgepistolzio · bullets

**Catalog:** `t0-gun` · **name:** Flintlock Pistol  
**Lab mesh:** `public/models/weapons/t0-flintlock.glb` (from `D:\Games\Models\flintlock.glb`)  
**Bullet:** `public/models/vfx/projectiles/bullet1.glb` (Styloo Guns pack)  
**Code:** `src/vfx/pistolBulletVfx.js` · `SkillProjectileSystem.spawnBullet` · `weaponSkillProduction`

---

## Anim pack review — grudgepistolzio

**Path:** `D:\Games\Models\_anim_packs\grudge6_incoming_2026-08-01\grudgepistolzio`

| Clip set | Role |
|----------|------|
| idle / walk / run / backward / strafe / arc | One-hand **loco** (guns + can cover crossbow-style stance) |
| jump | Jump |
| stand↔kneel / kneeling idle | Aim-down / braced idle |
| Heavy_mixamo | **Review** — likely heavy weapon, **not** flint fire default |

**Live combat fire/draw/whip** still from Open bake:

`open.grudge-studio.com/anims/baked/pistol/{gunplay,drawing-gun,charged-pistol,pistol-whip,idle,walk-*,run-*,strafe-*}.json`

**Next bake:** convert zio loco FBX → Bip001 JSON on Open CDN, then point `ANIM_PACKS.pistol` candidates at new names. Do **not** invent parallel packs.

Config: `src/config/pistolAnimSsot.js` · `GRUDGE_PISTOL_ZIO_INCOMING`

---

## Weapon mesh

| Field | Value |
|-------|--------|
| Catalog id | `t0-gun` |
| Local URL | `./models/weapons/t0-flintlock.glb` |
| Hand SI | ~0.48 m length (`WeaponMeshAttach` pistol profile) |
| Anim pack | `pistol` |
| Equip | `?t0=t0-gun` or Inventory Weapon tab |

`T0_MODEL_CDN['t0-gun']` points local until R2 `prod/gltf/weapons/t0-flintlock.glb` is uploaded.

**Size note:** source ~23 MB — compress with gltf-transform (Draco/WebP) before CDN promote.

---

## Bullet projectile

| Knob | Value |
|------|--------|
| Mesh | Styloo `bullet1.glb` (~2.7 cm raw) |
| Speed | **90 m/s** lab (readable ballistic; not real 300+) |
| Trail | **20%** default trail length (~0.2 m ribbon) |
| Life | 1.2 s |
| Contact | 0.12 m |

### Impact rules

| Target | VFX |
|--------|-----|
| Living (`hostile` · npc · player · boss · creature · unit) | Red **liquid blood** splatter + light inferno |
| Terrain · aim · props · ground | **Micro explosion** flash — **no blood** |

`isLivingTarget()` in `pistolBulletVfx.js` — extend kinds there, not ad-hoc.

---

## Wiring path

```
Equip t0-gun → flintlock mesh + pistol anim pack
  → primary skill compile useBulletProjectile
  → focus LMB / 1 / F → spawnBullet
  → hit living → blood · hit terrain → micro boom
```

---

## Checklist

```
[x] Flintlock mesh on t0-gun
[x] Bullet mesh + short trail + high speed
[x] Blood only on living
[x] Micro explode on terrain
[x] grudgepistolzio reviewed in SSOT
[ ] Upload flintlock to R2 prod
[ ] Bake zio loco → Open CDN
[ ] Crossbow pack choice (longbow vs pistol) product decision
```
