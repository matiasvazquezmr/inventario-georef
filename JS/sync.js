/* ============================================================
   SINCRONIZACION

   Reglas de la casa:
   - Nunca se bloquea al relevador esperando la red. Se guarda
     local, se encola y se sigue.
   - Los ids los genera el celular, asi que reenviar es seguro:
     el backend actualiza en vez de duplicar.
   - Los POST van con Content-Type text/plain a proposito, para
     evitar el preflight CORS que Apps Script no responde.
   ============================================================ */

var Sync = (function () {

  var oyentes = [];
  var enVuelo = false;
  var timers = { cola: null, cambios: null };

  function on(fn) { oyentes.push(fn); }

  function avisar(estado, detalle) {
    oyentes.forEach(function (fn) {
      try { fn(estado, detalle); } catch (e) { console.warn(e); }
    });
  }

  function hayRed() { return navigator.onLine !== false; }

  /* ------------------- transporte ------------------- */

  function pedir(params) {
    if (!CONFIG.API) return Promise.reject(new Error('Falta configurar la URL del backend'));
    var url = CONFIG.API + '?' + Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return conTimeout(fetch(url)).then(leerJSON);
  }

  function enviar(cuerpo) {
    if (!CONFIG.API) return Promise.reject(new Error('Falta configurar la URL del backend'));
    return conTimeout(fetch(CONFIG.API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo)
    })).then(leerJSON);
  }

  function conTimeout(promesa) {
    return new Promise(function (resolver, rechazar) {
      var t = setTimeout(function () {
        rechazar(new Error('Se agotó el tiempo de espera'));
      }, CONFIG.SYNC.timeout_ms);
      promesa.then(function (r) { clearTimeout(t); resolver(r); },
                   function (e) { clearTimeout(t); rechazar(e); });
    });
  }

  function leerJSON(r) {
    if (!r.ok) throw new Error('El servidor respondió ' + r.status);
    return r.json().then(function (d) {
      if (d && d.ok === false) throw new Error(d.error || 'Error del servidor');
      return d;
    });
  }

  /* ------------------- padrón ------------------- */

  function bajarPadron() {
    avisar('padron:inicio');
    return pedir({ accion: 'padron' }).then(function (d) {
      Almacen.guardarPadron(d);
      Buscador.construir(d.instalaciones);
      Almacen.pref('ts_padron', d.ts);
      avisar('padron:ok', { instalaciones: d.instalaciones.length,
                            calles: d.calles.length });
      return d;
    }).catch(function (e) {
      avisar('padron:error', e.message);
      throw e;
    });
  }

  /* ------------------- cola ------------------- */

  function subirPendientes() {
    if (enVuelo) return Promise.resolve(null);
    var p = Almacen.pendientes();
    var total = (p.elementos || []).length + (p.componentes || []).length
              + (p.tramos || []).length;
    if (!total) return Promise.resolve({ vacia: true });
    if (!hayRed()) { avisar('cola:sin_red', total); return Promise.resolve(null); }

    enVuelo = true;
    avisar('cola:subiendo', total);

    return enviar({
      accion: 'guardar',
      elementos: p.elementos || [],
      componentes: p.componentes || [],
      tramos: p.tramos || []
    }).then(function (d) {
      ['elementos', 'componentes', 'tramos'].forEach(function (t) {
        if (d[t] && d[t].ids) Almacen.confirmar(t, d[t].ids);
      });
      enVuelo = false;
      avisar('cola:ok', Almacen.cantidadPendiente());
      return d;
    }).catch(function (e) {
      enVuelo = false;
      /* No se borra nada de la cola. Se reintenta y listo. */
      avisar('cola:error', e.message);
      return null;
    });
  }

  /* ------------------- cambios de los demás ------------------- */

  function bajarCambios() {
    if (!hayRed()) return Promise.resolve(null);
    var desde = Almacen.relevados().ts;
    var params = { accion: 'cambios' };
    if (desde) params.desde = desde;

    return pedir(params).then(function (d) {
      var n = (d.elementos || []).length + (d.componentes || []).length
            + (d.tramos || []).length;
      if (n) {
        Almacen.fusionarRelevados(d);
        avisar('cambios:ok', n);
      }
      return d;
    }).catch(function (e) {
      avisar('cambios:error', e.message);
      return null;
    });
  }

  /* ------------------- arranque ------------------- */

  function iniciar() {
    Almacen.verificarEsquema();

    if (Almacen.hayPadron()) {
      Buscador.construir(Almacen.padron().instalaciones);
      avisar('padron:local', Almacen.padron().instalaciones.length);
    }

    window.addEventListener('online', function () {
      avisar('red:online');
      subirPendientes();
    });
    window.addEventListener('offline', function () { avisar('red:offline'); });

    timers.cola = setInterval(subirPendientes, CONFIG.SYNC.reintento_ms);
    timers.cambios = setInterval(bajarCambios, CONFIG.SYNC.cambios_ms);

    if (hayRed()) {
      var p = Almacen.hayPadron() ? Promise.resolve() : bajarPadron();
      p.then(bajarCambios).then(subirPendientes).catch(function () {});
    }
  }

  /* Sincronización manual, la del botón */
  function ahora() {
    return subirPendientes()
      .then(bajarCambios)
      .then(function () { avisar('sync:listo', Almacen.cantidadPendiente()); });
  }

  return {
    on: on,
    iniciar: iniciar,
    ahora: ahora,
    bajarPadron: bajarPadron,
    bajarCambios: bajarCambios,
    subirPendientes: subirPendientes,
    hayRed: hayRed
  };
})();
