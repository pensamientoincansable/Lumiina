# Lumiina

Lumiina es un laboratorio visual estático para generar imágenes con Gemini, con una interfaz holográfica y un núcleo 3D interactivo renderizado en canvas: una icosfera de alambre con proyección en perspectiva, anillos orbitales con satélites y estelas, barrido de escáner, ondas de choque y parallax con el cursor.

## Interacción del núcleo holográfico

- **Arrastrar** sobre el orbe para rotarlo en 3D (con inercia al soltar).
- **Clic** para emitir una onda de choque; **doble clic** para restablecer la vista.
- **Ctrl + rueda** o **pellizco** para zoom (la rueda normal conserva el scroll).
- Botones **− / ⊙ / +** sobre el orbe para alejar, restablecer y acercar.
- El movimiento del puntero añade parallax en profundidad. En pantallas táctiles el gesto vertical sigue desplazando la página (`touch-action: pan-y`).

## Ejecutar

No necesita build ni dependencias. Sirve la raíz del repositorio con cualquier servidor estático:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Después abre `http://localhost:4173`.

## Conectar Gemini

1. Abre **API OFFLINE** en la esquina superior derecha.
2. Pega una key creada en [Google AI Studio](https://aistudio.google.com/apikey).
3. Pulsa **TEST & CONNECT**. Lumiina consulta `/v1/models` y comprueba que el proyecto tenga un modelo de imágenes habilitado antes de permitir el render.
4. Genera desde el estudio.

La key no está hardcodeada ni se incluye en Git: se guarda únicamente en `localStorage` del navegador y se envía directamente a la API de Gemini usando `x-goog-api-key`. El cliente prioriza `gemini-3.1-flash-image`, `gemini-3-pro-image` y `gemini-3.1-flash-lite-image`, con compatibilidad para Nano Banana (`gemini-2.5-flash-image`) cuando esos modelos están disponibles en el proyecto.

## Nitidez facial

El modo **Focus lock / Detail boost** añade instrucciones explícitas para mantener ojos, piel, pelo y proporciones faciales en foco nítido, evita blur/defocus y solicita salida `2K` en los modelos actuales. Las imágenes se muestran con `object-fit: contain` sin filtros de desenfoque ni reescalado destructivo. También se puede adjuntar una referencia de hasta 8 MB.

## Comprobaciones

```bash
node --check src/main.js
node --check src/gemini.js
git diff --check
```
