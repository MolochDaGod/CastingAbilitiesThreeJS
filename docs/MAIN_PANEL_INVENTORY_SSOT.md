# Casting Main Panel · Inventory · Equipment SSOT

**Host:** casting.grudge.studio (production lab)  
**Panel:** `I` / `Q` → `InventoryPanel` (class name historical; UI title **Main Panel**)

## Design sources

| Source | Use |
|--------|-----|
| [Tactical Infinity equipment](https://tactical-infinity.replit.app/equipment) | Dark paperdoll, dual columns, silhouette |
| `Sample-InventorySlotsSet.png` | Bag slot chrome skins |
| **`inventory.png`** (Documents → `public/ui/warlords-dev/inventory/`) | Full bag shell ref · Main Panel `wl-inv-shell` |
| **`miniinventory.png`** | Quick bag / DropBag 9×4 + hotbar 1–10 |
| **`button UI.png`** | Pixel atlas for chrome icons |
| **Pirate Pack Cursors** | Hover intents (harvest / loot / attack / ship…) |
| `equipment.png` screenshot | Layout ENHANCEMENTS / ENCHANT |
| [Player-Inventory-System](https://github.com/fideltfg/Player-Inventory-System) | LMB pick/place, equip from bag, slot accepts |
| https://grudgewarlords.com/craft/ | Bag materials · professions skill trees SSOT |

Full map: `docs/WARLORDS_DEV_UI_SSOT.md`

## Interactions

| Input | Action |
|-------|--------|
| **LMB paperdoll slot** | Open inventory options that **fit** the slot |
| **LMB bag item** | Pick item → LMB paperdoll to equip |
| **Inventory tab** | 4×3 + 1×4 bag grid |
| **Professions tab** | WCS trees: Miner · Forester · Chef · Engineer · Mystic |
| **Slots tab / Admin F1** | Edit accept filters + labels (local admin) |

## Files

| Path | Role |
|------|------|
| `src/ui/mainPanelSlots.js` | Slot SSOT, bag, equip map, profession progress |
| `src/ui/mainPanel.css` | TI look + bag chrome |
| `src/ui/InventoryPanel.js` | Main Panel UI (`wl-inv-shell`) |
| `src/ui/DropBag.js` | Mini bag (harvest loot / throw) |
| `src/ui/warlordsUiSkin.js` · `warlordsCursors.js` | Shells + pirate intents |
| `public/ui/inventory/inventory-slots-set.png` | Slot art |
| `public/ui/inventory/equipment-reference.png` | Silhouette ref |
| `public/ui/warlords-dev/**` | inventory / mini / buttons / cursors |

## Data

- Equip map + bag: `localStorage` (`casting.mainPanel.*`) for lab
- Live mesh: mesh_ids + `equipWeaponById` for weapons
- Production bag write: `GrudgeFleet.depositHarvestLoot` / Railway via craft SSOT

## Deploy

Build/deploy CastingAbilitiesThreeJS to casting.grudge.studio and verify **I** → Character paperdoll + Inventory + Professions.
