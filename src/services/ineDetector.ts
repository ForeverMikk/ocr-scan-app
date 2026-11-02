/**
 * Puente entre el navegador (video, canvas, data URLs) y el detector puro de
 * `ineCardDetector.ts`. Toda la lógica de visión vive allá; aquí solo se mueven píxeles.
 */

import { ensureOpenCvLoaded } from './opencvLoader';
import {
  analyzeIneRegion,
  extractIneCard,
  INE_ANALYSIS_WIDTH,
  INE_MESSAGES,
  type Cv,
  type CvMat,
  type IneAnalysis,
  type IneSide,
} from './ineCardDetector';
import { mapGuideFrameToSource, type Rect } from '../utils/guideFrameGeometry';

export { INE_MESSAGES };
export type { IneFitStatus, IneSide, Quad } from './ineCardDetector';
export type IneDetectionResult = IneAnalysis;

/**
 * Margen alrededor del marco que también se analiza. También se usa al recortar
 * la foto final, para que el detector vea los 4 bordes de la tarjeta.
 */
export const INE_DETECTION_PAD_RATIO = 0.15;

/** Tamaño de salida de la INE enderezada (proporción ID-1, buena resolución para OCR). */
const INE_OUTPUT_WIDTH = 1586;
const INE_OUTPUT_HEIGHT = 1000;

const getCv = (): Cv => (window as unknown as { cv: Cv }).cv;

let roiCanvas: HTMLCanvasElement | null = null;

const getRoiCanvas = (): HTMLCanvasElement => {
  if (!roiCanvas) roiCanvas = document.createElement('canvas');
  return roiCanvas;
};

interface Roi {
  canvas: HTMLCanvasElement;
  /** Marco guía dentro del canvas ROI, ya escalado. */
  frame: Rect;
}

/** Dibuja marco + margen, reducido a INE_ANALYSIS_WIDTH, en el canvas ROI (un solo drawImage). */
const drawRoi = (video: HTMLVideoElement, guideFrame: HTMLElement): Roi | null => {
  const mapping = mapGuideFrameToSource(
    video.videoWidth,
    video.videoHeight,
    video,
    guideFrame,
    INE_DETECTION_PAD_RATIO
  );
  if (!mapping) return null;

  const { sourceRect, frameInSource } = mapping;
  const scale = Math.min(1, INE_ANALYSIS_WIDTH / sourceRect.width);
  const width = Math.max(1, Math.round(sourceRect.width * scale));
  const height = Math.max(1, Math.round(sourceRect.height * scale));

  const canvas = getRoiCanvas();
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  // willReadFrequently: cv.imread usa getImageData en cada muestra
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(
    video,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    width,
    height
  );

  return {
    canvas,
    frame: {
      x: frameInSource.x * scale,
      y: frameInSource.y * scale,
      width: frameInSource.width * scale,
      height: frameInSource.height * scale,
    },
  };
};

/**
 * Analiza el cuadro actual del video (marco + margen) y decide si hay una INE
 * bien encuadrada. Pensado para llamarse en bucle (~3-4 Hz).
 */
export async function analyzeIneInGuideFrame(opts: {
  video: HTMLVideoElement;
  guideFrame: HTMLElement;
  expectedSide?: IneSide;
}): Promise<IneDetectionResult> {
  const { video, guideFrame, expectedSide } = opts;

  // HAVE_CURRENT_DATA: aún no hay cuadro que dibujar
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return { status: 'searching', message: INE_MESSAGES.warmingCamera };
  }

  let src: CvMat | null = null;
  try {
    await ensureOpenCvLoaded();
    const cv = getCv();

    const roi = drawRoi(video, guideFrame);
    if (!roi) return { status: 'searching', message: INE_MESSAGES.searching };

    src = cv.imread(roi.canvas);
    return analyzeIneRegion(cv, src, roi.frame, { expectedSide });
  } catch (error) {
    console.warn('[ineDetector] Error al analizar el cuadro:', error);
    return { status: 'searching', message: INE_MESSAGES.error };
  } finally {
    src?.delete();
  }
}

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen capturada'));
    img.src = dataUrl;
  });

/**
 * Busca la INE en la foto (recorte del marco + margen) y la devuelve enderezada a
 * 1586×1000 en JPEG. `null` si no se encontró una tarjeta clara (usar el recorte tal cual).
 */
export async function extractIneFromDataUrl(dataUrl: string): Promise<string | null> {
  let src: CvMat | null = null;
  let card: CvMat | null = null;
  try {
    await ensureOpenCvLoaded();
    const cv = getCv();
    const img = await loadImage(dataUrl);

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);

    src = cv.imread(canvas);
    card = extractIneCard(cv, src, INE_OUTPUT_WIDTH, INE_OUTPUT_HEIGHT);
    if (!card) return null;

    const output = document.createElement('canvas');
    cv.imshow(output, card);
    return output.toDataURL('image/jpeg', 0.92);
  } catch (error) {
    console.warn('[ineDetector] No se pudo enderezar la INE:', error);
    return null;
  } finally {
    src?.delete();
    card?.delete();
  }
}
