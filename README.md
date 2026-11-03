# MF OCR · Prueba de captura

Prueba de captura de **INE** (frente y reverso, disparo manual o detección automática con OpenCV)
y **documentos** (Comprobante / Factura, con aplanado tipo Office Lens o subir imagen/PDF).

```bash
npm install
npm run dev   # https://localhost:3015 — en el teléfono: https://<IP-de-la-PC>:3015
```

## Estructura

```
src/
  App.tsx       Flujo: permiso → cámara → revisión → payload
  components/   Pantallas y piezas de la UI
  hooks/        Permiso de cámara y captura automática de INE
  vision/       OpenCV: detector de INE, aplanado de documentos, recorte al marco
  payload/      Armado del JSON para la API de OCR
  shared/       Utilidades de imagen y colores
  types/        Tipos compartidos
```
