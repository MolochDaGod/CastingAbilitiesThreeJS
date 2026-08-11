# Fishing profession SSOT (3D · Casting lab)

**Harvest profession** — main-hand fishing pole, not a second combat engine.

Aligned with ObjectStore `gathering.Fishing` + chef `foodSystem` (SWG-style **one meal per Red / Green / Blue**).

---

## Source review (2D / packs)

| Source | Status | What we took |
|--------|--------|----------------|
| `grudgewarlordsfishing/.../Dgrudge-fishing-game` | Vite **scaffold only** | Project name / intent |
| `FishingBar.png` · Target · Pointer · Template | 2D UI language | Palworld/Angler **fight bar** chrome |
| Cute Fish Pack rods L1–5 · lures · species | Stats from rarity tiers | Pole tiers · lure bias · difficulty |
| Grudge Angler language | Design | Rod **power / control / line / abilities** · sea_legs |
| `gameopen/.../humanPropsFishing.ts` | Tool defs | Pole idle/cast · bucket · craft hooks |
| `Animated Fish Bundle-glb.zip` | **Production meshes** | `public/models/fish/species\|poles\|lures\|docks` |
| ObjectStore professions.json | Fleet SSOT | gathering.Fishing tiers · chef RGB meals |

---

## Controls

| Input | Phase | Action |
|-------|--------|--------|
| **Shift+F** | any | Start fishing profession (lab pole if unequipped) |
| **RMB** | idle / aim | Toggle **aim** |
| **LMB** | aim | **Throw lure** |
| **S** or **RMB** | bite | **Snag** (SCUM window) |
| **Wheel down** | fight | **Reel in** |
| **Wheel up** | fight | **Give slack** |
| **LMB / RMB** hold | fight | Move reel zone |
| Inventory · Professions · **Fishing** | UI | Tree · rods · eat meals |

---

## Rod types (Grudge Angler parity)

| Id | Tier | Family | Nautical | Mesh |
|----|------|--------|----------|------|
| `t0-fishing-pole` | 0 | shore | 1.00 | `poles/fishing_rod.glb` |
| `fishing-pole-t1` | 1 | shore | 1.02 | `…-0yar0lg58p.glb` |
| `fishing-pole-t2` | 2 | river | 1.05 | `…-9aohhrphe7.glb` |
| `fishing-pole-t3` | 3 | sea | 1.08 | `…-aoabqwh68m.glb` |
| `fishing-pole-t4` | 4 | deep | 1.12 | `…-ldlwqjn9zg.glb` |
| `fishing-pole-t5` | 5 | void | 1.15 | same deep mesh until T6–8 art |

**Stats:** `power` (zone) · `control` · `lineStrength` · `castRangeM` · `reelSpeed` · `biteWindowS` · `abilities[]`

**Abilities:** `steady_hand` · `quick_snag` · `deep_cast` · `iron_line` · `sea_legs` (+nautical) · `void_line`

Code: `src/fishing/fishingRodTypes.js` → catalog re-exports as `FISHING_POLES`.

---

## Harvest skill tree

Nodes in `src/fishing/fishingSkillTree.js` (Main Panel **Fishing** tab is live, not stub):

- Catch qty · bite rate · zone · line · rare bias
- **Nautical:** `nautical_1` (+5%) · `nautical_2` (+8%) · `nautical_3` (+10%) — **multiplicative**
- `fish_meal_link` → Fisher’s Kitchen (blue meal crafts unlocked flag)
- `fish_master` Grandmaster Angler

Progress: `localStorage` key `grudge.casting.fishing.profession.v1` via `professionState.js`.

---

## Meals (SWG 3-buff · chef foodSystem)

| Slot | Source | Example buffs |
|------|--------|----------------|
| **Red** | Land meat / seared fish | HP regen · attack · defense |
| **Green** | Plants / seaweed | stamina · move · armor |
| **Blue** | Ocean / fish soup | mana · spell · **nauticalSpeedMul** |

One active meal **per color**; eating same color replaces. Combined with tree + rod for freeride speed.

Code: `src/fishing/mealBuffs.js`.

---

## Nautical speed

Applied to **windsurf freeride** (`WalkController` × `getNauticalSpeedMul`):

```
tree.nauticalSpeedMul × meals.nauticalSpeedMul × rod.nauticalSpeedMul (incl. sea_legs)
```

App wires `walk.ctx.getNauticalSpeedMul → fishing.getNauticalSpeedMul()`.

---

## Code map

| File | Role |
|------|------|
| `src/fishing/fishingRodTypes.js` | T0–T5 rods + abilities |
| `src/fishing/fishingSkillTree.js` | Harvest tree + nautical nodes |
| `src/fishing/mealBuffs.js` | RGB SWG meals |
| `src/fishing/professionState.js` | XP · unlock · resolveProfessionMods |
| `src/fishing/fishingCatalog.js` | Species · poles · lures · roll/zone |
| `src/fishing/fishingFight.js` | Bar sim + reelSpeedMul |
| `src/fishing/FishingController.js` | Runtime |
| `src/ui/fishingUi.js` + `fishing.css` | HUD + meal dots |
| `src/ui/InventoryPanel.js` | Professions · Fishing live UI |
| `public/api/v1/fishing-profession.json` | Contract |
| `public/models/fish/**` | GLB prefabs |
| `public/ui/fishing/**` | Bar textures |

---

## Prefabs / buildables

| Id | Kind |
|----|------|
| T0–T5 poles | Main-hand TOOL |
| Lures `worm` … `lure_heavy` | Bite / rarity bias |
| Docks · boat · bucket | Buildable / container |

---

## Playtest

1. Open Inventory → **Professions** → **Fishing**
2. Unlock Sea Legs nodes (grant SP by catching or set level in storage)
3. Eat a **blue** meal
4. Select a higher rod
5. **Shift+F** · cast · snag · fight
6. Deploy windsurf — freeride speed should scale with nautical multiplier
