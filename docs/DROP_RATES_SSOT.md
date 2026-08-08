# Drop rates SSOT (casting lab mirror)

**Fleet source:** ObjectStore `api/v1/drop-tables.json` + `docs/DROP_TABLES_SSOT.md`  
**Runtime:** `src/loot/dropTables.js`  
**Presentation:** `src/loot/prefabAssets.js` + `src/world/WorldDrops.js` (T0–T8 full pattern)

## Prefab pattern (all tiers T0–T8)

T6 / T7 / T8 **are full citizens** of the prefab systems:

| System | T6–T8 |
|--------|-------|
| `master-weapon-prefabs` (stats, skills, icons, models) | Yes |
| World drop (icon sprite, bloom glow, tier border, mini model) | Yes |
| Bag / throw / equip / craft / economy | Yes |
| Natural open-world RNG (`mob_*`, common chests, harvest, normal boss/raid) | **No** |

They are **not** stripped from catalogs or presentation — only gated out of **natural** loot.

## Natural vs special loot

| Source class | Max tier | Examples |
|--------------|----------|----------|
| **Natural** | **T5** | `mob_trash`, `mob_normal`, `mob_elite`, `chest_common`, `chest_uncommon`, `boss`, `raid`, `harvest_node` |
| **Special** | **T8** | `player_death`, `special_chest`, `dungeon_loot`, `dungeon_boss`, `raid_mythic`, `event_reward` |

### T6–T8 may appear from

1. **Player death** — corpse drops gear the player was **holding** (any tier, full prefab identity)  
2. **Special chests** — intentional high-end containers  
3. **Dungeon loot / dungeon bosses**  
4. **Raid mythic** / event rewards  

### T6–T8 must **not** appear from

- Trash / normal / elite open-world mobs  
- Common / uncommon world chests  
- Harvest nodes  
- Default open-world boss/raid tables (use `dungeon_boss` / `raid_mythic` when mythic+ is intended)

## Other hard rules

| Rule | Value |
|------|--------|
| **Catalog max** | **T8** (prefabs always) |
| **Natural max** | **T5** |
| **T0 in drops** | **Yes** — materials, potions, foods, thrown |
| **Player level** | Caps natural max + soft target; special unlocks T6+ with level gates |
| **Difficulty** | Level bias, qty mul, rare mul, T0 weight mul |

## Player level → natural max tier

| Player level | Natural max |
|--------------|-------------|
| 1–9 | T1 |
| 10–19 | T2 |
| 20–29 | T3 |
| 30–39 | T4 |
| 40+ | **T5** |

Special sources: T6 soft-unlock ~eff level 45, T7 ~55, T8 ~65 (still rare via `mythicChance`).

## Quick API

```js
import {
  rollLoot,
  rollPlayerDeathDrops,
  maxDropTier,
  assertDropTierLegal,
  NATURAL_MAX_DROP_TIER,
  MYTHIC_TIERS,
  isMythicSource
} from '../loot/dropTables.js';

// Natural — never T6–8
const natural = rollLoot({
  source: 'mob_normal',
  playerLevel: 22,
  difficulty: 'hard'
});
// meta.maxTier <= 5; no tier 6–8 in drops

// Corpse — spill held T6–8 gear as full prefabs
const corpse = rollPlayerDeathDrops(playerHeldItems, { playerLevel: 50 });

// Special chest / dungeon
const chest = rollLoot({ source: 'special_chest', playerLevel: 48, difficulty: 'elite' });
const dung = rollLoot({ source: 'dungeon_loot', playerLevel: 50, difficulty: 'hard' });
```

## Sources

**Natural (≤T5):**  
`mob_trash` · `mob_normal` · `mob_elite` · `chest_common` · `chest_uncommon` · `boss` · `raid` · `harvest_node`

**Special (≤T8):**  
`player_death` · `special_chest` · `dungeon_loot` · `dungeon_boss` · `raid_mythic` · `event_reward`

## Resolve items after roll

1. `category` + `tier` from roll (or full held item on `player_death`)  
2. Pick item from ObjectStore: `materials.json`, `consumables.json`, `master-weapon-prefabs.json`  
3. For natural rolls: never upgrade tier to 6+  
4. For special / corpse: resolve T6–8 through the **same** `presentPrefab` path as T0–5  

## Related

- Prefabs: `master-weapon-prefabs.json` (T0–T8)  
- ObjectStore: `docs/DROP_TABLES_SSOT.md`, `docs/WORLD_DROP_PRESENTATION.md`  
- Skills: `master-weaponSkills.json`  
- Showcase binds skills — separate from loot  
