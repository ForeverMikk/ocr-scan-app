import type { Rect } from '../../types/geometry';

export interface GuideFrameMapping {
  /** Región a recortar de la fuente (marco + margen), en píxeles de la fuente. */
  sourceRect: Rect;
  /** Posición del marco guía dentro de `sourceRect`, en píxeles de la fuente. */
  frameInSource: Rect;
}

/**
 * Mapea el marco guía (coordenadas de pantalla) a píxeles de la imagen fuente
 * (video o screenshot), compensando `object-fit: cover` del <video>.
 *
 * `padRatio` agranda la región por cada lado (proporcional al tamaño del marco):
 * si la INE llena el marco, sus bordes quedan dentro del área analizada y OpenCV
 * puede detectarlos (un borde pegado al límite de la imagen no genera contorno).
 */
export const mapGuideFrameToSource = (
  sourceWidth: number,
  sourceHeight: number,
  videoEl: HTMLVideoElement,
  frameEl: HTMLElement,
  padRatio = 0
): GuideFrameMapping | null => {
  const videoRect = videoEl.getBoundingClientRect();
  const frameRect = frameEl.getBoundingClientRect();

  if (!sourceWidth || !sourceHeight || videoRect.width <= 0 || videoRect.height <= 0) {
    return null;
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const displayAspect = videoRect.width / videoRect.height;

  // Tamaño con el que se pinta el video en pantalla (puede exceder el contenedor por `cover`)
  let renderedW: number;
  let renderedH: number;
  if (sourceAspect > displayAspect) {
    renderedH = videoRect.height;
    renderedW = renderedH * sourceAspect;
  } else {
    renderedW = videoRect.width;
    renderedH = renderedW / sourceAspect;
  }
  const offsetX = (videoRect.width - renderedW) / 2;
  const offsetY = (videoRect.height - renderedH) / 2;

  const scaleX = sourceWidth / renderedW;
  const scaleY = sourceHeight / renderedH;

  const frame: Rect = {
    x: (frameRect.left - videoRect.left - offsetX) * scaleX,
    y: (frameRect.top - videoRect.top - offsetY) * scaleY,
    width: frameRect.width * scaleX,
    height: frameRect.height * scaleY,
  };

  const padX = frame.width * padRatio;
  const padY = frame.height * padRatio;

  // Recorte con margen, limitado a los bordes de la fuente
  const x0 = Math.max(0, frame.x - padX);
  const y0 = Math.max(0, frame.y - padY);
  const x1 = Math.min(sourceWidth, frame.x + frame.width + padX);
  const y1 = Math.min(sourceHeight, frame.y + frame.height + padY);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;

  return {
    sourceRect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    frameInSource: { x: frame.x - x0, y: frame.y - y0, width: frame.width, height: frame.height },
  };
};
