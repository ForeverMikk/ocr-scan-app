import type { CSSProperties } from 'react';
import { COLORS } from '../shared/theme';
import type { IneFitStatus } from '../vision/ine/ineCardDetector';
import { Notice } from './Notice';

const TEXT_COLOR: Record<IneFitStatus, string> = {
  good: COLORS.detectionGoodText,
  bad: COLORS.detectionBadText,
  searching: COLORS.detectionIdleText,
};

/** Mensajes del detector automático de INE (se muestran debajo del marco). */
export function IneDetectionStatus({
  status,
  message,
  debug,
  isWarmingUp,
  loadError,
}: {
  status: IneFitStatus;
  message: string;
  /** Métricas del detector; solo se muestran en `npm run dev`. */
  debug: string | null;
  isWarmingUp: boolean;
  loadError: string | null;
}) {
  const text = loadError ?? (isWarmingUp ? 'Preparando detector…' : message);

  return (
    <>
      <p style={{ ...styles.message, color: TEXT_COLOR[status] }}>{text}</p>

      {/* Solo en `npm run dev`: métricas para calibrar el detector en el teléfono */}
      {import.meta.env.DEV && debug && <p style={styles.debug}>{debug}</p>}

      {status === 'bad' && (
        <Notice tone="error" text="⚠️ Coloca la INE correctamente dentro del marco" />
      )}
    </>
  );
}

const styles = {
  message: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },
  debug: { margin: 0, fontSize: 11, opacity: 0.75, fontFamily: 'monospace' },
} satisfies Record<string, CSSProperties>;
