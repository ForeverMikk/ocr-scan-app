import type { CSSProperties, ReactNode, RefObject } from 'react';
import { COLORS } from '../shared/theme';
import { INE_ASPECT, type IneFitStatus } from '../vision/ine/ineCardDetector';

const BORDER_COLOR: Record<IneFitStatus, string> = {
  good: COLORS.detectionGood,
  bad: COLORS.detectionBad,
  searching: '#ffffff',
};

/** INE: 90% de la pantalla, máximo 400px. */
const INE_FRAME_WIDTH = 'min(90vw, 400px)';
/**
 * Documento: vertical (1:1.3); se limita también por altura para que quede espacio
 * arriba (título) y abajo (barra de controles) en pantallas bajas.
 */
const DOCUMENT_FRAME_WIDTH = 'min(90vw, 400px, calc((100dvh - 340px) / 1.3))';

/**
 * Marco guía anclado al centro exacto de la pantalla. Título (arriba) y `children`
 * (abajo) van en posición absoluta respecto a él, así nunca lo desplazan al aparecer.
 *
 * `frameRef` apunta al rectángulo del marco: con él se recorta la foto y se analiza el video.
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
  const isIne = kind === 'ine';

  return (
    <div style={{ ...styles.anchor, width: isIne ? INE_FRAME_WIDTH : DOCUMENT_FRAME_WIDTH }}>
      <h3 style={styles.title}>{title}</h3>
      <div
        ref={frameRef}
        style={{
          ...styles.frame,
          aspectRatio: isIne ? `${INE_ASPECT} / 1` : '1 / 1.3',
          border: `3px solid ${borderColor}`,
        }}
      />
      {children && <div style={styles.below}>{children}</div>}
    </div>
  );
}

const styles = {
  anchor: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 10,
  },
  title: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    margin: '0 0 16px',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
    textAlign: 'center',
  },
  frame: {
    width: '100%',
    borderRadius: 14,
    // Oscurece todo lo que queda fuera del marco
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
  },
  below: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    textAlign: 'center',
  },
} satisfies Record<string, CSSProperties>;
