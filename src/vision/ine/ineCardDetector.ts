/**
 * Detector de INE con OpenCV — lógica pura (sin DOM).
 *
 * Este archivo no importa nada que toque el DOM ni assets de Vite (`?url`).
 *
 * Pipeline:
 *  1. Varias máscaras (2× Canny + Otsu): una sola falla con fondos claros, reflejos o texturas.
 *  2. Todos los contornos → casco convexo → rectángulo mínimo. Se descartan los que no
 *     son rectangulares; las esquinas redondeadas de la INE se toleran por el casco.
 *  3. Se elige el candidato con proporción ID-1 (85.6×54 mm) que mejor coincide con el marco.
 *  4. Sobre la tarjeta "enderezada" se mide nitidez, reflejos y textura (frente/reverso).
 */

import type { Rect } from '../../types/geometry';

// OpenCV.js no trae tipos útiles; se tipa como `any` solo en este borde.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cv = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CvMat = any;

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export interface CardCandidate {
  quad: Quad;
  /** Lado largo / lado corto. */
  aspectRatio: number;
  /** true si el lado largo está en horizontal. */
  isLandscape: boolean;
  /** Área del casco / área del rectángulo mínimo (1 = rectángulo perfecto). */
  rectangularity: number;
  bounds: Rect;
}

export type IneFitStatus = 'searching' | 'good' | 'bad';
export type IneSide = 'front' | 'back';

export interface IneAnalysis {
  status: IneFitStatus;
  message: string;
  /** Fracción de la tarjeta que cae dentro del marco (1 = toda adentro). */
  insideRatio?: number;
  /** Fracción del marco que cubre la tarjeta (1 = lo llena). */
  coverage?: number;
  aspectRatio?: number;
  /** Varianza del Laplaciano sobre la tarjeta enderezada (más alto = más nítido). */
  sharpness?: number;
  /** Fracción de píxeles quemados por reflejo. */
  glare?: number;
  /** Densidad de bordes en el centro de la tarjeta (el reverso con QR es muy alta). */
  texture?: number;
  /** Fracción de la tarjeta con fondo claro y poco saturado (tipo papel de identificación). */
  paper?: number;
  /** Esquinas normalizadas al marco (0..1), para medir estabilidad entre cuadros. */
  quadInFrame?: Quad;
}

// ---------------------------------------------------------------------------
// Umbrales (calibrados con las fotos de dev-fixtures/ine)
// ---------------------------------------------------------------------------

/** Proporción ID-1 (85.6 × 54 mm). */
export const INE_ASPECT = 85.6 / 54;

/** Tamaño de la INE enderezada que se envía al OCR (proporción ID-1). */
export const INE_OUTPUT_WIDTH = 1586;
export const INE_OUTPUT_HEIGHT = 1000;

/**
 * Margen alrededor del marco guía (fracción de su tamaño) que también se analiza y se
 * recorta en la foto final: el detector necesita ver los 4 bordes de la tarjeta.
 */
export const INE_DETECTION_PAD_RATIO = 0.15;

/** Ancho al que se reduce la región (marco + margen) antes de analizarla en vivo. */
export const INE_ANALYSIS_WIDTH = 480;
/** Desviación máxima de la proporción (≈ 1.29 – 1.89, tolera algo de perspectiva). */
const ASPECT_TOLERANCE = 0.3;
/** Casco / rectángulo mínimo; las esquinas redondeadas de la INE dan ~0.97. */
const MIN_RECTANGULARITY = 0.85;
/** Tolerancia de approxPolyDP (fracción del perímetro). */
const APPROX_EPSILON = 0.02;
/**
 * Pasadas de Canny (umbral bajo, alto, tamaño del kernel que une huecos del borde):
 * muy sensible para INE clara sobre fondo claro, media, y robusta para fondos con textura.
 */
const CANNY_PASSES: [number, number, number][] = [
  [15, 45, 7],
  [30, 90, 3],
  [75, 200, 3],
];

/** Mínimo de la tarjeta dentro del marco y mínimo del marco cubierto. */
const INSIDE_MIN = 0.9;
const COVERAGE_MIN = 0.6;
/** Por debajo de esto (IoU con el marco) se considera que no hay tarjeta. */
const PRESENCE_MIN_IOU = 0.15;
/** Lados opuestos: ±30% (solo rechaza perspectiva muy fuerte). */
const EDGE_TOLERANCE = 0.3;
/** Si toca el borde del área analizada, la tarjeta real es más grande de lo que se ve. */
const BORDER_TOUCH_RATIO = 0.015;

/** Tamaño de la tarjeta enderezada para medir calidad (métricas comparables entre cuadros). */
const QUALITY_W = 400;
const QUALITY_H = Math.round(QUALITY_W / INE_ASPECT);
export const SHARPNESS_MIN = 60;
/** Alto a propósito: el reverso tiene zonas blancas legítimas (~7% en la muestra oficial). */
export const GLARE_MAX = 0.15;
/** Densidad de bordes a partir de la cual es claramente el reverso (bloques QR). */
export const BACK_TEXTURE_MIN = 0.2;
/**
 * Mínimo de "fondo tipo papel" para considerar que es una identificación. Las credenciales
 * oficiales son claras y poco saturadas (≈ 0.7–0.9); tarjetas de colores como la del metro ≈ 0.06.
 * Por debajo, el detector actúa como si no hubiera nada (sin marco verde ni mensajes).
 */
export const PAPER_MIN = 0.35;
/** Píxel "tipo papel" en HSV de OpenCV (S y V en 0..255). */
const PAPER_MAX_SATURATION = 70;
const PAPER_MIN_VALUE = 110;

export const INE_MESSAGES = {
  searching: 'Coloca tu INE dentro del marco',
  warmingCamera: 'Iniciando cámara…',
  good: 'INE detectada. Mantén estable…',
  adjust: 'Endereza la INE, evita inclinarla',
  center: 'Centra la INE en el marco',
  tooSmall: 'Acerca la INE para que llene el marco',
  tooBig: 'Aleja un poco la INE; debe verse completa',
  rotated: 'Gira la INE en horizontal',
  notIne: 'Documento no parece una INE',
  blurry: 'Imagen borrosa: mantén quieto el celular',
  glare: 'Hay reflejo: inclina un poco la INE o cambia la luz',
  showFront: 'Ese es el reverso: muestra el FRENTE de tu INE',
  error: 'Buscando la INE…',
} as const;

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const relativeDiff = (a: number, b: number): number => {
  const max = Math.max(a, b);
  return max > 0 ? Math.abs(a - b) / max : 1;
};

const intersectionArea = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const iou = (a: Rect, b: Rect): number => {
  const inter = intersectionArea(a, b);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
};

/** Ordena 4 puntos como tl, tr, br, bl (por suma y diferencia de coordenadas). */
const orderQuad = (points: Point[]): Quad => {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return { tl: bySum[0], br: bySum[3], tr: byDiff[0], bl: byDiff[3] };
};

const quadPoints = (q: Quad): Point[] => [q.tl, q.tr, q.br, q.bl];

const quadBounds = (q: Quad): Rect => {
  const xs = quadPoints(q).map((p) => p.x);
  const ys = quadPoints(q).map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

const quadSides = (q: Quad) => ({
  top: distance(q.tl, q.tr),
  bottom: distance(q.bl, q.br),
  left: distance(q.tl, q.bl),
  right: distance(q.tr, q.br),
});

/** Rota el orden de las esquinas 90° para que una tarjeta vertical salga horizontal. */
const rotateQuadToLandscape = (q: Quad): Quad => ({ tl: q.bl, tr: q.tl, br: q.tr, bl: q.br });

const scaleQuad = (q: Quad, k: number): Quad => ({
  tl: { x: q.tl.x * k, y: q.tl.y * k },
  tr: { x: q.tr.x * k, y: q.tr.y * k },
  br: { x: q.br.x * k, y: q.br.y * k },
  bl: { x: q.bl.x * k, y: q.bl.y * k },
});

/** 1 = proporción ID-1 exacta, 0 = fuera de tolerancia. */
const aspectFit = (c: CardCandidate): number =>
  Math.max(0, 1 - Math.abs(c.aspectRatio - INE_ASPECT) / ASPECT_TOLERANCE);

/**
 * Elige la mejor tarjeta: `weight` (área o IoU con el marco) × parecido a ID-1 × rectangularidad.
 * La proporción pesa fuerte porque el contorno de la tarjeta a veces se fusiona con sombras o
 * con el fondo y sale un rectángulo más grande pero con proporción incorrecta.
 */
export const selectBestCard = (
  candidates: CardCandidate[],
  weight: (c: CardCandidate) => number
): CardCandidate | undefined => {
  let best: CardCandidate | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    const score = weight(c) * aspectFit(c) * c.rectangularity;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
};

// ---------------------------------------------------------------------------
// Detección de candidatos
// ---------------------------------------------------------------------------

/** Máscaras binarias de las que se extraen contornos. El llamador libera los Mats. */
const buildMasks = (cv: Cv, gray: CvMat): CvMat[] => {
  const blurred = new cv.Mat();
  const masks: CvMat[] = [];
  try {
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    for (const [low, high, closeSize] of CANNY_PASSES) {
      const edges = new cv.Mat();
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(closeSize, closeSize));
      cv.Canny(blurred, edges, low, high);
      // Une huecos del borde (reflejos, poco contraste) para que el contorno quede cerrado
      cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
      kernel.delete();
      masks.push(edges);
    }

    // Otsu separa tarjeta clara de fondo oscuro aunque el borde tenga poco gradiente
    const binary = new cv.Mat();
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    masks.push(binary);
  } finally {
    blurred.delete();
  }
  return masks;
};

const readPoints = (mat: CvMat): Point[] => {
  const data: Int32Array = mat.data32S;
  const points: Point[] = [];
  for (let i = 0; i < data.length; i += 2) points.push({ x: data[i], y: data[i + 1] });
  return points;
};

const toCandidate = (
  cv: Cv,
  contour: CvMat,
  minArea: number,
  imageW: number,
  imageH: number
): CardCandidate | null => {
  // Filtro barato antes de calcular el casco
  if (cv.contourArea(contour) < minArea * 0.5) return null;

  const hull = new cv.Mat();
  const approx = new cv.Mat();
  try {
    cv.convexHull(contour, hull, false, true);
    const hullArea = cv.contourArea(hull);
    if (hullArea < minArea) return null;

    const rotated = cv.minAreaRect(hull);
    const rectArea = rotated.size.width * rotated.size.height;
    if (rectArea <= 0) return null;
    const rectangularity = hullArea / rectArea;
    if (rectangularity < MIN_RECTANGULARITY) return null;

    // 4 esquinas reales si el polígono las da (respeta perspectiva); si no, rectángulo mínimo
    cv.approxPolyDP(hull, approx, APPROX_EPSILON * cv.arcLength(hull, true), true);
    const points: Point[] =
      approx.rows === 4 && cv.isContourConvex(approx)
        ? readPoints(approx)
        : (cv.RotatedRect.points(rotated) as Point[]).map((p) => ({ x: p.x, y: p.y }));

    const quad = orderQuad(points);
    const bounds = quadBounds(quad);

    // Regiones pegadas a 2+ bordes de la imagen son fondo (o la imagen entera), no la tarjeta
    const margin = 2;
    const touching =
      Number(bounds.x <= margin) +
      Number(bounds.y <= margin) +
      Number(bounds.x + bounds.width >= imageW - margin) +
      Number(bounds.y + bounds.height >= imageH - margin);
    if (touching >= 2) return null;

    const { top, bottom, left, right } = quadSides(quad);
    const width = (top + bottom) / 2;
    const height = (left + right) / 2;
    if (width <= 0 || height <= 0) return null;

    return {
      quad,
      aspectRatio: Math.max(width, height) / Math.min(width, height),
      isLandscape: width >= height,
      rectangularity,
      bounds,
    };
  } finally {
    hull.delete();
    approx.delete();
  }
};

/**
 * Todos los rectángulos plausibles de la imagen (gris, CV_8UC1).
 * `minAreaRatio`: área mínima respecto a la imagen.
 */
export const findCardCandidates = (cv: Cv, gray: CvMat, minAreaRatio: number): CardCandidate[] => {
  const imageW: number = gray.cols;
  const imageH: number = gray.rows;
  const minArea = imageW * imageH * minAreaRatio;
  const candidates: CardCandidate[] = [];

  const masks = buildMasks(cv, gray);
  try {
    for (const mask of masks) {
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      try {
        // RETR_LIST: la tarjeta puede quedar "dentro" de otro contorno del fondo
        cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          try {
            const candidate = toCandidate(cv, contour, minArea, imageW, imageH);
            if (candidate) candidates.push(candidate);
          } finally {
            contour.delete();
          }
        }
      } finally {
        contours.delete();
        hierarchy.delete();
      }
    }
  } finally {
    masks.forEach((m) => m.delete());
  }
  return candidates;
};

// ---------------------------------------------------------------------------
// Calidad sobre la tarjeta enderezada
// ---------------------------------------------------------------------------

/** Endereza la tarjeta (homografía) a `width × height`. El llamador libera el Mat. */
export const warpQuad = (cv: Cv, src: CvMat, quad: Quad, width: number, height: number): CvMat => {
  const srcPts = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    quadPoints(quad).flatMap((p) => [p.x, p.y])
  );
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
  const transform = cv.getPerspectiveTransform(srcPts, dstPts);
  const out = new cv.Mat();
  try {
    cv.warpPerspective(
      src,
      out,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar()
    );
  } finally {
    srcPts.delete();
    dstPts.delete();
    transform.delete();
  }
  return out;
};

export interface CardQuality {
  sharpness: number;
  glare: number;
  texture: number;
}

/** Métricas sobre la tarjeta enderezada en gris (QUALITY_W × QUALITY_H). */
export const measureCardQuality = (cv: Cv, gray: CvMat, quad: Quad): CardQuality => {
  const card = warpQuad(cv, gray, quad, QUALITY_W, QUALITY_H);
  const laplacian = new cv.Mat();
  const mean = new cv.Mat();
  const std = new cv.Mat();
  const bright = new cv.Mat();
  const edges = new cv.Mat();
  try {
    // Nitidez: varianza del Laplaciano (bajo = desenfocado o movido)
    cv.Laplacian(card, laplacian, cv.CV_64F);
    cv.meanStdDev(laplacian, mean, std);
    const sharpness = std.doubleAt(0, 0) ** 2;

    // Reflejo: píxeles prácticamente blancos (quemados)
    cv.threshold(card, bright, 250, 255, cv.THRESH_BINARY);
    const glare = cv.countNonZero(bright) / (QUALITY_W * QUALITY_H);

    // Textura del centro (sin bordes de la tarjeta): los QR del reverso la disparan
    const inner = card.roi(
      new cv.Rect(
        Math.round(QUALITY_W * 0.05),
        Math.round(QUALITY_H * 0.15),
        Math.round(QUALITY_W * 0.9),
        Math.round(QUALITY_H * 0.7)
      )
    );
    cv.Canny(inner, edges, 60, 180);
    const texture = cv.countNonZero(edges) / (inner.rows * inner.cols);
    inner.delete();

    return { sharpness, glare, texture };
  } finally {
    card.delete();
    laplacian.delete();
    mean.delete();
    std.delete();
    bright.delete();
    edges.delete();
  }
};

/** Fracción de la tarjeta (RGBA) con píxeles claros y poco saturados. */
export const measurePaperRatio = (cv: Cv, rgba: CvMat, quad: Quad): number => {
  // Baja resolución basta: solo importa la distribución de color
  const card = warpQuad(cv, rgba, quad, 160, 101);
  const rgb = new cv.Mat();
  const hsv = new cv.Mat();
  const low = new cv.Mat(card.rows, card.cols, cv.CV_8UC3, [0, 0, PAPER_MIN_VALUE, 0]);
  const high = new cv.Mat(card.rows, card.cols, cv.CV_8UC3, [180, PAPER_MAX_SATURATION, 255, 0]);
  const mask = new cv.Mat();
  try {
    cv.cvtColor(card, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    cv.inRange(hsv, low, high, mask);
    return cv.countNonZero(mask) / (card.rows * card.cols);
  } finally {
    [card, rgb, hsv, low, high, mask].forEach((m) => m.delete());
  }
};

// ---------------------------------------------------------------------------
// Análisis en vivo (marco guía)
// ---------------------------------------------------------------------------

export interface AnalyzeOptions {
  /** Lado que se espera; si se pide el frente y claramente es el reverso, se avisa. */
  expectedSide?: IneSide;
}

/**
 * Analiza una región (marco + margen) en RGBA y decide si hay una INE bien encuadrada.
 * `frame`: posición del marco guía dentro de la región, en píxeles de la región.
 */
export const analyzeIneRegion = (
  cv: Cv,
  rgba: CvMat,
  frame: Rect,
  options: AnalyzeOptions = {}
): IneAnalysis => {
  const gray = new cv.Mat();
  try {
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const roiW: number = gray.cols;
    const roiH: number = gray.rows;
    const frameArea = frame.width * frame.height;

    // Tarjetas por debajo de ~12% del marco no son relevantes
    const candidates = findCardCandidates(cv, gray, (frameArea * 0.12) / (roiW * roiH));

    // El que mejor coincide con el marco (IoU), con proporción ID-1 y bordes rectos
    const best = selectBestCard(
      candidates.filter((c) => c.isLandscape),
      (c) => iou(c.bounds, frame)
    );

    if (!best || iou(best.bounds, frame) < PRESENCE_MIN_IOU) {
      // Sin INE válida: ¿hay algo rectangular prominente que no sea una INE horizontal?
      const prominent = [...candidates].sort(
        (a, b) => iou(b.bounds, frame) - iou(a.bounds, frame)
      )[0];
      if (prominent && iou(prominent.bounds, frame) >= 0.3) {
        const rotated = !prominent.isLandscape && aspectFit(prominent) > 0;
        return {
          status: 'bad',
          message: rotated ? INE_MESSAGES.rotated : INE_MESSAGES.notIne,
          aspectRatio: prominent.aspectRatio,
        };
      }
      return { status: 'searching', message: INE_MESSAGES.searching };
    }

    // 0) Si no parece identificación (tarjeta de colores, etc.), se ignora sin mensajes
    const paper = measurePaperRatio(cv, rgba, best.quad);
    if (paper < PAPER_MIN) {
      return { status: 'searching', message: INE_MESSAGES.searching, paper };
    }

    const card = best.bounds;
    const cardArea = card.width * card.height;
    const overlap = intersectionArea(card, frame);
    const insideRatio = cardArea > 0 ? overlap / cardArea : 0;
    const coverage = frameArea > 0 ? overlap / frameArea : 0;
    const quadInFrame: Quad = {
      tl: {
        x: (best.quad.tl.x - frame.x) / frame.width,
        y: (best.quad.tl.y - frame.y) / frame.height,
      },
      tr: {
        x: (best.quad.tr.x - frame.x) / frame.width,
        y: (best.quad.tr.y - frame.y) / frame.height,
      },
      br: {
        x: (best.quad.br.x - frame.x) / frame.width,
        y: (best.quad.br.y - frame.y) / frame.height,
      },
      bl: {
        x: (best.quad.bl.x - frame.x) / frame.width,
        y: (best.quad.bl.y - frame.y) / frame.height,
      },
    };
    const metrics = { insideRatio, coverage, aspectRatio: best.aspectRatio, quadInFrame, paper };

    // 1) Se sale del área analizada → la tarjeta real es más grande o está desplazada
    const borderX = roiW * BORDER_TOUCH_RATIO;
    const borderY = roiH * BORDER_TOUCH_RATIO;
    const touchesBorder =
      card.x <= borderX ||
      card.x + card.width >= roiW - borderX ||
      card.y <= borderY ||
      card.y + card.height >= roiH - borderY;
    const outsideMessage = cardArea > frameArea * 1.1 ? INE_MESSAGES.tooBig : INE_MESSAGES.center;
    if (touchesBorder || insideRatio < INSIDE_MIN) {
      return { status: 'bad', message: outsideMessage, ...metrics };
    }

    // 2) Que llene lo suficiente el marco
    if (coverage < COVERAGE_MIN) {
      return { status: 'bad', message: INE_MESSAGES.tooSmall, ...metrics };
    }

    // 3) Perspectiva excesiva
    const { top, bottom, left, right } = quadSides(best.quad);
    if (relativeDiff(top, bottom) > EDGE_TOLERANCE || relativeDiff(left, right) > EDGE_TOLERANCE) {
      return { status: 'bad', message: INE_MESSAGES.adjust, ...metrics };
    }

    // 4) Calidad de imagen y lado correcto
    const quality = measureCardQuality(cv, gray, best.quad);
    const withQuality = { ...metrics, ...quality };

    if (options.expectedSide === 'front' && quality.texture >= BACK_TEXTURE_MIN) {
      return { status: 'bad', message: INE_MESSAGES.showFront, ...withQuality };
    }
    if (quality.sharpness < SHARPNESS_MIN) {
      return { status: 'bad', message: INE_MESSAGES.blurry, ...withQuality };
    }
    if (quality.glare > GLARE_MAX) {
      return { status: 'bad', message: INE_MESSAGES.glare, ...withQuality };
    }

    return { status: 'good', message: INE_MESSAGES.good, ...withQuality };
  } finally {
    gray.delete();
  }
};

// ---------------------------------------------------------------------------
// Extracción para la foto final
// ---------------------------------------------------------------------------

/** Ancho de la imagen usada para buscar la tarjeta en la foto final (rápido y suficiente). */
const EXTRACT_DETECT_WIDTH = 800;

/**
 * Busca la INE en una foto (RGBA) y la devuelve enderezada a `outW × outH` en RGBA,
 * usando la resolución completa para el recorte. `null` si no hay una INE clara.
 */
export const extractIneCard = (
  cv: Cv,
  rgba: CvMat,
  outW = INE_OUTPUT_WIDTH,
  outH = INE_OUTPUT_HEIGHT
): CvMat | null => {
  const scale = Math.min(1, EXTRACT_DETECT_WIDTH / rgba.cols);
  const small = new cv.Mat();
  const gray = new cv.Mat();
  try {
    cv.resize(
      rgba,
      small,
      new cv.Size(Math.round(rgba.cols * scale), Math.round(rgba.rows * scale)),
      0,
      0,
      cv.INTER_AREA
    );
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);

    // La INE debe ocupar al menos ~20% de la foto (ya viene recortada al marco + margen)
    const best = selectBestCard(
      findCardCandidates(cv, gray, 0.2),
      (c) => c.bounds.width * c.bounds.height
    );
    if (!best) return null;

    const quad = best.isLandscape ? best.quad : rotateQuadToLandscape(best.quad);
    return warpQuad(cv, rgba, scaleQuad(quad, 1 / scale), outW, outH);
  } finally {
    small.delete();
    gray.delete();
  }
};
