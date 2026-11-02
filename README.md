# MF OCR · Captura de documentos

Web app (React + Vite + TypeScript) que captura con la cámara del teléfono la **INE**
(frente y reverso) y **documentos** (Comprobante / Factura), y arma el payload para la API de OCR.

- **INE:** marco con proporción ID-1. Disparo manual o detección automática (casilla sobre el
  obturador): OpenCV detecta la tarjeta, valida encuadre, nitidez, reflejos y lado, y dispara
  cuando está quieta. La foto final se endereza a 1586×1000.
- **Documento:** disparo manual, aplanado opcional tipo Office Lens (jscanify) o subir imagen/PDF.

## Uso

```bash
npm install
npm run dev        # https://localhost:3015 (HTTPS: el teléfono lo necesita para la cámara)
```

En el teléfono abre `https://<IP-de-la-PC>:3015` y acepta el certificado de desarrollo.

| Script                 | Qué hace                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Servidor de desarrollo (muestra métricas del detector)     |
| `npm run build`        | Revisión de tipos + build de producción en `dist/`         |
| `npm run typecheck`    | Solo revisión de tipos (`src/` y `scripts/`)               |
| `npm run lint`         | ESLint                                                     |
| `npm run format`       | Formatea todo con Prettier                                 |
| `npm run test:ine`     | Calibración del detector de INE con fotos (Node, sin cámara) |

## Estructura

```
src/
  App.tsx                 Flujo: permiso → cámara → revisión → payload (solo estado y conexiones)
  components/             UI: PermissionGate, CameraView, GuideFrame, CaptureControls,
                          IneDetectionStatus, ReviewView, ModeSwitch, ShutterButton
  hooks/
    useCameraPermission   Permiso de cámara (geolocalización comentada, lista para activarse)
    useIneAutoCapture     Bucle de detección de INE y disparo automático
  vision/                 Todo lo de OpenCV / imagen
    loaders/              Carga de OpenCV.js y jscanify como <script>
    ine/ineCardDetector   Núcleo del detector (puro, sin DOM: corre también en Node)
    ine/ineCameraAnalyzer Puente navegador ↔ detector (video, canvas, data URLs)
    document/             Aplanado de documentos (jscanify)
    guideFrame/           Mapeo del marco en pantalla a píxeles del video y recorte
    processCameraShot     Foto → imagen final (INE enderezada / documento aplanado)
  payload/                Armado y envío del JSON (dispositivo, telemetría, GPS, capturas)
  shared/                 Utilidades de imagen y tema (colores, botones)
  types/                  Tipos del dominio (capturas, payload, geometría)
scripts/test-ine-detector.ts   Calibración del detector
dev-fixtures/ine/              Fotos de muestra (real/ está en .gitignore: datos personales)
```

### Reglas de dependencia

- `types/` y `shared/` no importan de otras carpetas de la app (son la base).
- `vision/ine/ineCardDetector.ts` no toca el DOM ni importa assets de Vite (`?url`):
  así lo puede usar el script de Node.
- `components/` solo reciben props; el estado del flujo vive en `App.tsx` y los hooks.

## Notas técnicas

- **OpenCV.js** se carga como `<script>` y se espera a `cv.Mat`: el objeto `cv` tiene su propio
  `then`, así que nunca debe resolverse dentro de una Promise (se cuelga).
- **jscanify** es UMD; importado como módulo ES truena, por eso también se carga como `<script>`
  (ver `vite.config.ts`).
- **Geolocalización** está comentada (en PC da timeout); el payload ya trae `gpsData: null`.
