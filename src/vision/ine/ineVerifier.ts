/**
 * Segundo análisis: ¿la tarjeta capturada es realmente una INE? ¿qué lado es?
 *
 * El detector en vivo solo sabe que hay "una tarjeta con forma de identificación"; una
 * licencia o cualquier credencial pasan. Aquí, ya con la tarjeta enderezada, se comparan
 * las zonas impresas que son IGUALES en todas las INE (encabezado, escudo, etiquetas del
 * frente; logo "INE" e "IDMEX" del reverso) contra una plantilla oficial.
 *
 * Como la tarjeta ya está enderezada, cada zona se busca solo en un vecindario pequeño de
 * su posición esperada (correlación normalizada); el puntaje es la mediana de las zonas.
 * Se prueban frente/reverso y la tarjeta girada 180° (INE de cabeza).
 *
 * Lógica pura (sin DOM): la usa el navegador y el script de calibración en Node.
 */

import type { Cv, CvMat, IneSide } from './ineCardDetector';

/** Tamaño de trabajo (plantillas y tarjeta se comparan a esta resolución, en gris). */
export const VERIFY_WIDTH = 640;
export const VERIFY_HEIGHT = 404;

/**
 * Mediana mínima para aceptar que es una INE. Calibración (scripts/test-ine-detector.ts):
 * INE real ≈ 0.83, licencia ≤ 0.34, tarjeta del metro ≤ 0.28, peor caso no-INE 0.51.
 */
export const INE_MATCH_MIN = 0.65;

/** Vecindario de búsqueda alrededor de cada zona (fracción del ancho / alto de la tarjeta). */
const SEARCH_MARGIN_X = 0.05;
const SEARCH_MARGIN_Y = 0.06;

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zona en píxeles de la muestra oficial (819×517) → coordenadas normalizadas 0..1. */
const zone = (x0: number, y0: number, x1: number, y1: number): Zone => ({
  x: x0 / 819,
  y: y0 / 517,
  w: (x1 - x0) / 819,
  h: (y1 - y0) / 517,
});

/** Zonas impresas fijas (no dependen de la persona). */
const ZONES: Record<IneSide, Zone[]> = {
  front: [
    zone(280, 25, 780, 92), // INSTITUTO NACIONAL ELECTORAL / CREDENCIAL PARA VOTAR
    zone(40, 20, 160, 118), // Escudo nacional
    zone(160, 45, 270, 80), // MÉXICO
    zone(268, 140, 345, 160), // NOMBRE
    zone(268, 266, 360, 286), // DOMICILIO
    zone(268, 363, 425, 384), // CLAVE DE ELECTOR
    zone(268, 390, 320, 408), // CURP
    zone(268, 442, 460, 463), // FECHA DE NACIMIENTO
  ],
  back: [
    zone(668, 22, 800, 60), // Logo INE
    zone(40, 380, 175, 412), // IDMEX (inicio del MRZ)
    zone(212, 14, 330, 30), // ELECCIONES FEDERALES
    zone(615, 285, 790, 330), // Texto bajo la firma del secretario
  ],
};

export type IneTemplates = Record<IneSide, CvMat>;

export interface IneVerification {
  isIne: boolean;
  /** Lado que mejor coincide (aunque no llegue al umbral). */
  side: IneSide;
  /** Mediana de correlación de las zonas del lado elegido (0..1). */
  score: number;
  /** true si la tarjeta venía de cabeza: hay que girarla 180° para la imagen final. */
  upsideDown: boolean;
}

/** RGBA o gris de cualquier tamaño → gris VERIFY_WIDTH×VERIFY_HEIGHT suavizado. */
export const toVerifyGray = (cv: Cv, image: CvMat): CvMat => {
  const resized = new cv.Mat();
  const gray = new cv.Mat();
  cv.resize(image, resized, new cv.Size(VERIFY_WIDTH, VERIFY_HEIGHT), 0, 0, cv.INTER_AREA);
  if (resized.channels() === 1) resized.copyTo(gray);
  else cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);
  resized.delete();
  // Suaviza ruido de JPEG y moiré para que la correlación compare formas, no píxeles
  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
  return gray;
};

/** Mediana de la mejor correlación de cada zona del lado `side`. */
const scoreSide = (cv: Cv, card: CvMat, template: CvMat, side: IneSide): number => {
  const scores: number[] = [];
  const marginX = Math.round(VERIFY_WIDTH * SEARCH_MARGIN_X);
  const marginY = Math.round(VERIFY_HEIGHT * SEARCH_MARGIN_Y);

  for (const z of ZONES[side]) {
    const rect = new cv.Rect(
      Math.round(z.x * VERIFY_WIDTH),
      Math.round(z.y * VERIFY_HEIGHT),
      Math.round(z.w * VERIFY_WIDTH),
      Math.round(z.h * VERIFY_HEIGHT)
    );
    const x0 = Math.max(0, rect.x - marginX);
    const y0 = Math.max(0, rect.y - marginY);
    const x1 = Math.min(VERIFY_WIDTH, rect.x + rect.width + marginX);
    const y1 = Math.min(VERIFY_HEIGHT, rect.y + rect.height + marginY);

    const patch = template.roi(rect);
    const search = card.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
    const result = new cv.Mat();
    try {
      cv.matchTemplate(search, patch, result, cv.TM_CCOEFF_NORMED);
      scores.push(cv.minMaxLoc(result).maxVal);
    } finally {
      patch.delete();
      search.delete();
      result.delete();
    }
  }

  scores.sort((a, b) => a - b);
  return scores[Math.floor(scores.length / 2)];
};

/**
 * Verifica una tarjeta ya enderezada (RGBA o gris, proporción ID-1).
 * `templates`: plantillas oficiales en gris VERIFY_WIDTH×VERIFY_HEIGHT (ver `toVerifyGray`).
 */
export const verifyIneCard = (cv: Cv, card: CvMat, templates: IneTemplates): IneVerification => {
  const upright = toVerifyGray(cv, card);
  const flipped = new cv.Mat();
  cv.rotate(upright, flipped, cv.ROTATE_180);

  try {
    let best: IneVerification = { isIne: false, side: 'front', score: -1, upsideDown: false };
    for (const side of ['front', 'back'] as const) {
      for (const [image, upsideDown] of [
        [upright, false],
        [flipped, true],
      ] as const) {
        const score = scoreSide(cv, image, templates[side], side);
        if (score > best.score) best = { isIne: false, side, score, upsideDown };
      }
    }
    return { ...best, isIne: best.score >= INE_MATCH_MIN };
  } finally {
    upright.delete();
    flipped.delete();
  }
};
