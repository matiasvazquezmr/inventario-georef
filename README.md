# Relevamiento georreferenciado de infraestructura semafórica

App web de campo para relevar con GPS de celular la ubicación del equipamiento
semafórico y de fibra óptica, con sincronización a Google Sheets y consumo
directo desde QGIS.

## Estructura del proyecto

```
/
├── index.html          carga de campo (celular)
├── visor.html          consulta de solo lectura (equipo)
├── css/estilos.css
├── js/
│   ├── catalogo.js     ← definición de tipos y campos (editar acá)
│   ├── gps.js          captura de punto, promediado, tracking de recorrido
│   ├── formularios.js  generador dinámico desde el catálogo
│   ├── sync.js         cola offline + reintentos
│   ├── mapa.js         Leaflet, ajuste manual del pin
│   └── app.js
└── backend/Codigo.gs   Apps Script
```

## Hojas de la planilla

**esquinas** (maestro, se importa una vez desde QGIS)

| nro_inventario | calle_1 | calle_2 | lat | lon | zona |
|---|---|---|---|---|---|

**elementos** (geometría: punto)

| campo | descripción |
|---|---|
| `id` | generado en el celular, permite reenvío sin duplicar |
| `nro_inventario` | vacío si el elemento no pertenece a una esquina |
| `tipo` | clave del catálogo |
| `lat` / `lon` | coordenada final (corregida si hubo ajuste manual) |
| `lat_gps` / `lon_gps` | coordenada cruda del GPS, para auditar calidad |
| `accuracy_m` | precisión informada por el dispositivo |
| `ajustado` | true si se movió el pin sobre la imagen satelital |
| `atributos_json` | campos propios del tipo |
| `fotos` | JSON con los file_id de Drive |
| `activo` | baja lógica, nunca se borra una fila |

**tramos** (geometría: línea, recorrido grabado)

`geometria_json` guarda el array `[[lat,lon],...]` ya simplificado.
Un tramo de 300 m con tolerancia de 2 m queda en unos 40 puntos, muy por
debajo del límite de la celda.

## API

Todo contra la URL `/exec` de la implementación.

**GET**

| parámetro | resultado |
|---|---|
| `?accion=ping` | verificar conexión |
| `?accion=todo` | esquinas + elementos + tramos, para cargar el caché inicial |
| `?accion=geojson` | FeatureCollection con todo |
| `?accion=geojson&tipo=columna` | filtrado por tipo |

**POST** (con `Content-Type: text/plain;charset=utf-8` para evitar el preflight
CORS, que Apps Script no responde)

```json
{ "accion": "guardar_elementos", "data": [ { "id": "...", "tipo": "columna", ... } ] }
{ "accion": "guardar_tramos",    "data": [ { ... } ] }
{ "accion": "subir_foto",        "id_elemento": "...", "seq": 1, "base64": "..." }
{ "accion": "baja",              "hoja": "elementos", "id": "..." }
```

El guardado es idempotente: si el `id` ya existe se actualiza en lugar de
insertar. La cola de reintentos puede reenviar el mismo lote las veces que
haga falta.

## Conexión con QGIS

**Opción A, capa viva por GeoJSON**

Capa → Agregar capa → Agregar capa vectorial → Origen: Protocolo HTTP(S)
Tipo: GeoJSON
URL: `https://script.google.com/macros/s/<ID>/exec?accion=geojson&tipo=columna`

Conviene una capa por tipo, así cada una tiene su simbología y sus campos.
Para actualizar: clic derecho sobre la capa → Volver a cargar.

**Opción B, si el redirect de Apps Script da problemas**

Archivo → Compartir → Publicar en la web → hoja `elementos` en formato CSV.
Después en QGIS: Capa de texto delimitado apuntando a esa URL, con
`lon` = X e `lat` = Y, SRC EPSG:4326.
Más estable, pero pierde los tramos y los atributos quedan sin aplanar.

## Precisión

El GPS de un celular entrega entre 3 y 10 m de error, peor entre edificios
altos. El flujo asume esa limitación:

1. `watchPosition` con `enableHighAccuracy`, promediando las mejores lecturas.
2. Semáforo visual de precisión; por encima de 20 m se bloquea el guardado.
3. Ajuste manual del pin sobre imagen satelital antes de confirmar.

Se guardan las dos coordenadas para poder auditar después qué tan confiable
fue cada registro.
