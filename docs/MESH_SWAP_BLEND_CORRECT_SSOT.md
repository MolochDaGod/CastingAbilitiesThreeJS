# Mesh swap + blend correct (Casting lab)

**Code:** `src/character/meshSwapGuard.js` · `src/animation/blendCorrect.js` · `src/api/meshCorrectWorker.js`  
**Prompt:** `docs/ai/MESH_CORRECT_WORKER.md`  
**UI:** Admin Hub F1 → **Verify kit / mesh swap**

## Laws

| Do | Do not |
|----|--------|
| Equip via **mesh_ids** on the **same** Toon kit | Swap a second body GLB as “equip” |
| Race change = `setRace` full reload | Mixamo / Meshy / capsule onto Bip001 |
| One `AnimationMixer` | Second mixer for blend |
| `stripPositionTracks` + **warp=false** crossfade | Position tracks / warp=true (shake + hip-float) |
| Bones-only rematch Bip001 | mixamorig tracks on Toon |

## AI worker

`window.__castingMeshCorrect.run(tool, input)`

| Tool | Job |
|------|-----|
| `verify_kit` | Contract, SI height, Bip001 feet/pelvis |
| `verify_mesh_swap` | Block `.glb` URLs and banned ids |
| `apply_safe_mesh_ids` | Apply only if gate ok, then re-ground |
| `verify_clip` | Rotation tracks; warn leftover `.position` |

## Confirm

```
[ ] verify_kit ok after ?race=human
[ ] apply_safe_mesh_ids with a .glb URL is rejected
[ ] Gait blend no limb shake (warp off)
[ ] Attack exclusive fade — no dual-bind deform
```
