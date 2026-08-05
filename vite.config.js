import { defineConfig } from 'vite';

/**
 * Fleet pin: three ^0.185 + Rapier WASM (rapier3d-compat).
 * @see grudge-3d-game-packages · grudge-rapier
 */
export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2500
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  // HDR + ride GLBs in /public; character kits from CDN.
  assetsInclude: ['**/*.hdr', '**/*.glb', '**/*.wasm']
});
