/* ============================================================
   CONFIGURACION
   Lo unico que hay que tocar para poner la app en marcha.
   ============================================================ */

var CONFIG = {

  /* Pegar acá la URL /exec de la implementación del Apps Script */
  API: 'https://script.google.com/macros/s/AKfycbxQ65_eq4EdfCGgWfVcESJouWpi7uZQkXbt-IukzJAwU_N3yAhP3RA8FnxRtHHjPnzzkQ/exec',

  /* ---------- Capas de mapa ----------
     Se usan en el módulo de captura. El orden importa: la
     primera es la que se muestra por defecto.

     PENDIENTE: reemplazar la URL del WMS municipal cuando
     Catastro confirme el endpoint. Se pide el documento
     GetCapabilities del servicio y ahí figuran los nombres
     exactos de las capas de parcelas y eje de calles.        */
  CAPAS: [
    {
      id: 'municipal',
      nombre: 'Catastro municipal',
      tipo: 'wms',
      url: '',                       // <-- endpoint del WMS Rosario
      capas: 'parcelas,ejes_calles', // <-- nombres reales según GetCapabilities
      formato: 'image/png',
      atribucion: 'Municipalidad de Rosario',
      habilitada: false              // se prende cuando haya URL
    },
    {
      id: 'satelital',
      nombre: 'Satelital',
      tipo: 'tiles',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 19,
      atribucion: 'Esri, Maxar, Earthstar Geographics',
      habilitada: true
    },
    {
      id: 'ign',
      nombre: 'Mapa base IGN',
      tipo: 'tiles',
      url: 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG:3857@png/{z}/{x}/{-y}.png',
      maxZoom: 20,
      atribucion: 'Instituto Geográfico Nacional',
      habilitada: true
    }
  ],

  /* ---------- Búsqueda ---------- */
  BUSQUEDA: {
    max_resultados: 25,
    radio_cerca_m: 400,      // "cerca mío" no muestra nada más lejos que esto
    max_cerca: 10
  },

  /* ---------- Sincronización ---------- */
  SYNC: {
    reintento_ms: 30000,     // cada cuánto reintenta la cola pendiente
    cambios_ms: 120000,      // cada cuánto pregunta qué cargaron los demás
    timeout_ms: 20000
  },

  /* ---------- GPS ---------- */
  GPS: {
    accuracy_buena_m: 8,
    accuracy_maxima_m: 20,
    lecturas_promedio: 5
  },

  /* Clave con la que se versiona el almacenamiento local.
     Subirla obliga a todos los celulares a recargar el padrón. */
  ESQUEMA: 1
};
