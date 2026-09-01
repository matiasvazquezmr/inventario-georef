/* ============================================================
   BUSCADOR
   Tres formas de llegar a una instalación. La que más se usa
   en la calle es la de cercanía, porque no hay que escribir.
   ============================================================ */

var Buscador = (function () {

  var idx = null;

  /* Prefijo de inventario -> familia. Sale de cómo numeran
     hoy: los semáforos son número puro, el resto lleva letra. */
  var PREFIJOS = {
    'D':    'punto_medida',
    'E':    'punto_medida',
    'CMV':  'pmv',
    'MV':   'pov',
    'CCTV': 'cctv'
  };

  /* La eñe se pliega a N a propósito: en la calle nadie la
     escribe. Solo afecta la clave de búsqueda, el nombre que
     se muestra sigue saliendo del padrón tal cual.           */
  function normalizar(s) {
    if (s === null || s === undefined) return '';
    return String(s).toUpperCase().trim()
      .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* Forma canónica de un número de inventario: letras pegadas
     al número sin ceros a la izquierda. Así "e5", "E-005" y
     "E 005" son todos lo mismo.                              */
  function canon(inv) {
    var s = String(inv === null || inv === undefined ? '' : inv)
              .toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = s.match(/^([A-Z]*)(\d*)$/);
    if (!m) return s;
    var num = m[2] ? String(parseInt(m[2], 10)) : '';
    return m[1] + num;
  }

  /* Arma el índice una vez, al arrancar */
  function construir(instalaciones) {
    idx = (instalaciones || []).map(function (r) {
      var c1 = normalizar(r.calle_1), c2 = normalizar(r.calle_2);
      return {
        ref: r,
        familia: r.familia,
        inv: String(r.inv || ''),
        invNorm: canon(r.inv),
        calles: c1 + ' ' + c2,
        c1: c1, c2: c2,
        lat: typeof r.lat === 'number' ? r.lat : parseFloat(r.lat),
        lon: typeof r.lon === 'number' ? r.lon : parseFloat(r.lon)
      };
    });
    return idx.length;
  }

  function indice() { return idx; }

  /* ¿La consulta parece un número de inventario?
     "435", "e-005", "e5", "cmv 7", y también "cmv" solo, que
     lista toda esa familia.                                  */
  function pareceInventario(q) {
    var s = String(q).trim();
    if (/^[A-Za-z]{0,4}\s*-?\s*\d+$/.test(s)) return true;
    return !!PREFIJOS[s.toUpperCase().replace(/[^A-Z]/g, '')];
  }

  function familiaDe(q) {
    var m = String(q).trim().toUpperCase().match(/^([A-Z]{1,4})/);
    if (!m) return /^\d/.test(String(q).trim()) ? 'semaforo' : null;
    return PREFIJOS[m[1]] || null;
  }

  /* ---------------- búsqueda por texto ---------------- */

  function buscar(consulta, posicion) {
    if (!idx) return [];
    var q = normalizar(consulta);
    if (!q) return [];

    var res = [];

    if (pareceInventario(consulta)) {
      var qn = canon(consulta);
      var fam = familiaDe(consulta);
      idx.forEach(function (it) {
        if (fam && it.familia !== fam) return;
        if (!qn) { res.push({ it: it, score: 30 }); return; }  // solo el prefijo
        var p = it.invNorm.indexOf(qn);
        if (p === 0)    res.push({ it: it, score: 100 });
        else if (p > 0) res.push({ it: it, score: 60 });
      });
      res.forEach(function (r) { if (r.it.invNorm === qn) r.score += 50; });

    } else {
      var tokens = q.split(' ').filter(Boolean);
      idx.forEach(function (it) {
        var enC1 = 0, enC2 = 0, todos = true;
        tokens.forEach(function (t) {
          var a = it.c1.indexOf(t) >= 0, b = it.c2.indexOf(t) >= 0;
          if (!a && !b) todos = false;
          if (a) enC1++;
          if (b) enC2++;
        });
        if (!todos) return;
        /* Si los tokens se reparten entre las dos calles, el
           usuario escribió una intersección: eso vale más.    */
        var score = (enC1 && enC2) ? 80 : 40;
        if (it.c1.indexOf(tokens[0]) === 0 || it.c2.indexOf(tokens[0]) === 0) score += 10;
        res.push({ it: it, score: score });
      });
    }

    /* A igual puntaje, primero lo que tenés más cerca */
    if (posicion) {
      res.forEach(function (r) {
        r.dist = distancia(posicion, r.it);
      });
    }

    res.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.dist !== undefined && b.dist !== undefined) return a.dist - b.dist;
      return a.it.inv.localeCompare(b.it.inv, 'es', { numeric: true });
    });

    return res.slice(0, CONFIG.BUSQUEDA.max_resultados).map(salida);
  }

  /* ---------------- cercanía ---------------- */

  function cerca(posicion, opciones) {
    if (!idx || !posicion) return [];
    var o = opciones || {};
    var radio = o.radio || CONFIG.BUSQUEDA.radio_cerca_m;
    var max = o.max || CONFIG.BUSQUEDA.max_cerca;

    var res = [];
    idx.forEach(function (it) {
      if (o.familia && it.familia !== o.familia) return;
      var d = distancia(posicion, it);
      if (d === null || d > radio) return;
      res.push({ it: it, dist: d, score: 0 });
    });
    res.sort(function (a, b) { return a.dist - b.dist; });
    return res.slice(0, max).map(salida);
  }

  function distancia(pos, it) {
    if (!isFinite(it.lat) || !isFinite(it.lon)) return null;
    return POSGAR.distancia(pos.lat, pos.lon, it.lat, it.lon);
  }

  function salida(r) {
    return {
      inv: r.it.inv,
      familia: r.it.familia,
      calle_1: r.it.ref.calle_1,
      calle_2: r.it.ref.calle_2,
      zona: r.it.ref.zona,
      lat: r.it.lat,
      lon: r.it.lon,
      dist_m: r.dist === undefined || r.dist === null ? null : Math.round(r.dist),
      datos: r.it.ref
    };
  }

  function porInventario(inv) {
    if (!idx) return null;
    var q = canon(inv);
    for (var i = 0; i < idx.length; i++) {
      if (idx[i].invNorm === q) return idx[i].ref;
    }
    return null;
  }

  /* Autocompletado de calles sobre el padrón */
  function sugerirCalles(consulta, calles, max) {
    var q = normalizar(consulta);
    if (q.length < 2) return [];
    var pre = [], med = [];
    (calles || []).forEach(function (c) {
      var n = normalizar(c);
      var p = n.indexOf(q);
      if (p === 0) pre.push(c);
      else if (p > 0) med.push(c);
    });
    return pre.concat(med).slice(0, max || 8);
  }

  return {
    construir: construir,
    indice: indice,
    buscar: buscar,
    cerca: cerca,
    porInventario: porInventario,
    sugerirCalles: sugerirCalles,
    normalizar: normalizar,
    pareceInventario: pareceInventario,
    familiaDe: familiaDe
  };
})();

if (typeof module !== 'undefined') module.exports = Buscador;
