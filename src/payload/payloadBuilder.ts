import { collectDeviceSnapshot } from './deviceInfo';
import type { CaptureMap, GeoLocationData } from '../types/capture';
import type {
  DocumentoLabel,
  GpsData,
  IneOcrData,
  VerificationPayload,
} from '../types/verificationPayload';

/** Motor OCR a usar (el backend define el catálogo). */
const MOTOR_OCR = '1';

/** Plantilla vacía de la INE: el OCR la completa al procesar las capturas. */
const EMPTY_INE_OCR: IneOcrData = {
  nombre: '',
  nombre2: '',
  nombreCompleto: '',
  apellidoPaterno: '',
  apellidoMaterno: '',
  nombres: '',
  direccion: '',
  calle: '',
  codigoPostal: '',
  estado: '',
  municipio: '',
  codigoPais: '',
  colonia: '',
  numeroExterior: '',
  numeroInterior: '',
  codigoEstado: '',
  calleNombre: '',
  curp: '',
  claveElector: '',
  cic: '',
  folio: '',
  sexo: '',
  annoEmision: '',
  numeroEmision: '',
  annoRegistro: '',
  fechaExpiracion: '',
  fechaNacimiento: '',
  mrz: '',
};

/**
 * El navegador solo da coordenadas; la dirección (geocodificación inversa) y la
 * distancia contra el domicilio del documento las completa el backend.
 */
const buildGpsData = (geo: GeoLocationData | null): GpsData | null => {
  if (!geo) return null;
  return {
    latitud: geo.latitude,
    longitud: geo.longitude,
    ubicacion: '',
    areaAdministrativa: '',
    codigoPais: '',
    nombrePais: '',
    localidad: '',
    codigoPostal: '',
    subAreaAdministrativa: '',
    subLocalidad: '',
    subNumeroCalle: '',
    calle: '',
    distanciaGeolocalizacionID: '',
  };
};

export interface BuildPayloadInput {
  documento: DocumentoLabel;
  /** null mientras la geolocalización siga desactivada. */
  geo: GeoLocationData | null;
  capturas: CaptureMap;
}

export const buildVerificationPayload = async ({
  documento,
  geo,
  capturas,
}: BuildPayloadInput): Promise<VerificationPayload> => {
  const { dispositivo, telemetria } = await collectDeviceSnapshot();

  const base = {
    motorocr: MOTOR_OCR,
    gpsData: buildGpsData(geo),
    dispositivo,
    telemetria,
    // Viene del OCR (municipio del domicilio)
    localidad: '',
    capturas,
  };

  return {
    success: true,
    message: 'Información obtenida',
    data:
      documento === 'INE'
        ? { Documento: 'INE', ...EMPTY_INE_OCR, ...base }
        : { Documento: documento, ...base },
  };
};
