import type { CSSProperties } from 'react';
import { buttonStyles, COLORS } from '../shared/theme';
import type { VerificationPayload } from '../types/verificationPayload';

const field = (label: string, value: string) => (value ? { label, value } : null);

const highlightsOf = (payload: VerificationPayload): { label: string; value: string }[] => {
  const data = payload.data;
  if (data.Documento === 'INE') {
    return [
      field('Nombre', data.nombreCompleto),
      field('CURP', data.curp),
      field('Clave de elector', data.claveElector),
      field('Nacimiento', data.fechaNacimiento),
      field('Vigencia', data.fechaExpiracion),
      field('CIC', data.cic),
    ].filter((item): item is { label: string; value: string } => item !== null);
  }
  if (data.Documento === 'Comprobante') {
    return [
      field('Proveedor', data.proveedor),
      field('Titular', data.nombreTitular),
      field('Servicio', data.numeroServicio),
      field('Total', data.totalAPagar),
      field('Dirección', data.direccion),
    ].filter((item): item is { label: string; value: string } => item !== null);
  }
  return [
    field('Tipo', data.tipoComprobante),
    field('Folio', data.numeroFactura),
    field('Fecha', data.fecha),
    field('Total', data.total),
    field('Emisor', data.emisor),
    field('Receptor', data.receptor),
  ].filter((item): item is { label: string; value: string } => item !== null);
};

const rawTextOf = (payload: VerificationPayload): string => {
  const data = payload.data;
  if (data.Documento === 'INE') return `Frente\n${data.textoOcrFrente}\n\nReverso\n${data.textoOcrReverso}`;
  return data.textoOcr;
};

/** Resumen de lo que se armó. El JSON completo queda en consola y en localStorage. */
export function ResultView({
  payload,
  onRestart,
}: {
  payload: VerificationPayload;
  onRestart: () => void;
}) {
  const highlights = highlightsOf(payload);
  return (
    <div style={styles.root}>
      <h2 style={styles.title}>{payload.data.Documento} listo</h2>
      <p style={styles.lead}>
        El JSON final está en la consola y en localStorage (`mf-ocr.payload`).
      </p>
      <dl style={styles.list}>
        {highlights.map((item) => (
          <div key={item.label} style={styles.row}>
            <dt style={styles.label}>{item.label}</dt>
            <dd style={styles.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <details style={styles.raw}>
        <summary>Texto que devolvió el OCR</summary>
        <pre style={styles.pre}>{rawTextOf(payload)}</pre>
      </details>
      <button type="button" onClick={onRestart} style={buttonStyles.primary}>
        Nueva captura
      </button>
    </div>
  );
}

const styles = {
  root: {
    height: '100%',
    overflow: 'auto',
    boxSizing: 'border-box',
    padding: '24px 20px 32px',
    color: '#fff',
    fontFamily: 'sans-serif',
    background: COLORS.background,
  },
  title: { margin: '0 0 8px', fontSize: 22 },
  lead: { margin: '0 0 16px', color: COLORS.muted, fontSize: 14 },
  list: { margin: '0 0 16px' },
  row: { marginBottom: 10 },
  label: { color: COLORS.muted, fontSize: 12 },
  value: { margin: 0, fontSize: 16 },
  raw: {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: COLORS.surface,
  },
  pre: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: 12,
    lineHeight: 1.4,
  },
} satisfies Record<string, CSSProperties>;
