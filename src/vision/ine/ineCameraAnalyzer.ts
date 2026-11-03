/**
 * Puente entre el navegador (video, canvas, data URLs) y el detector puro de
 * `ineCardDetector.ts`. Toda la lógica de visión vive allá; aquí solo se mueven píxeles.
 */

import { canvasToJpeg, loadImage } from '../../shared/image';
import type { Rect } from '../../types/geometry';
import { mapGuideFrameToSource } from '../guideFrame/guideFrameGeometry';
import { ensureOpenCvLoaded } from '../loaders/opencvLoader';
import {
  analyzeIneRegion,
  extractIneCard,
  INE_ANALYSIS_WIDTH,
  INE_DETECTION_PAD_RATIO,
  INE_MESSAGES,
  type Cv,
  type CvMat,
  type IneAnalysis,
  type IneSide,
} from './ineCardDetector';
import { toVerifyGray, verifyIneCard, type IneTemplates, type IneVerification } from './ineVerifier';
import frontTemplateUrl from './templates/ine-frente.jpg';
import backTemplateUrl from './templates/ine-reverso.jpg';

const getCv = (): Cv => (window as unknown as { cv: Cv }).cv;

/** Dibuja un data URL / URL de imagen en un canvas y lo lee como Mat RGBA. */
const imreadUrl = async (cv: Cv, url: string): Promise<CvMat> => {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  return cv.imread(canvas);
};

let templatesPromise: Promise<IneTemplates> | null = null;

/** Plantillas oficiales de frente y reverso, preparadas una sola vez. */
const loadTemplates = (cv: Cv): Promise<IneTemplates> => {
  templatesPromise ??= (async () => {
    const prepare = async (url: string) => {
      const rgba = await imreadUrl(cv, url);
      try {
        return toVerifyGray(cv, rgba);
      } finally {
        rgba.delete();
      }
    };
    const [front, back] = await Promise.all([prepare(frontTemplateUrl), prepare(backTemplateUrl)]);
    return { front, back };
  })().catch((error: unknown) => {
    templatesPromise = null;
    throw error;
  });
  return templatesPromise;
};

/** Canvas reutilizado entre cuadros (crear uno por muestra genera basura en cada tick). */
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
}): Promise<IneAnalysis> {
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
    console.warn('[ineCameraAnalyzer] Error al analizar el cuadro:', error);
    return { status: 'searching', message: INE_MESSAGES.error };
  } finally {
    src?.delete();
  }
}

export interface IneCardCapture {
  /** Tarjeta enderezada (y girada si venía de cabeza), en JPEG. */
  dataUrl: string;
  /** Resultado del 2º análisis: ¿es INE? ¿qué lado? */
  verification: IneVerification;
}

/**
 * Busca la tarjeta en la foto (recorte del marco + margen), la endereza y la verifica
 * contra las plantillas de la INE. `null` si no se encontró ninguna tarjeta.
 */
export async function extractAndVerifyIne(dataUrl: string): Promise<IneCardCapture | null> {
  let src: CvMat | null = null;
  let card: CvMat | null = null;
  try {
    await ensureOpenCvLoaded();
    const cv = getCv();
    const templates = await loadTemplates(cv);

    src = await imreadUrl(cv, dataUrl);
    card = extractIneCard(cv, src);
    if (!card) return null;

    const verification = verifyIneCard(cv, card, templates);
    // Girar 180° = voltear en ambos ejes (seguro en el mismo Mat)
    if (verification.upsideDown) cv.flip(card, card, -1);

    const output = document.createElement('canvas');
    cv.imshow(output, card);
    return { dataUrl: canvasToJpeg(output), verification };
  } catch (error) {
    console.warn('[ineCameraAnalyzer] No se pudo enderezar/verificar la INE:', error);
    return null;
  } finally {
    src?.delete();
    card?.delete();
  }
}
