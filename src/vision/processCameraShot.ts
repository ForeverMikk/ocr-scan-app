/**
 * Convierte una foto de la cámara en la imagen final que se envía al OCR:
 *  - INE: recorta marco + margen y endereza la tarjeta (fallback: recorte del marco).
 *  - Documento: recorta el marco y, si se pidió, lo aplana tipo Office Lens.
 */

import { unprocessedScan, type ScanResult } from '../types/capture';
import { flattenDocument } from './document/documentScanner';
import { cropDataUrlToGuideFrame } from './guideFrame/cropToGuideFrame';
import { extractIneFromDataUrl } from './ine/ineCameraAnalyzer';
import { INE_DETECTION_PAD_RATIO } from './ine/ineCardDetector';

export interface CameraShot {
  /** Screenshot completo del video (data URL JPEG). */
  screenshot: string;
  video: HTMLVideoElement;
  guideFrame: HTMLElement;
}

export const processIneShot = async ({
  screenshot,
  video,
  guideFrame,
}: CameraShot): Promise<ScanResult> => {
  // Con margen: el detector necesita ver los 4 bordes de la tarjeta
  const paddedCrop = await cropDataUrlToGuideFrame(
    screenshot,
    video,
    guideFrame,
    INE_DETECTION_PAD_RATIO
  );
  const card = await extractIneFromDataUrl(paddedCrop);
  if (card) {
    return { originalDataUrl: paddedCrop, processedDataUrl: card, wasPerspectiveCorrected: true };
  }
  return unprocessedScan(await cropDataUrlToGuideFrame(screenshot, video, guideFrame));
};

export const processDocumentShot = async (
  { screenshot, video, guideFrame }: CameraShot,
  flatten: boolean
): Promise<ScanResult> => {
  const frameCrop = await cropDataUrlToGuideFrame(screenshot, video, guideFrame);
  return flatten ? flattenDocument(frameCrop) : unprocessedScan(frameCrop);
};
