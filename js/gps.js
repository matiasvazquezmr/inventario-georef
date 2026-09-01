/* ============================================================
   GPS

   El celular no da un punto, da una nube de puntos que se va
   acomodando. Este modulo se encarga de:
     - mantener el GPS prendido y calentando
     - juzgar si la lectura sirve
     - promediar varias lecturas descartando las que se van

   Nada de esto reemplaza el ajuste manual sobre el mapa. Es
   para llegar al mapa con el mejor punto posible.
   ============================================================ */

var GPS = (function () {

  var watchId = null;
  var ultima = null;
  var historial = [];        // ultimas lecturas, para promediar
  var oyentes = [];
  var MAX_HISTORIAL = 20;

  function on(fn) { oyentes.push(fn); }
  function off(fn) { oyentes = oyentes.filter(function (x) { return x !== fn; }); }

  function avisar(lectura, error) {
    oyentes.forEach(function (fn) {
      try { fn(lectura, error); } catch (e) { console.warn(e); }
    });
  }

  /* ------------- seguimiento continuo -------------
     Se prende al entrar a la ficha, no al apretar capturar.
     La primera lectura de un GPS frio es siempre mala y tarda
     entre 20 y 40 segundos en estabilizar.                    */

  function iniciar() {
    if (watchId !== null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(function (p) {
      var l = {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        acc: p.coords.accuracy,
        ts: p.timestamp || Date.now()
      };
      ultima = l;
      historial.push(l);
      if (historial.length > MAX_HISTORIAL) historial.shift();
      avisar(l, null);
    }, function (err) {
      avisar(null, err);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 });
  }

  function detener() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    historial = [];
  }

  function posicion() { return ultima; }

  /* ------------- calidad -------------
     Tres estados, como una lente semaforica. Es el lenguaje
     que esta gente ya lee sin pensar.                         */

  function calidad(acc) {
    if (acc === null || acc === undefined) return 'nula';
    if (acc <= CONFIG.GPS.accuracy_buena_m) return 'buena';
    if (acc <= CONFIG.GPS.accuracy_maxima_m) return 'regular';
    return 'mala';
  }

  function texto(acc) {
    switch (calidad(acc)) {
      case 'buena':   return 'Precisión buena';
      case 'regular': return 'Precisión justa, esperá unos segundos';
      case 'mala':    return 'Precisión mala, salí a cielo abierto';
      default:        return 'Buscando señal';
    }
  }

  /* ------------- captura -------------
     Toma las mejores lecturas recientes, descarta las que se
     alejan del grupo y promedia ponderando por precision.
     Devuelve tambien la dispersion, que es la señal honesta
     de cuanto confiar en el punto.                            */

  function capturar() {
    var n = CONFIG.GPS.lecturas_promedio;
    var recientes = historial.filter(function (l) {
      return Date.now() - l.ts < 30000 && l.acc <= CONFIG.GPS.accuracy_maxima_m * 2;
    });

    if (!recientes.length) {
      return ultima ? Object.assign({}, ultima, { n: 1, dispersion: null }) : null;
    }

    /* Las mejores por precisión */
    recientes.sort(function (a, b) { return a.acc - b.acc; });
    var mejores = recientes.slice(0, n);

    /* Descarte de las que se van: se compara contra la mediana
       del grupo, no contra el promedio, para que una lectura
       muy corrida no arrastre la referencia.                   */
    var med = mediana(mejores);
    var accMed = medianaDe(mejores.map(function (l) { return l.acc; }));
    var limite = Math.max(accMed * 2, 10);
    var buenas = mejores.filter(function (l) {
      return POSGAR.distancia(l.lat, l.lon, med.lat, med.lon) <= limite;
    });
    if (!buenas.length) buenas = mejores;

    /* Promedio ponderado: una lectura de 4 m pesa mucho más
       que una de 15 m.                                        */
    var sw = 0, slat = 0, slon = 0, sacc = 0;
    buenas.forEach(function (l) {
      var w = 1 / Math.max(l.acc * l.acc, 1);
      sw += w; slat += l.lat * w; slon += l.lon * w; sacc += l.acc;
    });
    var lat = slat / sw, lon = slon / sw;

    /* Dispersión: qué tan lejos quedó la lectura más apartada
       del punto final. Si es grande, el GPS está bailando.    */
    var disp = 0;
    buenas.forEach(function (l) {
      var d = POSGAR.distancia(l.lat, l.lon, lat, lon);
      if (d > disp) disp = d;
    });

    return {
      lat: lat,
      lon: lon,
      acc: sacc / buenas.length,
      n: buenas.length,
      descartadas: mejores.length - buenas.length,
      dispersion: Math.round(disp * 10) / 10,
      ts: Date.now()
    };
  }

  function medianaDe(nums) {
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function mediana(lecturas) {
    return {
      lat: medianaDe(lecturas.map(function (l) { return l.lat; })),
      lon: medianaDe(lecturas.map(function (l) { return l.lon; }))
    };
  }

  /* Cuántas lecturas hay acumuladas: sirve para mostrar
     "estabilizando" en vez de dejar la pantalla muda.        */
  function lecturasAcumuladas() { return historial.length; }

  return {
    on: on, off: off,
    iniciar: iniciar, detener: detener,
    posicion: posicion,
    capturar: capturar,
    calidad: calidad,
    texto: texto,
    lecturasAcumuladas: lecturasAcumuladas,
    _mediana: mediana
  };
})();

if (typeof module !== 'undefined') module.exports = GPS;
