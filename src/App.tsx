/**
 * Flujo:
 *   Permiso → foto o archivo → el OCR devuelve texto → aquí se decide el tipo.
 *   INE: frente y luego reverso. Comprobante o factura: una sola imagen.
 *   Cada etapa tiene 3 intentos, sea foto o archivo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type Webcam from "react-webcam";
import { CameraView } from "./components/CameraView";
import { CaptureControls } from "./components/CaptureControls";
import { GuideFrame } from "./components/GuideFrame";
import { IneDetectionStatus } from "./components/IneDetectionStatus";
import { ModeSwitch } from "./components/ModeSwitch";
import { Notice } from "./components/Notice";
import { PermissionGate } from "./components/PermissionGate";
import { ResultView } from "./components/ResultView";
import { ReviewView } from "./components/ReviewView";
import { decideCapture, type CaptureStep } from "./flow/decideCapture";
import { useCameraPermission } from "./hooks/useCameraPermission";
import { useIneAutoCapture } from "./hooks/useIneAutoCapture";
import { classifyOcrText, mergeIneReads } from "./ocr/classifyDocument";
import { scanDocumentImage } from "./ocr/ocrClient";
import { buildVerificationPayload } from "./payload/payloadBuilder";
import { submitVerification } from "./payload/submitVerification";
import { dataUrlToBase64, readFileAsDataUrl } from "./shared/image";
import {
  clearStoredVerification,
  emptyOcrSession,
  writeOcrSession,
  type OcrSession,
} from "./session/ocrSession";
import {
  unprocessedScan,
  type CaptureMap,
  type CaptureMode,
  type CaptureSide,
  type ScanResult,
} from "./types/capture";
import type { IneFitStatus, IneSide } from "./vision/ine/ineCardDetector";
import { ensureOpenCvLoaded } from "./vision/loaders/opencvLoader";
import {
  processDocumentShot,
  processIdentificationShot,
} from "./vision/processCameraShot";
import type {
  ComprobanteOcrData,
  FacturaOcrData,
  IneOcrData,
  VerificationPayload,
} from "./types/verificationPayload";

const SIDE_LABEL: Record<CaptureSide, string> = {
  front: "Frente",
  back: "Reverso",
  single: "Documento",
};

export function App() {
  const permission = useCameraPermission();

  const [captureMode, setCaptureMode] = useState<CaptureMode>("ine");
  const [step, setStep] = useState<CaptureStep>("primero");
  const [ineAutoDetect, setIneAutoDetect] = useState(false);
  const [flattenDocument, setFlattenDocument] = useState(true);

  const [currentSide, setCurrentSide] = useState<CaptureSide>("front");
  const [captures, setCaptures] = useState<CaptureMap>({});
  const [isReviewing, setIsReviewing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [session, setSession] = useState<OcrSession>(emptyOcrSession);
  const [ineFrontRead, setIneFrontRead] = useState<{
    ine: IneOcrData;
    textoOcr: string;
  } | null>(null);
  const [donePayload, setDonePayload] = useState<VerificationPayload | null>(
    null,
  );

  const isCardFrame = step === "reverso" || captureMode === "ine";
  const expectedIneSide: IneSide = step === "reverso" ? "back" : "front";

  const webcamRef = useRef<Webcam>(null);
  const guideFrameRef = useRef<HTMLDivElement>(null);

  const publishSession = (next: OcrSession) => {
    setSession(next);
    writeOcrSession(next);
  };

  useEffect(() => {
    if (!permission.granted) return;
    if (isCardFrame || flattenDocument) {
      ensureOpenCvLoaded().catch((error: unknown) =>
        console.warn("[App] OpenCV no cargó:", error),
      );
    }
  }, [permission.granted, isCardFrame, flattenDocument]);

  const resetFlow = (mode: CaptureMode = captureMode) => {
    setCaptureMode(mode);
    setStep("primero");
    setCaptures({});
    setIsReviewing(false);
    setIsProcessing(false);
    setIsScanning(false);
    setAttemptsUsed(0);
    setBlocked(false);
    setScanError(null);
    setIneFrontRead(null);
    setDonePayload(null);
    setCurrentSide(mode === "ine" ? "front" : "single");
    setFlattenDocument(true);
    const fresh = emptyOcrSession();
    setSession(fresh);
    clearStoredVerification();
  };

  const handleModeChange = (mode: CaptureMode) => {
    if (step === "reverso") return;
    resetFlow(mode);
  };

  const handleCapturePhoto = useCallback(async () => {
    const webcam = webcamRef.current;
    const video = webcam?.video;
    const guideFrame = guideFrameRef.current;
    if (!webcam || !video || !guideFrame || isProcessing || blocked) return;

    const screenshot = webcam.getScreenshot();
    if (!screenshot) return;

    setIsProcessing(true);
    setScanError(null);
    try {
      const shot = { screenshot, video, guideFrame };
      const result: ScanResult = isCardFrame
        ? await processIdentificationShot(shot)
        : await processDocumentShot(shot, flattenDocument);
      const side: CaptureSide = step === "reverso" ? "back" : currentSide;
      setCaptures((prev) => ({ ...prev, [side]: result }));
      setCurrentSide(side);
      setIsReviewing(true);
    } finally {
      setIsProcessing(false);
    }
  }, [blocked, currentSide, flattenDocument, isCardFrame, isProcessing, step]);

  const ineDetection = useIneAutoCapture({
    enabled:
      permission.granted &&
      isCardFrame &&
      ineAutoDetect &&
      !isReviewing &&
      !isProcessing &&
      !isScanning &&
      !scanError &&
      !blocked,
    webcamRef,
    guideFrameRef,
    onAutoCapture: handleCapturePhoto,
    expectedSide: expectedIneSide,
    stableGoodNeeded: 3,
    intervalMs: 250,
  });

  const handleRetake = () => {
    setIsReviewing(false);
    ineDetection.resetAutoCapture();
  };

  const handleFileSelected = async (file: File) => {
    if (blocked) return;
    const dataUrl = await readFileAsDataUrl(file);
    const side: CaptureSide = step === "reverso" ? "back" : currentSide;
    setScanError(null);
    setCaptures((prev) => ({ ...prev, [side]: unprocessedScan(dataUrl) }));
    setCurrentSide(side);
    setIsReviewing(true);
  };

  const finish = async (payload: VerificationPayload) => {
    await submitVerification(payload);
    setDonePayload(payload);
    setIsReviewing(false);
  };

  const handleConfirmStep = async () => {
    const capture = captures[currentSide];
    if (!capture || isScanning || blocked) return;

    setIsScanning(true);
    setScanError(null);
    try {
      const ocr = await scanDocumentImage(
        dataUrlToBase64(capture.processedDataUrl),
      );
      const classification = classifyOcrText(ocr.resultado);
      console.info("[App] OCR", classification.kind, ocr.resultado);
      const decision = decideCapture(step, classification, attemptsUsed);

      if (
        decision.action === "reverso" &&
        classification.kind === "ine-frente"
      ) {
        publishSession({
          documento: "INE",
          lecturas: {
            frente: { status: ocr.status, resultado: ocr.resultado },
          },
          updatedAt: "",
        });
        setIneFrontRead({
          ine: classification.ine,
          textoOcr: classification.textoOcr,
        });
        setCaptures({ front: capture });
        setCurrentSide("back");
        setStep("reverso");
        setCaptureMode("ine");
        setAttemptsUsed(0);
        setIsReviewing(false);
        ineDetection.resetAutoCapture();
        return;
      }

      if (
        decision.action === "listo" &&
        decision.documento === "Comprobante" &&
        classification.kind === "comprobante"
      ) {
        const data: ComprobanteOcrData = classification.data;
        publishSession({
          ...session,
          documento: "Comprobante",
          lecturas: {
            ...session.lecturas,
            documento: { status: ocr.status, resultado: ocr.resultado },
          },
        });
        const payload = await buildVerificationPayload({
          documento: "Comprobante",
          geo: permission.geoData,
          capturas: { single: capture },
          comprobante: data,
        });
        await finish(payload);
        return;
      }

      if (
        decision.action === "listo" &&
        decision.documento === "Factura" &&
        classification.kind === "factura"
      ) {
        const data: FacturaOcrData = classification.data;
        publishSession({
          ...session,
          documento: "Factura",
          lecturas: {
            ...session.lecturas,
            documento: { status: ocr.status, resultado: ocr.resultado },
          },
        });
        const payload = await buildVerificationPayload({
          documento: "Factura",
          geo: permission.geoData,
          capturas: { single: capture },
          factura: data,
        });
        await finish(payload);
        return;
      }

      if (
        decision.action === "listo" &&
        decision.documento === "INE" &&
        classification.kind === "ine-reverso"
      ) {
        if (!ineFrontRead || !captures.front) {
          setScanError("Falta el frente de la INE. Empieza de nuevo.");
          setBlocked(true);
          return;
        }
        const merged = mergeIneReads(ineFrontRead.ine, classification.back);
        publishSession({
          documento: "INE",
          lecturas: {
            frente: session.lecturas.frente,
            reverso: { status: ocr.status, resultado: ocr.resultado },
          },
          updatedAt: "",
        });
        const payload = await buildVerificationPayload({
          documento: "INE",
          geo: permission.geoData,
          capturas: { front: captures.front, back: capture },
          ine: {
            ocr: merged,
            textoOcrFrente: ineFrontRead.textoOcr,
            textoOcrReverso: classification.back.textoOcr,
          },
        });
        await finish(payload);
        return;
      }

      if (decision.action === "reintentar") {
        setAttemptsUsed(decision.attemptsUsed);
        setScanError(decision.message);
        setBlocked(decision.agotado);
        if (!decision.agotado) {
          setIsReviewing(false);
          ineDetection.resetAutoCapture();
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo leer el documento.";
      console.error("[App] OCR:", error);
      setScanError(message);
    } finally {
      setIsScanning(false);
    }
  };

  if (!permission.granted) {
    return (
      <PermissionGate
        error={permission.error}
        isRequesting={permission.isRequesting}
        onRequest={permission.request}
      />
    );
  }

  if (donePayload) {
    return <ResultView payload={donePayload} onRestart={() => resetFlow()} />;
  }

  const modeSwitch =
    step === "primero" ? (
      <ModeSwitch mode={captureMode} onChange={handleModeChange} />
    ) : null;

  const activeCapture = captures[currentSide];
  if (isReviewing && activeCapture) {
    return (
      <div
        style={{
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "#121316",
        }}
      >
        {modeSwitch}
        <ReviewView
          title={SIDE_LABEL[currentSide]}
          capture={activeCapture}
          attachedFileName={null}
          confirmLabel={step === "reverso" ? "Leer reverso" : "Leer documento"}
          retakeLabel={blocked ? "Empezar de nuevo" : "Repetir toma"}
          hint={scanError}
          busy={isScanning}
          confirmDisabled={blocked}
          onRetake={blocked ? () => resetFlow() : handleRetake}
          onConfirm={handleConfirmStep}
        />
      </div>
    );
  }

  const frameTitle =
    step === "reverso"
      ? "Encuadra el REVERSO de la INE"
      : isCardFrame
        ? "Encuadra la identificación"
        : "Encuadra el comprobante o la factura";

  const frameStatus: IneFitStatus | undefined = !isCardFrame
    ? undefined
    : scanError
      ? "bad"
      : isProcessing
        ? "good"
        : isCardFrame && ineAutoDetect
          ? ineDetection.fitStatus
          : undefined;

  return (
    <CameraView webcamRef={webcamRef}>
      {modeSwitch}

      <GuideFrame
        kind={isCardFrame ? "ine" : "document"}
        title={frameTitle}
        detectionStatus={frameStatus}
        frameRef={guideFrameRef}
      >
        {scanError ? (
          <Notice tone="error" text={scanError} />
        ) : isProcessing ? (
          <Notice
            tone="info"
            text={
              isCardFrame
                ? "Preparando identificación…"
                : flattenDocument
                  ? "Aplanando documento…"
                  : "Procesando…"
            }
          />
        ) : (
          isCardFrame &&
          ineAutoDetect && (
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
        isIne={isCardFrame}
        autoDetect={ineAutoDetect}
        onAutoDetectChange={setIneAutoDetect}
        flatten={flattenDocument}
        onFlattenChange={setFlattenDocument}
        shutterDisabled={
          isProcessing ||
          blocked ||
          (isCardFrame && ineAutoDetect && !scanError)
        }
        onShutter={handleCapturePhoto}
        onFileSelected={handleFileSelected}
      />
    </CameraView>
  );
}

export default App;
