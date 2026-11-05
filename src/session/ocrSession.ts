/**
 * Guarda lo que devolvió el OCR (el texto, no las fotos) para armar el JSON
 * y poder inspeccionarlo aunque se recargue la página.
 * Las imágenes viven en memoria: en localStorage se pasan del cupo fácil.
 */

import type { DocumentoLabel } from '../types/verificationPayload';

const SESSION_KEY = 'mf-ocr.session';

export interface OcrReading {
  status: string;
  resultado: string;
}

export interface OcrSession {
  documento: DocumentoLabel | null;
  lecturas: {
    frente?: OcrReading;
    reverso?: OcrReading;
    documento?: OcrReading;
  };
  updatedAt: string;
}

export const emptyOcrSession = (): OcrSession => ({
  documento: null,
  lecturas: {},
  updatedAt: new Date().toISOString(),
});

export const writeOcrSession = (session: OcrSession): void => {
  const next: OcrSession = { ...session, updatedAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
};

export const clearStoredVerification = (): void => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('mf-ocr.payload');
};
