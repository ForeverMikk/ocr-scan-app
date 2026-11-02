import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type Webcam from 'react-webcam';
import { analyzeIneInGuideFrame } from '../vision/ine/ineCameraAnalyzer';
import {
  INE_MESSAGES,
  type IneAnalysis,
  type IneFitStatus,
  type IneSide,
  type Quad,
} from '../vision/ine/ineCardDetector';
import { ensureOpenCvLoaded } from '../vision/loaders/opencvLoader';

export interface UseIneAutoCaptureOptions {
  enabled: boolean;
  webcamRef: RefObject<Webcam | null>;
  guideFrameRef: RefObject<HTMLElement | null>;
  onAutoCapture: () => void;
  /** Lado que se está capturando; con 'front' avisa si se muestra el reverso. */
  expectedSide?: IneSide;
  /** Muestras "buenas" y estables seguidas antes de disparar. */
  stableGoodNeeded?: number;
  /** Intervalo de muestreo en ms. */
  intervalMs?: number;
}

export interface UseIneAutoCaptureResult {
  fitStatus: IneFitStatus;
  fitMessage: string;
  isWarmingUp: boolean;
  /** Mensaje si OpenCV no pudo cargarse (el detector no funcionará). */
  loadError: string | null;
  /** Métricas de la última muestra, solo para ajustar umbrales en desarrollo. */
  fitDebug: string | null;
  /** Rearma la auto-captura tras haberse disparado (p. ej. al descartar la foto). */
  resetAutoCapture: () => void;
}

/**
 * Movimiento máximo de cualquier esquina entre dos muestras, en fracción del marco.
 * Si la tarjeta se mueve más, el conteo vuelve a empezar (la foto saldría movida).
 */
const MAX_CORNER_DRIFT = 0.03;

const maxCornerDrift = (a: Quad, b: Quad): number =>
  Math.max(
    ...(['tl', 'tr', 'br', 'bl'] as const).map((k) => Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y))
  );

const percent = (value: number) => `${Math.round(value * 100)}%`;

const formatDebug = (result: IneAnalysis): string | null => {
  if (result.insideRatio === undefined || result.coverage === undefined) return null;
  const parts = [
    `dentro ${percent(result.insideRatio)}`,
    `cubre ${percent(result.coverage)}`,
    `prop ${result.aspectRatio?.toFixed(2) ?? '–'}`,
  ];
  if (result.sharpness !== undefined) parts.push(`nitidez ${Math.round(result.sharpness)}`);
  if (result.texture !== undefined) parts.push(`textura ${result.texture.toFixed(2)}`);
  return parts.join(' · ');
};

export function useIneAutoCapture({
  enabled,
  webcamRef,
  guideFrameRef,
  onAutoCapture,
  expectedSide,
  stableGoodNeeded = 4,
  intervalMs = 250,
}: UseIneAutoCaptureOptions): UseIneAutoCaptureResult {
  const [fitStatus, setFitStatus] = useState<IneFitStatus>('searching');
  const [fitMessage, setFitMessage] = useState<string>(INE_MESSAGES.searching);
  const [isCvReady, setIsCvReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fitDebug, setFitDebug] = useState<string | null>(null);

  const busyRef = useRef(false);
  const consecutiveGoodRef = useRef(0);
  const lastQuadRef = useRef<Quad | null>(null);
  const firedRef = useRef(false);

  // Refs para no reiniciar el intervalo cuando el padre recrea el callback o cambia de lado
  const onAutoCaptureRef = useRef(onAutoCapture);
  const expectedSideRef = useRef(expectedSide);
  useEffect(() => {
    onAutoCaptureRef.current = onAutoCapture;
    expectedSideRef.current = expectedSide;
  }, [onAutoCapture, expectedSide]);

  // Precarga OpenCV una sola vez al habilitarse
  useEffect(() => {
    if (!enabled || isCvReady) return;
    let cancelled = false;
    ensureOpenCvLoaded()
      .then(() => {
        if (cancelled) return;
        setLoadError(null);
        setIsCvReady(true);
      })
      .catch((error: unknown) => {
        console.warn('[useIneAutoCapture] No se pudo cargar OpenCV:', error);
        if (!cancelled) {
          setLoadError('No se pudo iniciar el detector. Recarga la página e intenta de nuevo.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, isCvReady]);

  useEffect(() => {
    if (!enabled || !isCvReady) return;

    // Evita aplicar resultados de un análisis en curso tras desmontar/deshabilitar
    let cancelled = false;

    const tick = async () => {
      if (busyRef.current || firedRef.current || document.hidden) return;

      const video = webcamRef.current?.video ?? null;
      const guideFrame = guideFrameRef.current;
      if (!video || !guideFrame) return;

      busyRef.current = true;
      try {
        const result = await analyzeIneInGuideFrame({
          video,
          guideFrame,
          expectedSide: expectedSideRef.current,
        });
        if (cancelled || firedRef.current) return;

        setFitStatus(result.status);
        setFitMessage(result.message);
        setFitDebug(formatDebug(result));

        if (result.status !== 'good' || !result.quadInFrame) {
          consecutiveGoodRef.current = 0;
          lastQuadRef.current = null;
          return;
        }

        // Cuenta solo si la tarjeta casi no se movió desde la muestra anterior
        const previous = lastQuadRef.current;
        const isSteady = !previous || maxCornerDrift(previous, result.quadInFrame) <= MAX_CORNER_DRIFT;
        consecutiveGoodRef.current = isSteady ? consecutiveGoodRef.current + 1 : 1;
        lastQuadRef.current = result.quadInFrame;

        if (consecutiveGoodRef.current >= stableGoodNeeded) {
          // Dispara una sola vez; queda en pausa hasta resetAutoCapture o cambio de enabled
          firedRef.current = true;
          consecutiveGoodRef.current = 0;
          lastQuadRef.current = null;
          onAutoCaptureRef.current();
        }
      } finally {
        busyRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      consecutiveGoodRef.current = 0;
      lastQuadRef.current = null;
      firedRef.current = false;
      setFitStatus('searching');
      setFitMessage(INE_MESSAGES.searching);
      setFitDebug(null);
    };
  }, [enabled, isCvReady, intervalMs, stableGoodNeeded, webcamRef, guideFrameRef]);

  const resetAutoCapture = useCallback(() => {
    consecutiveGoodRef.current = 0;
    lastQuadRef.current = null;
    firedRef.current = false;
    setFitStatus('searching');
    setFitMessage(INE_MESSAGES.searching);
  }, []);

  // Deshabilitado: siempre "buscando", sin depender del último estado guardado
  if (!enabled) {
    return {
      fitStatus: 'searching',
      fitMessage: INE_MESSAGES.searching,
      isWarmingUp: false,
      loadError: null,
      fitDebug: null,
      resetAutoCapture,
    };
  }

  return {
    fitStatus,
    fitMessage,
    isWarmingUp: !isCvReady && !loadError,
    loadError,
    fitDebug,
    resetAutoCapture,
  };
}
