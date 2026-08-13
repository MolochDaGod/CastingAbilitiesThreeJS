# Item-Granted Skills — weapon · gear · relic (SSOT)

One skill pipeline, three item sources. Adopted from the LinearAbiltyCastingThreeJS
pattern: **a skill is a script** (catalog row + optional production override JSON);
**any item is a source** that grants skill ids — never definitions.

## Contract

```
master-weaponSkills (info.grudge-studio.com, D1-indexed)   ← skill DEFINITIONS (SSOT)
        │  byId
        ▼
compileProductionWeaponSkill ── productionToDrcSkill        ← ONE compile path
        ▲                              ▲
weapon hotbar                item-granted bar
(t0WeaponCatalog             (itemGrantedSkills.js —
 hotbarForWeapon,             gear + relic slots, rides
 slots 0–3)                   slots 4+ after the weapon)
```

- **Weapons**: unchanged — `hotbarForWeapon` fills slots 0–3.
- **Gear / relics**: paperdoll slots (`relic`, `head`, `chest`, `legs`, `hands`,
  `feet`, `shoulders`, `back`) may carry `grantsSkills: ["<catalog-skill-id>", …]`
  on the equip-map item row, or in `skills/production/<itemId>.json`.
  `itemGrantedSkills.js` compiles the grants through the same production
  pipeline and appends them to the `equipped` tree at slots 4+ with a
  `grantSource: { itemId, kind, slot }` tag.

## Rules (fleet)

1. **Never invent skill ids.** Grants must resolve in `master-weaponSkills.byId`
   (304 skills as of 2026-08). Unknown ids warn and are dropped.
2. **Catalog numbers stay SSOT.** Damage / cooldown / cost come from the catalog
   row; overrides tune anim, VFX and physics presentation only.
3. **UUIDs**: catalog rows carry them; labs never mint (`deployableContract`).
4. **Shipping path**: item rows with `grantsSkills` are promoted through
   ObjectStore pipelines → info hub → D1, same as weapon prefabs. The
   localStorage equip map is the play-session mirror, not the SSOT.

## LinearAbilty → client adoption map

| LinearAbilty system | Client landing spot |
| --- | --- |
| `Ability` phase machine (travel → impact → fade, pooled, no-alloc) | `vfx/` effect implementations behind `castEffectId` / `travelEffectId` / `impactEffectId` — port ability classes as effect ids, not as a second ability stack |
| 5 finished linear-cast VFX (Frost Lance, Storm Lance, Cinder Fall, Nova Beam, Voltaic Snare) | candidates for `elementalLinearCast` travel/impact effect ids — the "no ugly effects" bar |
| Live settings tree (938 sliders, valid mid-cast) | already present (`config/settings.js` + Editor) — same lineage |
| `PresetManager` (merge-into-live snapshots) | production override JSONs promoted via ObjectStore, not localStorage presets |
| One-file-per-ability + settings-block contract | production override `skills/production/<id>.json` + scaffold script |

## Test (browser console, dev)

```js
const slots = await import('/src/ui/mainPanelSlots.js');
const m = slots.loadEquipMap(); 
m.relic = { id: 'relic-test', kind: 'relic', grantsSkills: ['xbow_heavy_bolt'] };
slots.saveEquipMap(m);
// equipped tree now shows 4:xbow_heavy_bolt ←relic after the weapon slots
```

Note (Vite dev): console `import('/src/…')` without the `?t=` query creates a
shadow module instance — probe the app graph by importing the exact URL found
in a served importer, or state changes will not reach the running game.
