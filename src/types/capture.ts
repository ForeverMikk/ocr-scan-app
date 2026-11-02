/**
 * Catálogo de documentos (listo para query ?id=1|2|3 más adelante).
 * Por ahora la UI solo distingue INE vs Documento genérico.
 */
export const DOCUMENT_CATALOG = {
  1: { id: 1, key: 'ine', label: 'INE' },
  2: { id: 2, key: 'comprobante', label: 'Comprobante' },
  3: { id: 3, key: 'factura', label: 'Factura' },
} as const;

export type DocumentId = keyof typeof DOCUMENT_CATALOG;

/** Modo de la UI actual (switch superior). */
export type CaptureMode = 'ine' | 'documento';

/** INE: frente y reverso. Comprobante/Factura: una sola imagen. */
export type CaptureSide = 'front' | 'back' | 'single';

/** Imagen capturada (o adjuntada) lista para enviarse al OCR. */
export interface ScanResult {
  /** Imagen antes de enderezar/aplanar. */
  originalDataUrl: string;
  /** Imagen final; igual a `originalDataUrl` si no se transformó o si falló la detección. */
  processedDataUrl: string;
  wasPerspectiveCorrected: boolean;
}

export type CaptureMap = Partial<Record<CaptureSide, ScanResult>>;

export interface GeoLocationData {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: string;
}

/** Resuelve el id numérico que irá en el payload según el modo de UI. */
export const documentIdForMode = (mode: CaptureMode): DocumentId => (mode === 'ine' ? 1 : 2);

/** Resultado sin transformar (recorte del marco o archivo adjunto). */
export const unprocessedScan = (dataUrl: string): ScanResult => ({
  originalDataUrl: dataUrl,
  processedDataUrl: dataUrl,
  wasPerspectiveCorrected: false,
});
