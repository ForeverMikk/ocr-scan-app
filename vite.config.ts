import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const apiUrl = env.VITE_OCR_API_URL || 'https://ocr.noiseray.dev/ocr/';
  const upstream = new URL(apiUrl);
  const upstreamPath = upstream.pathname.replace(/\/$/, '') || '/ocr';

  return {
    // basicSsl: HTTPS en dev para que cámara/GPS funcionen en el teléfono (http://IP no es contexto seguro)
    plugins: [react(), basicSsl()],
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
  };
});
