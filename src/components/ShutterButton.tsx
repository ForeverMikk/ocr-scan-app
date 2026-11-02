import type { CSSProperties } from 'react';

/**
 * Obturador tipo app de cámara: aro blanco con disco blanco al centro, sin texto.
 * El disco se encoge al presionar (clases en index.css); deshabilitado se atenúa.
 */
export function ShutterButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="shutter-btn"
      aria-label="Capturar foto"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.ring,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span className="shutter-disc" style={styles.disc} />
    </button>
  );
}

const styles = {
  ring: {
    width: 74,
    height: 74,
    padding: 5,
    borderRadius: '50%',
    border: '4px solid #fff',
    background: 'transparent',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s ease',
    WebkitTapHighlightColor: 'transparent',
  },
  disc: {
    display: 'block',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: '#fff',
  },
} satisfies Record<string, CSSProperties>;
