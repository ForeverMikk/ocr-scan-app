/**
 * Después de cada lectura decide el siguiente paso.
 * Hay 3 intentos por etapa (la primera toma y, si es INE, el reverso).
 * Da igual si el intento fue foto o archivo.
 */

import type { OcrClassification } from "../ocr/classifyDocument";
import type { DocumentoLabel } from "../types/verificationPayload";

export const MAX_CAPTURE_ATTEMPTS = 3;

export type CaptureStep = "primero" | "reverso";

export type CaptureDecision =
  | { action: "reverso" }
  | { action: "listo"; documento: DocumentoLabel }
  | {
      action: "reintentar";
      message: string;
      attemptsUsed: number;
      agotado: boolean;
    };

const reasonFor = (
  step: CaptureStep,
  classification: OcrClassification,
): string => {
  if (step === "reverso") {
    if (classification.kind === "ine-frente")
      return "Ese es el frente. Muestra el reverso de la INE.";
    if (classification.kind === "licencia")
      return "Eso es una licencia, no el reverso de la INE.";
    return "No reconocimos el reverso de la INE.";
  }
  if (classification.kind === "ine-reverso")
    return "Ese es el reverso. Primero captura el frente de la INE.";
  if (classification.kind === "licencia") {
    return "Esto es una licencia para conducir, no una INE, un comprobante ni una factura.";
  }
  return "No reconocimos una INE, un comprobante o una factura.";
};

const retry = (attemptsUsed: number, reason: string): CaptureDecision => {
  const next = attemptsUsed + 1;
  const agotado = next >= MAX_CAPTURE_ATTEMPTS;
  const message = agotado
    ? `Se agotaron los ${MAX_CAPTURE_ATTEMPTS} intentos. ${reason}`
    : `${reason} Intento ${next} de ${MAX_CAPTURE_ATTEMPTS}.`;
  return { action: "reintentar", message, attemptsUsed: next, agotado };
};

export const decideCapture = (
  step: CaptureStep,
  classification: OcrClassification,
  attemptsUsed: number,
): CaptureDecision => {
  if (step === "primero" && classification.kind === "ine-frente")
    return { action: "reverso" };
  if (step === "primero" && classification.kind === "comprobante") {
    return { action: "listo", documento: "Comprobante" };
  }
  if (step === "primero" && classification.kind === "factura")
    return { action: "listo", documento: "Factura" };
  if (step === "reverso" && classification.kind === "ine-reverso")
    return { action: "listo", documento: "INE" };
  return retry(attemptsUsed, reasonFor(step, classification));
};
