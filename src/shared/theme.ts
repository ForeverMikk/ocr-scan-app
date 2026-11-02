import type { CSSProperties } from 'react';

/** Paleta de la app (un solo lugar para cambiar colores). */
export const COLORS = {
  brand: '#2457c5',
  background: '#121316',
  surface: '#1c1e24',
  muted: '#a0a4ab',
  neutralButton: '#34373c',
  warning: '#ffb020',
  error: '#ff6b6b',
  /** Marco y mensajes del detector de INE. */
  detectionGood: '#22c55e',
  detectionBad: '#ef4444',
  detectionGoodText: '#86efac',
  detectionBadText: '#fca5a5',
  detectionIdleText: '#e5e7eb',
} as const;

/** Botones compartidos entre vistas. */
export const buttonStyles = {
  primary: {
    padding: '12px 24px',
    borderRadius: 8,
    background: COLORS.brand,
    color: '#fff',
    border: 'none',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 16,
  },
  secondary: {
    padding: '12px 20px',
    borderRadius: 8,
    background: COLORS.neutralButton,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>;

/** Vista a pantalla completa con fondo oscuro y contenido centrado. */
export const fullScreenCentered: CSSProperties = {
  minHeight: '100vh',
  background: COLORS.background,
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: 'sans-serif',
};
