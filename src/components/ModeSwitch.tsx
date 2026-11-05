import type { CSSProperties } from "react";
import type { CaptureMode } from "../types/capture";
import { COLORS } from "../shared/theme";

const OPTIONS: { mode: CaptureMode; label: string }[] = [
  { mode: "ine", label: "INE" },
  { mode: "documento", label: "Doc" },
];

/**
 * Solo cambia el encuadre (tarjeta o hoja).
 * Si es INE, comprobante o factura lo decide el texto del OCR.
 */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
}) {
  return (
    <div style={styles.root} role="group" aria-label="Tipo de documento">
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          aria-pressed={mode === option.mode}
          onClick={() => onChange(option.mode)}
          style={{
            ...styles.button,
            background: mode === option.mode ? COLORS.brand : "transparent",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  root: {
    flexShrink: 0,
    alignSelf: "flex-start",
    zIndex: 30,
    display: "flex",
    gap: 4,
    margin: "max(8px, env(safe-area-inset-top)) 12px 4px",
    padding: 4,
    borderRadius: 10,
    background: "rgba(0,0,0,0.65)",
    border: "1px solid rgba(255,255,255,0.15)",
    pointerEvents: "auto",
  },
  button: {
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;
