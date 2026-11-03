import type { CSSProperties } from 'react';

/** Aviso breve debajo del marco (verificando, error del 2º análisis…). */
export function Notice({ tone, text }: { tone: 'info' | 'error'; text: string }) {
  return (
    <p role="status" style={{ ...styles.base, ...styles[tone] }}>
      {text}
    </p>
  );
}

const styles = {
  base: {
    margin: 0,
    padding: '8px 12px',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
  },
  info: { background: 'rgba(0, 0, 0, 0.65)' },
  error: { background: 'rgba(239, 68, 68, 0.9)' },
} satisfies Record<string, CSSProperties>;
