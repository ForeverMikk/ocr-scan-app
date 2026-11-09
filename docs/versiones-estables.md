# Versiones que vamos a dejar

Node **24.22.2** y React **18.3.1** se quedan como están. Son requisito. Esto es lo que yo dejaría en el resto de las librerías, para el tema del OCR, sin mover esas dos.

El OCR no lo instalamos nosotros. La foto se manda a un API (`src/ocr/ocrClient.ts`). Lo que sí está en el proyecto es la cámara, OpenCV para recortar y enderezar, y Vite para armar el build.

Las imágenes las lee el navegador: `Image`, el canvas y `FileReader` en `src/shared/image.ts`.

## Lo que hay instalado y lo que yo dejaría

| Librería | Hoy | La dejaría en | Por qué |
| --- | --- | --- | --- |
| `node` | `24.22.2` | **`24.22.2`** | Requisito. |
| `react` / `react-dom` | `18.3.1` | **`18.3.1`** | Requisito. |
| `@techstark/opencv-js` | `4.10.0-release.1` | **`4.12.0-release.1`** | Última de la 4.x (noviembre 2025). Sigue siendo `dist/opencv.js`, que es el archivo que ya cargamos. |
| `jscanify` | `1.4.3` | **`1.4.3`** | Última que hay (julio 2026). No salió una 1.5. |
| `react-webcam` | `7.2.0` | **`7.2.0`** | Última. Acepta React 16 para arriba, así que 18.3.1 entra. |
| `vite` | `8.3.5` | **`8.3.5`** | Node 24.22.2 le queda (`^20.19.0 \|\| >=22.12.0`). La 8.3.7 salió el mismo día que armé esto. |
| `@vitejs/plugin-react` | `6.1.2` | **`6.1.2`** | Pide Vite 8 y trabaja con React 18. La 6.3.0 salió el mismo día. |
| `@vitejs/plugin-basic-ssl` | `2.3.0` | **`2.3.0`** | Última. Sirve con Vite 6, 7 y 8. |
| `typescript` | `6.0.3` | **`6.0.3`** | Es el tope que acepta `typescript-eslint` 8 (`typescript < 6.1.0`). |
| `typescript-eslint` | `8.72.1` | **`8.72.1`** | Va con ESLint 10 y con TypeScript 6.0.3. |
| `eslint` | `10.13.0` | **`10.14.0`** | Parche de la misma línea. En `engines` ya trae Node `>= 24`. |
| `eslint-plugin-react-hooks` | `7.1.1` | **`7.1.1`** | Última. Acepta ESLint 10. |
| `eslint-plugin-react-refresh` | `0.5.7` | **`0.5.7`** | Última. Acepta ESLint 9 y 10. |
| `@eslint/js` | `10.0.1` | **`10.0.1`** | Última de la línea 10. |
| `globals` | `17.13.0` | **`17.14.0`** | Último parche. |
| `@types/react` | `18.3.12` | **`18.3.31`** | Últimos tipos de React 18. Los de la 19 son para React 19. |
| `@types/react-dom` | `18.3.1` | **`18.3.7`** | Últimos tipos de React DOM 18. |
| `@types/node` | `24.19.2` | **`24.19.2`** | Tipos de Node 24. Los `26.x` son de otra versión de Node. |

Vite `8.3.7`, `@vitejs/plugin-react` `6.3.0` y `typescript-eslint` `8.72.2` salieron el mismo día que armé esta lista. Me quedo con lo que ya tenemos corriendo.

## OpenCV

Me quedo en la 4, en `4.12.0-release.1`. Lleva como un año publicada y el loader de `src/vision/loaders/opencvLoader.ts` sigue sirviendo, porque apunta a `dist/opencv.js` y espera `window.cv.Mat`.

OpenCV 5 (`5.0.0-release.1`, junio 2026) cambia la forma del contorno. Hoy un polígono de 4 puntos tiene `rows === 4`, y con eso el detector dice que vio la tarjeta (`src/vision/ine/ineCardDetector.ts`). En la 5 ese arreglo pasa a ser un vector de una dimensión, `rows` ya no es 4, y la captura automática deja de encontrar la INE.

Si subimos a 4.12 hay que dejarla fija, sin `^`:

```json
"@techstark/opencv-js": "4.12.0-release.1"
```

La API que usamos sigue igual (`findContours`, `approxPolyDP`, `cornerSubPix`, `getPerspectiveTransform`), pero Canny y los contornos se pueden mover unos píxeles. Antes de darlo por bueno hay que volver a tomar frente, reverso y un comprobante. Si el encuadre se mueve, nos quedamos en `4.10.0-release.1`, que es con la que está calibrado el detector.

## TypeScript

`7.0.2` ya está publicada. `typescript-eslint` 8 trae este rango:

```text
typescript >= 4.8.4 < 6.1.0
```

Con la 7 el lint deja de ser una combinación que ellos soportan. `6.0.3` (abril 2026) es el último parche que sí entra.

## jscanify

`1.4.3` es la última y es la que dejaría. El aplanado de ahora ya no la llama: la hoja la endereza OpenCV en `src/vision/document/documentScanner.ts`. El loader (`src/vision/loaders/jscanifyLoader.ts`) y el plugin de `vite.config.ts` siguen en el repo, pero la foto que se va al OCR no pasa por ahí.

## Si aplicamos los cambios

1. Subir `@techstark/opencv-js` a `4.12.0-release.1` y repetir INE frente, reverso y un comprobante o factura.
2. Subir `@types/react` a `18.3.31` y `@types/react-dom` a `18.3.7`, y correr `npm run build`.
3. Subir `eslint` a `10.14.0` y `globals` a `17.14.0`, y correr `npm run lint`.
