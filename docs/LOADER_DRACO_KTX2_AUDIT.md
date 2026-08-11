# Loader audit: Draco · Meshopt · KTX2

**Question:** Does having Draco + a “KTX2 gap” cause conflicts?  
**Answer:** **No.** They are independent glTF extensions. Gaps and **duplicate** loaders were the real risk.

---

## Verdict

| Pair | Conflict? | Detail |
|------|-----------|--------|
| Draco geometry + Meshopt buffers | **No** | Both can exist on one GLB; each extension owns its buffers |
| Draco + KTX2 textures | **No** | Geometry vs textures |
| Missing KTX2 | **Not a conflict** | Assets without `KHR_texture_basisu` load fine (WebP/PNG/JPEG) |
| GLB with KTX2, no KTX2Loader | **Broken textures** | Silent pink/black if asset *requires* basisu |
| **Two DRACOLoader instances** | **Resource thrash** | Second WASM worker pool (projectiles vs AssetLoader) |
| Unversioned Draco CDN vs versioned | **Drift risk** | Open used `…/v1/decoders/`; Casting used `…/1.5.7/` |
| KTX2 basis path three@0.184 vs app 0.185 | **Mild mismatch** | Open was pinned 0.184; runtime three 0.185.1 |

---

## What we fixed (managed edits)

### Casting lab

| File | Change |
|------|--------|
| `src/loaders/gltfPipeline.js` | **New** — single shared Draco · Meshopt · bindKtx2 · status |
| `src/loaders/AssetLoader.js` | Uses shared pipeline; `bindRenderer(gl)` for KTX2; sRGB textures |
| `SkillProjectileSystem.js` | Uses `sharedGltfLoader()` — **no second DRACOLoader** |
| `config/assets.js` | Documents versioned Draco + KTX2 0.185.1 paths |
| `App.load()` | Calls `assets.bindRenderer(gl)` before asset load |

### Open (gameopen)

| File | Change |
|------|--------|
| `artifacts/animator/src/three/loaders/gltf.ts` | Draco → **versioned 1.5.7**; KTX2 pin **0.185.1** (match package three) |

---

## Correct architecture (fleet)

```
WebGLRenderer created
  → bindKtx2(renderer)     // once — detectSupport
  → one DRACOLoader        // process-wide WASM
  → GLTFLoader
       .setDRACOLoader(shared)
       .setMeshoptDecoder(MeshoptDecoder)
       .setKTX2Loader(sharedKtx2 if bound)

Any other system (projectiles, camp, drops)
  → sharedGltfLoader() only — never new DRACOLoader()
```

### When each decoder runs

| Extension on asset | Needs |
|--------------------|--------|
| (none) | Plain GLTFLoader |
| `KHR_draco_mesh_compression` | DRACOLoader |
| `EXT_meshopt_compression` | MeshoptDecoder |
| `KHR_texture_basisu` | KTX2Loader + GPU support |

If asset has **no** basisu textures, **missing KTX2 never breaks Draco**.

---

## Pins (SSOT)

| Decoder | Path |
|---------|------|
| Draco | `https://www.gstatic.com/draco/versioned/decoders/1.5.7/` |
| KTX2/Basis | `https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/libs/basis/` |
| three | `^0.185.1` |

When upgrading three major: bump **both** package.json and `KTX2_TRANSCODER_PATH` in the same PR.

Optional later: self-host `public/draco/` + `public/basis/` for offline / CSP.

---

## Audit checklist

```
[x] One shared Draco worker pool (Casting)
[x] Projectiles use sharedGltfLoader
[x] KTX2 bound after renderer
[x] Versioned Draco path Open + Casting
[x] KTX2 path matches three 0.185.1
[ ] Self-host decoders under public/ (optional)
[ ] CI smoke: load one Draco GLB + one Meshopt GLB
[ ] When first basisu atlas ships: verify bindKtx2 before load
```

---

## Symptom → cause

| Symptom | Likely cause |
|---------|----------------|
| Geometry missing / stuck load | Draco path 404 or CORS |
| Double memory on many projectiles | Second DRACOLoader (fixed) |
| Pink/black materials on **KTX2** GLB | bindKtx2 never called |
| Pink on **WebP** atlas | colorSpace / flipY / CDN 404 — not KTX2 |
| Works in Casting, fails Open | Path pin mismatch (fixed) |

---

## Related

- Casting `AssetLoader` · `gltfPipeline.js`
- Open `three/loaders/gltf.ts` · `bindKtx2`
- Review: `FLEET_ENTRY_DEPLOY_LOADERS_RAYCAST_REVIEW.md` (KTX2 gap now closed in lab)
