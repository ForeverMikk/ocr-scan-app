import type { ChangeEvent, CSSProperties } from 'react';
import { COLORS } from '../shared/theme';
import { ShutterButton } from './ShutterButton';

const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

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
 *  - INE: casilla "Detección automática" (marcada → el obturador se deshabilita).
 *  - Documento: casilla de aplanado y botón para subir imagen/PDF.
 */
export function CaptureControls({
  isIne,
  autoDetect,
  onAutoDetectChange,
  flatten,
  onFlattenChange,
  shutterDisabled,
  onShutter,
  onFileSelected,
}: {
  isIne: boolean;
  autoDetect: boolean;
  onAutoDetectChange: (value: boolean) => void;
  flatten: boolean;
  onFlattenChange: (value: boolean) => void;
  shutterDisabled: boolean;
  onShutter: () => void;
  onFileSelected: (file: File) => void;
}) {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpia el input para poder volver a elegir el mismo archivo
    e.target.value = '';
    if (!file) return;

    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
      alert('Formato no soportado. Sube JPG, PNG, WEBP o PDF.');
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
          {!isIne && (
            <label style={styles.uploadButton}>
              Subir PDF / Imagen
              <input
                type="file"
                accept={ACCEPTED_UPLOAD_TYPES.join(',')}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>🔒 Tu información estará encriptada</p>
    </div>
  );
}

const styles = {
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '16px 16px calc(20px + env(safe-area-inset-bottom))',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
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
    whiteSpace: 'nowrap',
  },
} satisfies Record<string, CSSProperties>;
