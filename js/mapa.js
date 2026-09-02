/* ============================================================
   MAPA

   Leaflet va incluido en el repo, no desde un CDN: sin señal
   un CDN no carga y la app quedaria inutil justo cuando mas
   se la necesita.

   Las teselas si necesitan red. Cuando no hay, el mapa queda
   gris pero el pin y el ajuste siguen funcionando: se ve la
   posicion relativa contra el punto de la esquina.
   ============================================================ */

var Mapa = (function () {

  /* OJO: isFinite(null) devuelve true, porque null se convierte a 0.
     Lo mismo con '' y con []. Para validar coordenadas hace falta
     comprobar el tipo, si no un marcador en [null,null] llega hasta
     Leaflet y revienta adentro de la librería.                    */
  function esCoord(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function puntoValido(p) {
    return !!p && esCoord(p.lat) && esCoord(p.lon);
  }

  var mapa = null;
  var pin = null;
  var circulo = null;
  var refEsquina = null;
  var alMover = null;

  function capasDisponibles() {
    var out = {};
    (CONFIG.CAPAS || []).forEach(function (c) {
      if (!c.habilitada || !c.url) return;
      if (c.tipo === 'wms') {
        out[c.nombre] = L.tileLayer.wms(c.url, {
          layers: c.capas,
          format: c.formato || 'image/png',
          transparent: false,
          attribution: c.atribucion
        });
      } else {
        out[c.nombre] = L.tileLayer(c.url, {
          maxZoom: c.maxZoom || 19,
          attribution: c.atribucion
        });
      }
    });
    return out;
  }

  /* Iconos dibujados con CSS, sin archivos de imagen. Un PNG
     menos es un 404 menos cuando se sube el repo.             */
  function icono(clase) {
    return L.divIcon({
      className: '',
      html: '<span class="pin ' + clase + '"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function crear(contenedor, punto, opciones) {
    var o = opciones || {};
    destruir();

    if (!puntoValido(punto)) {
      console.warn('Mapa: punto inválido', punto);
      return null;
    }

    mapa = L.map(contenedor, {
      zoomControl: true,
      attributionControl: true,
      tap: true
    }).setView([punto.lat, punto.lon], o.zoom || 19);

    var capas = capasDisponibles();
    var nombres = Object.keys(capas);
    if (nombres.length) {
      capas[nombres[0]].addTo(mapa);
      if (nombres.length > 1) L.control.layers(capas, null, { position: 'topright' }).addTo(mapa);
    }

    /* Referencia de la esquina: donde dice el inventario que
       esta el cruce. Ayuda a orientarse cuando no hay teselas. */
    if (puntoValido(o.referencia)) {
      refEsquina = L.marker([o.referencia.lat, o.referencia.lon], {
        icon: icono('ref'), interactive: false, keyboard: false
      }).addTo(mapa);
    }

    if (esCoord(punto.acc) && punto.acc > 0) {
      circulo = L.circle([punto.lat, punto.lon], {
        radius: punto.acc, color: '#1a73e8', weight: 1,
        fillColor: '#1a73e8', fillOpacity: 0.10, interactive: false
      }).addTo(mapa);
    }

    pin = L.marker([punto.lat, punto.lon], {
      icon: icono('equipo'),
      draggable: true,
      autoPan: true
    }).addTo(mapa);

    pin.on('drag', function () {
      if (circulo) { mapa.removeLayer(circulo); circulo = null; }
    });
    pin.on('dragend', function () {
      if (alMover) alMover(posicionPin());
    });

    /* Tocar el mapa tambien mueve el pin: con guantes es mas
       facil tocar que arrastrar.                              */
    mapa.on('click', function (e) {
      pin.setLatLng(e.latlng);
      if (circulo) { mapa.removeLayer(circulo); circulo = null; }
      if (alMover) alMover(posicionPin());
    });

    /* Leaflet mide mal el contenedor si se creo oculto */
    setTimeout(function () { if (mapa) mapa.invalidateSize(); }, 120);

    return mapa;
  }

  function alMoverse(fn) { alMover = fn; }

  function posicionPin() {
    if (!pin) return null;
    var p = pin.getLatLng();
    return { lat: p.lat, lon: p.lng };
  }

  /* Cuánto se corrió el pin respecto de donde lo dejó el GPS */
  function desplazamiento(original) {
    var p = posicionPin();
    if (!p || !original) return 0;
    return POSGAR.distancia(original.lat, original.lon, p.lat, p.lon);
  }

  function centrarEn(lat, lon) {
    if (mapa && esCoord(lat) && esCoord(lon)) mapa.setView([lat, lon], mapa.getZoom());
  }

  function destruir() {
    if (mapa) { mapa.remove(); mapa = null; }
    pin = null; circulo = null; refEsquina = null;
  }

  function activo() { return !!mapa; }

  return {
    crear: crear,
    alMoverse: alMoverse,
    posicionPin: posicionPin,
    desplazamiento: desplazamiento,
    centrarEn: centrarEn,
    destruir: destruir,
    activo: activo,
    esCoord: esCoord
  };
})();