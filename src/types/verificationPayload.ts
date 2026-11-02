/**
 * Forma del objeto de verificación (referencia actual; puede cambiar a futuro).
 *
 * Los campos de OCR los llena el motor OCR / backend. Desde el front se envían vacíos
 * junto con las capturas, la ubicación, el dispositivo y la telemetría.
 */

import type { ScanResult } from '../services/scannerService';
import type { CaptureSide } from './capture';

export type DocumentoLabel = 'INE' | 'Factura' | 'Comprobante';

/** Datos extraídos de la INE por el OCR. */
export interface IneOcrData {
  nombre: string;
  nombre2: string;
  nombreCompleto: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  direccion: string;
  calle: string;
  codigoPostal: string;
  estado: string;
  municipio: string;
  codigoPais: string;
  colonia: string;
  numeroExterior: string;
  numeroInterior: string;
  codigoEstado: string;
  calleNombre: string;
  curp: string;
  claveElector: string;
  cic: string;
  folio: string;
  sexo: string;
  annoEmision: string;
  numeroEmision: string;
  annoRegistro: string;
  fechaExpiracion: string;
  fechaNacimiento: string;
  mrz: string;
}

export interface GpsData {
  latitud: number;
  longitud: number;
  // Dirección: se obtiene por geocodificación inversa (backend)
  ubicacion: string;
  areaAdministrativa: string;
  codigoPais: string;
  nombrePais: string;
  localidad: string;
  codigoPostal: string;
  subAreaAdministrativa: string;
  subLocalidad: string;
  subNumeroCalle: string;
  calle: string;
  /** Distancia (m) entre el GPS y el domicilio del documento; la calcula el backend. */
  distanciaGeolocalizacionID: string;
}

export interface DispositivoData {
  /** El navegador no puede conocer su IP pública; la asigna el backend desde la petición. */
  ipAddress: string;
  /** Huella del dispositivo (32 hex) a partir de rasgos estables del navegador. */
  hash: string;
  tipoDispositivo: 'WEBAPP';
  osVersion: string;
  Navegador: string;
}

export interface VelocidadRed {
  kbps: number | null;
  mbps: number | null;
  metodo: 'navigator-connection' | 'no-disponible';
}

export interface TelemetriaData {
  modeloDispositivo: string;
  tipoRed: string;
  versionNavegador: string;
  sistemaOperativo: string;
  gpuRenderer: string;
  nucleosCPU: number | null;
  memoriaGB: number | null;
  resolucionPantalla: string;
  touchPoints: number;
  velocidadRed: VelocidadRed;
  sdkVersion: string;
}

/** Bloque común a todos los documentos. */
interface VerificationDataBase {
  Documento: DocumentoLabel;
  motorocr: string;
  gpsData: GpsData | null;
  dispositivo: DispositivoData;
  telemetria: TelemetriaData;
  localidad: string;
  /** Imágenes confirmadas por el usuario (no viene en la referencia; las necesita el OCR). */
  capturas: Partial<Record<CaptureSide, ScanResult>>;
}

/** INE: incluye todos los campos de OCR. */
export type IneVerificationData = VerificationDataBase & IneOcrData & { Documento: 'INE' };

/** Factura / Comprobante: sus campos de OCR se definirán más adelante. */
export type DocumentVerificationData = VerificationDataBase & {
  Documento: 'Factura' | 'Comprobante';
};

export interface VerificationPayload {
  success: boolean;
  message: string;
  data: IneVerificationData | DocumentVerificationData;
}
