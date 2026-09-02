/* ============================================================
   ALMACEN
   Todo lo que la app guarda en el celular.

   Tres cosas distintas conviven acá:
     padron      lo que baja del servidor, se puede volver a bajar
     pendientes  lo que el relevador cargó y todavia no subio.
                 Esto NO se puede perder nunca.
     prefs       quien sos, ultima sincronizacion, etc.
   ============================================================ */

var Almacen = (function () {

  var K = {
    esquema:    'gs.esquema',
    padron:     'gs.padron',
    relevados:  'gs.relevados',    // lo que ya cargó la cuadrilla
    pendientes: 'gs.pendientes',
    prefs:      'gs.prefs'
  };

  function leer(clave, porDefecto) {
    try {
      var s = localStorage.getItem(clave);
      return s ? JSON.parse(s) : porDefecto;
    } catch (e) {
      console.warn('No se pudo leer', clave, e);
      return porDefecto;
    }
  }

  function escribir(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      /* Se llenó el almacenamiento. Lo grave sería perder lo
         pendiente, asi que ante todo avisamos fuerte.          */
      console.error('No se pudo guardar', clave, e);
      if (clave === K.pendientes) {
        alert('No hay espacio para guardar el relevamiento. '
            + 'Conectate a internet y sincronizá antes de seguir cargando.');
      }
      return false;
    }
  }

  /* Si cambia el esquema, el padrón viejo no sirve. Los
     pendientes se conservan igual, son sagrados.            */
  function verificarEsquema() {
    var v = leer(K.esquema, null);
    if (v !== CONFIG.ESQUEMA) {
      localStorage.removeItem(K.padron);
      localStorage.removeItem(K.relevados);
      escribir(K.esquema, CONFIG.ESQUEMA);
      return false;
    }
    return true;
  }

  /* ---------------- padrón ---------------- */

  function guardarPadron(p) {
    return escribir(K.padron, {
      ts: p.ts,
      instalaciones: p.instalaciones || [],
      calles: p.calles || [],
      relevadores: p.relevadores || [],
      campanias: p.campanias || []
    });
  }

  function padron() {
    return leer(K.padron, null);
  }

  function hayPadron() {
    var p = padron();
    return !!(p && p.instalaciones && p.instalaciones.length);
  }

  /* -------- lo ya relevado por la cuadrilla -------- */

  function relevados() {
    return leer(K.relevados, { ts: null, elementos: [], componentes: [],
                               tramos: [], obstrucciones: [] });
  }

  /* Mezcla los cambios que llegaron del servidor con lo que ya
     teniamos. Se pisa por id, que es la clave de todo.        */
  function fusionarRelevados(cambios) {
    var r = relevados();
    ['elementos', 'componentes', 'tramos', 'obstrucciones'].forEach(function (t) {
      if (!cambios[t] || !cambios[t].length) return;
      if (!r[t]) r[t] = [];
      var porId = {};
      r[t].forEach(function (x) { porId[x.id] = x; });
      cambios[t].forEach(function (x) { porId[x.id] = x; });
      r[t] = Object.keys(porId).map(function (k) { return porId[k]; });
    });
    r.ts = cambios.ts || r.ts;
    escribir(K.relevados, r);
    return r;
  }

  /* Cuánto se relevó en una instalación, para el control de avance */
  function elementosDe(inv) {
    return relevados().elementos.filter(function (e) {
      return String(e.inv) === String(inv) && e.activo !== false;
    });
  }

  /* ---------------- pendientes ---------------- */

  function pendientes() {
    return leer(K.pendientes, { elementos: [], componentes: [], tramos: [],
                                obstrucciones: [], fotos: [] });
  }

  function encolar(tipo, registro) {
    var p = pendientes();
    if (!p[tipo]) p[tipo] = [];
    /* Si ya estaba encolado el mismo id, se reemplaza en vez de
       agregar. Editar dos veces antes de sincronizar no debe
       generar dos envíos.                                       */
    var i = -1;
    for (var k = 0; k < p[tipo].length; k++) {
      if (p[tipo][k].id === registro.id) { i = k; break; }
    }
    if (i >= 0) p[tipo][i] = registro; else p[tipo].push(registro);
    escribir(K.pendientes, p);

    /* Se guarda tambien como relevado local, asi la ficha muestra
       el avance aunque todavia no haya subido.                   */
    var r = relevados();
    if (r[tipo]) {
      var j = -1;
      for (var m = 0; m < r[tipo].length; m++) {
        if (r[tipo][m].id === registro.id) { j = m; break; }
      }
      if (j >= 0) r[tipo][j] = registro; else r[tipo].push(registro);
      escribir(K.relevados, r);
    }
    return p;
  }

  /* Saca de la cola lo que el servidor confirmó por id */
  function confirmar(tipo, ids) {
    var p = pendientes();
    if (!p[tipo]) return p;
    var set = {};
    ids.forEach(function (i) { set[i] = true; });
    p[tipo] = p[tipo].filter(function (r) { return !set[r.id]; });
    escribir(K.pendientes, p);
    return p;
  }

  function cantidadPendiente() {
    var p = pendientes();
    return (p.elementos || []).length + (p.componentes || []).length
         + (p.tramos || []).length + (p.obstrucciones || []).length
         + (p.fotos || []).length;
  }

  /* ---------------- sesión ----------------
     sessionStorage sobrevive a un refresco pero se borra al
     cerrar la app. Es exactamente lo que queremos: recargar la
     página no es "empezar de nuevo", cerrar la app sí.        */

  function sesionActiva() {
    try { return sessionStorage.getItem('gs.sesion') === '1'; }
    catch (e) { return false; }
  }

  function abrirSesion() {
    try { sessionStorage.setItem('gs.sesion', '1'); } catch (e) {}
    pref('ultimo_uso', Date.now());
  }

  function cerrarSesion() {
    try { sessionStorage.removeItem('gs.sesion'); } catch (e) {}
  }

  /* ---------------- preferencias ---------------- */

  function prefs() { return leer(K.prefs, {}); }

  function pref(clave, valor) {
    if (valor === undefined) return prefs()[clave];
    var p = prefs();
    p[clave] = valor;
    escribir(K.prefs, p);
    return valor;
  }

  /* Identificador único generado en el celular. Es lo que hace
     que reenviar un lote no duplique nada del lado del servidor. */
  function nuevoId(prefijo) {
    var r = Math.random().toString(36).slice(2, 8);
    return (prefijo || 'e') + '_' + Date.now().toString(36) + '_' + r;
  }

  function espacioUsado() {
    var total = 0;
    for (var k in localStorage) {
      if (k.indexOf('gs.') === 0) total += (localStorage.getItem(k) || '').length;
    }
    return Math.round(total / 1024);   // KB aproximados
  }

  return {
    verificarEsquema: verificarEsquema,
    guardarPadron: guardarPadron,
    padron: padron,
    hayPadron: hayPadron,
    relevados: relevados,
    fusionarRelevados: fusionarRelevados,
    elementosDe: elementosDe,
    pendientes: pendientes,
    encolar: encolar,
    confirmar: confirmar,
    cantidadPendiente: cantidadPendiente,
    pref: pref,
    sesionActiva: sesionActiva,
    abrirSesion: abrirSesion,
    cerrarSesion: cerrarSesion,
    nuevoId: nuevoId,
    espacioUsado: espacioUsado
  };
})();

if (typeof module !== 'undefined') module.exports = Almacen;