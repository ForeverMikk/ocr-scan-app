/**
 * Banco de pruebas del detector de INE (solo desarrollo).
 *
 * Simula la cámara de un celular en vertical: compone una INE real sobre distintos
 * fondos, la transmite como <video> (captureStream) con el mismo marco guía de la app
 * y ejecuta `analyzeIneInGuideFrame` en cada escenario.
 *
 * Uso (con `npm run dev` corriendo), en la consola del navegador:
 *   const h = await import('/dev-fixtures/detectorHarness.js');
 *   console.table(await h.runDetectorHarness());
 */

const SOURCE_W = 720;
const SOURCE_H = 1280;
/** Tamaño en pantalla del <video> simulado (misma proporción que la fuente). */
const DISPLAY_W = 360;
const DISPLAY_H = 640;
/** Igual que INE_FRAME_WIDTH en App.tsx: min(90vw, 400px). */
const FRAME_W = Math.min(DISPLAY_W * 0.9, 400);
const FRAME_H = FRAME_W / 1.586;

const FIXTURES = {
  frente: '/dev-fixtures/ine/frente.png',
  reverso: '/dev-fixtures/ine/reverso.png',
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Ruido determinista para que los fondos sean reproducibles. */
const seededRandom = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const BACKGROUNDS = {
  oscuro: (ctx) => {
    ctx.fillStyle = '#2a2b2e';
    ctx.fillRect(0, 0, SOURCE_W, SOURCE_H);
  },
  'mesa-clara': (ctx) => {
    ctx.fillStyle = '#d6d2ca';
    ctx.fillRect(0, 0, SOURCE_W, SOURCE_H);
  },
  blanco: (ctx) => {
    ctx.fillStyle = '#f1f1ef';
    ctx.fillRect(0, 0, SOURCE_W, SOURCE_H);
  },
  madera: (ctx) => {
    const rand = seededRandom(7);
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(0, 0, SOURCE_W, SOURCE_H);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(${60 + rand() * 40}, ${35 + rand() * 25}, 15, 0.35)`;
      ctx.lineWidth = 1 + rand() * 4;
      const y = rand() * SOURCE_H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(240, y + rand() * 30 - 15, 480, y + rand() * 30 - 15, SOURCE_W, y);
      ctx.stroke();
    }
  },
  /** Parecido al fondo de las capturas: tela oscura con manchas claras y hojas. */
  tela: (ctx) => {
    const rand = seededRandom(42);
    ctx.fillStyle = '#3b3d48';
    ctx.fillRect(0, 0, SOURCE_W, SOURCE_H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(220, 220, 225, ${0.25 + rand() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(rand() * SOURCE_W, rand() * SOURCE_H, 20 + rand() * 50, 20 + rand() * 50, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(70, 110, 170, ${0.3 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(rand() * SOURCE_W, rand() * SOURCE_H, 60 + rand() * 60, 12 + rand() * 12, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

/** Escenarios de colocación respecto al marco guía. */
const PLACEMENTS = {
  exacta: { scale: 1, dx: 0, dy: 0, rotation: 0, expect: 'good' },
  'algo-chica (88%)': { scale: 0.88, dx: 0, dy: 0, rotation: 0, expect: 'good' },
  'algo-grande (104%)': { scale: 1.04, dx: 0, dy: 0, rotation: 0, expect: 'good' },
  'girada 4°': { scale: 0.95, dx: 0, dy: 0, rotation: 4, expect: 'good' },
  'desplazada 5%': { scale: 0.95, dx: 0.05, dy: 0.03, rotation: 0, expect: 'good' },
  'muy chica (55%)': { scale: 0.55, dx: 0, dy: 0, rotation: 0, expect: 'bad' },
  'muy desplazada (25%)': { scale: 1, dx: 0.25, dy: 0, rotation: 0, expect: 'bad' },
};

/** Marco guía en coordenadas de la fuente (pantalla → fuente es ×2). */
const frameInSource = () => {
  const k = SOURCE_W / DISPLAY_W;
  return {
    x: ((DISPLAY_W - FRAME_W) / 2) * k,
    y: ((DISPLAY_H - FRAME_H) / 2) * k,
    width: FRAME_W * k,
    height: FRAME_H * k,
  };
};

const drawScene = (ctx, card, background, placement) => {
  BACKGROUNDS[background](ctx);

  const frame = frameInSource();
  const cardW = frame.width * placement.scale;
  const cardH = cardW * (card.height / card.width);
  const cx = frame.x + frame.width / 2 + placement.dx * frame.width;
  const cy = frame.y + frame.height / 2 + placement.dy * frame.height;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((placement.rotation * Math.PI) / 180);
  // Sombra suave como la de una tarjeta real sobre una superficie
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  // Ligero desenfoque de cámara
  ctx.filter = 'blur(0.8px)';
  ctx.drawImage(card, -cardW / 2, -cardH / 2, cardW, cardH);
  ctx.restore();
};

export async function runDetectorHarness({ samplesPerCase = 2 } = {}) {
  const detector = await import('/src/services/ineDetector.ts');
  const cards = Object.fromEntries(
    await Promise.all(Object.entries(FIXTURES).map(async ([k, src]) => [k, await loadImage(src)]))
  );

  const canvas = document.createElement('canvas');
  canvas.width = SOURCE_W;
  canvas.height = SOURCE_H;
  const ctx = canvas.getContext('2d');

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = canvas.captureStream(15);
  video.style.cssText = `position:fixed;left:0;top:0;width:${DISPLAY_W}px;height:${DISPLAY_H}px;object-fit:cover;z-index:99999`;

  const frameEl = document.createElement('div');
  frameEl.style.cssText = `position:fixed;left:${(DISPLAY_W - FRAME_W) / 2}px;top:${(DISPLAY_H - FRAME_H) / 2}px;width:${FRAME_W}px;height:${FRAME_H}px;z-index:100000;outline:2px solid red`;

  document.body.append(video, frameEl);
  await video.play();

  let scene = null;
  const redraw = window.setInterval(() => scene && drawScene(ctx, ...scene), 50);
  const results = [];

  try {
    for (const [cardName, card] of Object.entries(cards)) {
      for (const background of Object.keys(BACKGROUNDS)) {
        for (const [placementName, placement] of Object.entries(PLACEMENTS)) {
          scene = [card, background, placement];
          drawScene(ctx, ...scene);
          await new Promise((r) => setTimeout(r, 300));

          let last = null;
          let goodCount = 0;
          for (let i = 0; i < samplesPerCase; i++) {
            last = await detector.analyzeIneInGuideFrame({ video, guideFrame: frameEl });
            if (last.status === 'good') goodCount++;
            await new Promise((r) => setTimeout(r, 80));
          }
          const status = goodCount === samplesPerCase ? 'good' : last.status;
          const pct = (v) => (v === undefined ? '-' : `${Math.round(v * 100)}%`);

          results.push({
            lado: cardName,
            fondo: background,
            colocacion: placementName,
            esperado: placement.expect,
            obtenido: status,
            ok: (placement.expect === 'good') === (status === 'good') ? '✓' : '✗',
            mensaje: last.message,
            dentro: pct(last.insideRatio),
            cubre: pct(last.coverage),
            proporcion: last.aspectRatio?.toFixed(2) ?? '-',
          });
        }
      }
    }
  } finally {
    window.clearInterval(redraw);
    video.remove();
    frameEl.remove();
  }

  return results;
}
