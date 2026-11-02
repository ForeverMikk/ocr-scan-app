import React, { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import {
  processCapturedImage,
  ScanResult,
  DOCUMENT_PAPER_SIZE,
} from './services/scannerService';
import { cropDataUrlToGuideFrame } from './utils/cropToGuideFrame';
import { buildVerificationPayload } from './services/payloadBuilder';
import { ensureOpenCvLoaded } from './services/opencvLoader';
import { useIneAutoCapture } from './hooks/useIneAutoCapture';
import {
  extractIneFromDataUrl,
  INE_DETECTION_PAD_RATIO,
  type IneFitStatus,
} from './services/ineDetector';
import {
  CaptureMode,
  CaptureSide,
  DOCUMENT_CATALOG,
  documentIdForMode,
  GeoLocationData,
} from './types/capture';

const isSecureContext = (): boolean =>
  typeof window !== 'undefined' && window.isSecureContext;

// --- Geolocalización (comentada: en PC suele dar TIMEOUT; en teléfono sí funciona) ---
// const getCurrentPosition = (
//   options: PositionOptions
// ): Promise<GeolocationPosition> =>
//   new Promise((resolve, reject) => {
//     if (!navigator.geolocation) {
//       reject(new Error('Geolocation API no disponible en este navegador'));
//       return;
//     }
//     navigator.geolocation.getCurrentPosition(resolve, reject, options);
//   });
//
// const requestLocationWithFallback = async (): Promise<GeolocationPosition> => {
//   try {
//     return await getCurrentPosition({
//       enableHighAccuracy: true,
//       timeout: 8000,
//       maximumAge: 60_000,
//     });
//   } catch (firstErr) {
//     const code = (firstErr as GeolocationPositionError)?.code;
//     if (code === 3 || code === 2) {
//       return getCurrentPosition({
//         enableHighAccuracy: false,
//         timeout: 20000,
//         maximumAge: 5 * 60_000,
//       });
//     }
//     throw firstErr;
//   }
// };

const describePermissionError = (err: unknown): string => {
  if (!isSecureContext()) {
    return (
      'Este navegador solo permite Cámara en HTTPS o localhost. ' +
      'En el teléfono abre la app por HTTPS, no por http://IP. En PC usa http://localhost:3015'
    );
  }

  if (err instanceof DOMException || (err as Error)?.name === 'NotAllowedError') {
    return 'Bloqueaste el permiso de Cámara. Actívalo en el candado/permisos del sitio y vuelve a intentar.';
  }

  return 'Para continuar es obligatorio permitir el acceso a tu Cámara en el navegador.';
};

/** Ancho del marco INE: 90% de la pantalla, máximo 400px. */
const INE_FRAME_WIDTH = 'min(90vw, 400px)';
/**
 * El marco de documento es vertical (1:1.3); se limita también por altura para que
 * quede espacio arriba (título) y abajo (barra de controles) en pantallas bajas.
 */
const DOCUMENT_FRAME_WIDTH = 'min(90vw, 400px, calc((100dvh - 340px) / 1.3))';

const frameBorderColor = (status: IneFitStatus, showDetection: boolean): string => {
  if (!showDetection) return '#ffffff';
  if (status === 'good') return '#22c55e';
  if (status === 'bad') return '#ef4444';
  return '#ffffff';
};

export function App() {
  // Modo de captura (sustituye query params por ahora; ids 1/2/3 listos en DOCUMENT_CATALOG)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('ine');
  const isIne = captureMode === 'ine';

  // Casilla "Detección automática": solo aplica a INE; Comprobante/Factura siempre son manuales
  const [ineAutoDetect, setIneAutoDetect] = useState(false);
  const isIneAutoCapture = isIne && ineAutoDetect;

  // Permisos (solo cámara; geo comentada)
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [geoData] = useState<GeoLocationData | null>(null);

  const [currentSide, setCurrentSide] = useState<CaptureSide>('front');
  const [captures, setCaptures] = useState<Partial<Record<CaptureSide, ScanResult>>>({});
  const [isReviewing, setIsReviewing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  /** Nombre del PDF adjunto (si aplica) para la vista de revisión. */
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  // Aplanado tipo Office Lens: solo en modo Documento
  const [useJscanifyLens, setUseJscanifyLens] = useState(true);

  const webcamRef = useRef<Webcam>(null);
  const guideFrameRef = useRef<HTMLDivElement>(null);

  // ---- Permisos: solo cámara ----
  const requestMandatoryPermissions = async () => {
    setPermissionError(null);
    setIsRequestingPermissions(true);

    try {
      if (!isSecureContext()) {
        throw new Error('INSECURE_CONTEXT');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      stream.getTracks().forEach((track) => track.stop());

      // --- Geolocalización desactivada en PC (timeout); reactivar para producción móvil ---
      // const pos = await requestLocationWithFallback();
      // setGeoData({
      //   latitude: pos.coords.latitude,
      //   longitude: pos.coords.longitude,
      //   accuracyMeters: pos.coords.accuracy,
      //   timestamp: new Date(pos.timestamp).toISOString(),
      // });

      setPermissionsGranted(true);
    } catch (err) {
      setPermissionError(describePermissionError(err));
      console.error(err);
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  // Precarga OpenCV: la INE siempre se endereza con él; el documento solo si se aplana
  useEffect(() => {
    if (!permissionsGranted) return;
    if (isIne || useJscanifyLens) {
      ensureOpenCvLoaded().catch((error: unknown) => console.warn('[App] OpenCV no cargó:', error));
    }
  }, [permissionsGranted, isIne, useJscanifyLens]);

  // Al cambiar INE ↔ Documento, reinicia el flujo de captura
  const handleModeChange = (mode: CaptureMode) => {
    setCaptureMode(mode);
    setCaptures({});
    setIsReviewing(false);
    setIsProcessing(false);
    setAttachedFileName(null);
    setCurrentSide(mode === 'ine' ? 'front' : 'single');
    setUseJscanifyLens(mode === 'documento');
  };

  // ---- Captura (recorte al marco + opcional extractPaper) ----
  const handleCapturePhoto = useCallback(async () => {
    if (!webcamRef.current || isProcessing) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setIsProcessing(true);
    setAttachedFileName(null);
    try {
      const videoEl = webcamRef.current.video;
      const frameEl = guideFrameRef.current;

      let frameCrop = imageSrc;
      if (videoEl && frameEl) {
        frameCrop = await cropDataUrlToGuideFrame(imageSrc, videoEl, frameEl);
      }

      let result: ScanResult;
      if (isIne && videoEl && frameEl) {
        // INE (manual o automática): recorta marco + margen para que el detector vea los
        // 4 bordes y devuelva solo la tarjeta enderezada. Si no la encuentra, usa el marco.
        const paddedCrop = await cropDataUrlToGuideFrame(
          imageSrc,
          videoEl,
          frameEl,
          INE_DETECTION_PAD_RATIO
        );
        const card = await extractIneFromDataUrl(paddedCrop);
        result = card
          ? { originalDataUrl: paddedCrop, processedDataUrl: card, wasPerspectiveCorrected: true }
          : { originalDataUrl: frameCrop, processedDataUrl: frameCrop, wasPerspectiveCorrected: false };
      } else {
        // Documento: aplanado opcional (Office Lens)
        result = await processCapturedImage(frameCrop, useJscanifyLens, DOCUMENT_PAPER_SIZE);
      }

      setCaptures((prev) => ({ ...prev, [currentSide]: result }));
      setIsReviewing(true);
    } finally {
      setIsProcessing(false);
    }
  }, [currentSide, isIne, isProcessing, useJscanifyLens]);

  // Auto-captura INE cuando el marco está en verde y la tarjeta quieta (si la casilla está marcada)
  const { fitStatus, fitMessage, isWarmingUp, loadError, fitDebug, resetAutoCapture } = useIneAutoCapture({
    enabled: permissionsGranted && isIneAutoCapture && !isReviewing && !isProcessing,
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
    resetAutoCapture();
  };

  // ---- Adjuntar imagen o PDF (solo Documento) ----
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Formato no soportado. Sube JPG, PNG, WEBP o PDF.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachedFileName(file.type === 'application/pdf' ? file.name : null);
      setCaptures({
        single: {
          originalDataUrl: dataUrl,
          processedDataUrl: dataUrl,
          wasPerspectiveCorrected: false,
        },
      });
      setCurrentSide('single');
      setIsReviewing(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ---- Confirmar paso / armar payload ----
  const handleConfirmStep = async () => {
    if (isIne && currentSide === 'front') {
      setIsReviewing(false);
      setCurrentSide('back');
      resetAutoCapture();
      return;
    }

    // ids listos para ?id=1|2|3; por ahora el tipo viene del switch
    const catalogEntry = DOCUMENT_CATALOG[documentIdForMode(captureMode)];

    const finalPayload = await buildVerificationPayload({
      documento: catalogEntry.label,
      geo: geoData, // null mientras la geolocalización siga comentada → gpsData: null
      capturas: captures,
    });

    console.log('PAYLOAD LISTO PARA API OCR:', finalPayload);
    alert('Flujo completado (Simulación Mock). Revisa la consola para ver el JSON generado.');
  };

  // ========== Vista 1: Permisos ==========
  if (!permissionsGranted) {
    const insecure = !isSecureContext();
    return (
      <div style={styles.gateRoot}>
        <h2 style={{ color: '#fff' }}>Verificación de Documentos</h2>
        <p style={styles.gateText}>Necesitamos acceso a tu cámara antes de comenzar.</p>
        {insecure && (
          <p style={styles.warnText}>
            Estás en un contexto no seguro ({window.location.origin}). La cámara no mostrará el popup.
            En PC usa <strong>localhost</strong>; en teléfono necesitas HTTPS.
          </p>
        )}
        {permissionError && <p style={styles.errorText}>{permissionError}</p>}
        <button
          onClick={requestMandatoryPermissions}
          disabled={isRequestingPermissions}
          style={{
            ...styles.primaryBtn,
            cursor: isRequestingPermissions ? 'wait' : 'pointer',
            opacity: isRequestingPermissions ? 0.7 : 1,
          }}
        >
          {isRequestingPermissions ? 'Solicitando permiso…' : 'Permitir Cámara'}
        </button>
      </div>
    );
  }

  // ========== Vista 2: Revisión ==========
  if (isReviewing && captures[currentSide]) {
    const activeCapture = captures[currentSide]!;
    const isPdf = Boolean(attachedFileName) || activeCapture.processedDataUrl.startsWith('data:application/pdf');

    return (
      <div style={styles.reviewRoot}>
        <ModeSwitch mode={captureMode} onChange={handleModeChange} />
        <h3>
          Revisa tu captura (
          {isIne
            ? currentSide === 'front'
              ? 'Frente'
              : 'Reverso'
            : 'Documento'}
          )
        </h3>
        {isPdf ? (
          <div style={styles.pdfPreview}>
            <p style={{ margin: 0, fontSize: 15 }}>📄 PDF adjunto</p>
            <p style={{ margin: '8px 0 0', color: '#a0a4ab', fontSize: 13 }}>
              {attachedFileName ?? 'archivo.pdf'}
            </p>
          </div>
        ) : (
          <img
            src={activeCapture.processedDataUrl}
            alt="Vista previa de captura"
            style={styles.previewImg}
          />
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleRetake} style={styles.secondaryBtn}>
            Repetir toma
          </button>
          <button onClick={handleConfirmStep} style={styles.primaryBtn}>
            {isIne && currentSide === 'front' ? 'Continuar al Reverso' : 'Confirmar y Enviar'}
          </button>
        </div>
      </div>
    );
  }

  // ========== Vista 3: Cámara ==========
  const borderColor = frameBorderColor(fitStatus, isIneAutoCapture);
  const showIneWarning = isIneAutoCapture && fitStatus === 'bad';

  return (
    <div style={styles.cameraRoot}>
      <ModeSwitch mode={captureMode} onChange={handleModeChange} />

      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        screenshotQuality={0.92}
        videoConstraints={{
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }}
        style={styles.webcam}
      />

      {/*
        El marco está anclado al centro exacto de la pantalla. Título y mensajes se
        posicionan en absoluto respecto a él, así nunca lo desplazan al aparecer/desaparecer.
      */}
      <div
        style={{
          ...styles.frameAnchor,
          width: isIne ? INE_FRAME_WIDTH : DOCUMENT_FRAME_WIDTH,
        }}
      >
        <h3 style={styles.frameTitle}>
          {isIne
            ? `Rellena el marco con tu INE (${currentSide === 'front' ? 'FRENTE' : 'REVERSO'})`
            : 'Encuadra tu documento'}
        </h3>

        <div
          ref={guideFrameRef}
          style={{
            width: '100%',
            aspectRatio: isIne ? '1.586 / 1' : '1 / 1.3',
            border: `3px solid ${borderColor}`,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
            transition: 'border-color 0.2s ease',
            boxSizing: 'border-box',
          }}
        />

        {/* Feedback de detección INE (debajo del marco, fuera del flujo) */}
        {isIneAutoCapture && (
          <div style={styles.frameStatus}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                color:
                  fitStatus === 'good'
                    ? '#86efac'
                    : fitStatus === 'bad'
                      ? '#fca5a5'
                      : '#e5e7eb',
              }}
            >
              {isProcessing
                ? 'Capturando…'
                : loadError
                  ? loadError
                  : isWarmingUp
                    ? 'Preparando detector…'
                    : fitMessage}
            </p>

            {/* Solo en `npm run dev`: métricas para calibrar el detector en el teléfono */}
            {import.meta.env.DEV && fitDebug && (
              <p style={{ margin: 0, fontSize: 11, opacity: 0.75, fontFamily: 'monospace' }}>
                {fitDebug}
              </p>
            )}

            {showIneWarning && (
              <p style={styles.ineWarning} role="status">
                ⚠️ Coloca la INE correctamente dentro del marco
              </p>
            )}
          </div>
        )}
      </div>

      {/* Barra fija abajo, como una app de cámara */}
      <div style={styles.bottomBar}>
        {/* INE: elegir detección automática o disparo manual */}
        {isIne && (
          <label style={styles.optionToggle}>
            <input
              type="checkbox"
              checked={ineAutoDetect}
              onChange={(e) => setIneAutoDetect(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Detección automática
          </label>
        )}

        {/* Documento: aplanado tipo Office Lens */}
        {!isIne && (
          <label style={styles.optionToggle}>
            <input
              type="checkbox"
              checked={useJscanifyLens}
              onChange={(e) => setUseJscanifyLens(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Aplanar documento (tipo Office Lens)
          </label>
        )}

        {/* Tres columnas iguales: el obturador queda siempre centrado */}
        <div style={styles.shutterRow}>
          <div />
          <ShutterButton
            onClick={handleCapturePhoto}
            // En automático dispara el detector; el botón queda bloqueado
            disabled={isProcessing || isIneAutoCapture}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            {!isIne && (
              <label style={styles.uploadBtn}>
                Subir PDF / Imagen
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>🔒 Conexión segura</p>
      </div>
    </div>
  );
}

/**
 * Obturador tipo app de cámara: aro blanco con disco blanco al centro, sin texto.
 * El disco se encoge al presionar (clase en index.css); deshabilitado se atenúa.
 */
function ShutterButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="shutter-btn"
      aria-label="Capturar foto"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.shutterRing,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span className="shutter-disc" style={styles.shutterDisc} />
    </button>
  );
}

/** Switch fijo arriba-izquierda: INE ↔ Documento (sin query params por ahora). */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
}) {
  return (
    <div style={styles.modeSwitch} role="group" aria-label="Tipo de documento">
      <button
        type="button"
        onClick={() => onChange('ine')}
        style={{
          ...styles.modeBtn,
          background: mode === 'ine' ? '#2457c5' : 'transparent',
          color: '#fff',
        }}
      >
        INE
      </button>
      <button
        type="button"
        onClick={() => onChange('documento')}
        style={{
          ...styles.modeBtn,
          background: mode === 'documento' ? '#2457c5' : 'transparent',
          color: '#fff',
        }}
      >
        Documento
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  gateRoot: {
    minHeight: '100vh',
    background: '#121316',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    fontFamily: 'sans-serif',
    textAlign: 'center',
  },
  gateText: { maxWidth: 360, color: '#a0a4ab', marginBottom: 24 },
  warnText: { color: '#ffb020', maxWidth: 360, marginBottom: 16, fontSize: 14 },
  errorText: { color: '#ff6b6b', maxWidth: 360, marginBottom: 16 },
  reviewRoot: {
    minHeight: '100vh',
    background: '#121316',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    fontFamily: 'sans-serif',
    position: 'relative',
  },
  previewImg: {
    maxWidth: '90%',
    maxHeight: '60vh',
    borderRadius: 12,
    border: '2px solid #fff',
    marginBottom: 16,
  },
  pdfPreview: {
    width: '90%',
    maxWidth: 360,
    padding: 32,
    borderRadius: 12,
    border: '2px dashed #5c6370',
    background: '#1c1e24',
    textAlign: 'center',
    marginBottom: 16,
  },
  cameraRoot: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#000',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
    color: '#fff',
  },
  webcam: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  frameAnchor: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 10,
  },
  frameTitle: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    margin: '0 0 16px',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
    textAlign: 'center',
  },
  frameStatus: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '16px 16px calc(20px + env(safe-area-inset-bottom))',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
  },
  ineWarning: {
    margin: 0,
    padding: '8px 12px',
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.85)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
  },
  optionToggle: {
    fontSize: 13,
    background: 'rgba(0,0,0,0.6)',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
  },
  shutterRow: {
    width: '100%',
    maxWidth: 420,
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 16,
  },
  shutterRing: {
    width: 74,
    height: 74,
    padding: 5,
    borderRadius: '50%',
    border: '4px solid #fff',
    background: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s ease',
    WebkitTapHighlightColor: 'transparent',
  },
  shutterDisc: {
    display: 'block',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: '#fff',
  },
  uploadBtn: {
    padding: '10px 14px',
    borderRadius: 999,
    background: '#2457c5',
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  primaryBtn: {
    padding: '12px 24px',
    borderRadius: 8,
    background: '#2457c5',
    color: '#fff',
    border: 'none',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 16,
  },
  secondaryBtn: {
    padding: '12px 20px',
    borderRadius: 8,
    background: '#34373c',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  },
  modeSwitch: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 30,
    display: 'flex',
    gap: 4,
    padding: 4,
    borderRadius: 10,
    background: 'rgba(0,0,0,0.65)',
    border: '1px solid rgba(255,255,255,0.15)',
  },
  modeBtn: {
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default App;
