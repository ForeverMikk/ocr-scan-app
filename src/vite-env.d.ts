/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** POST { image } del OCR. Ejemplo: https://ocr.noiseray.dev/ocr/ */
  readonly VITE_OCR_API_URL?: string;
  /** Token Bearer. Solo en `.env.local`, nunca en el código. */
  readonly VITE_OCR_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
