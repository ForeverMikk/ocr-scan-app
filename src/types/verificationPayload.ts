/**
 * Forma del objeto de verificación (referencia actual; puede cambiar a futuro).
 *
 * El texto lo devuelve el OCR; el front lo clasifica y llena los campos del documento.
 * Las capturas, la ubicación, el dispositivo y la telemetría se arman aquí.
 */

export type DocumentoLabel = 'INE' | 'Factura' | 'Comprobante';

/**
 * JPEG listo para el OCR: base64 puro, sin el prefijo `data:image/jpeg;base64,`.
 * Se guardan las dos versiones de cada toma (recorte de cámara y tarjeta enderezada).
 */
export interface ApiImage {
  original: string;
  processed: string;
}

/** INE: las dos caras, cada una con original + procesada. */
export interface IneCapturasPayload {
  frente: ApiImage;
  reverso: ApiImage;
}

/** Comprobante / Factura: una sola imagen. */
export interface DocumentoCapturasPayload {
  documento: ApiImage;
}

export type CapturasPayload = IneCapturasPayload | DocumentoCapturasPayload;

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
  /** Imágenes confirmadas, en base64. INE lleva frente y reverso. */
  capturas: CapturasPayload;
}

/** INE: campos de la credencial más el texto crudo de cada cara. */
export type IneVerificationData = VerificationDataBase &
  IneOcrData & {
    Documento: 'INE';
    textoOcrFrente: string;
    textoOcrReverso: string;
  };

/** Recibo de servicio (CFE, agua, teléfono…). El texto crudo siempre se conserva. */
export interface ComprobanteOcrData {
  proveedor: string;
  nombreTitular: string;
  direccion: string;
  calle: string;
  numeroExterior: string;
  colonia: string;
  codigoPostal: string;
  localidad: string;
  estado: string;
  totalAPagar: string;
  numeroServicio: string;
  rfcEmisor: string;
  limitePago: string;
  periodoFacturado: string;
  textoOcr: string;
}

/**
 * Factura. El ejemplo que se probó no es un CFDI mexicano; estos campos cubren
 * ese ejemplo y un CFDI (UUID, RFC, folio).
 */
export interface FacturaOcrData {
  tipoComprobante: string;
  emisor: string;
  receptor: string;
  rfcEmisor: string;
  rfcReceptor: string;
  numeroFactura: string;
  fecha: string;
  total: string;
  uuid: string;
  textoOcr: string;
}

export type DocumentVerificationData =
  | (VerificationDataBase & ComprobanteOcrData & { Documento: 'Comprobante' })
  | (VerificationDataBase & FacturaOcrData & { Documento: 'Factura' });

export interface VerificationPayload {
  success: boolean;
  message: string;
  data: IneVerificationData | DocumentVerificationData;
}
