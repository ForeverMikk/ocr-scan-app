/** Utilidades de imagen compartidas por la captura, el recorte y el aplanado. */

/** Calidad JPEG de todas las imágenes que genera la app (buen balance tamaño/OCR). */
export const JPEG_QUALITY = 0.92;

/** Decodifica un data URL en un <img> listo para dibujarse en canvas. */
export const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = dataUrl;
  });

/** Exporta un canvas como data URL JPEG con la calidad estándar de la app. */
export const canvasToJpeg = (canvas: HTMLCanvasElement): string =>
  canvas.toDataURL('image/jpeg', JPEG_QUALITY);

/**
 * Data URL (`data:image/jpeg;base64,XXXX`) → solo el base64 (`XXXX`).
 * Si ya viene sin prefijo, se deja igual.
 */
export const dataUrlToBase64 = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
};

/** Lee un archivo seleccionado por el usuario como data URL. */
export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    reader.readAsDataURL(file);
  });
