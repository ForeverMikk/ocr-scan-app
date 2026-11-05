import type { ApiImage, CapturasPayload, VerificationPayload } from '../types/verificationPayload';

/**
 * Endpoint del OCR. Mientras no lo pasen, déjalo vacío: se arma el payload y se
 * imprime un resumen en consola (sin pegar los base64, que saturan DevTools).
 *
 * Cuando exista: en la raíz del proyecto, `.env` con
 *   VITE_OCR_API_URL=https://…
 * y reiniciar `npm run dev`. El cuerpo es JSON; las imágenes van en
 * `data.capturas.*.processed` / `.original` como base64 puro.
 */
const OCR_API_URL = import.meta.env.VITE_OCR_API_URL?.trim() ?? '';

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

/**
 * Envía el payload a la API de OCR. Si no hay URL, solo deja el resumen en consola.
 * Cuando cambie el contrato (otros nombres de campo, FormData, etc.) se ajusta aquí.
 */
export const submitVerification = async (payload: VerificationPayload): Promise<void> => {
  const summary = summarizePayload(payload);
  console.info('[submitVerification] payload:', summary);

  if (!OCR_API_URL) {
    console.info('[submitVerification] Sin VITE_OCR_API_URL; no se llama a la API.');
    return;
  }

  const response = await fetch(OCR_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OCR ${response.status}: ${detail || response.statusText}`);
  }
};
