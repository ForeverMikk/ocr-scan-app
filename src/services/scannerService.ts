import { ensureOpenCvLoaded } from './opencvLoader';
import { loadJScanify } from './jscanifyLoader';

export interface ScanResult {
  originalDataUrl: string;
  processedDataUrl: string; // Será igual a originalDataUrl si no se transforma o si falla la detección
  wasPerspectiveCorrected: boolean;
}

export interface ExtractPaperSize {
  width: number;
  height: number;
}

/** Proporción INE / ID-1 (~85.6 × 54 mm). */
export const INE_PAPER_SIZE: ExtractPaperSize = { width: 1586, height: 1000 };
/** Proporción vertical para facturas / comprobantes. */
export const DOCUMENT_PAPER_SIZE: ExtractPaperSize = { width: 1200, height: 1600 };

const loadImageElement = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
};

export const processCapturedImage = async (
  rawImageDataUrl: string,
  enableLensEffect: boolean,
  paperSize: ExtractPaperSize = DOCUMENT_PAPER_SIZE
): Promise<ScanResult> => {
  // Si el efecto Lens está apagado, conserva el recorte del marco tal cual
  if (!enableLensEffect) {
    return {
      originalDataUrl: rawImageDataUrl,
      processedDataUrl: rawImageDataUrl,
      wasPerspectiveCorrected: false,
    };
  }

  try {
    await ensureOpenCvLoaded();
    const imgElement = await loadImageElement(rawImageDataUrl);
    const JScanify = await loadJScanify();
    const scanner = new JScanify();

    // extractPaper internamente: findPaperContour → getCornerPoints → warpPerspective
    const extractedCanvas = scanner.extractPaper(
      imgElement,
      paperSize.width,
      paperSize.height
    );

    if (!extractedCanvas) {
      console.warn('[jscanify] No se detectó el documento; se usa el recorte del marco');
      return {
        originalDataUrl: rawImageDataUrl,
        processedDataUrl: rawImageDataUrl,
        wasPerspectiveCorrected: false,
      };
    }

    return {
      originalDataUrl: rawImageDataUrl,
      processedDataUrl: extractedCanvas.toDataURL('image/jpeg', 0.92),
      wasPerspectiveCorrected: true,
    };
  } catch (error) {
    console.warn('Fallback al original por error en jscanify:', error);
    return {
      originalDataUrl: rawImageDataUrl,
      processedDataUrl: rawImageDataUrl,
      wasPerspectiveCorrected: false,
    };
  }
};
