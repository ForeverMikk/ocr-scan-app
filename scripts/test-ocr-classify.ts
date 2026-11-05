/**
 * Comprueba la clasificación contra las lecturas reales del OCR.
 *   npx esbuild scripts/test-ocr-classify.ts --bundle --platform=node --format=esm --outfile=dev-fixtures/out/test-ocr.mjs && node dev-fixtures/out/test-ocr.mjs
 */

import { classifyOcrText, mergeIneReads } from '../src/ocr/classifyDocument';
import { decideCapture } from '../src/flow/decideCapture';

const INE_FRONT = `& UNIDOS *
INSTITUTO NACIONAL ELECTORAL
MEXICO
CREDENCIAL PARA VOTAR
NOMBRE
SEXO H
MOLINA
PEREZ
MICHAEL
DOMICILIO
AV 5 DE MAYO S/N
PBLO SAN BARTOLO CUAUTLALPAN 55630
ZUMPANGO, MEX.
CLAVE DE ELECTOR MLPRMC97060615H500
CURP
ANO DE REGISTRO
My
MOPM970606HMCLRC01
2015 02
FECHA DE NACIMIENTO SECCION VIGENCIA
06/06/1997
5902
2023 - 2033`;

const INE_BACK = `RONER
24
INE
C003422
MIGUES ANGEL PATISO ARROYO
ENCARGADO DEL DESPACHO DE
LA SECRE ARA E/ECUTIVA DEL
INSTITUTO NACIONAL ELECTORAL
IDMEX2481262753<<5902103244917
9706062H3312315MEX<02<<16074<7
MOLINA<PEREZ<<MICHAEL<<<<<<<<<`;

const LICENSE = `ESTADOS UNIDOS MEXICANOS
GOBIERNO DE LA CIUDAD DE MEXICO
SECRETARIA DE MOVILIDAD
LICENCIA PARA CONDUCIR
MICHAEL MOLINA PEREZ
CURP
MOPM970606HMCLRC01
VIGENCIA
PERMANENTE`;

const CFE = `CFE
Comisión Federal de Electricidad
TOTAL A PAGAR:
PEREZ GARCIA DELIA PIEDAD
CALLEJON SIN NOMBRE 9 CP.55630
$749
SAN BARTOLO CUAUTLALPAN. C.P. 55630
(SETECIENTOS CUARENTA Y NUEVE PESOS
SAN BARTOLO CUAUTLAL MEX.
M.N.)
NO. DE SERVICIO : 568160802924
RFC: CFE370814QI0
LÍMITE DE PAGO: 07 AGO 2026
PERIODO FACTURADO: 18 MAY 26 20 JUL 26
Total
$749.66`;

const FACTURA = `Factura de abono
Datos del cliente
EMPRESA B, S.L.
EMPRESA A, S.L.
CIF/NIF B43214321
CIF/NIF B12341234
N° factura
Fecha
Cliente
Pág
2020123
08/07/2024
200
1
Total factura
-39,41
-8,27
0,00
-47,68`;

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) {
    console.log('ok', name);
    return;
  }
  failed += 1;
  console.error('FAIL', name, detail ?? '');
};

const front = classifyOcrText(INE_FRONT);
check('frente es INE', front.kind === 'ine-frente', front.kind);
if (front.kind === 'ine-frente') {
  check('nombres', front.ine.nombres === 'MICHAEL', front.ine.nombres);
  check('paterno', front.ine.apellidoPaterno === 'MOLINA', front.ine);
  check('materno', front.ine.apellidoMaterno === 'PEREZ');
  check('curp', front.ine.curp === 'MOPM970606HMCLRC01', front.ine.curp);
  check('clave', front.ine.claveElector === 'MLPRMC97060615H500');
  check('sexo', front.ine.sexo === 'H');
  check('cp', front.ine.codigoPostal === '55630', front.ine.codigoPostal);
  check('municipio', front.ine.municipio === 'ZUMPANGO', front.ine.municipio);
  check('calle', front.ine.calle === 'AV 5 DE MAYO', front.ine.calle);
  check('nacimiento', front.ine.fechaNacimiento === '06/06/1997');
  check('vigencia', front.ine.fechaExpiracion === '2023-2033', front.ine.fechaExpiracion);
  check('registro', front.ine.annoRegistro === '2015' && front.ine.numeroEmision === '02', front.ine);
}

const back = classifyOcrText(INE_BACK);
check('reverso es INE', back.kind === 'ine-reverso', back.kind);
if (front.kind === 'ine-frente' && back.kind === 'ine-reverso') {
  check('cic', back.back.cic === '2481262753', back.back.cic);
  check('mrz', back.back.mrz.includes('IDMEX2481262753'));
  const merged = mergeIneReads(front.ine, back.back);
  check('merge cic', merged.cic === '2481262753');
  check('merge no pisa vigencia', merged.fechaExpiracion === '2023-2033', merged.fechaExpiracion);
  check('merge nacimiento mrz si faltara', back.back.complemento.fechaNacimiento === '06/06/1997', back.back.complemento);
  check('merge expiry mrz', back.back.complemento.fechaExpiracion === '31/12/2033', back.back.complemento.fechaExpiracion);
}

check('licencia', classifyOcrText(LICENSE).kind === 'licencia');
check('metro', classifyOcrText('VP').kind === 'desconocido');

const cfe = classifyOcrText(CFE);
check('cfe es comprobante', cfe.kind === 'comprobante', cfe.kind);
if (cfe.kind === 'comprobante') {
  check('proveedor', cfe.data.proveedor === 'CFE');
  check('titular', cfe.data.nombreTitular === 'PEREZ GARCIA DELIA PIEDAD', cfe.data.nombreTitular);
  check('servicio', cfe.data.numeroServicio === '568160802924', cfe.data.numeroServicio);
  check('total', cfe.data.totalAPagar === '749.66', cfe.data.totalAPagar);
  check('rfc', cfe.data.rfcEmisor === 'CFE370814QI0', cfe.data.rfcEmisor);
  check('limite', cfe.data.limitePago === '07 AGO 2026', cfe.data.limitePago);
  check('numero exterior', cfe.data.numeroExterior === '9', cfe.data);
  check('localidad', cfe.data.localidad === 'SAN BARTOLO CUAUTLALPAN', cfe.data.localidad);
}

const factura = classifyOcrText(FACTURA);
check('factura', factura.kind === 'factura', factura.kind);
if (factura.kind === 'factura') {
  check('folio', factura.data.numeroFactura === '2020123', factura.data.numeroFactura);
  check('fecha', factura.data.fecha === '08/07/2024', factura.data.fecha);
  check('total factura', factura.data.total === '-47,68', factura.data.total);
  check('receptor', factura.data.receptor.includes('EMPRESA B'), factura.data.receptor);
  check('emisor', factura.data.emisor.includes('EMPRESA A'), factura.data.emisor);
}

const licenseTry = decideCapture('primero', classifyOcrText(LICENSE), 0);
check('licencia reintenta', licenseTry.action === 'reintentar' && licenseTry.attemptsUsed === 1);
const third = decideCapture('primero', classifyOcrText('VP'), 2);
check('tercer intento agota', third.action === 'reintentar' && third.agotado);
const toBack = decideCapture('primero', front, 1);
check('frente pide reverso y no gasta intento', toBack.action === 'reverso');
const backOk = decideCapture('reverso', back, 0);
check('reverso listo', backOk.action === 'listo' && backOk.documento === 'INE');
const cfeOk = decideCapture('primero', cfe, 2);
check('comprobante listo aunque haya intentos previos', cfeOk.action === 'listo' && cfeOk.documento === 'Comprobante');

if (failed) {
  console.error(failed, 'fallos');
  process.exit(1);
}
console.log('clasificación ok');
