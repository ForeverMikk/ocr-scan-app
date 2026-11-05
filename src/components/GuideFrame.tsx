import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { COLORS } from '../shared/theme';
import { INE_ASPECT, type IneFitStatus } from '../vision/ine/ineCardDetector';

const BORDER_COLOR: Record<IneFitStatus, string> = {
  good: COLORS.detectionGood,
  bad: COLORS.detectionBad,
  searching: '#ffffff',
};

/** Documento vertical, un poco más bajo que A4 para ganar ancho en el teléfono. */
const DOCUMENT_ASPECT = 1 / 1.3;
const FRAME_RADIUS = 14;

/**
 * Oscurece toda la pantalla salvo el rectángulo de captura.
 * Va fuera del contenedor del marco: ese contenedor recorta y el sombreado
 * se quedaba en un rectángulo interior.
 */
function FrameShade({
  frameRef,
  layoutKey,
}: {
  frameRef: RefObject<HTMLDivElement>;
  layoutKey: string;
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const update = () => {
      const rect = frame.getBoundingClientRect();
      setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    if (frame.parentElement) observer.observe(frame.parentElement);
    window.addEventListener('resize', update);
    const frameId = window.requestAnimationFrame(update);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [frameRef, layoutKey]);

  if (!box || box.width < 2 || box.height < 2) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        borderRadius: FRAME_RADIUS,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}

/**
 * Marco guía: ocupa todo el espacio libre entre el switch y los controles,
 * lo más grande posible sin tapar botones ni salirse de la pantalla.
 *
 * `frameRef` apunta al rectángulo del marco: con él se recorta la foto y se analiza el video.
 * El título y los avisos no entran en esa medida, para que el marco no salte al aparecer texto.
 */
export function GuideFrame({
  kind,
  title,
  detectionStatus,
  frameRef,
  children,
}: {
  kind: 'ine' | 'document';
  title: string;
  /** Estado del detector de INE (verde/rojo); sin él el marco es blanco. */
  detectionStatus?: IneFitStatus;
  frameRef: RefObject<HTMLDivElement>;
  children?: ReactNode;
}) {
  const borderColor = detectionStatus ? BORDER_COLOR[detectionStatus] : '#ffffff';
  const aspect = kind === 'ine' ? INE_ASPECT : DOCUMENT_ASPECT;

  return (
    <div style={styles.column}>
      <FrameShade frameRef={frameRef} layoutKey={kind} />
      <h3 style={styles.title}>{title}</h3>
      <div style={styles.frameHost}>
        <div
          ref={frameRef}
          style={{
            ...styles.frame,
            aspectRatio: `${aspect} / 1`,
            width: `min(100cqw, calc(100cqh * ${aspect}))`,
            border: `3px solid ${borderColor}`,
          }}
        />
        {children && <div style={styles.notices}>{children}</div>}
      </div>
    </div>
  );
}

const styles = {
  column: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    padding: '4px 16px 0',
    boxSizing: 'border-box',
  },
  title: {
    position: 'relative',
    zIndex: 2,
    flexShrink: 0,
    margin: '0 0 8px',
    padding: '0 8px',
    minHeight: '2.6em',
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.3,
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
    textAlign: 'center',
  },
  frameHost: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    containerType: 'size',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  frame: {
    height: 'auto',
    maxHeight: '100%',
    borderRadius: FRAME_RADIUS,
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
  },
  /** Flota sobre el marco. Si ocupara alto en el flex, el recuadro se encogería. */
  notices: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    textAlign: 'center',
    pointerEvents: 'none',
  },
} satisfies Record<string, CSSProperties>;
