import type { ApiImage, CapturasPayload, VerificationPayload } from '../types/verificationPayload';

/**
 * El OCR de cada foto ya se llamó en `ocr/ocrClient` (POST { image }).
 * Aquí el JSON final se deja en consola y en localStorage para revisarlo.
 * Las fotos son el peso: si no caben, se guarda el mismo JSON con el tamaño
 * de cada imagen en lugar del base64.
 */

const PAYLOAD_KEY = 'mf-ocr.payload';

const imageSize = (image: ApiImage) => ({
  originalChars: image.original.length,
  processedChars: image.processed.length,
});

const summarizeCapturas = (capturas: CapturasPayload) =>
  'frente' in capturas
    ? { frente: imageSize(capturas.frente), reverso: imageSize(capturas.reverso) }
    : { documento: imageSize(capturas.documento) };

/** Resumen del payload para consola: mismas llaves, sin los strings enormes. */
const summarizePayload = (payload: VerificationPayload) => ({
  ...payload,
  data: { ...payload.data, capturas: summarizeCapturas(payload.data.capturas) },
});

export const submitVerification = async (payload: VerificationPayload): Promise<void> => {
  const summary = summarizePayload(payload);
  console.info('[submitVerification] payload:', summary);

  try {
    localStorage.setItem(PAYLOAD_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[submitVerification] El payload con fotos no cupo en localStorage:', error);
    localStorage.setItem(PAYLOAD_KEY, JSON.stringify(summary));
  }
};
