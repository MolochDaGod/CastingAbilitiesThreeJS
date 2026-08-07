/**
 * REMOVED play deploy stack.
 *
 * Warlords character play = toonKitPlay.js only (Casting live deploy SSOT).
 * Re-exports kept so old import paths do not invent a second system.
 */
export {
  diagnoseCharacterLook,
  countSkeletons,
  reGroundToonKit as reGroundAfterAnimSample,
  deployToonPlayKit,
  fitRootUniformSi,
  measureBoneStructuralBBox,
} from './toonKitPlay.js';

/** @deprecated throws — use deployToonPlayKit */
export function scaffoldGrudge6Kit() {
  throw new Error(
    '[grudge6Deploy] REMOVED — use toonKitPlay.deployToonPlayKit (Casting / ObjectStore Toon RTS play)',
  );
}

/** @deprecated throws — use deployToonPlayKit */
export function deployGrudge6Model() {
  throw new Error(
    '[grudge6Deploy] REMOVED — use toonKitPlay.deployToonPlayKit',
  );
}

/** @deprecated throws — do not unify for Toon play */
export function unifySkeletons() {
  throw new Error(
    '[grudge6Deploy] unifySkeletons REMOVED for Toon RTS play (head-at-feet)',
  );
}
