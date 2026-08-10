# CraftPix HUD SSOT — Casting / Warlords player chrome

**Skill:** `craftpix-rpg-mmo-ui`  
**Host:** casting-abilities-threejs.vercel.app · casting.grudge-studio.com  
**Code:** `src/ui/craftpixUi.js` · `src/ui/craftpix-hud.css` · `src/ui/HUD.js`

## Source

| Layer | Path |
|-------|------|
| Disk SSOT | `D:\Games\Models\craftpix-rpg-mmo-ui\Textures\` |
| App ship | `public/ui/craftpix/{unit,hotbar,fill,panel}/` |
| CDN | `https://assets.grudge-studio.com/ui/craftpix/...` |

## Unit frame layer stack

1. `unit/avatar_bg.png`  
2. Race portrait (`client…/images/portraits/{race}.png`)  
3. `unit/avatar_border.png`  
4. `unit/avatar_overlay.png`  
5. Bars: `unit/pb_*` (HP) · `unit/sb_*` (MP/STA) with hue filter tints  

## Hotbar slot stack

1. `hotbar/slot_bg.png`  
2. Glyph / skill icon  
3. CD dark plate `scaleY(--cd)`  
4. `hotbar/slot_border.png`  
5. Press plate on `:active`  

## Rules

- Do **not** ship Font Awesome–only chrome when CraftPix is available.  
- Prefer **local** `/ui/craftpix` (Vercel) over CDN for same-origin paint.  
- HYDRA layouts remain at 1920×1080 design space; current casting HUD is responsive absolute chrome, not full HYDRA stage.  
- TightBar (Danger orbs) coexists; CraftPix owns unit frames + element hotbar.

## Cast bar (shipped)

| File | Role |
|------|------|
| `cast/bg.png` | Track plate |
| `cast/fill.png` | Progress fill (element-tinted) |
| `cast/icon_frame.png` | Spell gem frame |
| `src/ui/CastBar.js` | Progress UI |
| `DrcCombatController` | `castDuration` channel · interrupt on WASD · path cast time |

**Skill cast:** digits 1–6 → cast bar for `skill.castDuration` (catalog/staff bind) → cast loop anim → release VFX.  
**Path cast:** LMB release → cast bar 0.35–1.6s from hold+length → cast anim → ability travel.  
**Interrupt:** movement cancels channel (toast “Cast interrupted”).

## Review checklist (production)

- [x] Player frame uses UnitFrame avatar + PB/SB plates  
- [x] Target frame hostile tint + empty state dimmed  
- [x] Action slots use AB_MainSlot layers  
- [x] Portrait from production race portraits when race known  
- [x] Cast bar under crosshair (Cast Bar pack) + real cast times  
- [x] Cast animations loop during channel  
- [ ] Optional: full HYDRA combat-2bar layout scale root  
