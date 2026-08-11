# Fishing profession SSOT (3D · Casting lab)

**Harvest profession** — main-hand fishing pole, not a second combat engine.

---

## Source review (2D / packs)

| Source | Status | What we took |
|--------|--------|----------------|
| `grudgewarlordsfishing/.../Dgrudge-fishing-game` | Vite **scaffold only** (no fight loop) | Project name / intent |
| `FishingBar.png` · `FishingTarget.png` · `FishingPointer.png` · `FishingTemplate.png` | 2D UI language | Palworld/Angler **fight bar** chrome |
| Cute Fish Pack rods L1–5 · lures · species | Stats designed from rarity tiers | Pole tiers · lure bias · species difficulty |
| `gameopen/.../humanPropsFishing.ts` | Tool defs | Pole idle/cast · bucket · profession table recipes |
| `Animated Fish Bundle-glb.zip` | **Production meshes** | `public/models/fish/species|poles|lures|docks` |

---

## Controls (this version)

| Input | Phase | Action |
|-------|--------|--------|
| **RMB** | idle / aim | Toggle **aim** (arrow / mouse aim · reuses focus look) |
| **LMB** | aim | **Throw lure** to aim point (water/shore) |
| **S** or **RMB** | bite window | **Snag** (SCUM-style hook attempt) |
| **Wheel down** | fight | **Reel in** |
| **Wheel up** | fight | **Give slack** |
| **LMB** hold/click | fight | Move reel zone **right** (up bar) |
| **RMB** hold/click | fight | Move reel zone **left** |
| **W / S** | fight | Alt reel / slack |

---

## State machine

```
idle → aim → cast → waiting → bite → fight → won | lost
                              ↑ snag          ↓
                              └──── fail ─────┘
```

Fight bar (0..1): **fish** wanders; **reel zone** width from pole power + abilities + fish `zoneWidthBase`. Stay on fish to fill **progress**; **tension** breaks line if over `lineStrength`.

---

## Stats

### Fish
`strength` · `speed` · `stamina` · `difficulty` · `zoneWidthBase` · `weightKg` · `rarity` · `preferredLures` · `value`

### Pole
`power` (zone width) · `control` (zone move) · `lineStrength` · `castRangeM` · `abilities[]`

### Abilities
`steady_hand` · `quick_snag` · `deep_cast` · `iron_line`

### Lure
`biteMul` · `rarityBias`

---

## Code

| File | Role |
|------|------|
| `src/fishing/fishingCatalog.js` | Species · poles · lures · buildables |
| `src/fishing/fishingFight.js` | Bar sim |
| `src/fishing/FishingController.js` | Runtime + cast/snag/fight |
| `src/ui/fishingUi.js` + `fishing.css` | HUD |
| `public/models/fish/**` | GLB prefabs |
| `public/ui/fishing/**` | Bar textures |

---

## Prefabs / buildables

| Id | Kind |
|----|------|
| `t0-fishing-pole` … T3 poles | Main-hand TOOL |
| Lures `worm` … `lure_heavy` | Consumable / equip |
| Fish species meshes | Catch loot presentation |
| `dock_long` · `dock_wide` · `dock_stairs` · `fishing_boat` | Shore buildables |
| `fish_bucket` | Catch container |

---

## Wire

- Equip pole → start profession (`FishingController.beginProfession` or RMB aim)
- Catch → bag / world drop via `onCatch`
- Does **not** steal combat residual when pole unequipped

---

## Related

- Harvest: `DevIslandHarvest` · profession cooking table (gameopen humanProps)
- Camera aim: CombatFocus + MouseAim (RMB aim toggle pattern)
