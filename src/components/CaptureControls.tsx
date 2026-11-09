import type { ChangeEvent, CSSProperties } from 'react';
import { COLORS } from '../shared/theme';
import { ShutterButton } from './ShutterButton';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Casilla de opción sobre el obturador. */
function OptionToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginRight: 8 }}
      />
      {label}
    </label>
  );
}

/**
 * Barra fija abajo, como una app de cámara:
 *  - Identificación: casilla "Detección automática" (marcada → el obturador se deshabilita).
 *  - Documento: casilla de aplanado.
 *  - INE: solo imagen. Comprobante y factura: imagen o PDF.
 */
export function CaptureControls({
  isIne,
  allowPdf,
  autoDetect,
  onAutoDetectChange,
  flatten,
  onFlattenChange,
  shutterDisabled,
  onShutter,
  onFileSelected,
}: {
  isIne: boolean;
  /** PDF solo en comprobante y factura. Se manda en base64 igual que una foto. */
  allowPdf: boolean;
  autoDetect: boolean;
  onAutoDetectChange: (value: boolean) => void;
  flatten: boolean;
  onFlattenChange: (value: boolean) => void;
  shutterDisabled: boolean;
  onShutter: () => void;
  onFileSelected: (file: File) => void;
}) {
  const accept = allowPdf ? [...IMAGE_TYPES, 'application/pdf', '.pdf'] : IMAGE_TYPES;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpia el input para poder volver a elegir el mismo archivo
    e.target.value = '';
    if (!file) return;

    const pdf = isPdfFile(file);
    if (pdf && !allowPdf) {
      alert('El PDF solo se puede subir en comprobante o factura.');
      return;
    }
    if (!IMAGE_TYPES.includes(file.type) && !pdf) {
      alert(
        allowPdf
          ? 'Formato no soportado. Sube JPG, PNG, WEBP o PDF.'
          : 'Formato no soportado. Sube JPG, PNG o WEBP.',
      );
      return;
    }
    onFileSelected(file);
  };

  return (
    <div style={styles.bar}>
      {isIne ? (
        <OptionToggle
          label="Detección automática"
          checked={autoDetect}
          onChange={onAutoDetectChange}
        />
      ) : (
        <OptionToggle
          label="Aplanar documento (tipo Office Lens)"
          checked={flatten}
          onChange={onFlattenChange}
        />
      )}

      {/* Tres columnas iguales: el obturador queda siempre centrado */}
      <div style={styles.shutterRow}>
        <div />
        <ShutterButton onClick={onShutter} disabled={shutterDisabled} />
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <label style={styles.uploadButton}>
            {allowPdf ? 'Subir archivo' : 'Subir imagen'}
            <input
              type="file"
              accept={accept.join(',')}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>🔒 Tu información estará encriptada</p>
    </div>
  );
}

const styles = {
  bar: {
    flexShrink: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px max(10px, env(safe-area-inset-bottom))',
    boxSizing: 'border-box',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
    pointerEvents: 'auto',
  },
  toggle: {
    fontSize: 13,
    background: 'rgba(0,0,0,0.6)',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
  },
  shutterRow: {
    width: '100%',
    maxWidth: 420,
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 16,
  },
  uploadButton: {
    padding: '10px 14px',
    borderRadius: 999,
    background: COLORS.brand,
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'normal',
    textAlign: 'center',
    lineHeight: 1.2,
  },
} satisfies Record<string, CSSProperties>;
