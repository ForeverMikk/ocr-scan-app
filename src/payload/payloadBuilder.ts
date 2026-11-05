import { collectDeviceSnapshot } from './deviceInfo';
import { dataUrlToBase64 } from '../shared/image';
import type { CaptureMap, GeoLocationData, ScanResult } from '../types/capture';
import type {
  ApiImage,
  CapturasPayload,
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

const toApiImage = (scan: ScanResult): ApiImage => ({
  original: dataUrlToBase64(scan.originalDataUrl),
  processed: dataUrlToBase64(scan.processedDataUrl),
});

/** INE exige frente y reverso; el resto, una sola toma. */
const toCapturasPayload = (documento: DocumentoLabel, capturas: CaptureMap): CapturasPayload => {
  if (documento === 'INE') {
    if (!capturas.front || !capturas.back) {
      throw new Error('Faltan el frente o el reverso de la INE');
    }
    return { frente: toApiImage(capturas.front), reverso: toApiImage(capturas.back) };
  }
  if (!capturas.single) throw new Error('Falta la imagen del documento');
  return { documento: toApiImage(capturas.single) };
};

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
    capturas: toCapturasPayload(documento, capturas),
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
