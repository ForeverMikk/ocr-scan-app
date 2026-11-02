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
} from './types/capture';
import { ensureOpenCvLoaded } from './vision/loaders/opencvLoader';
import { processDocumentShot, processIneShot } from './vision/processCameraShot';

const SIDE_LABEL: Record<CaptureSide, string> = {
  front: 'Frente',
  back: 'Reverso',
  single: 'Documento',
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

  const webcamRef = useRef<Webcam>(null);
  const guideFrameRef = useRef<HTMLDivElement>(null);

  // Precarga OpenCV: la INE siempre se endereza con él; el documento solo si se aplana
  useEffect(() => {
    if (!permission.granted) return;
    if (isIne || flattenDocument) {
      ensureOpenCvLoaded().catch((error: unknown) => console.warn('[App] OpenCV no cargó:', error));
    }
  }, [permission.granted, isIne, flattenDocument]);

  // Al cambiar INE ↔ Documento, reinicia el flujo de captura
  const handleModeChange = (mode: CaptureMode) => {
    setCaptureMode(mode);
    setCaptures({});
    setIsReviewing(false);
    setIsProcessing(false);
    setAttachedFileName(null);
    setCurrentSide(mode === 'ine' ? 'front' : 'single');
    setFlattenDocument(true);
  };

  // ---- Captura: foto → recorte al marco → INE enderezada / documento aplanado ----
  const handleCapturePhoto = useCallback(async () => {
    const webcam = webcamRef.current;
    const video = webcam?.video;
    const guideFrame = guideFrameRef.current;
    if (!webcam || !video || !guideFrame || isProcessing) return;

    const screenshot = webcam.getScreenshot();
    if (!screenshot) return;

    setIsProcessing(true);
    setAttachedFileName(null);
    try {
      const shot = { screenshot, video, guideFrame };
      const result = isIne
        ? await processIneShot(shot)
        : await processDocumentShot(shot, flattenDocument);

      setCaptures((prev) => ({ ...prev, [currentSide]: result }));
      setIsReviewing(true);
    } finally {
      setIsProcessing(false);
    }
  }, [currentSide, isIne, isProcessing, flattenDocument]);

  // Auto-captura INE cuando el marco está en verde y la tarjeta quieta (si la casilla está marcada)
  const ineDetection = useIneAutoCapture({
    enabled: permission.granted && isIneAutoCapture && !isReviewing && !isProcessing,
    webcamRef,
    guideFrameRef,
    onAutoCapture: handleCapturePhoto,
    expectedSide: currentSide === 'back' ? 'back' : 'front',
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

    // ids listos para ?id=1|2|3; por ahora el tipo viene del switch
    const catalogEntry = DOCUMENT_CATALOG[documentIdForMode(captureMode)];
    const payload = await buildVerificationPayload({
      documento: catalogEntry.label,
      geo: permission.geoData, // null mientras la geolocalización siga comentada → gpsData: null
      capturas: captures,
    });

    await submitVerification(payload);
    alert('Flujo completado (Simulación Mock). Revisa la consola para ver el JSON generado.');
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
      <div style={{ position: 'relative' }}>
        {modeSwitch}
        <ReviewView
          title={SIDE_LABEL[currentSide]}
          capture={activeCapture}
          attachedFileName={attachedFileName}
          confirmLabel={isIne && currentSide === 'front' ? 'Continuar al Reverso' : 'Confirmar y Enviar'}
          onRetake={handleRetake}
          onConfirm={handleConfirmStep}
        />
      </div>
    );
  }

  // ========== Vista 3: Cámara ==========
  const frameTitle = isIne
    ? `Rellena el marco con tu INE (${currentSide === 'front' ? 'FRENTE' : 'REVERSO'})`
    : 'Encuadra tu documento';

  return (
    <CameraView webcamRef={webcamRef}>
      {modeSwitch}

      <GuideFrame
        kind={isIne ? 'ine' : 'document'}
        title={frameTitle}
        detectionStatus={isIneAutoCapture ? ineDetection.fitStatus : undefined}
        frameRef={guideFrameRef}
      >
        {isIneAutoCapture && (
          <IneDetectionStatus
            status={ineDetection.fitStatus}
            message={ineDetection.fitMessage}
            debug={ineDetection.fitDebug}
            isProcessing={isProcessing}
            isWarmingUp={ineDetection.isWarmingUp}
            loadError={ineDetection.loadError}
          />
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
