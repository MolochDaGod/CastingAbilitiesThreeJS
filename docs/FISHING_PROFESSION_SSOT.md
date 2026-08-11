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

## SI fish scale (no mess)

| Pack | Path | Contents |
|------|------|----------|
| Reef v1 | `public/models/fish/species/*.glb` | clownfish … angler |
| **Game v2** | `public/models/fish/species/large/` | dolphin, fish_*, manta, shark_game, whale |
| Poles / lures / docks | `poles/` · `lures/` · `docks/` | tools only |

Runtime fit: `src/fishing/fishScale.js` → **lengthM** on longest axis, elongated (longer than tall/wide).

| sizeClass | lengthM band | Example |
|-----------|--------------|---------|
| tiny | 0.06–0.14 | tetra, goldfish |
| small | 0.15–0.35 | clownfish, piranha |
| medium | 0.4–0.9 | koi, fish_mid |
| large | 1.0–2.2 | tuna, swordfish |
| huge | 2.3–4.5 | dolphin, game shark |
| titan | 5–12 | whale (~8.5 m) |

**Gates (need both):** rod `maxSizeRank` **and** tree maxSizeRank · lure sizeClass match · lure tier vs rod `lureSlotTier`.

## Lures (gameplay value)

| Id | Tier | Sizes | Notes |
|----|------|-------|-------|
| worm | 0 | tiny/small | shore |
| lure_basic | 0 | tiny–medium | general |
| lure_spinner | 1 | small/medium | flash |
| lure_deep | 2 | medium/large | deep |
| lure_heavy | 3 | large/huge | big game |
| lure_game | 4 | large/huge | dolphin/manta |
| lure_titan | 5 | huge/titan | whale |

## Prefabs / buildables

| Id | Kind |
|----|------|
| T0–T5 poles | Main-hand TOOL · maxSizeRank · maxFishLengthM · lureSlotTier |
| Lures `worm` … `lure_titan` | sizeClass · bite · value |
| Docks · boat · bucket | Buildable / container |

---

## Super-rare / deep (species/rare/)

| Id | Behavior | SI | Unlock |
|----|----------|-----|--------|
| `pulbo_monstruo` | Deep rare | ~2.0 m large | ink/tentacle recipes |
| `aetherwing_turtle` | Super rare · slow | ~3.4 m huge | **Worge → form recipe** · else **mount recipe** |
| `ocean_creature` | Passive titan · leviathan prey | ~11 m titan | hide recipes · mesh ~219MB local |
| `glow_whale` | Passive titan · hard catch · leviathan prey | ~10 m titan | glow essence recipes |

Leviathan strikes during fight: tension spike · progress snatch · rare steal.

## Docks (boat housing)

| Id | Claim | Boats |
|----|-------|-------|
| `dock_t1` | **no** — building place anywhere | 1 |
| `dock_t2` | **own claim flag** required | 2 |
| `dock_t3` | **own claim flag** required | 4 |

Code: `src/fishing/dockBuild.js` · node palette family `fishing_dock`.

## Playtest

1. Open Inventory → **Professions** → **Fishing**
2. Unlock Sea Legs / size nodes · eat **blue** meal · pick rod + lure
3. **Shift+F** · cast · snag · fight
4. Plant claim (lab) → place Dock T2/T3
5. Windsurf freeride for nautical multiplier
