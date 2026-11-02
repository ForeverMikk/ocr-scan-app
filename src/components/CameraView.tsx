import type { CSSProperties, ReactNode, RefObject } from 'react';
import Webcam from 'react-webcam';
import { JPEG_QUALITY } from '../shared/image';

/** Visor a pantalla completa: video de la cámara trasera + capas encima (`children`). */
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
      {children}
    </div>
  );
}

const styles = {
  root: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#000',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
    color: '#fff',
  },
  video: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    // El recorte al marco compensa este `cover` (ver guideFrameGeometry)
    objectFit: 'cover',
  },
} satisfies Record<string, CSSProperties>;
