import jscanifyScriptUrl from 'jscanify/client?url';
import { ensureOpenCvLoaded } from './opencvLoader';

/**
 * jscanify se distribuye como UMD que asigna `this.jscanify`. Importado como módulo ES,
 * `this` es undefined y truena, así que se carga como <script> clásico (global `jscanify`).
 * Depende del global `cv`, por eso primero se asegura OpenCV.
 */

type JScanifyClass = typeof import('jscanify').default;

let loadingPromise: Promise<JScanifyClass> | null = null;

const getGlobalJScanify = (): JScanifyClass | undefined =>
  (window as unknown as { jscanify?: JScanifyClass }).jscanify;

export const loadJScanify = (): Promise<JScanifyClass> => {
  const existing = getGlobalJScanify();
  if (existing) return Promise.resolve(existing);
  if (loadingPromise) return loadingPromise;

  loadingPromise = ensureOpenCvLoaded()
    .then(
      () =>
        new Promise<JScanifyClass>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = jscanifyScriptUrl;
          script.async = true;
          script.dataset.jscanify = 'true';
          script.onload = () => {
            const JScanify = getGlobalJScanify();
            if (JScanify) resolve(JScanify);
            else reject(new Error('jscanify cargó pero no registró el global'));
          };
          script.onerror = () => reject(new Error('No se pudo descargar jscanify'));
          document.head.appendChild(script);
        })
    )
    .catch((err: unknown) => {
      loadingPromise = null;
      throw err instanceof Error ? err : new Error(String(err));
    });

  return loadingPromise;
};
