import opencvScriptUrl from '@techstark/opencv-js/dist/opencv.js?url';

/**
 * Carga OpenCV.js como <script> clásico y espera a que el runtime WASM esté listo.
 *
 * No se usa `import('@techstark/opencv-js')`: el objeto `cv` define su propio `then`
 * (Emscripten), así que cualquier Promise que resuelva con él (incluido el interop de
 * Vite) entra en un ciclo y nunca termina. Por eso aquí jamás se resuelve con `cv`.
 */

const LOAD_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 50;

type CvGlobal = { Mat?: unknown };

let loadingPromise: Promise<void> | null = null;

const getGlobalCv = (): CvGlobal | undefined => (window as unknown as { cv?: CvGlobal }).cv;

const isRuntimeReady = (): boolean => Boolean(getGlobalCv()?.Mat);

const injectScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = opencvScriptUrl;
    script.async = true;
    script.dataset.opencv = 'true';
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`No se pudo descargar OpenCV desde ${opencvScriptUrl}`));
    document.head.appendChild(script);
  });

/** El runtime WASM inicializa después del onload; se sondea hasta que `cv.Mat` exista. */
const waitForRuntime = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      if (isRuntimeReady()) {
        resolve();
        return;
      }
      if (performance.now() - startedAt > LOAD_TIMEOUT_MS) {
        reject(new Error('OpenCV tardó demasiado en inicializar'));
        return;
      }
      window.setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  });

export const ensureOpenCvLoaded = (): Promise<void> => {
  if (isRuntimeReady()) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  console.info('[opencv] Cargando OpenCV.js…');
  const startedAt = performance.now();

  loadingPromise = injectScript()
    .then(waitForRuntime)
    .then(() => {
      console.info(`[opencv] Listo en ${Math.round(performance.now() - startedAt)} ms`);
    })
    .catch((err: unknown) => {
      // Permite reintentar en la siguiente llamada
      loadingPromise = null;
      throw err instanceof Error ? err : new Error(String(err));
    });

  return loadingPromise;
};
