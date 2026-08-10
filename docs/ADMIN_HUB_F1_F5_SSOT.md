# Admin Hub F1–F4 · ] World — tools, editors, deployables

**Code:** `src/ui/AdminHub.js` · `src/api/deployableContract.js` · `src/api/prefabDraftStore.js`  
**Host:** casting.grudge.studio (lab control plane)  
**Related:** `PREFAB_SCAFFOLD_CONTROL_SSOT.md` · `WEAPON_PREFAB_UUID_SSOT.md` · `GAME_ITEM_PREFAB_PRODUCTION_SSOT.md`

---

## Hotkeys

| Key | Tab | Owns |
|-----|-----|------|
| **F1** | Player | Hero session, race kit, controller, equip shortcuts, Foundry/ID links |
| **F2** | Assets | Buildables · harvestables · vehicles — **scripts + purpose** |
| **F3** | Creatures | Enemy · ally · boss · NPC · vendor · Grudge race kits · AI brain |
| **F4** | Prefabs | Weapons · armour · T0 scaffold · craft · export |
| **]** | World | Stage notes · loot spawn · deploy surface map (**not F5**) |
| **`** | — | Auto run / freeride sail-row (toggle) |
| **Esc** | — | Close Admin Hub |
| **?** / **H** | — | Keyboard help (not F1) |

**F5 is unbound** (browser refresh elsewhere). Same admin key **toggles close** if that tab is already open. Top chips + TightBar **Admin** also open F4.

---

## Product intent

Continue **tools, editors, and systems** for:

1. **Prefab creation + saves** (local drafts → export JSON)
2. **Buildable assets** — mesh + **script** + **purpose** (structure, camp, craft, storage, harvest node…)
3. **Everything deployable** — weapons, armour, enemies, Grudge characters, vehicles, props

Do **not** invent a second catalog. Read ObjectStore / info SSOT; mint UUIDs only via ObjectStore pipelines.

---

## Deployable kinds

| Kind | Admin tab | Layers (have) | Jobs (do) |
|------|-----------|---------------|-----------|
| weapon | F4 | identity · stats · skills · assets · runtime · loadout | bag · equip · controller · hotbar · combat · craft · export |
| armour | F4 | identity · stats · assets · runtime · slots | bag · mesh_ids · stats · export |
| buildable | F2 | identity · **purpose** · **script** · assets · placement · runtime | place · snap · interact · use · save instance · export |
| harvestable | F2 | + drops | spawn · E harvest · loot · export |
| vehicle | F2 | + seats | spawn · mount · drive · export |
| enemy / ally / npc | F3 | identity · kit · anims · ai · combat · assets · runtime | spawn · aggro/follow · skills · loot · export |
| character_kit | F3 | race · mesh_ids · anims | load kit · equip · export |

Contract API: `createDeployableDraft` · `validateDeployableDraft` · `exportDeployableSnapshot`.

---

## Create + save flow

```
Admin F2/F3/F4 → Create draft
       ↓
  localStorage  grudge.casting.deployableDrafts.v1
       ↓
  Export JSON  (deployable-*.json)
       ↓
  ObjectStore pipeline / R2 CDN  (real ITEM- / PREFAB- / NPC- uuids)
       ↓
  Fleet clients consume catalog
```

| Store | What |
|-------|------|
| **localStorage drafts** | Lab authoring only |
| **Download JSON** | Handoff pack + validation |
| **ObjectStore** | Catalog mint (`build:weapon-pipeline`, `generate:master`) |
| **Railway** | Player instances (bag, equip) — never drafts |
| **R2 CDN** | GLB / icons binaries only |

---

## Buildable purpose + script

Purpose tags (`BUILDABLE_PURPOSES`): structure · camp · crafting · storage · defense · decoration · resource_node · spawn_pad · transport.

Script stub (not eval’d):

```js
{
  id, type, purpose,
  onPlace, onInteract, onDestroy, tick?, stats?
}
```

Interact routes by purpose (craft UI · depot · harvest swing · inspect).

---

## Creatures (F3)

Each entry ties:

- **Model** — grudge6 race GLB (`…/toon-rts-characters/glb/characters/{short}.glb`)
- **Anims** — pack + roles (idle/walk/attack/death…)
- **AI brain** — passive · guard · patrol · hunter · boss_phase · ally_follow · vendor_idle
- **Role** — enemy · monster · boss · ally · commander · npc · vendor · training_dummy

---

## Prefabs (F4)

- Load live T0 / equippable catalog
- One-click **scaffold pack** (existing `buildItemScaffoldPack`)
- New weapon/armour drafts
- Link to Inventory **Prefabs** tab for full browser equip

---

## Agent rules

1. Extend **this** hub + `deployableContract` — do not fork `AdminPanel2` / parallel F-keys.  
2. Never mint GRUDGE UUIDs in the lab.  
3. Buildables must declare **purpose + script**, not mesh-only.  
4. Enemies use grudge6 kits + SI heights (human ~1.8 m).  
5. Saves are local drafts until ObjectStore register.  
6. Help stays on **?** — F1 is Player.

---

## Files

| File | Role |
|------|------|
| `src/ui/AdminHub.js` | Panel UI |
| `src/ui/adminHub.css` | Styles + top chips |
| `src/api/deployableContract.js` | Kinds · layers · create · validate · export |
| `src/api/prefabDraftStore.js` | localStorage CRUD · import/export |
| `src/api/prefabScaffold.js` | Weapon scaffold (F4) |
| `src/input/InputManager.js` | F1–F4 · ] World · ` auto · Esc |
| `src/core/App.js` | Wire AdminHub |
