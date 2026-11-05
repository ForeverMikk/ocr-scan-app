/**
 * Aplanado de documentos tipo Office Lens (Comprobante / Factura).
 *
 * jscanify.extractPaper sobre el recorte del marco estira cualquier contorno interno
 * (efecto "cortina"): al recortar, los bordes de la hoja quedan pegados al límite y
 * Canny no los ve. Aquí se busca la hoja en un recorte CON margen, se valida que el
 * rectángulo parezca papel, y si no hay uno claro se deja el recorte del marco.
 */

import { canvasToJpeg, loadImage } from '../../shared/image';
import { unprocessedScan, type ScanResult } from '../../types/capture';
import {
  findCardCandidates,
  warpQuad,
  type CardCandidate,
  type Cv,
  type CvMat,
} from '../ine/ineCardDetector';
import { ensureOpenCvLoaded } from '../loaders/opencvLoader';

/** Tamaño de salida: proporción vertical aproximada de carta/A4. */
const DOCUMENT_OUTPUT = { width: 1200, height: 1600 };

/** Margen alrededor del marco para que OpenCV vea los 4 bordes de la hoja. */
export const DOCUMENT_DETECTION_PAD_RATIO = 0.2;

/** Hoja, no una tira ni un cuadrado pequeño. Carta/A4 ~ 1.29–1.41. */
const MIN_ASPECT = 1.05;
const MAX_ASPECT = 2.5;
const MIN_AREA_RATIO = 0.12;

const getCv = (): Cv => (window as unknown as { cv: Cv }).cv;

const imreadDataUrl = async (cv: Cv, dataUrl: string): Promise<CvMat> => {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  return cv.imread(canvas);
};

const pickPaper = (candidates: CardCandidate[]): CardCandidate | undefined => {
  let best: CardCandidate | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    if (c.aspectRatio < MIN_ASPECT || c.aspectRatio > MAX_ASPECT) continue;
    const score = c.bounds.width * c.bounds.height * c.rectangularity;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
};

/**
 * `paddedDataUrl`: marco + margen (para detectar bordes).
 * `fallbackDataUrl`: recorte justo del marco, por si no hay hoja clara.
 */
export const flattenDocument = async (
  paddedDataUrl: string,
  fallbackDataUrl: string
): Promise<ScanResult> => {
  let src: CvMat | null = null;
  let gray: CvMat | null = null;
  let warped: CvMat | null = null;
  try {
    await ensureOpenCvLoaded();
    const cv = getCv();
    src = await imreadDataUrl(cv, paddedDataUrl);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const paper = pickPaper(findCardCandidates(cv, gray, MIN_AREA_RATIO));
    if (!paper) {
      console.warn('[documentScanner] No se detectó una hoja; se usa el recorte del marco');
      return unprocessedScan(fallbackDataUrl);
    }

    const portrait = !paper.isLandscape;
    const outW = portrait ? DOCUMENT_OUTPUT.width : DOCUMENT_OUTPUT.height;
    const outH = portrait ? DOCUMENT_OUTPUT.height : DOCUMENT_OUTPUT.width;
    warped = warpQuad(cv, src, paper.quad, outW, outH);

    const output = document.createElement('canvas');
    cv.imshow(output, warped);
    return {
      originalDataUrl: fallbackDataUrl,
      processedDataUrl: canvasToJpeg(output),
      wasPerspectiveCorrected: true,
    };
  } catch (error) {
    console.warn('[documentScanner] Error al aplanar; se usa el recorte del marco:', error);
    return unprocessedScan(fallbackDataUrl);
  } finally {
    src?.delete();
    gray?.delete();
    warped?.delete();
  }
};
