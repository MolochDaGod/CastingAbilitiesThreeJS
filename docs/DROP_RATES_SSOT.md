# Drop rates SSOT (casting lab mirror)

**Fleet source:** ObjectStore `api/v1/drop-tables.json` + `docs/DROP_TABLES_SSOT.md`  
**Runtime:** `src/loot/dropTables.js`

## Rules (product)

| Rule | |
|------|--|
| **Max drop tier** | **5** |
| **Never drop** | **T6, T7, T8** (any source) |
| **T0 in drops** | **Yes** — materials, potions, foods, thrown weapons |
| **Player level** | Caps max tier + soft target tier |
| **Difficulty** | Level bias, qty mul, rare mul, T0 weight mul |

## Quick API

```js
import { rollLoot, maxDropTier, assertDropTierLegal } from '../loot/dropTables.js';

const { drops, meta } = rollLoot({
  source: 'mob_normal',   // mob_trash | mob_elite | chest_common | boss | raid | harvest_node
  playerLevel: 22,
  difficulty: 'hard'      // trivial…raid
});
// meta.maxTier <= 5; no tier 6–8 in drops
// boss/raid include guaranteed T0 mats/potions
```

## Sources

- `mob_trash` / `mob_normal` / `mob_elite`  
- `chest_common` / `chest_uncommon`  
- `boss` / `raid` (T0 guarantees)  
- `harvest_node` (materials + T0 boost)  

## Resolve items after roll

1. `category` + `tier` from roll  
2. Pick item from ObjectStore: `materials.json`, `consumables.json`, `master-weapon-prefabs.json` with `tier <= meta.maxTier`  
3. Never upgrade rolled tier to 6+  

## Related

- Prefabs: `master-weapon-prefabs.json`  
- Skills: `master-weaponSkills.json`  
- Showcase binds skills — separate from loot  
