/** Tipos mínimos de jscanify (solo lo que usa la app). */
declare module 'jscanify' {
  export default class JScanify {
    constructor();

    /** Detecta la hoja, corrige la perspectiva y la devuelve en un canvas del tamaño pedido. */
    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      resultWidth: number,
      resultHeight: number
    ): HTMLCanvasElement | null;
  }
}
