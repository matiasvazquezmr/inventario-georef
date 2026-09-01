# Inventario georreferenciado de instalaciones

App de campo para relevar con GPS la ubicación del equipamiento semafórico y de
fibra óptica de Rosario. Sin dependencias externas ni compilación: se sube a
GitHub Pages tal cual está.

Datos en Google Sheets, backend en Apps Script, front en JavaScript plano.

## Estructura

```
index.html            única página, la app entera
.nojekyll             GitHub Pages sirve los archivos sin procesarlos

css/
  estilos.css

js/                   los módulos propios, en orden de dependencia
  posgar.js           POSGAR 94 faja 5 <-> WGS84, y distancias
  config.js           URL del backend, capas de mapa, umbrales
  catalogo.js         qué se releva y qué campos pide cada cosa
  almacen.js          padrón local, cola de pendientes, preferencias
  buscador.js         búsqueda por inventario, por calles y por cercanía
  gps.js              seguimiento, promediado y calidad de la lectura
  formulario.js       genera los formularios leyendo el catálogo
  mapa.js             Leaflet, capas y pin arrastrable
  sync.js             descarga del padrón, cola de reintentos, cambios
  ficha.js            ficha de instalación, captura y componentes
  app.js              navegación, buscador y estado

vendor/
  leaflet.js          1.9.4 sin modificar
  leaflet.css

apps-script/          copia versionada, NO se publica
  posgar.gs
  importador.gs
  backend.gs
```

## Orden de carga

Los scripts se cargan con etiquetas `<script>` comunes, sin módulos ES ni
empaquetador, así que **el orden importa**. Cada uno deja su objeto global y
los siguientes lo usan:

```
leaflet -> posgar -> config -> catalogo -> almacen -> buscador
        -> gps -> formulario -> mapa -> sync -> ficha -> app
```

`app.js` va último siempre: es el que arranca todo cuando el DOM está listo.

## Puesta en marcha

1. En la planilla del inventario, Extensiones > Apps Script. Crear tres
   archivos con el contenido de `apps-script/`, en ese orden.
2. Ejecutar `prepararHojas()` una vez y aceptar los permisos.
3. Ejecutar el menú Inventario > Importar y validar. Revisar la hoja `revisar`.
4. Cargar los nombres de la cuadrilla en la hoja `relevadores`.
5. Implementar > Nueva implementación > Aplicación web.
   Ejecutar como **Yo**, acceso para **Cualquier persona**.
   Cualquier otra opción devuelve una pantalla de login y la app falla
   con un error de CORS.
6. Pegar la URL `/exec` en `js/config.js`.
7. Publicar el repo en GitHub Pages.

Para verificar que el backend quedó público, abrir en una ventana de incógnito:

```
<URL>/exec?accion=ping
```

Tiene que devolver JSON. Si lleva al login de Google, el paso 5 quedó mal.

## Notas

`posgar` está duplicado a propósito: una copia corre en el navegador y otra
dentro de Apps Script, que son entornos separados y no pueden compartir
archivos. Si se toca uno, hay que actualizar el otro.

GitHub Pages distingue mayúsculas de minúsculas aunque Windows no. Todos los
nombres van en minúscula.

## Coordenadas

El inventario original está en POSGAR 94 / Argentina faja 5 (EPSG:22185). El
importador reproyecta a WGS84 y deja ambas versiones. De cada elemento relevado
se guardan las dos coordenadas, la cruda del GPS y la corregida a mano, para
poder auditar después la calidad de cada registro.

## Estado

Hecho: importación y validación, buscador, ficha con avance, captura GPS,
ajuste en mapa, formularios por tipo, componentes en cadena.

Pendiente: tramos con recorrido grabado, fotos, visor de solo lectura,
service worker, campañas y modo oficina.