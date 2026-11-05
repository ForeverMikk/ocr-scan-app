import { collectDeviceSnapshot } from './deviceInfo';
import { dataUrlToBase64 } from '../shared/image';
import type { CaptureMap, GeoLocationData, ScanResult } from '../types/capture';
import type {
  ApiImage,
  CapturasPayload,
  ComprobanteOcrData,
  DocumentoLabel,
  FacturaOcrData,
  GpsData,
  IneOcrData,
  VerificationPayload,
} from '../types/verificationPayload';

/** Motor OCR a usar (el backend define el catálogo). */
const MOTOR_OCR = '1';

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
  /** INE ya fusionada (frente + reverso) y los textos crudos de cada cara. */
  ine?: { ocr: IneOcrData; textoOcrFrente: string; textoOcrReverso: string };
  comprobante?: ComprobanteOcrData;
  factura?: FacturaOcrData;
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
  ine,
  comprobante,
  factura,
}: BuildPayloadInput): Promise<VerificationPayload> => {
  const { dispositivo, telemetria } = await collectDeviceSnapshot();

  const localidad =
    documento === 'INE'
      ? (ine?.ocr.municipio ?? '')
      : documento === 'Comprobante'
        ? (comprobante?.localidad ?? '')
        : '';

  const base = {
    motorocr: MOTOR_OCR,
    gpsData: buildGpsData(geo),
    dispositivo,
    telemetria,
    localidad,
    capturas: toCapturasPayload(documento, capturas),
  };

  if (documento === 'INE') {
    if (!ine) throw new Error('Falta la lectura de la INE');
    return {
      success: true,
      message: 'Información obtenida',
      data: {
        Documento: 'INE',
        ...ine.ocr,
        textoOcrFrente: ine.textoOcrFrente,
        textoOcrReverso: ine.textoOcrReverso,
        ...base,
      },
    };
  }

  if (documento === 'Comprobante') {
    if (!comprobante) throw new Error('Falta la lectura del comprobante');
    return {
      success: true,
      message: 'Información obtenida',
      data: { Documento: 'Comprobante', ...comprobante, ...base },
    };
  }

  if (!factura) throw new Error('Falta la lectura de la factura');
  return {
    success: true,
    message: 'Información obtenida',
    data: { Documento: 'Factura', ...factura, ...base },
  };
};
