declare module 'jscanify' {
  export default class JScanify {
    constructor();
    highlightPaper(
      image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
      options?: { color?: string; thickness?: number }
    ): HTMLCanvasElement;

    /** Detecta el contorno del documento. Requiere `cv.imread(image)` como entrada. */
    findPaperContour(img: unknown): unknown;

    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: {
        topLeftCorner: { x: number; y: number };
        topRightCorner: { x: number; y: number };
        bottomLeftCorner: { x: number; y: number };
        bottomRightCorner: { x: number; y: number };
      }
    ): HTMLCanvasElement | null;

    getCornerPoints(contour: unknown): {
      topLeftCorner: { x: number; y: number };
      topRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
    };
  }
}

declare module 'jscanify/client' {
  export { default } from 'jscanify';
}
