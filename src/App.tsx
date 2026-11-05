/**
 * Flujo de captura:
 *   Permiso de cámara → Cámara → Revisión → (INE: frente → reverso) → Payload para OCR.
 *
 * App solo guarda el estado del flujo y conecta las piezas; la visión por computadora
 * vive en `vision/`, el armado del JSON en `payload/` y la UI en `components/`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type Webcam from 'react-webcam';
import { CameraView } from './components/CameraView';
import { CaptureControls } from './components/CaptureControls';
import { GuideFrame } from './components/GuideFrame';
import { IneDetectionStatus } from './components/IneDetectionStatus';
import { ModeSwitch } from './components/ModeSwitch';
import { Notice } from './components/Notice';
import { PermissionGate } from './components/PermissionGate';
import { ReviewView } from './components/ReviewView';
import { useCameraPermission } from './hooks/useCameraPermission';
import { useIneAutoCapture } from './hooks/useIneAutoCapture';
import { buildVerificationPayload } from './payload/payloadBuilder';
import { submitVerification } from './payload/submitVerification';
import { readFileAsDataUrl } from './shared/image';
import {
  DOCUMENT_CATALOG,
  documentIdForMode,
  unprocessedScan,
  type CaptureMap,
  type CaptureMode,
  type CaptureSide,
  type ScanResult,
} from './types/capture';
import type { IneFitStatus, IneSide } from './vision/ine/ineCardDetector';
import { ensureOpenCvLoaded } from './vision/loaders/opencvLoader';
import { processDocumentShot, processIneShot } from './vision/processCameraShot';

const SIDE_LABEL: Record<CaptureSide, string> = {
  front: 'Frente',
  back: 'Reverso',
  single: 'Documento',
};

/** Tiempo que se muestra el rechazo del 2º análisis antes de volver a buscar. */
const REJECTION_NOTICE_MS = 2500;

const REJECTION_MESSAGE: Record<'notIne' | 'wrongSide', (expected: IneSide) => string> = {
  notIne: () => 'No reconocimos una INE. Vuelve a intentarlo.',
  wrongSide: (expected) =>
    expected === 'front'
      ? 'Esa es la parte de atrás. Muestra el FRENTE de tu INE.'
      : 'Ese es el frente. Muestra el REVERSO de tu INE.',
};

export function App() {
  const permission = useCameraPermission();

  // Modo de captura (sustituye query params por ahora; ids 1/2/3 listos en DOCUMENT_CATALOG)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('ine');
  const isIne = captureMode === 'ine';

  // Casilla "Detección automática": solo aplica a INE; Comprobante/Factura siempre son manuales
  const [ineAutoDetect, setIneAutoDetect] = useState(false);
  const isIneAutoCapture = isIne && ineAutoDetect;

  // Aplanado tipo Office Lens: solo en modo Documento
  const [flattenDocument, setFlattenDocument] = useState(true);

  const [currentSide, setCurrentSide] = useState<CaptureSide>('front');
  const [captures, setCaptures] = useState<CaptureMap>({});
  const [isReviewing, setIsReviewing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  /** Nombre del PDF adjunto (si aplica) para la vista de revisión. */
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  /** Mensaje cuando el 2º análisis rechaza la captura (no es INE o es el otro lado). */
  const [ineRejection, setIneRejection] = useState<string | null>(null);

  const expectedIneSide: IneSide = currentSide === 'back' ? 'back' : 'front';

  const webcamRef = useRef<Webcam>(null);
  const guideFrameRef = useRef<HTMLDivElement>(null);

  // Precarga OpenCV: la INE siempre se endereza con él; el documento solo si se aplana
  useEffect(() => {
    if (!permission.granted) return;
    if (isIne || flattenDocument) {
      ensureOpenCvLoaded().catch((error: unknown) => console.warn('[App] OpenCV no cargó:', error));
    }
  }, [permission.granted, isIne, flattenDocument]);

  // El rechazo se muestra unos segundos; al quitarse, la detección automática se reanuda
  useEffect(() => {
    if (!ineRejection) return;
    const timer = window.setTimeout(() => setIneRejection(null), REJECTION_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [ineRejection]);

  // Al cambiar INE ↔ Documento, reinicia el flujo de captura
  const handleModeChange = (mode: CaptureMode) => {
    setCaptureMode(mode);
    setCaptures({});
    setIsReviewing(false);
    setIsProcessing(false);
    setAttachedFileName(null);
    setIneRejection(null);
    setCurrentSide(mode === 'ine' ? 'front' : 'single');
    setFlattenDocument(true);
  };

  // ---- Captura: foto → recorte al marco → INE enderezada y verificada / documento aplanado ----
  const handleCapturePhoto = useCallback(async () => {
    const webcam = webcamRef.current;
    const video = webcam?.video;
    const guideFrame = guideFrameRef.current;
    if (!webcam || !video || !guideFrame || isProcessing) return;

    const screenshot = webcam.getScreenshot();
    if (!screenshot) return;

    setIsProcessing(true);
    setAttachedFileName(null);
    setIneRejection(null);
    try {
      const shot = { screenshot, video, guideFrame };
      let result: ScanResult;
      if (isIne) {
        // 2º análisis: si no es INE (o es el otro lado) se avisa y se vuelve a la cámara
        const outcome = await processIneShot(shot, expectedIneSide);
        if (!outcome.ok) {
          setIneRejection(REJECTION_MESSAGE[outcome.reason](expectedIneSide));
          return;
        }
        result = outcome.scan;
      } else {
        result = await processDocumentShot(shot, flattenDocument);
      }

      // Se conserva el otro lado: al tomar el reverso el frente no se borra
      setCaptures((prev) => ({ ...prev, [currentSide]: result }));
      setIsReviewing(true);
    } finally {
      setIsProcessing(false);
    }
  }, [currentSide, expectedIneSide, isIne, isProcessing, flattenDocument]);

  // Auto-captura INE cuando el marco está en verde y la tarjeta quieta (si la casilla está marcada).
  // Se pausa mientras se muestra un rechazo para no disparar en bucle sobre la misma tarjeta.
  const ineDetection = useIneAutoCapture({
    enabled:
      permission.granted && isIneAutoCapture && !isReviewing && !isProcessing && !ineRejection,
    webcamRef,
    guideFrameRef,
    onAutoCapture: handleCapturePhoto,
    expectedSide: expectedIneSide,
    stableGoodNeeded: 3,
    intervalMs: 250,
  });

  // Tras "Repetir toma", rearmar el detector
  const handleRetake = () => {
    setIsReviewing(false);
    setAttachedFileName(null);
    ineDetection.resetAutoCapture();
  };

  // ---- Adjuntar imagen o PDF (solo Documento) ----
  const handleFileSelected = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    setAttachedFileName(file.type === 'application/pdf' ? file.name : null);
    setCaptures({ single: unprocessedScan(dataUrl) });
    setCurrentSide('single');
    setIsReviewing(true);
  };

  // ---- Confirmar paso: INE frente → reverso; si no, armar y enviar el payload ----
  const handleConfirmStep = async () => {
    if (isIne && currentSide === 'front') {
      setIsReviewing(false);
      setCurrentSide('back');
      ineDetection.resetAutoCapture();
      return;
    }

    if (isIne && (!captures.front || !captures.back)) {
      alert('Falta capturar el frente o el reverso de la INE.');
      return;
    }

    // ids listos para ?id=1|2|3; por ahora el tipo viene del switch
    const catalogEntry = DOCUMENT_CATALOG[documentIdForMode(captureMode)];
    try {
      const payload = await buildVerificationPayload({
        documento: catalogEntry.label,
        geo: permission.geoData, // null mientras la geolocalización siga comentada → gpsData: null
        capturas: captures,
      });
      await submitVerification(payload);
      alert('Flujo completado. Revisa la consola para ver el resumen del payload.');
    } catch (error) {
      console.error('[App] No se pudo armar o enviar el payload:', error);
      alert('No se pudo enviar al OCR. Revisa la consola.');
    }
  };

  // ========== Vista 1: Permisos ==========
  if (!permission.granted) {
    return (
      <PermissionGate
        error={permission.error}
        isRequesting={permission.isRequesting}
        onRequest={permission.request}
      />
    );
  }

  const modeSwitch = <ModeSwitch mode={captureMode} onChange={handleModeChange} />;

  // ========== Vista 2: Revisión ==========
  const activeCapture = captures[currentSide];
  if (isReviewing && activeCapture) {
    return (
      <div
        style={{
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#121316',
        }}
      >
        {modeSwitch}
        <ReviewView
          title={SIDE_LABEL[currentSide]}
          capture={activeCapture}
          attachedFileName={attachedFileName}
          confirmLabel={
            isIne && currentSide === 'front' ? 'Continuar al Reverso' : 'Confirmar y Enviar'
          }
          onRetake={handleRetake}
          onConfirm={handleConfirmStep}
        />
      </div>
    );
  }

  // ========== Vista 3: Cámara ==========
  const frameTitle = isIne
    ? `Encuadra tu INE (${currentSide === 'front' ? 'FRENTE' : 'REVERSO'}) en el recuadro`
    : 'Encuadra tu documento';

  // Marco: rojo si el 2º análisis rechazó, verde mientras verifica, si no lo que diga el detector
  const frameStatus: IneFitStatus | undefined = !isIne
    ? undefined
    : ineRejection
      ? 'bad'
      : isProcessing
        ? 'good'
        : isIneAutoCapture
          ? ineDetection.fitStatus
          : undefined;

  return (
    <CameraView webcamRef={webcamRef}>
      {modeSwitch}

      <GuideFrame
        kind={isIne ? 'ine' : 'document'}
        title={frameTitle}
        detectionStatus={frameStatus}
        frameRef={guideFrameRef}
      >
        {ineRejection ? (
          <Notice tone="error" text={ineRejection} />
        ) : isProcessing ? (
          <Notice
            tone="info"
            text={isIne ? 'Verificando INE…' : flattenDocument ? 'Aplanando documento…' : 'Procesando…'}
          />
        ) : (
          isIneAutoCapture && (
            <IneDetectionStatus
              status={ineDetection.fitStatus}
              message={ineDetection.fitMessage}
              debug={ineDetection.fitDebug}
              isWarmingUp={ineDetection.isWarmingUp}
              loadError={ineDetection.loadError}
            />
          )
        )}
      </GuideFrame>

      <CaptureControls
        isIne={isIne}
        autoDetect={ineAutoDetect}
        onAutoDetectChange={setIneAutoDetect}
        flatten={flattenDocument}
        onFlattenChange={setFlattenDocument}
        // En automático dispara el detector; el obturador queda bloqueado
        shutterDisabled={isProcessing || isIneAutoCapture}
        onShutter={handleCapturePhoto}
        onFileSelected={handleFileSelected}
      />
    </CameraView>
  );
}

export default App;
