# Skill authoring + VFX Studio SSOT

**Host:** https://casting.grudge.studio · toggle **V** / HUD **VFX**  
**Shell:** `src/ui/vfxStudio/VfxStudio.js` · **SSOT map:** `src/config/skillAuthoringSSOT.js`

Singular container. No second combat engine, no R3F, no parallel lil-gui floating outside the shell when studio is open.

---

## uMMORPG → Casting map

| uMMORPG / Unity idea | Casting lab |
|----------------------|-------------|
| ScriptableObject Skill | Catalog skill row (master-weaponSkills / T0 / production package) |
| Skill.cooldown / mana / castTime | `cooldownSec` · mana · cast time fields |
| Target type (self / enemy / area) | soft-lock · aim · ground ring · self |
| ProjectileSkill / AoESkill / Buff | `SkillDeliveryPattern` (`skillDelivery.js`) |
| Effect modules on skill | `EffectPrimitive[]` (`effectPrefab.js`) |
| Prefab / VFX reference | VfxDirector `effectId` + `meshId` + settings knobs |
| Runtime activation only | DrcCombatController · projectiles · residual · abilities |

**Rule:** Catalog invents skill **ids**. Studio authors **delivery + VFX + knobs + export**. Never invent skill ids in the editor.

---

## Authoring pipeline (tabs)

```
Pipeline → Skill → Delivery → VFX → Linear → Samples → Knobs → Export
```

| Tab | Owns |
|-----|------|
| **Pipeline** | Process map (uMMORPG ↔ Casting) |
| **Skill** | Scriptable draft fields (pull active bar skill) |
| **Delivery** | weapon · linear · over · under · around · aura · path |
| **VFX** | Primitives + VFX_CATALOG preview (sandbox effectIds) |
| **Linear** | Ice / thunder / meteor / beam / snare / glacier families |
| **Samples** | Mesh/texture swatches → `settings.effect.meshId` + color |
| **Knobs** | Existing lil-gui Editor docked (settings.js live) |
| **Export** | EffectPrefab JSON for client / Warlords |

---

## File map

| Path | Role |
|------|------|
| `src/ui/vfxStudio/VfxStudio.js` | Shell + tabs |
| `src/ui/vfxStudio/vfxStudio.css` | UI chrome |
| `src/config/skillAuthoringSSOT.js` | Tabs · delivery groups · samples · field template |
| `src/ui/Editor.js` | Live knobs (hosted in Knobs tab) |
| `src/vfx/effectPrefab.js` | Primitives + export |
| `src/vfx/vfxCatalog.js` | effectId catalog |
| `src/combat/skillDelivery.js` | Delivery patterns |
| `src/config/settings.js` | Live runtime knobs |

---

## Delivery groups (user language)

| Group | Patterns |
|-------|----------|
| Weapon | `weapon` |
| Linear | `caster_to_target` |
| Over | `over_target` |
| Under | `under_target` |
| Around | `around_caster` · `around_target` |
| Aura | `toggle_aura` |
| Place | `at_location` |
| Path | `path_stream` · `path_aoe` · `path_spikes` · `path_wall` |

---

## Export contract

```json
{
  "source": "casting-lab-vfx-studio",
  "version": "1.1.0",
  "skillDraft": { "id": "…", "delivery": "caster_to_target" },
  "prefabs": [
    {
      "id": "prefab_…",
      "primitives": [{ "kind": "travel", "intensity": 1, "meshId": "orb-fire" }]
    }
  ]
}
```

Ship JSON into Open / Warlords skill VFX arrays — do not re-author a second VFX engine client-side.

---

## Hard bans

- ❌ Second skill scripting runtime in Casting  
- ❌ Second AnimationMixer for VFX  
- ❌ Free-floating second editor UI outside VfxStudio  
- ❌ Invented skill ids not in catalog  
- ❌ Whole fireball.glb as orb travel  

---

## Related

- `docs/CASTING_LAB_SSOT.md` · `docs/SKILL_DELIVERY_SSOT.md` · `docs/ENGINE_DEPLOY_SSOT.md`  
- `docs/WEAPON_SKILL_PRODUCTION_SSOT.md`  
