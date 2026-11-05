import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
/** Entry de navegador real; evita exports subpath y el entry Node (canvas/jsdom). */
const jscanifyClientFile = path.resolve(rootDir, 'node_modules/jscanify/src/jscanify.js');

/**
 * Resuelve `jscanify` y `jscanify/client` al .js de browser sin pasar por
 * el campo `exports` (que con alias producía `./client/client`).
 */
function jscanifyBrowserResolve(): Plugin {
  return {
    name: 'jscanify-browser-resolve',
    enforce: 'pre',
    resolveId(id) {
      // Conserva sufijos como `?url` (usado por jscanifyLoader para cargarlo como <script>)
      const [bare, query] = id.split('?');
      if (bare === 'jscanify' || bare === 'jscanify/client') {
        return query ? `${jscanifyClientFile}?${query}` : jscanifyClientFile;
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const apiUrl = env.VITE_OCR_API_URL || 'https://ocr.noiseray.dev/ocr/';
  const upstream = new URL(apiUrl);
  const upstreamPath = upstream.pathname.replace(/\/$/, '') || '/ocr';

  return {
    // basicSsl: HTTPS en dev para que cámara/GPS funcionen en el teléfono (http://IP no es contexto seguro)
    plugins: [react(), basicSsl(), jscanifyBrowserResolve()],
    server: {
      port: 3015, // Puerto definido en el diagrama de arquitectura MF OCR
      strictPort: true,
      host: true,
      // El OCR no responde al preflight CORS. En dev el navegador llama a este
      // mismo origen y Vite reenvía el POST al host real.
      proxy: {
        '/ocr-api': {
          target: upstream.origin,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/ocr-api/, upstreamPath),
        },
      },
    },
    optimizeDeps: {
      // El entry Node de jscanify arrastra nativos; no prebundlearlos.
      exclude: ['canvas', 'jsdom', 'jscanify'],
    },
    ssr: {
      // Si algún pre-transform/SSR toca el grafo, forzar el artefacto de cliente.
      noExternal: ['jscanify'],
    },
  };
});
