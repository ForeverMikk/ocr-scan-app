import type { CSSProperties } from 'react';
import { buttonStyles, COLORS, fullScreenCentered } from '../shared/theme';
import type { ScanResult } from '../types/capture';

/** Muestra la captura (o el PDF adjunto) para confirmarla o repetirla. */
export function ReviewView({
  title,
  capture,
  attachedFileName,
  confirmLabel,
  onRetake,
  onConfirm,
}: {
  title: string;
  capture: ScanResult;
  /** Nombre del PDF adjunto; null si es una imagen. */
  attachedFileName: string | null;
  confirmLabel: string;
  onRetake: () => void;
  onConfirm: () => void;
}) {
  const isPdf =
    Boolean(attachedFileName) || capture.processedDataUrl.startsWith('data:application/pdf');

  return (
    <div style={styles.root}>
      <h3>Revisa tu captura ({title})</h3>
      {isPdf ? (
        <div style={styles.pdfPreview}>
          <p style={{ margin: 0, fontSize: 15 }}>📄 PDF adjunto</p>
          <p style={{ margin: '8px 0 0', color: COLORS.muted, fontSize: 13 }}>
            {attachedFileName ?? 'archivo.pdf'}
          </p>
        </div>
      ) : (
        <img src={capture.processedDataUrl} alt="Vista previa de captura" style={styles.image} />
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onRetake} style={buttonStyles.secondary}>
          Repetir toma
        </button>
        <button onClick={onConfirm} style={buttonStyles.primary}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

const styles = {
  root: fullScreenCentered,
  image: {
    maxWidth: '90%',
    maxHeight: '60vh',
    borderRadius: 12,
    border: '2px solid #fff',
    marginBottom: 16,
  },
  pdfPreview: {
    width: '90%',
    maxWidth: 360,
    padding: 32,
    borderRadius: 12,
    border: '2px dashed #5c6370',
    background: COLORS.surface,
    textAlign: 'center',
    marginBottom: 16,
  },
} satisfies Record<string, CSSProperties>;
