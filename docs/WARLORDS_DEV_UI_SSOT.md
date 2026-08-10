# Warlords Dev Island UI SSOT (casting.*)

**Host:** casting.grudge-studio.com · casting-abilities-threejs.vercel.app  
**Repo:** CastingAbilitiesThreeJS  

Gameplay chrome for the **Warlords-era dev island** lab: bag shells, button atlas, pirate cursors.  
Does **not** replace CraftPix unit frames / hotbar (`craftpixUi.js`) or invent a second inventory stack.

---

## Author sources (Documents)

| File | Role on casting |
|------|-----------------|
| `inventory.png` (201×188) | Full bag layout ref: armor doll · 2×2 craft + result · 9×3 bag · 9 hotbar · side tabs |
| `miniinventory.png` (800×512) | Fantasy wood **mini bag** 9×4 + side tabs + hotbar **1–10** |
| `button UI.png` (192×192) | Pixel **icon atlas** (8×8 @ 24px) for chrome toggles |
| `Pirate Pack - Cursors.zip` | **Mouse intents** (board / attack / loot / harvest / door / sail…) |

Shipped under:

```
public/ui/warlords-dev/
  inventory/inventory.png
  inventory/miniinventory.png
  buttons/button-ui.png
  cursors/pirate/MouseIcon1.png … MouseIcon10.png
```

Optional fleet mirror: GrudgeBuilder `client/public/ui/warlords-dev/`.

---

## Code

| Module | Job |
|--------|-----|
| `src/ui/warlordsUiSkin.js` | Paths, CSS vars, mini/full grid contract, button atlas helpers |
| `src/ui/warlordsCursors.js` | `configureWarlordsCursors` · `setCursorIntent` · interact→intent map |
| `src/ui/warlords-dev-ui.css` | Mini bag skin · Main Panel shell accent · button chrome |
| `src/ui/DropBag.js` | Quick bag uses **miniinventory** 9×4 + hotbar strip |
| `src/ui/InventoryPanel.js` | Main Panel gets `wl-inv-shell` class |
| `src/core/App.js` | Boot skin + cursors; harvest proximity → harvest cursor |

---

## Systems map (what uses what)

| Gameplay | UI skin |
|----------|---------|
| CraftPix HUD frames / DRC bar | Existing `craftpix/*` |
| **I** Main Panel equipment + bag | `inventory.png` shell accent + existing slot chrome |
| **Bag** / harvest loot throw-pickup | `miniinventory.png` DropBag |
| Menu / admin chrome icons | `button-ui.png` atlas (`.wl-btn-icon`) |
| Hover harvest node / dummy / loot | Pirate **cursor intent** |
| Focus combat (RMB) | Cursor **none** + screen crosshair (unchanged) |

---

## Cursor intents (Pirate Pack)

| Intent | Icon (pack) | Use |
|--------|-------------|-----|
| `default` | MouseIcon2 cutlass | Free roam |
| `attack` | MouseIcon2 | Hostile / dummy |
| `slash` | MouseIcon3 | Skill-ready slash |
| `enter_ship` | MouseIcon1 anchor | Board ship (not sail) |
| `sail` | MouseIcon6 | Helm / windsurf sail |
| `door` | MouseIcon4 | Portal / door |
| `loot` / `pickup` | MouseIcon7 coin | Chest / world drop |
| `look` | MouseIcon5 telescope | Inspect |
| `harvest` | MouseIcon8 | Resource node in range |
| `talk` | MouseIcon9 | NPC |
| `use` | MouseIcon10 | Generic interact |

```js
import { setCursorIntent, intentFromInteractKind } from './ui/warlordsCursors.js';
setCursorIntent('harvest');
setCursorIntent(intentFromInteractKind('ore'));
```

**Hard split:** `enter_ship` ≠ `sail`. Do not collapse boarding and helm.

---

## Bag contracts

| Panel | Grid | Hotbar |
|-------|------|--------|
| Mini (`DropBag`) | **9×4 = 36** | 1–10 labels (visual; combat hotbar still DRC) |
| Full (`inventory.png` ref) | **9×3 = 27** + craft 2×2 | 9 |
| Main Panel bag tab | Existing `mainPanelSlots` SSOT | — |

Production bag SSOT remains Railway / fleet craft — lab uses local DropBag + Main Panel storage.

---

## Boot order

1. `applyCraftpixCssVars` (HUD)  
2. `applyWarlordsUiCssVars` + `configureWarlordsCursors({ theme: 'pirate', target: canvas })`  
3. Preload shells + cursors (non-blocking)  
4. Frame: if unlocked cursor and nearest harvest ≤5 m → `harvest` intent  

---

## Related

- `docs/MAIN_PANEL_INVENTORY_SSOT.md`  
- `docs/CRAFTPIX_HUD_SSOT.md`  
- `docs/ISLAND_STAGE_SSOT.md` · harvest F  
- Skill: `craftpix-rpg-mmo-ui` (HUD only — bag shells are this doc)
