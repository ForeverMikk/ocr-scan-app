/**
 * Calibración del detector de INE con imágenes reales (sin webcam ni navegador).
 *
 *   node scripts/test-ine-detector.ts
 *
 * Arma escenas con las fotos de `dev-fixtures/ine` (fondo oscuro/claro, perspectiva,
 * desenfoque, mal encuadre…), las pasa por `analyzeIneRegion` simulando el marco guía y
 * compara con el resultado esperado. Las tarjetas enderezadas se guardan en
 * `dev-fixtures/out/` para revisarlas a ojo.
 */

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import {
  analyzeIneRegion,
  extractIneCard,
  findCardCandidates,
  INE_ANALYSIS_WIDTH as ANALYSIS_WIDTH,
  INE_ASPECT,
  INE_DETECTION_PAD_RATIO as PAD_RATIO,
  INE_MESSAGES,
  selectBestCard,
  type Cv,
  type CvMat,
  type IneSide,
} from '../src/vision/ine/ineCardDetector.ts';
import type { Rect } from '../src/types/geometry.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'dev-fixtures', 'ine');
const outDir = join(root, 'dev-fixtures', 'out');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// OpenCV en Node: el objeto `cv` tiene su propio `then`, nunca se resuelve en una Promise
// ---------------------------------------------------------------------------

const loadOpenCv = async (): Promise<{ cv: Cv }> => {
  const require = createRequire(import.meta.url);
  const cv = require('@techstark/opencv-js');
  const started = Date.now();
  while (!cv.Mat) {
    if (Date.now() - started > 30_000) throw new Error('OpenCV no inicializó');
    await new Promise((r) => setTimeout(r, 50));
  }
  // Envuelto en objeto: devolver `cv` directo haría que la Promise espere su `then` para siempre
  return { cv };
};

// ---------------------------------------------------------------------------
// E/S de imágenes
// ---------------------------------------------------------------------------

const readImage = (cv: Cv, file: string): CvMat => {
  const buffer = readFileSync(file);
  const { width, height, data } = file.endsWith('.png')
    ? PNG.sync.read(buffer)
    : jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
  const mat = new cv.Mat(height, width, cv.CV_8UC4);
  mat.data.set(data);
  return mat;
};

const writePng = (mat: CvMat, name: string): void => {
  const png = new PNG({ width: mat.cols, height: mat.rows });
  png.data = Buffer.from(mat.data);
  writeFileSync(join(outDir, name), PNG.sync.write(png));
};

// ---------------------------------------------------------------------------
// Escenas
// ---------------------------------------------------------------------------

/** Pega la tarjeta (con perspectiva opcional) sobre un fondo liso. */
const composeScene = (
  cv: Cv,
  card: CvMat,
  opts: { bg: number; sceneW?: number; cardW: number; offsetX?: number; tilt?: number; blur?: number }
): { scene: CvMat; cardRect: Rect } => {
  const sceneW = opts.sceneW ?? 1000;
  const sceneH = Math.round(sceneW * 0.75);
  const cardW = opts.cardW;
  const cardH = Math.round(cardW / INE_ASPECT);
  const x = Math.round((sceneW - cardW) / 2 + (opts.offsetX ?? 0));
  const y = Math.round((sceneH - cardH) / 2);
  const tilt = opts.tilt ?? 0; // fracción del ancho que se "encoge" el borde superior

  const scene = new cv.Mat(sceneH, sceneW, cv.CV_8UC4, new cv.Scalar(opts.bg, opts.bg, opts.bg, 255));
  const shrink = cardW * tilt;
  const src = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, card.cols, 0, card.cols, card.rows, 0, card.rows]);
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [
    x + shrink, y, x + cardW - shrink, y, x + cardW, y + cardH, x, y + cardH,
  ]);
  const transform = cv.getPerspectiveTransform(src, dst);
  cv.warpPerspective(card, scene, transform, new cv.Size(sceneW, sceneH), cv.INTER_LINEAR, cv.BORDER_TRANSPARENT, new cv.Scalar());
  src.delete();
  dst.delete();
  transform.delete();

  if (opts.blur) cv.GaussianBlur(scene, scene, new cv.Size(opts.blur, opts.blur), 0);
  return { scene, cardRect: { x, y, width: cardW, height: cardH } };
};

/**
 * Simula el marco guía: centrado en `center`, con `frameW` de ancho y proporción ID-1.
 * Recorta la región marco + 15% como hace la app y devuelve el marco relativo a ella.
 */
const cropLikeApp = (cv: Cv, scene: CvMat, centerX: number, centerY: number, frameW: number) => {
  const frameH = frameW / INE_ASPECT;
  const frame = { x: centerX - frameW / 2, y: centerY - frameH / 2, width: frameW, height: frameH };
  const padX = frameW * PAD_RATIO;
  const padY = frameH * PAD_RATIO;
  const x0 = Math.max(0, Math.round(frame.x - padX));
  const y0 = Math.max(0, Math.round(frame.y - padY));
  const x1 = Math.min(scene.cols, Math.round(frame.x + frame.width + padX));
  const y1 = Math.min(scene.rows, Math.round(frame.y + frame.height + padY));
  // Igual que la app: la región se reduce a ANALYSIS_WIDTH antes de analizarla
  const crop = scene.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
  const k = Math.min(1, ANALYSIS_WIDTH / crop.cols);
  const region = new cv.Mat();
  cv.resize(crop, region, new cv.Size(Math.round(crop.cols * k), Math.round(crop.rows * k)), 0, 0, cv.INTER_AREA);
  crop.delete();
  return {
    region,
    frame: { x: (frame.x - x0) * k, y: (frame.y - y0) * k, width: frame.width * k, height: frame.height * k },
  };
};

/** Encuentra la tarjeta en una foto real para colocar el marco a su alrededor. */
const locateCard = (cv: Cv, rgba: CvMat): Rect | null => {
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  const best = selectBestCard(
    findCardCandidates(cv, gray, 0.1).filter((c) => c.isLandscape),
    (c) => c.bounds.width * c.bounds.height
  );
  gray.delete();
  return best?.bounds ?? null;
};

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

interface Case {
  name: string;
  run: () => { scene: CvMat; centerX: number; centerY: number; frameW: number; side?: IneSide };
  expect: string;
}

const main = async () => {
  const t0 = Date.now();
  const { cv } = await loadOpenCv();
  console.log(`OpenCV listo en ${Date.now() - t0} ms\n`);

  const front = readImage(cv, join(fixtures, 'frente.png'));
  const back = readImage(cv, join(fixtures, 'reverso.png'));

  // Fotos reales: la INE viene girada 90° (vertical) sobre teclado/tela
  const realFrontPortrait = readImage(cv, join(fixtures, 'real', 'frente-real.jpg'));
  const realBackPortrait = readImage(cv, join(fixtures, 'real', 'reverso-real.jpg'));
  const rotate = (m: CvMat) => {
    const out = new cv.Mat();
    cv.rotate(m, out, cv.ROTATE_90_COUNTERCLOCKWISE);
    return out;
  };
  const realFront = rotate(realFrontPortrait);
  const realBack = rotate(realBackPortrait);
  realFrontPortrait.delete();
  realBackPortrait.delete();

  // Tarjeta real ya recortada, para pegarla en otros fondos
  const realFrontCard = extractIneCard(cv, realFront, 793, 500);
  if (!realFrontCard) throw new Error('No se pudo extraer la INE real');

  /** Escena sintética con el marco ajustado para que la tarjeta lo llene al ~92%. */
  const synthetic = (card: CvMat, opts: Parameters<typeof composeScene>[2], frameScale = 1 / 0.92, side?: IneSide) => () => {
    const { scene, cardRect } = composeScene(cv, card, opts);
    return {
      scene,
      centerX: scene.cols / 2,
      centerY: scene.rows / 2,
      frameW: cardRect.width * frameScale,
      side,
    };
  };

  /** Foto real con el marco colocado alrededor de la tarjeta detectada. */
  const realPhoto = (photo: CvMat, side?: IneSide, frameScale = 1 / 0.92) => () => {
    const card = locateCard(cv, photo);
    if (!card) throw new Error('No se localizó la tarjeta en la foto real');
    return {
      scene: photo.clone(),
      centerX: card.x + card.width / 2,
      centerY: card.y + card.height / 2,
      frameW: card.width * frameScale,
      side,
    };
  };

  const cases: Case[] = [
    { name: 'frente · fondo oscuro', run: synthetic(front, { bg: 35, cardW: 600 }, undefined, 'front'), expect: INE_MESSAGES.good },
    { name: 'frente · fondo claro', run: synthetic(front, { bg: 225, cardW: 600 }, undefined, 'front'), expect: INE_MESSAGES.good },
    { name: 'frente · perspectiva leve', run: synthetic(front, { bg: 60, cardW: 600, tilt: 0.05 }, undefined, 'front'), expect: INE_MESSAGES.good },
    { name: 'reverso · fondo oscuro', run: synthetic(back, { bg: 35, cardW: 600 }, undefined, 'back'), expect: INE_MESSAGES.good },
    { name: 'reverso cuando se pide frente', run: synthetic(back, { bg: 35, cardW: 600 }, undefined, 'front'), expect: INE_MESSAGES.showFront },
    { name: 'frente · desenfoque leve', run: synthetic(front, { bg: 35, cardW: 600, blur: 5 }, undefined, 'front'), expect: INE_MESSAGES.good },
    { name: 'REAL frente · desenfoque leve', run: synthetic(realFrontCard, { bg: 60, cardW: 600, blur: 5 }, undefined, 'front'), expect: INE_MESSAGES.good },
    { name: 'frente · desenfocado', run: synthetic(front, { bg: 35, cardW: 600, blur: 15 }, undefined, 'front'), expect: INE_MESSAGES.blurry },
    { name: 'REAL frente · desenfocado', run: synthetic(realFrontCard, { bg: 60, cardW: 600, blur: 15 }, undefined, 'front'), expect: INE_MESSAGES.blurry },
    { name: 'frente · muy pequeña', run: synthetic(front, { bg: 35, cardW: 350 }, 600 / 350 / 0.92, 'front'), expect: INE_MESSAGES.tooSmall },
    { name: 'frente · desplazada', run: synthetic(front, { bg: 35, cardW: 600, offsetX: 140 }, undefined, 'front'), expect: INE_MESSAGES.center },
    {
      name: 'sin tarjeta (fondo vacío)',
      run: () => {
        const scene = new cv.Mat(750, 1000, cv.CV_8UC4, new cv.Scalar(40, 40, 40, 255));
        return { scene, centerX: 500, centerY: 375, frameW: 650 };
      },
      expect: INE_MESSAGES.searching,
    },
    { name: 'REAL frente', run: realPhoto(realFront, 'front'), expect: INE_MESSAGES.good },
    { name: 'REAL reverso', run: realPhoto(realBack, 'back'), expect: INE_MESSAGES.good },
    { name: 'REAL reverso cuando se pide frente', run: realPhoto(realBack, 'front'), expect: INE_MESSAGES.showFront },
    { name: 'REAL frente · fondo claro', run: synthetic(realFrontCard, { bg: 215, cardW: 600 }, undefined, 'front'), expect: INE_MESSAGES.good },
    { name: 'REAL frente · perspectiva', run: synthetic(realFrontCard, { bg: 90, cardW: 600, tilt: 0.06 }, undefined, 'front'), expect: INE_MESSAGES.good },
    {
      // La INE sostenida en vertical dentro de un marco horizontal
      name: 'frente vertical (girada)',
      run: () => {
        const { scene: landscape } = composeScene(cv, front, { bg: 35, cardW: 450 });
        const scene = new cv.Mat();
        cv.rotate(landscape, scene, cv.ROTATE_90_CLOCKWISE);
        landscape.delete();
        return { scene, centerX: scene.cols / 2, centerY: scene.rows / 2, frameW: scene.cols * 0.9, side: 'front' as IneSide };
      },
      expect: INE_MESSAGES.rotated,
    },
  ];

  let passed = 0;
  for (const testCase of cases) {
    const { scene, centerX, centerY, frameW, side } = testCase.run();
    const { region, frame } = cropLikeApp(cv, scene, centerX, centerY, frameW);
    const started = performance.now();
    const result = analyzeIneRegion(cv, region, frame, { expectedSide: side });
    const ms = performance.now() - started;
    const ok = result.message === testCase.expect;
    if (ok) passed++;

    const fmt = (n?: number, d = 2) => (n === undefined ? '—' : n.toFixed(d));
    console.log(
      `${ok ? '✔' : '✘'} ${testCase.name.padEnd(36)} ${result.message}` +
        (ok ? '' : `   (esperado: ${testCase.expect})`)
    );
    console.log(
      `    dentro ${fmt(result.insideRatio)} · cubre ${fmt(result.coverage)} · prop ${fmt(result.aspectRatio)}` +
        ` · nitidez ${fmt(result.sharpness, 0)} · reflejo ${fmt(result.glare, 3)} · textura ${fmt(result.texture, 3)}` +
        ` · ${ms.toFixed(0)} ms`
    );

    const slug = testCase.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const extracted = extractIneCard(cv, region, 793, 500);
    if (extracted) {
      writePng(extracted, `${slug}.png`);
      extracted.delete();
    }
    region.delete();
    scene.delete();
  }

  console.log(`\n${passed}/${cases.length} casos correctos`);
  process.exitCode = passed === cases.length ? 0 : 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
