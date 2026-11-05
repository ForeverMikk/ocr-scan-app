/**
 * POST { image: base64 } al OCR.
 * El base64 va sin el prefijo `data:image/...;base64,`.
 */

export interface OcrApiResponse {
  status: string;
  resultado: string;
}

export const scanDocumentImage = async (imageBase64: string): Promise<OcrApiResponse> => {
  const configured = import.meta.env.VITE_OCR_API_URL?.trim() ?? '';
  const bearer = import.meta.env.VITE_OCR_API_TOKEN?.trim() ?? '';
  if (!configured || !bearer) {
    throw new Error('Falta VITE_OCR_API_URL o VITE_OCR_API_TOKEN en .env.local. Reinicia npm run dev.');
  }
  // En `npm run dev` el API no acepta el preflight del navegador. Vite reenvía /ocr-api.
  const endpoint = import.meta.env.DEV ? '/ocr-api/' : configured;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        accept: '*/*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: imageBase64 }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('No se pudo contactar el OCR. Reinicia npm run dev e inténtalo de nuevo.');
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401) throw new Error('El token del OCR no fue aceptado.');
    throw new Error(`OCR ${response.status}: ${detail || response.statusText}`);
  }

  const body = (await response.json()) as Partial<OcrApiResponse>;
  if (typeof body.resultado !== 'string') throw new Error('El OCR no devolvió texto.');
  return { status: body.status ?? 'ok', resultado: body.resultado };
};
