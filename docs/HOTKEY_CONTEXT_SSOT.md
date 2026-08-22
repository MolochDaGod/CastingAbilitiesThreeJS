# Hotkey context SSOT

**Runtime table:** `src/input/hotkeyContext.js`  
**Mode owner:** XState `playerActivityMachine` + `SessionState.gates` (derived context, not a second machine)  
**Input:** `InputManager` looks up the table  
**Chrome:** CSS `html[data-hotkey-ctx]` / `#hud[data-hotkey-ctx]`

Do **not** drive keys from HudSettings / `grudge.hud.hotkeys.v1` (Q = block).

---

## Languages (what we use — do not add a 5th)

| Layer | Language | Why |
|-------|----------|-----|
| Mode / activity | **XState v5** | Combat ↔ harvest, hand, tool memory. Docs: [stately.ai/docs](https://stately.ai/docs/quick-start) |
| Session gates | **JS** `SessionState` | DRC combat/equip, ride, TPS |
| Bindings | **JS data table** (JSON-shaped) | One row per action + `ctx[]` |
| Catalogs / scriptable play | **JSON** ObjectStore + `compileScriptablePlayBind` | Skills, spine, VFX ids — already the MMO bind language |
| HUD chrome | **CSS** + CraftPix / GrudgeGameUI | Show/hide by `data-hotkey-ctx`. Not combat logic |
| Runtime fire | **JS** InputManager → App → DRC | Pointer + hold timers |

**Not viable here:** Lua (WoW-style) — no runtime, no SSOT. C# — Unity leftover. HudSettings HYDRA map — wrong Q/F. A second XState just for keys — derive context instead.

CSS **is** the right language for *which chrome is visible* (`[data-hotkey-ctx="harvest"]`). It is **not** the skill compiler. Scriptable systems stay **JSON binds** (anim pack, spine, vfx id, UUID).

---

## Contexts

| `data-hotkey-ctx` | From |
|-------------------|------|
| `combat` | activity combat + DRC combat |
| `harvest` | Hold Q → harvest |
| `equip` | Shift+Q DRC equip |
| `inventory` | I panel open |
| `ride` | windsurf / horse parented |

Priority: inventory > ride > equip > harvest > combat.

---

## Combat vs harvest (reserved)

| Key | combat | harvest |
|-----|--------|---------|
| **F** | Class skill 0 | Harvest swing |
| **R tap** | Class item | Last tool |
| **R hold** | Class radial or skill tree | Tool radial |
| **Tap Q** | Weapon 1↔2 | Tool for nearest node |
| **Hold Q** | Mode radial | Mode radial |
| **1–4** | Weapon skills | off |
| **E C X** | Block parry dodge | off |

**MMB** = class melee instinct (`CLASS_MMB` in `mmbHeavy.js`) — all 8 specs. Worge forms override (bear stun/charge, typhoon 7 m / 2 m).

Lab only: **Alt+** sandbox VFX · **Alt+Shift+** linear skillshots (qualifiers, not tap Q).

---

## Best practice

1. One table (`HOTKEY_BINDINGS`) — first match wins.  
2. Context is **derived** from XState + session, then stamped on `html`.  
3. Holds stay time-based in App (`RADIAL_HOLD_S`) — table emits `*HoldStart`.  
4. Display (`keybindSsot`) copies ids from this table.  
5. Skills/effects stay `planElementalLinearCast` + catalog JSON, not CSS and not a new script VM.
