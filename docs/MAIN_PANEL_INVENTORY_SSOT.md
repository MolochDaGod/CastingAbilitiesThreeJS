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

## Interactions (MMO quality)

| Input | Action |
|-------|--------|
| **LMB paperdoll slot** | Open bag options that **fit** the slot |
| **RMB paperdoll slot** | Context menu: Unequip · Replace from bag… · Inspect |
| **LMB bag item** | Pick item → LMB paperdoll to equip |
| **RMB bag item** | **Equip → slot** · Split · Drop world · Deposit account · Inspect · Craft ↗ |
| **RMB DropBag item** | Equip → Main bag · Drop world · Deposit |
| **Inventory tab** | 9×3 + util row (Warlords inventory shell) |
| **API tab** | Railway ping · characters · fleet Main Panel iframe · UI asset catalog |
| **Professions tab** | WCS trees: Miner · Forester · Chef · Engineer · Mystic |
| **Slots tab / Admin F1** | Edit accept filters + labels (local admin) |

**Code:** `itemContextMenu.js` · `uiAssetCatalog.js` · `mainPanelSlots.js`

## Files

| Path | Role |
|------|------|
| `src/ui/mainPanelSlots.js` | Slot SSOT, bag, equip map, profession progress |
| `src/ui/mainPanel.css` | TI look + bag chrome |
| `src/ui/itemContextMenu.js` | RMB MMO item / equipment menus |
| `src/ui/uiAssetCatalog.js` | Full UI asset inventory + prod Main Panel URLs |
| `src/ui/InventoryPanel.js` | Main Panel UI (`wl-inv-shell`) |
| `src/ui/DropBag.js` | Mini bag (harvest loot / throw) + RMB |
| `src/ui/craftpixUi.js` | CraftPix HUD textures |
| `src/ui/warlordsUiSkin.js` · `warlordsCursors.js` | Shells + pirate intents |
| `public/ui/craftpix/**` | Hotbar, unit frames, cast, panel |
| `public/ui/inventory/**` | Slot set + equipment silhouette |
| `public/ui/warlords-dev/**` | inventory / mini / buttons / cursors |

## Data

- Equip map + bag: `localStorage` (`casting.mainPanel.*`) for lab
- Live mesh: mesh_ids + `equipWeaponById` for weapons
- Icons: `iconResolve.js` → CDN `496_rpg_icons` + `public/icons/dev-island/minerals`
- Catalog: `loadGameItemCatalog()` (info + objectstore) warms bag icons
- Harvest loot → DropBag **and** Main Panel bag (with resolved icons)
- Account deposit: `fleetApi.depositItem` → Railway paths; fail → Craft SSOT
- API tab: fleet status bundle · inventory · catalog import T0

## Deploy

Build/deploy CastingAbilitiesThreeJS to casting.grudge.studio and verify **I** → Character paperdoll + Inventory + Professions.
