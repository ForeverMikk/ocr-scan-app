import type { VerificationPayload } from '../types/verificationPayload';

/**
 * Envía el payload a la API de OCR.
 *
 * Por ahora es un mock: solo lo muestra en consola. Cuando exista el endpoint,
 * aquí va el `fetch` (y su manejo de errores); el resto de la app no cambia.
 */
export const submitVerification = async (payload: VerificationPayload): Promise<void> => {
  console.log('PAYLOAD LISTO PARA API OCR:', payload);
};
