/* ============================================================
   POSGAR 94 / Argentina Faja 5  <->  WGS84
   EPSG:22185  <->  EPSG:4326

   Transversa de Mercator, implementada a mano para no depender
   de proj4js. Sirve igual en Apps Script, en el navegador y en
   Node, porque no usa nada externo.

   Elipsoide GRS80. POSGAR 94 y WGS84 son coincidentes a nivel
   centimetrico, asi que no se aplica transformacion de datum.
   ============================================================ */

var POSGAR = (function () {

  var a  = 6378137.0;               // semieje mayor GRS80
  var f  = 1 / 298.257222101;       // achatamiento
  var e2 = f * (2 - f);             // primera excentricidad al cuadrado
  var ep2 = e2 / (1 - e2);          // segunda excentricidad al cuadrado

  var k0   = 1.0;
  var lon0 = -60 * Math.PI / 180;   // meridiano central faja 5
  var lat0 = -90 * Math.PI / 180;   // origen de latitudes: polo sur
  var FE   = 5500000.0;             // falso este de la faja 5
  var FN   = 0.0;

  /* Arco de meridiano desde el ecuador hasta lat (radianes) */
  function arcoMeridiano(lat) {
    return a * (
      (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * lat
      - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * lat)
      + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * lat)
      - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * lat)
    );
  }

  var M0 = arcoMeridiano(lat0);

  /* ---------- Gauss-Kruger  ->  lat/lon ---------- */
  function aLatLon(x, y) {
    var M  = M0 + (y - FN) / k0;
    var mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var e1_2 = e1 * e1, e1_3 = e1_2 * e1, e1_4 = e1_3 * e1;

    var phi1 = mu
      + (3 * e1 / 2 - 27 * e1_3 / 32) * Math.sin(2 * mu)
      + (21 * e1_2 / 16 - 55 * e1_4 / 32) * Math.sin(4 * mu)
      + (151 * e1_3 / 96) * Math.sin(6 * mu)
      + (1097 * e1_4 / 512) * Math.sin(8 * mu);

    var sinP = Math.sin(phi1), cosP = Math.cos(phi1), tanP = Math.tan(phi1);

    var C1 = ep2 * cosP * cosP;
    var T1 = tanP * tanP;
    var N1 = a / Math.sqrt(1 - e2 * sinP * sinP);
    var R1 = a * (1 - e2) / Math.pow(1 - e2 * sinP * sinP, 1.5);
    var D  = (x - FE) / (N1 * k0);

    var D2 = D * D, D3 = D2 * D, D4 = D3 * D, D5 = D4 * D, D6 = D5 * D;

    var lat = phi1 - (N1 * tanP / R1) * (
        D2 / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6 / 720
    );

    var lon = lon0 + (
        D
      - (1 + 2 * T1 + C1) * D3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5 / 120
    ) / cosP;

    return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
  }

  /* ---------- lat/lon  ->  Gauss-Kruger ---------- */
  function aGaussKruger(lat, lon) {
    var phi = lat * Math.PI / 180;
    var lam = lon * Math.PI / 180;

    var sinP = Math.sin(phi), cosP = Math.cos(phi), tanP = Math.tan(phi);

    var N = a / Math.sqrt(1 - e2 * sinP * sinP);
    var T = tanP * tanP;
    var C = ep2 * cosP * cosP;
    var A = (lam - lon0) * cosP;
    var M = arcoMeridiano(phi);

    var A2 = A * A, A3 = A2 * A, A4 = A3 * A, A5 = A4 * A, A6 = A5 * A;

    var x = FE + k0 * N * (
        A
      + (1 - T + C) * A3 / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5 / 120
    );

    var y = FN + k0 * (
      (M - M0) + N * tanP * (
          A2 / 2
        + (5 - T + 9 * C + 4 * C * C) * A4 / 24
        + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6 / 720
      )
    );

    return { x: x, y: y };
  }

  /* ---------- utilidades ---------- */

  /* Banda plausible para cualquier coordenada de Rosario, sea X o Y.
     Es tan angosta que un valor solo cae adentro con una unica
     potencia de diez, asi que la correccion no es ambigua.        */
  var MIN_BANDA = 5400000, MAX_BANDA = 6400000;

  /* Corrige el separador decimal mal interpretado.
     Sheets en configuracion regional Argentina lee "5437127.735"
     como el entero 5437127735, porque toma el punto como separador
     de miles. Se detecta por magnitud y se divide.                */
  function normalizarMagnitud(n) {
    if (n === null || !isFinite(n) || n === 0) return { valor: n, escala: 1 };
    var v = Math.abs(n);
    if (v >= MIN_BANDA && v <= MAX_BANDA) return { valor: n, escala: 1 };

    var f;
    for (f = 10; f <= 1e7; f *= 10) {          // valor inflado
      if (v / f >= MIN_BANDA && v / f <= MAX_BANDA) return { valor: n / f, escala: 1 / f };
    }
    for (f = 10; f <= 1e4; f *= 10) {          // valor truncado
      if (v * f >= MIN_BANDA && v * f <= MAX_BANDA) return { valor: n * f, escala: f };
    }
    return { valor: n, escala: 0 };            // no se pudo interpretar
  }

  /* Parsea "5440092,17", "5440092.17", 5437127735 o un numero.
     Devuelve { valor, escala } donde escala != 1 avisa que hubo
     que corregir la magnitud.                                    */
  function parseCoordDetalle(v) {
    if (v === null || v === undefined || v === '') return { valor: null, escala: 1 };
    var n;
    if (typeof v === 'number') {
      n = isFinite(v) ? v : null;
    } else {
      var s = String(v).trim().replace(/\s/g, '');
      // Si tiene coma y no punto, la coma es el decimal
      if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
      else if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
        // Tiene los dos: el ultimo que aparece es el decimal
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
      }
      n = parseFloat(s);
      if (!isFinite(n)) n = null;
    }
    if (n === null) return { valor: null, escala: 1 };
    return normalizarMagnitud(n);
  }

  function parseCoord(v) { return parseCoordDetalle(v).valor; }

  /* Rango plausible para Rosario en faja 5 */
  function coordEnRango(x, y) {
    return x > 5410000 && x < 5460000 && y > 6335000 && y < 6375000;
  }

  /* Distancia en metros entre dos lat/lon (Haversine, suficiente
     para comparar puntos a pocos cientos de metros) */
  function distancia(lat1, lon1, lat2, lon2) {
    var R = 6371008.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLon / 2);
    var h = s1 * s1 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* Extrae lat/lon de un link de Google Maps o Street View */
  function latLonDeMaps(url) {
    if (!url) return null;
    var m = String(url).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : null;
  }

  return {
    aLatLon: aLatLon,
    aGaussKruger: aGaussKruger,
    parseCoord: parseCoord,
    parseCoordDetalle: parseCoordDetalle,
    normalizarMagnitud: normalizarMagnitud,
    coordEnRango: coordEnRango,
    distancia: distancia,
    latLonDeMaps: latLonDeMaps,
    EPSG: 22185
  };
})();

if (typeof module !== 'undefined') module.exports = POSGAR;
