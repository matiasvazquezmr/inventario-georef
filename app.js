/* ============================================================
   APP - modulo 1
   Alta del relevador, buscador y estado de sincronizacion.
   La captura GPS y los formularios llegan en el modulo 2.
   ============================================================ */

var App = (function () {

  var el = {};
  var posicion = null;
  var watchId = null;
  var solapa = 'cerca';

  var NOMBRE_FAMILIA = {
    semaforo: 'Semáforo',
    punto_medida: 'Punto de medida',
    pmv: 'Pantalla de mensajería',
    pov: 'Onda verde',
    cctv: 'Cámara',
    central_zona: 'Central de zona'
  };

  /* En un celular no se puede abrir la consola, asi que
     cualquier error tiene que verse en la pantalla.       */
  function mostrarFatal(msg) {
    var f = document.getElementById('fatal');
    if (!f) { alert(msg); return; }
    f.hidden = false;
    f.textContent = 'Algo se rompió\n\n' + msg
      + '\n\nTocá «Revisar configuración» para ver qué falta.';
  }

  window.addEventListener('error', function (e) {
    mostrarFatal((e.message || 'Error') + '\n' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    mostrarFatal(String((e.reason && e.reason.message) || e.reason));
  });

  /* ------------------- arranque ------------------- */

  function iniciar() {
    el.portada   = document.getElementById('portada');
    el.principal = document.getElementById('principal');
    el.quien     = document.getElementById('quien');
    el.punto     = document.getElementById('punto');
    el.estadoTxt = document.getElementById('estadoTxt');
    el.entrada   = document.getElementById('entrada');
    el.pista     = document.getElementById('pista');
    el.lista     = document.getElementById('lista');
    el.selector  = document.getElementById('selectorRelevador');

    Sync.on(alCambiarEstado);
    Sync.iniciar();

    document.querySelectorAll('.pestania').forEach(function (b) {
      b.addEventListener('click', function () { cambiarSolapa(b.dataset.solapa); });
    });

    el.entrada.addEventListener('input', debounce(buscar, 160));
    document.getElementById('sincronizar').addEventListener('click', sincronizar);
    document.getElementById('entrar').addEventListener('click', entrar);
    document.getElementById('revisar').addEventListener('click', diagnosticar);

    if (Almacen.pref('relevador')) mostrarPrincipal();
    else mostrarPortada();
  }

  /* ------------------- alta del relevador ------------------- */

  function mostrarPortada() {
    el.portada.hidden = false;
    el.principal.hidden = true;
    poblarRelevadores();
  }

  function poblarRelevadores() {
    var p = Almacen.padron();
    var lista = (p && p.relevadores) ? p.relevadores.filter(function (r) {
      return r.activo !== false && r.activo !== 'FALSE';
    }) : [];

    var manual = document.getElementById('nombreManual');
    var aviso = document.getElementById('avisoPortada');

    el.selector.innerHTML = '';

    if (!lista.length) {
      /* Sin padrón no se puede quedar en un callejón sin salida:
         se escribe el nombre a mano y se sigue.                  */
      el.selector.hidden = true;
      manual.hidden = false;
      aviso.hidden = false;
      document.getElementById('entrar').disabled = false;
      return;
    }

    el.selector.hidden = false;
    manual.hidden = true;
    aviso.hidden = true;
    document.getElementById('entrar').disabled = false;

    lista.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.nombre;
      o.textContent = r.nombre + (r.zona ? '  ·  ' + r.zona : '');
      el.selector.appendChild(o);
    });
  }

  function entrar() {
    var manual = document.getElementById('nombreManual');
    var n = manual.hidden ? el.selector.value : manual.value.trim();
    if (!n) { manual.focus(); return; }
    Almacen.pref('relevador', n);
    mostrarPrincipal();
  }

  /* ------------------- diagnóstico ------------------- */

  function diagnosticar() {
    var caja = document.getElementById('diagnostico');
    caja.hidden = false;
    var lineas = [];

    function marcar(ok, texto) { lineas.push((ok ? '✓  ' : '✗  ') + texto); }

    marcar(typeof POSGAR !== 'undefined', 'js/posgar.js cargado');
    marcar(typeof CONFIG !== 'undefined', 'js/config.js cargado');
    marcar(typeof Almacen !== 'undefined', 'js/almacen.js cargado');
    marcar(typeof Buscador !== 'undefined', 'js/buscador.js cargado');
    marcar(typeof Sync !== 'undefined', 'js/sync.js cargado');

    var hayApi = typeof CONFIG !== 'undefined' && !!CONFIG.API;
    marcar(hayApi, hayApi ? 'CONFIG.API configurada' : 'CONFIG.API está vacía en js/config.js');

    marcar(location.protocol === 'https:', 'servido por HTTPS (el GPS lo exige)');
    marcar(!!navigator.geolocation, 'el navegador expone GPS');

    try {
      localStorage.setItem('gs.test', '1');
      localStorage.removeItem('gs.test');
      marcar(true, 'almacenamiento local disponible');
    } catch (e) {
      marcar(false, 'almacenamiento local bloqueado (¿modo incógnito?)');
    }

    marcar(navigator.onLine !== false, 'hay conexión a internet');

    if (typeof Almacen !== 'undefined') {
      var p = Almacen.padron();
      marcar(!!(p && p.instalaciones && p.instalaciones.length),
             p && p.instalaciones ? 'padrón local: ' + p.instalaciones.length + ' instalaciones'
                                  : 'todavía no se bajó el padrón');
    }

    caja.textContent = lineas.join('\n') + '\n\nProbando el backend…';

    if (!hayApi) {
      caja.textContent = lineas.join('\n')
        + '\n\nFalta pegar la URL /exec de la implementación\nde Apps Script en js/config.js.';
      return;
    }

    fetch(CONFIG.API + '?accion=ping')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        marcar(!!d.ok, 'el backend respondió (versión ' + (d.version || '?') + ')');
        caja.textContent = lineas.join('\n');
      })
      .catch(function (e) {
        marcar(false, 'el backend no respondió: ' + e.message);
        lineas.push('');
        lineas.push('Revisá que la implementación esté publicada');
        lineas.push('con acceso «Cualquier persona».');
        caja.textContent = lineas.join('\n');
      });
  }

  function mostrarPrincipal() {
    el.portada.hidden = true;
    el.principal.hidden = false;
    el.quien.textContent = Almacen.pref('relevador') || '';
    seguirPosicion();
    cambiarSolapa('cerca');
  }

  /* ------------------- ubicación ------------------- */

  function seguirPosicion() {
    if (!navigator.geolocation) {
      el.pista.textContent = 'Este dispositivo no tiene GPS disponible.';
      return;
    }
    /* Se deja prendido: cuando el relevador llegue a la esquina,
       la lectura ya está estabilizada.                          */
    watchId = navigator.geolocation.watchPosition(function (p) {
      posicion = { lat: p.coords.latitude, lon: p.coords.longitude,
                   acc: p.coords.accuracy };
      if (solapa === 'cerca') render();
    }, function (err) {
      posicion = null;
      if (solapa === 'cerca') {
        pintarVacio('Sin señal de GPS',
          err.code === 1 ? 'Permitile a la app usar la ubicación desde los ajustes del navegador.'
                         : 'Salí a cielo abierto y esperá unos segundos.');
      }
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }

  /* ------------------- solapas ------------------- */

  function cambiarSolapa(s) {
    solapa = s;
    document.querySelectorAll('.pestania').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.solapa === s ? 'true' : 'false');
    });
    document.getElementById('cajaBuscar').hidden = (s !== 'buscar');
    if (s === 'buscar') el.entrada.focus();
    render();
  }

  /* ------------------- render ------------------- */

  function render() {
    if (!Almacen.hayPadron()) {
      pintarVacio('Todavía no bajaste el padrón',
                  'Conectate a internet y tocá Sincronizar.');
      return;
    }
    if (solapa === 'cerca') renderCerca();
    else buscar();
  }

  function renderCerca() {
    if (!posicion) {
      pintarVacio('Buscando tu ubicación', 'Esperá unos segundos.');
      return;
    }
    var r = Buscador.cerca(posicion);
    if (!r.length) {
      pintarVacio('No hay instalaciones cerca',
                  'Estás a más de ' + CONFIG.BUSQUEDA.radio_cerca_m
                  + ' m de la más próxima. Buscá por número o por calle.');
      return;
    }
    pintarLista(r);
    el.pista.textContent = 'Tu posición tiene ' + Math.round(posicion.acc) + ' m de precisión.';
  }

  function buscar() {
    var q = el.entrada.value.trim();
    if (!q) {
      pintarVacio('Buscá una instalación',
                  'Escribí el número de inventario o el nombre de las calles.');
      el.pista.textContent = '';
      return;
    }
    var r = Buscador.buscar(q, posicion);
    if (!r.length) {
      pintarVacio('No encontré nada con "' + q + '"',
                  'Probá con una sola calle, o revisá el número.');
      return;
    }
    pintarLista(r);
    el.pista.textContent = r.length + (r.length === 1 ? ' resultado' : ' resultados');
  }

  function pintarLista(resultados) {
    el.lista.innerHTML = '';
    resultados.forEach(function (r) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.className = 'fila';
      b.dataset.familia = r.familia;
      b.dataset.inv = r.inv;

      var inv = document.createElement('span');
      inv.className = 'inv';
      inv.textContent = r.inv;

      var cruce = document.createElement('span');
      cruce.className = 'cruce';
      var nom = document.createElement('b');
      nom.textContent = (r.calle_1 || '') + (r.calle_2 ? ' y ' + r.calle_2 : '');
      var sub = document.createElement('span');
      var relevados = Almacen.elementosDe(r.inv).length;
      sub.textContent = (NOMBRE_FAMILIA[r.familia] || r.familia)
                      + (relevados ? '  ·  ' + relevados + ' relevado'
                                     + (relevados === 1 ? '' : 's') : '');
      cruce.appendChild(nom);
      cruce.appendChild(sub);

      b.appendChild(inv);
      b.appendChild(cruce);

      if (r.dist_m !== null) {
        var d = document.createElement('span');
        d.className = 'dist' + (r.dist_m <= 25 ? ' pegado' : '');
        d.textContent = r.dist_m < 1000 ? r.dist_m + ' m'
                                        : (r.dist_m / 1000).toFixed(1) + ' km';
        b.appendChild(d);
      }

      b.addEventListener('click', function () { abrirFicha(r); });
      li.appendChild(b);
      el.lista.appendChild(li);
    });
  }

  function pintarVacio(titulo, texto) {
    el.lista.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'vacio';
    var h = document.createElement('p');
    h.innerHTML = '<b>' + titulo + '</b>';
    var p = document.createElement('p');
    p.textContent = texto;
    d.appendChild(h);
    d.appendChild(p);
    el.lista.appendChild(d);
  }

  /* La ficha llega en el módulo 2. Por ahora deja ver que el
     buscador encontró lo correcto.                            */
  function abrirFicha(r) {
    alert(r.inv + '\n' + (r.calle_1 || '') + ' y ' + (r.calle_2 || '')
        + '\n' + (NOMBRE_FAMILIA[r.familia] || r.familia)
        + (r.zona ? '\n' + r.zona : '')
        + (r.dist_m !== null ? '\n\nA ' + r.dist_m + ' m tuyo' : ''));
  }

  /* ------------------- sincronización ------------------- */

  function sincronizar() {
    if (!Almacen.hayPadron()) Sync.bajarPadron().then(render).catch(function () {});
    else Sync.ahora().then(render);
  }

  function alCambiarEstado(estado, detalle) {
    var pend = Almacen.cantidadPendiente();
    var clase = '', txt = pend ? String(pend) : 'Al día';

    if (estado === 'padron:inicio' || estado === 'cola:subiendo') {
      clase = 'trabajando'; txt = 'Sincronizando';
    } else if (estado === 'red:offline' || estado === 'cola:sin_red') {
      clase = 'sin-red'; txt = pend ? pend + ' sin subir' : 'Sin conexión';
    } else if (estado.indexOf(':error') > 0) {
      clase = 'error'; txt = pend ? pend + ' sin subir' : 'Error';
    } else if (estado === 'padron:ok') {
      poblarRelevadores();
      txt = detalle.instalaciones + ' instalaciones';
      setTimeout(function () { alCambiarEstado('sync:listo'); }, 2500);
    }

    el.punto.className = 'punto ' + clase;
    el.estadoTxt.textContent = txt;
  }

  /* ------------------- utilidades ------------------- */

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  return { iniciar: iniciar };
})();

document.addEventListener('DOMContentLoaded', App.iniciar);