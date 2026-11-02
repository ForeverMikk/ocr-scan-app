import { mapGuideFrameToSource } from './guideFrameGeometry';

/**
 * Recorta un dataURL al rectángulo del marco guía, compensando object-fit: cover
 * del video respecto al viewport. `padRatio` agrega margen alrededor del marco.
 */
export const cropDataUrlToGuideFrame = async (
  dataUrl: string,
  videoEl: HTMLVideoElement,
  frameEl: HTMLElement,
  padRatio = 0
): Promise<string> => {
  const img = await loadImage(dataUrl);
  const imageWidth = img.naturalWidth || img.width;
  const imageHeight = img.naturalHeight || img.height;

  const mapping = mapGuideFrameToSource(imageWidth, imageHeight, videoEl, frameEl, padRatio);
  if (!mapping) return dataUrl;
  const { x, y, width, height } = mapping.sourceRect;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
