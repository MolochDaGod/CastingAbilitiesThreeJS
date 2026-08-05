import { defineConfig } from 'vite';

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
    chunkSizeWarningLimit: 2000
  },
  // HDR probe lives in /public. Character mesh + anims load from Grudge CDN/Open.
  assetsInclude: ['**/*.hdr', '**/*.glb']
});
