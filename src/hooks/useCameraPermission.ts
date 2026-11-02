import { useState } from 'react';
import type { GeoLocationData } from '../types/capture';

/** La cámara (y el GPS) solo funcionan en HTTPS o localhost. */
export const isSecureContext = (): boolean =>
  typeof window !== 'undefined' && window.isSecureContext;

const describePermissionError = (err: unknown): string => {
  if (!isSecureContext()) {
    return (
      'Este navegador solo permite Cámara en HTTPS o localhost. ' +
      'En el teléfono abre la app por HTTPS, no por http://IP. En PC usa http://localhost:3015'
    );
  }

  if (err instanceof DOMException || (err as Error)?.name === 'NotAllowedError') {
    return 'Bloqueaste el permiso de Cámara. Actívalo en el candado/permisos del sitio y vuelve a intentar.';
  }

  return 'Para continuar es obligatorio permitir el acceso a tu Cámara en el navegador.';
};

// --- Geolocalización (comentada: en PC suele dar TIMEOUT; en teléfono sí funciona) ---
// Para reactivarla: descomentar esto y el bloque marcado en `request`, y cambiar
// `const [geoData]` por `const [geoData, setGeoData]`.
//
// const getCurrentPosition = (options: PositionOptions): Promise<GeolocationPosition> =>
//   new Promise((resolve, reject) => {
//     if (!navigator.geolocation) {
//       reject(new Error('Geolocation API no disponible en este navegador'));
//       return;
//     }
//     navigator.geolocation.getCurrentPosition(resolve, reject, options);
//   });
//
// /** Primero alta precisión; si da TIMEOUT (3) o no disponible (2), reintenta con red/wifi. */
// const requestLocationWithFallback = async (): Promise<GeolocationPosition> => {
//   try {
//     return await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 });
//   } catch (firstErr) {
//     const code = (firstErr as GeolocationPositionError)?.code;
//     if (code === 3 || code === 2) {
//       return getCurrentPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 5 * 60_000 });
//     }
//     throw firstErr;
//   }
// };

export interface CameraPermission {
  granted: boolean;
  /** Mensaje para el usuario si el permiso falló. */
  error: string | null;
  isRequesting: boolean;
  /** Pide el permiso (debe llamarse desde un gesto del usuario, p. ej. un clic). */
  request: () => Promise<void>;
  /** null mientras la geolocalización siga desactivada. */
  geoData: GeoLocationData | null;
}

export function useCameraPermission(): CameraPermission {
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [geoData] = useState<GeoLocationData | null>(null);

  const request = async () => {
    setError(null);
    setIsRequesting(true);

    try {
      if (!isSecureContext()) throw new Error('INSECURE_CONTEXT');

      // Solo para disparar el popup de permiso; el stream real lo abre <Webcam>
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      stream.getTracks().forEach((track) => track.stop());

      // --- Geolocalización desactivada (ver arriba) ---
      // const pos = await requestLocationWithFallback();
      // setGeoData({
      //   latitude: pos.coords.latitude,
      //   longitude: pos.coords.longitude,
      //   accuracyMeters: pos.coords.accuracy,
      //   timestamp: new Date(pos.timestamp).toISOString(),
      // });

      setGranted(true);
    } catch (err) {
      setError(describePermissionError(err));
      console.error(err);
    } finally {
      setIsRequesting(false);
    }
  };

  return { granted, error, isRequesting, request, geoData };
}
