import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * rapier3d-compat embeds wasm as base64 and calls init(Uint8Array).
 * wasm-bindgen wants init({ module_or_path }) — wrap bytes so console stays clean.
 * @see node_modules/@dimforge/rapier3d-compat/rapier.mjs function xA
 */
function fixRapierInitDeprecation() {
  const needle =
    'Object.getPrototypeOf(I)===Object.prototype?({module_or_path:I}=I):console.warn("using deprecated parameters for the initialization function; pass a single object instead")';
  const replacement =
    'Object.getPrototypeOf(I)===Object.prototype?({module_or_path:I}=I):(I={module_or_path:I},I=I.module_or_path)';
  return {
    name: 'fix-rapier-init-deprecation',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@dimforge/rapier3d-compat')) return null;
      if (!code.includes('using deprecated parameters for the initialization function')) {
        return null;
      }
      if (!code.includes(needle)) return null;
      return { code: code.replaceAll(needle, replacement), map: null };
    }
  };
}

/**
 * Fleet pin: three ^0.185 + Rapier WASM (rapier3d-compat).
 * @see grudge-3d-game-packages · grudge-rapier
 */
export default defineConfig({
  // Absolute base for Vercel root host — relative `./` can break module graph on some redirects
  base: '/',
  plugins: [fixRapierInitDeprecation()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false,
    proxy: {
      '/api/assets': {
        target: 'https://assets.grudge-studio.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/assets/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://assets.grudge-studio.com/');
          });
        }
      },
      '/api/open': {
        target: 'https://open.grudge-studio.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/open/, '')
      },
      '/api/info': {
        target: 'https://info.grudge-studio.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/info/, '/api')
      },
      '/api/objectstore': {
        target: 'https://grudge-objectstore.pages.dev',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/objectstore/, '/api')
      },
      '/api': {
        target: 'https://grudge-api-production-0d46.up.railway.app',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        devnode: resolve(__dirname, 'devnode.html')
      }
    }
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  // HDR + ride GLBs in /public; character kits from CDN.
  assetsInclude: ['**/*.hdr', '**/*.glb', '**/*.wasm']
});
