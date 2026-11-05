import type { CSSProperties, ReactNode, RefObject } from 'react';
import Webcam from 'react-webcam';
import { JPEG_QUALITY } from '../shared/image';

/**
 * Visor a pantalla completa: video de la cámara trasera y una columna encima
 * (header, marco, barra de controles) que cabe sin scroll.
 */
export function CameraView({
  webcamRef,
  children,
}: {
  webcamRef: RefObject<Webcam>;
  children: ReactNode;
}) {
  return (
    <div style={styles.root}>
      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        screenshotQuality={JPEG_QUALITY}
        videoConstraints={{
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }}
        style={styles.video}
      />
      <div style={styles.overlay}>{children}</div>
    </div>
  );
}

const styles = {
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: '#000',
    overflow: 'hidden',
    fontFamily: 'sans-serif',
    color: '#fff',
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    pointerEvents: 'none',
  },
} satisfies Record<string, CSSProperties>;
