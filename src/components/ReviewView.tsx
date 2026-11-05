import type { CSSProperties } from 'react';
import { buttonStyles, COLORS } from '../shared/theme';
import type { ScanResult } from '../types/capture';

/** Muestra la captura (o el PDF adjunto) para confirmarla o repetirla, sin scroll. */
export function ReviewView({
  title,
  capture,
  attachedFileName,
  confirmLabel,
  retakeLabel = 'Repetir toma',
  hint,
  busy = false,
  confirmDisabled = false,
  onRetake,
  onConfirm,
}: {
  title: string;
  capture: ScanResult;
  /** Nombre del PDF adjunto; null si es una imagen. */
  attachedFileName: string | null;
  confirmLabel: string;
  retakeLabel?: string;
  /** Aviso bajo el título (error del OCR o intento fallido). */
  hint?: string | null;
  busy?: boolean;
  confirmDisabled?: boolean;
  onRetake: () => void;
  onConfirm: () => void;
}) {
  const isPdf =
    Boolean(attachedFileName) || capture.processedDataUrl.startsWith('data:application/pdf');

  return (
    <div style={styles.root}>
      <h3 style={styles.title}>Revisa tu captura ({title})</h3>
      {hint ? <p style={styles.hint}>{hint}</p> : null}
      {isPdf ? (
        <div style={styles.pdfPreview}>
          <p style={{ margin: 0, fontSize: 15 }}>📄 PDF adjunto</p>
          <p style={{ margin: '8px 0 0', color: COLORS.muted, fontSize: 13 }}>
            {attachedFileName ?? 'archivo.pdf'}
          </p>
        </div>
      ) : (
        <div style={styles.imageWrap}>
          <img src={capture.processedDataUrl} alt="Vista previa de captura" style={styles.image} />
        </div>
      )}
      <div style={styles.actions}>
        <button onClick={onRetake} style={buttonStyles.secondary} disabled={busy}>
          {retakeLabel}
        </button>
        <button
          onClick={onConfirm}
          style={{ ...buttonStyles.primary, opacity: busy || confirmDisabled ? 0.55 : 1 }}
          disabled={busy || confirmDisabled}
        >
          {busy ? 'Leyendo…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

const styles = {
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px max(12px, env(safe-area-inset-bottom))',
    color: '#fff',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box',
  },
  title: {
    flexShrink: 0,
    margin: '0 0 8px',
    fontSize: 16,
    textAlign: 'center',
  },
  hint: {
    flexShrink: 0,
    margin: '0 0 8px',
    maxWidth: 420,
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
  },
  imageWrap: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  image: {
    maxWidth: '92%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: 12,
    border: '2px solid #fff',
  },
  pdfPreview: {
    width: '90%',
    maxWidth: 360,
    padding: 32,
    borderRadius: 12,
    border: '2px dashed #5c6370',
    background: COLORS.surface,
    textAlign: 'center',
    marginBottom: 12,
  },
  actions: {
    flexShrink: 0,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
} satisfies Record<string, CSSProperties>;
