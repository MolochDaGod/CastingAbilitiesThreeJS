# Casting Lab SDK export SSOT

**Module:** `src/sdk/castingLabSdk.js`  
**Package export:** `casting-abilities/sdk` (see root `package.json` `exports`)  
**Runtime contract:** `GET /api/v1/casting-lab-contract.json` (static under `public/`)

---

## Purpose

Give Open / Warlords / satellites a **single import surface** for lab systems that are ready to ship:

| Export group | Systems |
|--------------|---------|
| Loaders | shared Draco · Meshopt · KTX2 bind |
| Skills | production compile · statuses · delivery · staff bind |
| Linear | planElementalLinearCast · PRODUCT_TO_LINEAR |
| Terrain | mountTerrainLayers · heightAt · projectToTerrain |
| VFX | staff orbs · element attack kinds |
| Contract | CASTING_LAB_CONTRACT version stamp |

**Not exported:** full `App` shell, AdminHub, lil-gui editor — those stay lab-only.

---

## Import

```js
// From Casting repo (monorepo path)
import {
  sharedGltfLoader,
  bindKtx2,
  compileProductionWeaponSkill,
  mountTerrainLayers,
  CASTING_LAB_CONTRACT
} from 'casting-abilities/sdk';

// Or relative
import { … } from '../CastingAbilitiesThreeJS/src/sdk/castingLabSdk.js';
```

### Fleet install pattern (later npm)

```bash
# When published as @grudge-studio/casting-lab or workspace path:
npm install casting-abilities
```

Until then, copy contract JSON to ObjectStore or depend via git path.

---

## Definitions (SSOT authority)

| Definition | Source |
|------------|--------|
| Skill rows | info `master-weaponSkills` / `t0-weapons` |
| Skill runtime package | `compileProductionWeaponSkill` |
| Status ids | `skillStatusSystem.parseCatalogEffects` |
| Element → linear | `PRODUCT_TO_LINEAR` |
| Decoder pins | `gltfPipeline` DRACO / KTX2 paths |
| Terrain layers | `TERRAIN_LAYER` + THREE_LAYER_TERRAIN_SSOT |
| Character play | grudge6 loadRaceKit / toonKitPlay |

---

## Deploy optimization

| Do | Don't |
|----|--------|
| Ship split orbs/rocks/arrows only | Ship `*_src.glb` multipacks in prod (gitignored) |
| One sharedGltfLoader | new GLTFLoader / DRACOLoader per system |
| Contract JSON static on Vercel | Duplicate pin strings in consumers |
| Warm skill overrides on equip | Sync-fetch overrides per skill cast |

---

## Version

Bump `CASTING_LAB_SDK_VERSION` + `public/api/v1/casting-lab-contract.json` together when removing/renaming exports.
