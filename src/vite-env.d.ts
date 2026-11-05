/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endpoint del OCR. Vacío = no se llama, solo se arma el payload. */
  readonly VITE_OCR_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
