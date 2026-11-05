/**
 * La API de OCR no dice qué documento es: devuelve el texto y aquí se clasifica.
 *
 * Afinado con lecturas reales de INE (frente y reverso), licencia, tarjeta del
 * metro ("VP"), recibo de CFE y una factura de ejemplo (no es un CFDI).
 */

import type {
  ComprobanteOcrData,
  FacturaOcrData,
  IneOcrData,
} from '../types/verificationPayload';

export interface IneBackRead {
  textoOcr: string;
  mrz: string;
  cic: string;
  folio: string;
  /** Lo que el MRZ puede completar si el frente no lo trajo. */
  complemento: Partial<IneOcrData>;
}

export type OcrClassification =
  | { kind: 'ine-frente'; ine: IneOcrData; textoOcr: string }
  | { kind: 'ine-reverso'; back: IneBackRead }
  | { kind: 'comprobante'; data: ComprobanteOcrData }
  | { kind: 'factura'; data: FacturaOcrData }
  | { kind: 'licencia'; textoOcr: string }
  | { kind: 'desconocido'; textoOcr: string };

const emptyIne = (): IneOcrData => ({
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
});

const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const linesOf = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const CURP_RE = /\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/;
const RFC_RE = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/;
const UUID_RE = /\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/;
const DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/;

const isIneFront = (folded: string): boolean =>
  folded.includes('CREDENCIAL PARA VOTAR') ||
  (folded.includes('INSTITUTO NACIONAL ELECTORAL') && folded.includes('CLAVE DE ELECTOR'));

const isIneBack = (folded: string): boolean => /IDMEX\d{9,}/.test(folded.replace(/\s/g, ''));

const isLicense = (folded: string): boolean => folded.includes('LICENCIA PARA CONDUCIR');

const isFactura = (folded: string): boolean =>
  /\bFACTURA\b/.test(folded) ||
  folded.includes('CFDI') ||
  folded.includes('FOLIO FISCAL') ||
  UUID_RE.test(folded);

const COMPROBANTE_MARKERS = [
  'COMISION FEDERAL DE ELECTRICIDAD',
  'CFE',
  'TELMEX',
  'TELCEL',
  'TOTALPLAY',
  'MEGACABLE',
  'NATURGY',
  'IZZI',
  'NO. DE SERVICIO',
  'NO DE SERVICIO',
  'LIMITE DE PAGO',
  'COMPROBANTE DE DOMICILIO',
  'RECIBO',
];

const isComprobante = (folded: string): boolean =>
  COMPROBANTE_MARKERS.some((marker) => folded.includes(marker));

const afterLabel = (lines: string[], label: RegExp): string => {
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(label);
    if (!match) continue;
    const inline = match[1]?.trim();
    if (inline) return inline;
    return lines[i + 1]?.trim() ?? '';
  }
  return '';
};

const parseStreet = (line: string): { calle: string; numeroExterior: string } => {
  const sn = line.match(/^(.*?)(?:\s+S\/N)\s*$/i);
  if (sn) return { calle: sn[1].trim(), numeroExterior: 'S/N' };
  const number = line.match(/^(.*?)(?:\s+)(\d+[A-Z]?)\s*$/i);
  if (number && /[A-ZÁÉÍÓÚÑ]/i.test(number[1])) {
    return { calle: number[1].trim(), numeroExterior: number[2] };
  }
  return { calle: line.trim(), numeroExterior: '' };
};

const parseIneFront = (text: string): IneOcrData => {
  const ine = emptyIne();
  const lines = linesOf(text);
  const foldedLines = lines.map(fold);
  const folded = fold(text);

  const sexo = folded.match(/\bSEXO\s+([HM])\b/);
  if (sexo) ine.sexo = sexo[1];

  const clave = folded.match(/CLAVE DE ELECTOR\s+([A-Z0-9]+)/);
  if (clave) ine.claveElector = clave[1];

  const curp = folded.match(CURP_RE);
  if (curp) ine.curp = curp[1];

  const nacimiento = text.match(DATE_RE);
  if (nacimiento) ine.fechaNacimiento = nacimiento[1];

  const vigencia = folded.match(/\b((?:19|20)\d{2})\s*-\s*((?:19|20)\d{2})\b/);
  if (vigencia) ine.fechaExpiracion = `${vigencia[1]}-${vigencia[2]}`;

  const registroLine = foldedLines.find((line) => /^(?:19|20)\d{2}\s+\d{2}$/.test(line));
  if (registroLine) {
    const [anio, emision] = registroLine.split(/\s+/);
    ine.annoRegistro = anio;
    ine.numeroEmision = emision;
  }

  const nombreAt = foldedLines.findIndex((line) => line === 'NOMBRE' || line.startsWith('NOMBRE '));
  const domicilioAt = foldedLines.findIndex((line) => line === 'DOMICILIO' || line.startsWith('DOMICILIO '));
  if (nombreAt !== -1 && domicilioAt > nombreAt) {
    const nameLines = lines.slice(nombreAt + 1, domicilioAt).filter((line) => {
      const foldedLine = fold(line);
      if (/^SEXO\b/.test(foldedLine)) return false;
      if (/\d/.test(foldedLine)) return false;
      return /^[A-ZÑ][A-ZÑ\s'.-]+$/.test(foldedLine);
    });
    if (nameLines.length >= 3) {
      ine.apellidoPaterno = nameLines[0];
      ine.apellidoMaterno = nameLines[1];
      ine.nombres = nameLines.slice(2).join(' ');
    } else if (nameLines.length === 2) {
      ine.apellidoPaterno = nameLines[0];
      ine.nombres = nameLines[1];
    } else if (nameLines.length === 1) {
      ine.nombres = nameLines[0];
    }
    ine.nombre = ine.nombres;
    ine.nombreCompleto = [ine.nombres, ine.apellidoPaterno, ine.apellidoMaterno].filter(Boolean).join(' ');
  }

  if (domicilioAt !== -1) {
    const addressLines: string[] = [];
    for (const line of lines.slice(domicilioAt + 1)) {
      const foldedLine = fold(line);
      if (
        foldedLine.startsWith('CLAVE DE ELECTOR') ||
        foldedLine === 'CURP' ||
        foldedLine.startsWith('CURP ') ||
        foldedLine.startsWith('ANO DE REGISTRO') ||
        foldedLine.startsWith('FECHA DE NACIMIENTO')
      ) {
        break;
      }
      addressLines.push(line);
    }
    ine.direccion = addressLines.join(', ');
    if (addressLines[0]) {
      const street = parseStreet(addressLines[0]);
      ine.calle = street.calle;
      ine.calleNombre = street.calle;
      ine.numeroExterior = street.numeroExterior;
    }
    const postal = ine.direccion.match(/\b(\d{5})\b/);
    if (postal) ine.codigoPostal = postal[1];
    const place = addressLines.find((line) => /,\s*[A-Z]{2,}\.?$/i.test(fold(line)));
    if (place) {
      const [municipio, estado] = place.split(',');
      ine.municipio = municipio.trim().replace(/\.$/, '');
      ine.estado = (estado ?? '').trim().replace(/\.$/, '');
      ine.codigoEstado = ine.estado;
      if (ine.estado === 'MEX' || ine.estado === 'MEXICO') ine.codigoPais = 'MX';
    }
    const colonia = addressLines.find((line) => line !== addressLines[0] && line !== place);
    if (colonia) {
      ine.colonia = colonia.replace(/\s+\d{5}\s*$/, '').replace(/^PBLO\s+/i, '').trim();
    }
  }

  return ine;
};

const mrzLinesOf = (lines: string[]): string[] =>
  lines.filter((line) => {
    const compact = line.replace(/\s/g, '');
    if (/IDMEX\d/.test(compact)) return true;
    return compact.length >= 20 && /^[A-Z0-9<]+$/.test(compact) && compact.includes('<');
  });

/** Nacimiento: 97 → 1997. Vigencia: 33 → 2033 (las credenciales vigentes son de este siglo). */
const yymmddToDate = (yymmdd: string, kind: 'birth' | 'expiry'): string => {
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const current = new Date().getFullYear() % 100;
  const year = kind === 'expiry' ? 2000 + yy : yy > current ? 1900 + yy : 2000 + yy;
  return `${dd}/${mm}/${year}`;
};

const parseIneBack = (text: string): IneBackRead => {
  const lines = linesOf(text);
  const mrzLines = mrzLinesOf(lines);
  const mrz = mrzLines.join('\n');
  const compact = mrz.replace(/\s/g, '');
  const cicMatch = compact.match(/IDMEX(\d{9,13})/);
  const folioMatch = fold(text).match(/FOLIO\s*[:\s]\s*([A-Z0-9]+)/);

  const complemento: Partial<IneOcrData> = {};
  const names = mrzLines.find((line) => {
    const compact = line.replace(/\s/g, '');
    return compact.includes('<<') && !compact.includes('IDMEX') && !/\d/.test(compact);
  });
  if (names) {
    const [surnames, given = ''] = names.split('<<');
    const [paterno = '', materno = ''] = surnames.split('<');
    const nombres = given.replace(/<+$/g, '').replace(/</g, ' ').trim();
    if (paterno) complemento.apellidoPaterno = paterno.replace(/</g, '').trim();
    if (materno) complemento.apellidoMaterno = materno.replace(/</g, '').trim();
    if (nombres) {
      complemento.nombres = nombres;
      complemento.nombre = nombres;
    }
    complemento.nombreCompleto = [complemento.nombres, complemento.apellidoPaterno, complemento.apellidoMaterno]
      .filter(Boolean)
      .join(' ');
  }

  const meta = compact.match(/(\d{6})\d([HM])(\d{6})\d[A-Z]{3}<(\d{2})/);
  if (meta) {
    complemento.fechaNacimiento = yymmddToDate(meta[1], 'birth');
    complemento.sexo = meta[2];
    complemento.fechaExpiracion = yymmddToDate(meta[3], 'expiry');
    complemento.numeroEmision = meta[4];
  }

  return {
    textoOcr: text,
    mrz,
    cic: cicMatch?.[1] ?? '',
    folio: folioMatch?.[1] ?? '',
    complemento,
  };
};

const PROVIDERS: [RegExp, string][] = [
  [/COMISION FEDERAL DE ELECTRICIDAD|\bCFE\b/, 'CFE'],
  [/\bTELMEX\b/, 'TELMEX'],
  [/\bTELCEL\b/, 'TELCEL'],
  [/\bTOTALPLAY\b/, 'TOTALPLAY'],
  [/\bMEGACABLE\b/, 'MEGACABLE'],
  [/\bNATURGY\b/, 'NATURGY'],
  [/\bIZZI\b/, 'IZZI'],
];

const parseComprobante = (text: string): ComprobanteOcrData => {
  const lines = linesOf(text);
  const folded = fold(text);
  const foldedLines = lines.map(fold);
  const proveedor = PROVIDERS.find(([pattern]) => pattern.test(folded))?.[1] ?? lines[0] ?? '';

  const totalAt = foldedLines.findIndex((line) => line.startsWith('TOTAL A PAGAR'));
  let nombreTitular = '';
  const addressLines: string[] = [];
  if (totalAt !== -1) {
    for (const line of lines.slice(totalAt + 1)) {
      const foldedLine = fold(line);
      if (foldedLine.startsWith('NO. DE SERVICIO') || foldedLine.startsWith('NO DE SERVICIO')) break;
      if (/^\$/.test(line) || /^\(?[A-Z\s]+PESOS/.test(foldedLine) || /^M\.N/.test(foldedLine)) continue;
      if (!nombreTitular && /^[A-ZÑ][A-ZÑ\s.]+$/.test(foldedLine) && foldedLine.length > 5) {
        nombreTitular = line;
        continue;
      }
      if (nombreTitular) addressLines.push(line);
    }
  }

  const direccion = addressLines.join(', ');
  const streetSource = (addressLines[0] ?? '').replace(/\s*C\.?P\.?\s*:?\s*\d{5}\b\.?/gi, '').trim();
  const street = streetSource ? parseStreet(streetSource) : { calle: '', numeroExterior: '' };
  const postal = folded.match(/\bC\.?P\.?\s*:?\s*(\d{5})\b/) ?? direccion.match(/\b(\d{5})\b/);
  const localidadLine = addressLines.find((line) => /C\.?P\.?\s*:?\s*\d{5}/i.test(line) && line !== addressLines[0]);
  const estadoLine = addressLines.map(fold).find((line) => /\bMEX\b/.test(line));

  const amounts = [...text.matchAll(/\$\s*([\d]+(?:[.,]\d{1,2})?)/g)].map((match) => match[1]);
  const totalLine = lines.findIndex((line) => fold(line) === 'TOTAL');
  const totalAfterLabel = totalLine === -1 ? '' : (lines[totalLine + 1]?.match(/([\d]+(?:[.,]\d{1,2})?)/)?.[1] ?? '');

  const rfc = folded.match(/RFC:\s*([A-Z0-9]+)/);

  return {
    proveedor,
    nombreTitular,
    direccion,
    calle: street.calle,
    numeroExterior: street.numeroExterior,
    colonia: '',
    codigoPostal: postal?.[1] ?? '',
    localidad: (localidadLine ?? '').replace(/\.?\s*C\.?P\.?\s*:?\s*\d{5}.*/i, '').replace(/\.$/, '').trim(),
    estado: estadoLine && /\bMEX\b/.test(estadoLine) ? 'MEX' : '',
    totalAPagar: totalAfterLabel || amounts.at(-1) || amounts[0] || '',
    numeroServicio: afterLabel(lines, /NO\.?\s*DE SERVICIO\s*:?\s*(\d+)/i),
    rfcEmisor: rfc?.[1] ?? '',
    limitePago: afterLabel(lines, /L[IÍ]MITE DE PAGO:\s*(.*)/i),
    periodoFacturado: afterLabel(lines, /PERIODO FACTURADO:\s*(.*)/i),
    textoOcr: text,
  };
};

const companyLines = (lines: string[]): string[] =>
  lines.filter((line) => /\b(S\.?\s?L\.?|S\.?\s?A\.?|S\.A\. DE C\.V\.|SA DE CV)\b/i.test(line));

const parseFactura = (text: string): FacturaOcrData => {
  const lines = linesOf(text);
  const folded = fold(text);
  const tipo = lines.find((line) => /\bFACTURA\b/i.test(fold(line))) ?? '';
  const uuid = text.match(UUID_RE)?.[1] ?? '';
  const rfcs = [...folded.matchAll(new RegExp(RFC_RE.source, 'g'))].map((match) => match[1]);
  const fecha = text.match(DATE_RE)?.[1] ?? (text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? '');

  const labelAt = lines.findIndex((line) => /N[°ºo.]?\s*FACTURA/i.test(line));
  let numeroFactura = '';
  if (labelAt !== -1) {
    numeroFactura =
      lines.slice(labelAt + 1, labelAt + 8).find((line) => /^\d{3,}$/.test(line.replace(/\s/g, ''))) ?? '';
  }
  if (!numeroFactura) {
    numeroFactura = folded.match(/FOLIO(?:\s+FISCAL)?\s*[:\s]\s*([A-Z0-9-]+)/)?.[1] ?? '';
    if (numeroFactura === uuid) numeroFactura = folded.match(/\bFOLIO\s*[:\s]\s*([A-Z0-9-]+)/)?.[1] ?? '';
  }

  const totalLabel = lines.findIndex((line) => fold(line) === 'TOTAL FACTURA' || fold(line) === 'TOTAL');
  let total = '';
  if (totalLabel !== -1) {
    const nearby = lines.slice(totalLabel + 1, totalLabel + 6);
    const amounts = nearby.map((line) => line.match(/-?\d+[.,]\d{2}/)?.[0]).filter((value): value is string => Boolean(value));
    total = amounts.at(-1) ?? '';
  }
  if (!total) {
    total = folded.match(/TOTAL\s*[:\s]\s*\$?\s*(-?[\d.,]+)/)?.[1] ?? '';
  }

  const companies = companyLines(lines);
  const clienteAt = lines.findIndex((line) => fold(line).includes('DATOS DEL CLIENTE'));
  const receptor =
    clienteAt === -1
      ? (companies[1] ?? '')
      : (lines.slice(clienteAt + 1).find((line) => companies.includes(line)) ?? companies[0] ?? '');
  const emisor = companies.find((line) => line !== receptor) ?? companies[0] ?? '';

  return {
    tipoComprobante: tipo,
    emisor,
    receptor,
    rfcEmisor: rfcs[1] ?? rfcs[0] ?? '',
    rfcReceptor: rfcs.length > 1 ? rfcs[0] : '',
    numeroFactura,
    fecha,
    total,
    uuid,
    textoOcr: text,
  };
};

/** Clasifica el `resultado` del OCR. El orden evita que un recibo con RFC cuente como factura. */
export const classifyOcrText = (resultado: string): OcrClassification => {
  const text = resultado ?? '';
  const folded = fold(text);
  if (isIneFront(folded)) return { kind: 'ine-frente', ine: parseIneFront(text), textoOcr: text };
  if (isIneBack(folded)) return { kind: 'ine-reverso', back: parseIneBack(text) };
  if (isLicense(folded)) return { kind: 'licencia', textoOcr: text };
  if (isFactura(folded)) return { kind: 'factura', data: parseFactura(text) };
  if (isComprobante(folded)) return { kind: 'comprobante', data: parseComprobante(text) };
  return { kind: 'desconocido', textoOcr: text };
};

/** El reverso completa huecos del frente (MRZ, CIC) y no pisa lo que ya se leyó. */
export const mergeIneReads = (frente: IneOcrData, reverso: IneBackRead): IneOcrData => {
  const merged: IneOcrData = { ...frente, mrz: reverso.mrz };
  (Object.keys(reverso.complemento) as (keyof IneOcrData)[]).forEach((key) => {
    const value = reverso.complemento[key];
    if (!merged[key] && value) merged[key] = value;
  });
  if (reverso.cic) merged.cic = reverso.cic;
  if (!merged.folio && reverso.folio) merged.folio = reverso.folio;
  return merged;
};
