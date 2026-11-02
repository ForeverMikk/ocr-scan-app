/**
 * Aplanado de documentos tipo Office Lens (Comprobante / Factura) con jscanify:
 * detecta la hoja, corrige la perspectiva y la devuelve "escaneada".
 */

import { canvasToJpeg, loadImage } from '../../shared/image';
import { unprocessedScan, type ScanResult } from '../../types/capture';
import { loadJScanify } from '../loaders/jscanifyLoader';

/** Tamaño de salida: proporción vertical aproximada de carta/A4. */
const DOCUMENT_OUTPUT = { width: 1200, height: 1600 };

/** Si no encuentra la hoja o algo falla, devuelve la imagen original sin cambios. */
export const flattenDocument = async (dataUrl: string): Promise<ScanResult> => {
  try {
    // loadJScanify asegura OpenCV antes de cargar jscanify
    const JScanify = await loadJScanify();
    const image = await loadImage(dataUrl);

    // extractPaper: findPaperContour → getCornerPoints → warpPerspective
    const extracted = new JScanify().extractPaper(
      image,
      DOCUMENT_OUTPUT.width,
      DOCUMENT_OUTPUT.height
    );
    if (!extracted) {
      console.warn('[documentScanner] No se detectó el documento; se usa el recorte del marco');
      return unprocessedScan(dataUrl);
    }

    return {
      originalDataUrl: dataUrl,
      processedDataUrl: canvasToJpeg(extracted),
      wasPerspectiveCorrected: true,
    };
  } catch (error) {
    console.warn('[documentScanner] Error al aplanar; se usa el recorte del marco:', error);
    return unprocessedScan(dataUrl);
  }
};
