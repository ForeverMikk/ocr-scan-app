import type { CSSProperties } from 'react';
import { isSecureContext } from '../hooks/useCameraPermission';
import { buttonStyles, COLORS, fullScreenCentered } from '../shared/theme';

/** Primera pantalla: pide el permiso de cámara antes de mostrar el visor. */
export function PermissionGate({
  error,
  isRequesting,
  onRequest,
}: {
  error: string | null;
  isRequesting: boolean;
  onRequest: () => void;
}) {
  const insecure = !isSecureContext();

  return (
    <div style={styles.root}>
      <h2 style={{ color: '#fff' }}>Verificación de Documentos</h2>
      <p style={styles.text}>Necesitamos acceso a tu cámara antes de comenzar.</p>
      {insecure && (
        <p style={styles.warning}>
          Estás en un contexto no seguro ({window.location.origin}). La cámara no mostrará el popup.
          En PC usa <strong>localhost</strong>; en teléfono necesitas HTTPS.
        </p>
      )}
      {error && <p style={styles.error}>{error}</p>}
      <button
        onClick={onRequest}
        disabled={isRequesting}
        style={{
          ...buttonStyles.primary,
          cursor: isRequesting ? 'wait' : 'pointer',
          opacity: isRequesting ? 0.7 : 1,
        }}
      >
        {isRequesting ? 'Solicitando permiso…' : 'Permitir Cámara'}
      </button>
    </div>
  );
}

const styles = {
  root: { ...fullScreenCentered, padding: 24, textAlign: 'center' },
  text: { maxWidth: 360, color: COLORS.muted, marginBottom: 24 },
  warning: { color: COLORS.warning, maxWidth: 360, marginBottom: 16, fontSize: 14 },
  error: { color: COLORS.error, maxWidth: 360, marginBottom: 16 },
} satisfies Record<string, CSSProperties>;
