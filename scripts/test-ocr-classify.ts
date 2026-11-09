/**
 * Comprueba la clasificación contra textos de ejemplo (no son documentos reales).
 *   npx esbuild scripts/test-ocr-classify.ts --bundle --platform=node --format=esm --outfile=dev-fixtures/out/test-ocr.mjs && node dev-fixtures/out/test-ocr.mjs
 */

import { classifyOcrText, mergeIneReads } from '../src/ocr/classifyDocument';
import { decideCapture } from '../src/flow/decideCapture';

const INE_FRONT = `INSTITUTO NACIONAL ELECTORAL
MEXICO
CREDENCIAL PARA VOTAR
NOMBRE
SEXO H
GARCIA
LOPEZ
ANDRES
DOMICILIO
AV REFORMA S/N
PBLO CENTRO 01000
BENITO JUAREZ, CDMX
CLAVE DE ELECTOR GALXAN80010101H000
CURP
ANO DE REGISTRO
GALP800101HDFRZN09
2015 02
FECHA DE NACIMIENTO SECCION VIGENCIA
01/01/1980
1234
2023 - 2033`;

const INE_BACK = `INE
INSTITUTO NACIONAL ELECTORAL
IDMEX1234567890<<1234101234567
8001012H3312315MEX<02<<00000<0
GARCIA<LOPEZ<<ANDRES<<<<<<<<<<`;

const LICENSE = `ESTADOS UNIDOS MEXICANOS
LICENCIA PARA CONDUCIR
ANDRES GARCIA LOPEZ
VIGENCIA
PERMANENTE`;

const CFE = `CFE
Comisión Federal de Electricidad
TOTAL A PAGAR:
LOPEZ RUIZ ANA
CALLE FALSA 123 CP.01000
$100
CENTRO. C.P. 01000
(CIEN PESOS
BENITO JUAREZ CDMX.
M.N.)
NO. DE SERVICIO : 000000000001
RFC: CFE370814QI0
LÍMITE DE PAGO: 01 ENE 2026
PERIODO FACTURADO: 01 ENE 26 01 FEB 26
Total
$100.00`;

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
  check('nombres', front.ine.nombres === 'ANDRES', front.ine.nombres);
  check('paterno', front.ine.apellidoPaterno === 'GARCIA', front.ine);
  check('materno', front.ine.apellidoMaterno === 'LOPEZ');
  check('curp', front.ine.curp === 'GALP800101HDFRZN09', front.ine.curp);
  check('clave', front.ine.claveElector === 'GALXAN80010101H000');
  check('sexo', front.ine.sexo === 'H');
  check('cp', front.ine.codigoPostal === '01000', front.ine.codigoPostal);
  check('municipio', front.ine.municipio === 'BENITO JUAREZ', front.ine.municipio);
  check('calle', front.ine.calle === 'AV REFORMA', front.ine.calle);
  check('nacimiento', front.ine.fechaNacimiento === '01/01/1980');
  check('vigencia', front.ine.fechaExpiracion === '2023-2033', front.ine.fechaExpiracion);
  check('registro', front.ine.annoRegistro === '2015' && front.ine.numeroEmision === '02', front.ine);
}

const back = classifyOcrText(INE_BACK);
check('reverso es INE', back.kind === 'ine-reverso', back.kind);
if (front.kind === 'ine-frente' && back.kind === 'ine-reverso') {
  check('cic', back.back.cic === '1234567890', back.back.cic);
  check('mrz', back.back.mrz.includes('IDMEX1234567890'));
  const merged = mergeIneReads(front.ine, back.back);
  check('merge cic', merged.cic === '1234567890');
  check('merge no pisa vigencia', merged.fechaExpiracion === '2023-2033', merged.fechaExpiracion);
  check('merge nacimiento mrz si faltara', back.back.complemento.fechaNacimiento === '01/01/1980', back.back.complemento);
  check('merge expiry mrz', back.back.complemento.fechaExpiracion === '31/12/2033', back.back.complemento.fechaExpiracion);
}

check('licencia', classifyOcrText(LICENSE).kind === 'licencia');
check('metro', classifyOcrText('VP').kind === 'desconocido');

const cfe = classifyOcrText(CFE);
check('cfe es comprobante', cfe.kind === 'comprobante', cfe.kind);
if (cfe.kind === 'comprobante') {
  check('proveedor', cfe.data.proveedor === 'CFE');
  check('titular', cfe.data.nombreTitular === 'LOPEZ RUIZ ANA', cfe.data.nombreTitular);
  check('servicio', cfe.data.numeroServicio === '000000000001', cfe.data.numeroServicio);
  check('total', cfe.data.totalAPagar === '100.00', cfe.data.totalAPagar);
  check('rfc', cfe.data.rfcEmisor === 'CFE370814QI0', cfe.data.rfcEmisor);
  check('limite', cfe.data.limitePago === '01 ENE 2026', cfe.data.limitePago);
  check('numero exterior', cfe.data.numeroExterior === '123', cfe.data);
  check('localidad', cfe.data.localidad === 'CENTRO', cfe.data.localidad);
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
