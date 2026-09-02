/* ============================================================
   APP - modulo 1
   Alta del relevador, buscador y estado de sincronizacion.
   La captura GPS y los formularios llegan en el modulo 2.
   ============================================================ */

var App = (function () {

  /* Subir esto cada vez que cambia la estructura del HTML.
     El diagnóstico lo muestra, así se detecta al instante si
     los archivos quedaron desincronizados.                  */
  var VERSION = '3.3';

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

  var faltantes = [];

  /* Engancha un evento sin asumir que el elemento existe */
  function enlazar(id, evento, fn) {
    var n = document.getElementById(id);
    if (!n) { faltantes.push(id); return null; }
    n.addEventListener(evento, fn);
    return n;
  }

  function nodo(id) {
    var n = document.getElementById(id);
    if (!n) faltantes.push(id);
    return n;
  }

  /* En un celular no se puede abrir la consola, asi que
     cualquier error tiene que verse en la pantalla.       */
  function mostrarFatal(msg) {
    var f = document.getElementById('fatal');
    if (!f) { alert(msg); return; }
    var hora = new Date().toLocaleTimeString();
    f.hidden = false;
    f.textContent = 'Algo se rompió  (' + hora + ')\n\n' + msg
      + '\n\nTocá acá para cerrar este aviso.';
    /* Con la hora se distingue un error nuevo de uno viejo que
       quedó en pantalla, y se puede descartar de un toque.     */
    f.onclick = function () { f.hidden = true; };
  }

  window.addEventListener('error', function (e) {
    mostrarFatal((e.message || 'Error') + '\n' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    mostrarFatal(String((e.reason && e.reason.message) || e.reason));
  });

  /* ------------------- arranque ------------------- */

  function iniciar() {
    el.portada   = nodo('portada');
    el.principal = nodo('principal');
    el.quien     = nodo('quien');
    el.punto     = nodo('punto');
    el.estadoTxt = nodo('estadoTxt');
    el.entrada   = nodo('entrada');
    el.pista     = nodo('pista');
    el.lista     = nodo('lista');
    el.selector  = nodo('selectorRelevador');

    Sync.on(alCambiarEstado);
    Sync.iniciar();

    document.querySelectorAll('.pestania').forEach(function (b) {
      b.addEventListener('click', function () { cambiarSolapa(b.dataset.solapa); });
    });

    /* Si el index.html quedó desactualizado respecto del JS,
       falta algún elemento. Antes eso tumbaba toda la app; ahora
       se anota y se sigue, y el diagnóstico lo muestra.        */
    enlazar('entrada', 'input', debounce(buscar, 160));
    enlazar('sincronizar', 'click', sincronizar);
    enlazar('entrar', 'click', entrar);
    enlazar('revisar', 'click', diagnosticar);
    enlazar('continuar', 'click', continuarSesion);
    enlazar('cambiar', 'click', pedirNombre);
    enlazar('quien', 'click', cambiarRelevador);
    enlazar('atras', 'click', volver);
    window.addEventListener('popstate', retroceder);

    if (faltantes.length) {
      mostrarFatal('El index.html no coincide con el resto de los archivos.\n'
        + 'Faltan estos elementos: ' + faltantes.join(', ')
        + '\n\nSubí la versión nueva de index.html.');
    }

    /* Un refresco de página no es empezar de nuevo. Si la sesión
       sigue abierta se entra directo; si no, se pregunta, pero
       con un atajo de un toque para el caso habitual.          */
    if (Almacen.sesionActiva() && Almacen.pref('relevador')) mostrarPrincipal();
    else mostrarPortada();
  }

  /* ------------------- navegación -------------------
     El botón atrás del celular tiene que funcionar. Si no,
     el operario sale de la app sin querer y pierde el hilo. */

  var VISTAS = {
    principal: { el: 'principal',    titulo: 'Relevamiento' },
    ficha:     { el: 'vistaFicha',   titulo: 'Instalación' },
    tipo:      { el: 'vistaTipo',    titulo: 'Nuevo elemento' },
    captura:   { el: 'vistaCaptura', titulo: 'Capturar' },
    datos:     { el: 'vistaDatos',   titulo: 'Datos del elemento' },
    comp:      { el: 'vistaComp',    titulo: 'Componentes' },
    guardado:  { el: 'vistaGuardado',titulo: 'Guardado' },
    camara:    { el: 'vistaCamara',  titulo: 'Cámara' },
    conectar:  { el: 'vistaConectar',titulo: 'Conectar' },
    tramoNuevo:{ el: 'vistaTramoNuevo', titulo: 'Nuevo ducto' },
    tramo:     { el: 'vistaTramo',   titulo: 'Ducto' },
    obstruccion:{el: 'vistaObstruccion', titulo: 'Obstrucción' }
  };
  var pila = ['principal'];

  function irA(v, sinHistorial) {
    if (!VISTAS[v]) return;
    if (!sinHistorial) {
      pila.push(v);
      try { history.pushState({ vista: v }, '', '#' + v); } catch (e) {}
    }
    pintarVista(v);
  }

  function pintarVista(v) {
    Object.keys(VISTAS).forEach(function (k) {
      var n = document.getElementById(VISTAS[k].el);
      if (n) n.hidden = (k !== v);
    });
    document.getElementById('titulo').textContent = VISTAS[v].titulo;
    document.getElementById('atras').hidden = (v === 'principal');
    /* El GPS queda encendido mientras la app está en uso: apagarlo
       obligaba a esperar el arranque en frío en cada captura. */
    if (v === 'principal') { Ficha.salir(); Red.salir(); pintarSolapa(); }
    window.scrollTo(0, 0);
  }

  function volver() {
    if (pila.length <= 1) return;
    try { history.back(); } catch (e) { retroceder(); }
  }

  function retroceder() {
    pila.pop();
    var v = pila[pila.length - 1] || 'principal';
    /* Al volver a la ficha se vuelve a dibujar: puede haber
       cambiado el avance por lo que se acaba de cargar.      */
    if (v === 'ficha' && Ficha.actual()) Ficha.abrir(Ficha.actual());
    if (v === 'camara') Red.refrescar();
    pintarVista(v);
  }

  /* Aviso breve de que algo se guardó */
  var timerBrindis = null;
  function avisarGuardado(msg) {
    var b = document.getElementById('brindis');
    b.textContent = msg;
    b.hidden = false;
    clearTimeout(timerBrindis);
    timerBrindis = setTimeout(function () { b.hidden = true; }, 2600);
  }

  /* ------------------- alta del relevador ------------------- */

  function mostrarPortada() {
    el.portada.hidden = false;
    el.principal.hidden = true;
    document.getElementById('quien').hidden = true;
    poblarRelevadores();

    /* Si ya hubo alguien en este equipo, el caso normal es que
       siga siendo la misma persona: un toque y adentro.        */
    var ultimo = Almacen.pref('relevador');
    var cont = document.getElementById('continuar');
    var cambiar = document.getElementById('cambiar');
    var eleccion = document.getElementById('eleccion');

    if (ultimo) {
      document.getElementById('tituloPortada').textContent = 'Hola de nuevo';
      document.getElementById('subPortada').textContent =
        'Si sos otra persona, cambialo antes de empezar.';
      cont.textContent = 'Continuar como ' + ultimo;
      cont.hidden = false;
      cambiar.hidden = false;
      eleccion.hidden = true;
    } else {
      cont.hidden = true;
      cambiar.hidden = true;
      eleccion.hidden = false;
    }
  }

  function continuarSesion() {
    Almacen.abrirSesion();
    mostrarPrincipal();
  }

  /* Muestra el selector, ocultando el atajo */
  function pedirNombre() {
    document.getElementById('tituloPortada').textContent = '¿Quién está relevando?';
    document.getElementById('subPortada').textContent =
      'Tu nombre queda guardado en cada registro que cargues.';
    document.getElementById('continuar').hidden = true;
    document.getElementById('cambiar').hidden = true;
    document.getElementById('eleccion').hidden = false;
    poblarRelevadores();
  }

  /* Desde la barra superior, sin recargar */
  function cambiarRelevador() {
    Almacen.cerrarSesion();
    mostrarPortada();
    pedirNombre();
  }

  /* La lista sale de la hoja 'relevadores', no de quienes usaron
     la app antes: si no, con el tiempo sería un listado infinito.
     El campo manual está siempre disponible.                    */
  function poblarRelevadores() {
    var p = Almacen.padron();
    var lista = (p && p.relevadores) ? p.relevadores.filter(function (r) {
      return r.nombre && r.activo !== false && r.activo !== 'FALSE';
    }) : [];

    var manual = document.getElementById('nombreManual');
    var sep = document.getElementById('sepPortada');
    var aviso = document.getElementById('avisoPortada');
    var ultimo = Almacen.pref('relevador');

    el.selector.innerHTML = '';
    manual.value = '';

    if (!lista.length) {
      el.selector.hidden = true;
      sep.hidden = true;
      aviso.hidden = false;
      return;
    }

    el.selector.hidden = false;
    sep.hidden = false;
    aviso.hidden = true;

    var vacio = document.createElement('option');
    vacio.value = '';
    vacio.textContent = 'Elegí tu nombre';
    el.selector.appendChild(vacio);

    lista.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.nombre;
      o.textContent = r.nombre + (r.zona ? '  ·  ' + r.zona : '');
      if (r.nombre === ultimo) o.selected = true;
      el.selector.appendChild(o);
    });
  }

  function entrar() {
    var manual = document.getElementById('nombreManual');
    /* Lo escrito a mano gana: si alguien completó el campo, es
       porque no está en la lista.                              */
    var n = manual.value.trim() || el.selector.value;
    if (!n) {
      avisarGuardado('Elegí o escribí tu nombre');
      manual.focus();
      return;
    }
    Almacen.pref('relevador', n);
    Almacen.abrirSesion();
    mostrarPrincipal();
  }

  /* ------------------- diagnóstico ------------------- */

  function diagnosticar() {
    var caja = document.getElementById('diagnostico');
    caja.hidden = false;
    var lineas = [];

    function marcar(ok, texto) { lineas.push((ok ? '✓  ' : '✗  ') + texto); }

    lineas.push('app.js v' + VERSION);
    lineas.push('');

    marcar(typeof POSGAR !== 'undefined', 'js/posgar.js cargado');
    marcar(typeof Red !== 'undefined', 'js/red.js cargado');
    marcar(typeof CONFIG !== 'undefined', 'js/config.js cargado');
    marcar(typeof Almacen !== 'undefined', 'js/almacen.js cargado');
    marcar(typeof Buscador !== 'undefined', 'js/buscador.js cargado');
    marcar(typeof Sync !== 'undefined', 'js/sync.js cargado');

    var hayApi = typeof CONFIG !== 'undefined' && !!CONFIG.API;
    marcar(hayApi, hayApi ? 'CONFIG.API configurada' : 'CONFIG.API está vacía en js/config.js');

    /* La comprobación que importa: el HTML tiene que tener la
       estructura que este app.js espera.                     */
    var panel = document.getElementById('panelBuscador');
    var red = document.getElementById('vistaRed');
    marcar(!!panel, 'index.html tiene #panelBuscador');
    marcar(!!red, 'index.html tiene #vistaRed');
    if (panel && red) {
      var dentro = document.getElementById('principal')
                && document.getElementById('principal').contains(red);
      marcar(dentro, dentro ? 'la lista de red está dentro de la pantalla principal'
                            : 'index.html VIEJO: #vistaRed está fuera de #principal');
    }

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
    Almacen.abrirSesion();
    el.portada.hidden = true;
    el.principal.hidden = false;
    el.quien.hidden = false;
    el.quien.textContent = Almacen.pref('relevador') || '';
    el.quien.title = 'Tocá para cambiar de relevador';
    seguirPosicion();
    cambiarSolapa('cerca');
  }

  /* ------------------- ubicación ------------------- */

  /* Antes había DOS rastreadores en paralelo, uno acá y otro en
     gps.js. Eso gastaba batería de más y, peor, dejaba la pantalla
     de captura esperando una lectura que nunca llegaba cuando se
     entraba desde la pestaña Red. Ahora hay uno solo.           */
  function seguirPosicion() {
    if (!navigator.geolocation) {
      el.pista.textContent = 'Este dispositivo no tiene GPS disponible.';
      return;
    }
    GPS.on(function (l, err) {
      if (err) {
        posicion = null;
        if (solapa === 'cerca') {
          pintarVacio('Sin señal de GPS',
            err.code === 1 ? 'Permitile a la app usar la ubicación desde los ajustes del navegador.'
                           : 'Salí a cielo abierto y esperá unos segundos.');
        }
        return;
      }
      posicion = { lat: l.lat, lon: l.lon, acc: l.acc };
      if (solapa === 'cerca') render();
    });
    GPS.iniciar();
  }

  /* ------------------- solapas ------------------- */

  function cambiarSolapa(s) {
    solapa = s;
    document.querySelectorAll('.pestania').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.solapa === s ? 'true' : 'false');
    });
    pintarSolapa();
    if (s === 'buscar') el.entrada.focus();
  }

  /* Dibuja el contenido de la solapa activa dentro de la pantalla
     principal. Las tres son solapas, no pantallas distintas, así
     que el botón atrás nunca tiene que llevarte fuera de acá.   */
  function pintarSolapa() {
    var caja = document.getElementById('cajaBuscar');
    var panel = document.getElementById('panelBuscador');
    var red = document.getElementById('vistaRed');

    if (!panel || !red) {
      mostrarFatal('El index.html no coincide con app.js v' + VERSION + '.\n'
        + 'Falta ' + (!panel ? '#panelBuscador' : '#vistaRed') + '.\n\n'
        + 'Subí la versión nueva de index.html.');
      return;
    }
    if (caja) caja.hidden = (solapa !== 'buscar');
    panel.hidden = (solapa === 'red');
    red.hidden = (solapa !== 'red');

    if (solapa === 'red') Red.abrirLista();
    else render();
  }

  /* Vuelve a la pantalla principal con la solapa de red activa */
  function volverARed() {
    solapa = 'red';
    document.querySelectorAll('.pestania').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.solapa === 'red' ? 'true' : 'false');
    });
    irA('principal', true);
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

  function abrirFicha(r) {
    var inst = r.datos || Buscador.porInventario(r.inv);
    if (!inst) return;
    Ficha.abrir(inst);
    irA('ficha');
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

  return { iniciar: iniciar, irA: irA, avisarGuardado: avisarGuardado,
           volverARed: volverARed };
})();

document.addEventListener('DOMContentLoaded', App.iniciar);