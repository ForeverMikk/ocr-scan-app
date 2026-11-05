/**
 * Convierte una foto de la cámara en la imagen final que se envía al OCR:
 *  - INE: recorta marco + margen, endereza la tarjeta y la verifica (2º análisis).
 *  - Documento: recorta el marco y, si se pidió, lo aplana tipo Office Lens.
 */

import { unprocessedScan, type ScanResult } from '../types/capture';
import { DOCUMENT_DETECTION_PAD_RATIO, flattenDocument } from './document/documentScanner';
import { cropDataUrlToGuideFrame } from './guideFrame/cropToGuideFrame';
import { extractAndVerifyIne } from './ine/ineCameraAnalyzer';
import { INE_DETECTION_PAD_RATIO, type IneSide } from './ine/ineCardDetector';

export interface CameraShot {
  /** Screenshot completo del video (data URL JPEG). */
  screenshot: string;
  video: HTMLVideoElement;
  guideFrame: HTMLElement;
}

export type IneShotResult =
  | { ok: true; scan: ScanResult }
  /** `notIne`: no hay tarjeta o no es INE. `wrongSide`: es INE pero del otro lado. */
  | { ok: false; reason: 'notIne' | 'wrongSide' };

export const processIneShot = async (
  { screenshot, video, guideFrame }: CameraShot,
  expectedSide: IneSide
): Promise<IneShotResult> => {
  // Con margen: el detector necesita ver los 4 bordes de la tarjeta
  const paddedCrop = await cropDataUrlToGuideFrame(
    screenshot,
    video,
    guideFrame,
    INE_DETECTION_PAD_RATIO
  );
  const card = await extractAndVerifyIne(paddedCrop);
  console.info('[processIneShot] 2º análisis:', card?.verification ?? 'sin tarjeta');

  if (!card?.verification.isIne) return { ok: false, reason: 'notIne' };
  if (card.verification.side !== expectedSide) return { ok: false, reason: 'wrongSide' };

  return {
    ok: true,
    scan: { originalDataUrl: paddedCrop, processedDataUrl: card.dataUrl, wasPerspectiveCorrected: true },
  };
};

export const processDocumentShot = async (
  { screenshot, video, guideFrame }: CameraShot,
  flatten: boolean
): Promise<ScanResult> => {
  const frameCrop = await cropDataUrlToGuideFrame(screenshot, video, guideFrame);
  if (!flatten) return unprocessedScan(frameCrop);

  // Con margen: si se recorta justo al marco, los bordes de la hoja desaparecen y el
  // aplanado estira cualquier trazo interno (efecto cortina).
  const paddedCrop = await cropDataUrlToGuideFrame(
    screenshot,
    video,
    guideFrame,
    DOCUMENT_DETECTION_PAD_RATIO
  );
  return flattenDocument(paddedCrop, frameCrop);
};
