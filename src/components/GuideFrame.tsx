import type { CSSProperties, ReactNode, RefObject } from 'react';
import { COLORS } from '../shared/theme';
import { INE_ASPECT, type IneFitStatus } from '../vision/ine/ineCardDetector';

const BORDER_COLOR: Record<IneFitStatus, string> = {
  good: COLORS.detectionGood,
  bad: COLORS.detectionBad,
  searching: '#ffffff',
};

/** Documento vertical, un poco más bajo que A4 para ganar ancho en el teléfono. */
const DOCUMENT_ASPECT = 1 / 1.3;

/**
 * Marco guía: ocupa todo el espacio libre entre el switch y los controles,
 * lo más grande posible sin tapar botones ni salirse de la pantalla.
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
  const aspect = isIne ? INE_ASPECT : DOCUMENT_ASPECT;

  return (
    <div style={styles.column}>
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
      </div>
      {children && <div style={styles.below}>{children}</div>}
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
    padding: '4px 16px',
  },
  title: {
    flexShrink: 0,
    margin: '0 0 8px',
    padding: '0 8px',
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
    overflow: 'hidden',
    containerType: 'size',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    height: 'auto',
    maxHeight: '100%',
    borderRadius: 14,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
  },
  below: {
    flexShrink: 0,
    width: '100%',
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    textAlign: 'center',
  },
} satisfies Record<string, CSSProperties>;
