/**
 * Aplanado de documentos tipo Office Lens (Comprobante / Factura).
 *
 * Buscar la hoja solo dentro del recorte justo del marco estira cualquier contorno interno
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
  type Quad,
} from '../ine/ineCardDetector';
import { ensureOpenCvLoaded } from '../loaders/opencvLoader';

/**
 * Tope del lado largo al aplanar. No se amplía por encima de los píxeles reales
 * de la foto: inventar resolución no ayuda al OCR y el JPEG ya va a calidad 0.92.
 */
const DOCUMENT_MAX_LONG_SIDE = 1600;

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

/** Acerca cada esquina al borde real. Si alguna salta hacia una línea interna, se deja la original. */
const refineQuad = (cv: Cv, gray: CvMat, quad: Quad): Quad => {
  const corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad.tl.x, quad.tl.y,
    quad.tr.x, quad.tr.y,
    quad.br.x, quad.br.y,
    quad.bl.x, quad.bl.y,
  ]);
  const criteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 30, 0.01);
  try {
    cv.cornerSubPix(gray, corners, new cv.Size(7, 7), new cv.Size(-1, -1), criteria);
    const data = corners.data32F as Float32Array;
    const next: Quad = {
      tl: { x: data[0], y: data[1] },
      tr: { x: data[2], y: data[3] },
      br: { x: data[4], y: data[5] },
      bl: { x: data[6], y: data[7] },
    };
    const limit = 0.04 * Math.max(gray.cols, gray.rows);
    const keys = ['tl', 'tr', 'br', 'bl'] as const;
    const jumped = keys.some((key) => {
      const dx = next[key].x - quad[key].x;
      const dy = next[key].y - quad[key].y;
      return dx * dx + dy * dy > limit * limit;
    });
    return jumped ? quad : next;
  } catch (error) {
    console.warn('[documentScanner] No se pudieron afinar las esquinas:', error);
    return quad;
  } finally {
    corners.delete();
    if (typeof criteria.delete === 'function') criteria.delete();
  }
};

const outputSize = (quad: Quad): { width: number; height: number } => {
  const width = (Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y) +
    Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y)) / 2;
  const height = (Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y) +
    Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y)) / 2;
  const longSide = Math.max(width, height);
  const scale = longSide > DOCUMENT_MAX_LONG_SIDE ? DOCUMENT_MAX_LONG_SIDE / longSide : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
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

    const quad = refineQuad(cv, gray, paper.quad);
    const { width: outW, height: outH } = outputSize(quad);
    warped = warpQuad(cv, src, quad, outW, outH);

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
