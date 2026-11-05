# MF OCR · Prueba de captura

Prueba de captura de **INE** (frente y reverso) y de **documentos** (comprobante o factura).
La cámara endereza la tarjeta o aplana la hoja. El tipo de documento lo decide el texto que
devuelve el OCR, no el interruptor de la pantalla.

```bash
npm install
cp .env.example .env.local   # pon el token; el archivo no se sube a git
npm run dev                  # https://localhost:3015 — en el teléfono: https://<IP-de-la-PC>:3015
```

Reinicia `npm run dev` si cambias `.env.local`. Vite solo lee esas variables al arrancar.

En desarrollo el navegador no llama al OCR directo (el API no responde el preflight de CORS).
La app hace `POST /ocr-api/` en el mismo origen y Vite lo reenvía a `VITE_OCR_API_URL`.

## Estructura

```
src/
  App.tsx          Flujo: permiso → cámara → revisión → OCR → payload
  components/      Pantallas y piezas de la UI
  hooks/           Permiso de cámara y captura automática de INE
  vision/          OpenCV: encuadre de INE, aplanado de documentos, recorte al marco
  ocr/             Cliente del API y clasificación del texto
  flow/            Intentos y siguiente paso (reverso, listo, reintentar)
  session/         Texto del OCR en localStorage
  payload/         JSON final (consola y localStorage; no se reenvía al OCR)
  shared/          Utilidades de imagen y colores
  types/           Tipos compartidos
```

El detalle del flujo, del proxy y del JSON está en `docs/proceso-de-desarrollo.md`.
