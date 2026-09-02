/* ============================================================
   FICHA Y CAPTURA

   Dos pantallas:
     ficha    los datos de la instalacion y que falta relevar
     captura  el flujo GPS -> mapa -> guardar

   El control de avance compara los conteos que ya tenias
   declarados en el inventario contra lo que se relevo. Eso
   convierte la planilla vieja en una lista de tareas.
   ============================================================ */

var Ficha = (function () {

  var actual = null;        // instalación abierta
  var enCaptura = null;     // { tipo, punto, original }

  /* Columnas del inventario original -> que elemento cuentan.
     Los nombres son los de la planilla, tal cual.             */
  var DECLARADOS = {
    semaforo: [
      { col: 'MENSULAS',  etiqueta: 'Columnas con ménsula', tipo: 'columna', sub: 'mensula' },
      { col: 'COL. 101',  etiqueta: 'Columnas 101',         tipo: 'columna', sub: '101' },
      { col: 'Cant Sonoros', etiqueta: 'Sonorizadores',     tipo: 'sonorizador' }
    ]
  };

  /* Configuraciones de cuerpo, con el nombre de columna real */
  var CUERPOS = [
    ['3x200', '3x200'], ['3X300', '3x300'], ['300+2X200', '300 + 2x200'],
    ['Peatonales', 'Peatonal'],
    ['GIRO 2X200 V-V', 'Giro 2x200 V-V'], ['GIRO 2X200 R-V', 'Giro 2x200 R-V'],
    ['GIRO 3X200 R-R-V', 'Giro 3x200 R-R-V'], ['GIRO 3X200 R-A-V', 'Giro 3x200 R-A-V'],
    ['GIRO 2X300 V-V', 'Giro 2x300 V-V'], ['GIRO 2X300 R-V', 'Giro 2x300 R-V'],
    ['GIRO 3X300 R-R-V', 'Giro 3x300 R-R-V'], ['GIRO 3X300 R-A-V', 'Giro 3x300 R-A-V']
  ];

  function datos(inst) {
    try { return JSON.parse(inst.datos_json || '{}'); } catch (e) { return {}; }
  }

  function num(v) {
    if (v === '' || v === null || v === undefined) return 0;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  /* ------------------- ficha ------------------- */

  function abrir(inst) {
    actual = inst;
    GPS.iniciar();
    var c = document.getElementById('vistaFicha');
    c.innerHTML = '';
    c.appendChild(cabecera(inst));
    c.appendChild(avance(inst));
    c.appendChild(relevado(inst));
    c.appendChild(botonAgregar(inst));
  }

  function cabecera(inst) {
    var d = datos(inst);
    var box = document.createElement('div');
    box.className = 'bloque';

    /* El número de inventario va primero y como chapa: es lo que
       conecta la app con la planilla y lo primero que se busca. */
    if (inst.inv) {
      var chapa = document.createElement('div');
      chapa.className = 'chapa';
      chapa.textContent = inst.inv;
      box.appendChild(chapa);
    }

    var h = document.createElement('h2');
    h.textContent = (inst.calle_1 || '') + (inst.calle_2 ? ' y ' + inst.calle_2 : '');
    box.appendChild(h);

    var ubic = [];
    if (inst.zona) ubic.push('Zona ' + String(inst.zona).replace(/^Zona /i, '')
                              .replace('1', 'norte').replace('2', 'sur'));
    if (inst.distrito) ubic.push('distrito ' + capitalizar(inst.distrito));
    if (ubic.length) {
      var sub = document.createElement('p');
      sub.className = 'sub';
      sub.textContent = ubic.join(', ');
      box.appendChild(sub);
    }

    /* Solo lo que sirve en la calle. El resto vive en la planilla. */
    var utiles = [
      ['Sistema', d['Sistema']],
      ['Controlador', d['CONTROLADOR']],
      ['N° de serie', d['Nº de Serie']],
      ['Conexión', d['CONEXION']],
      ['N° de cruce', d['Nº Cruce']],
      ['Regulador', d['Nº Regulador']],
      ['Estado', d['ESTADO']]
    ].filter(function (p) { return p[1]; });

    if (utiles.length) {
      var dl = document.createElement('dl');
      dl.className = 'datos';
      utiles.forEach(function (p) {
        var dt = document.createElement('dt'); dt.textContent = p[0];
        var dd = document.createElement('dd'); dd.textContent = p[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      box.appendChild(dl);
    }
    return box;
  }

  /* Avance: declarado contra relevado */
  function avance(inst) {
    var box = document.createElement('div');
    box.className = 'bloque';
    var d = datos(inst);
    var elementos = Almacen.elementosDe(inst.inv);

    var filas = [];

    (DECLARADOS[inst.familia] || []).forEach(function (def) {
      var dec = num(d[def.col]);
      if (!dec) return;
      var rel = elementos.filter(function (e) {
        if (e.tipo !== def.tipo) return false;
        if (!def.sub) return true;
        try { return JSON.parse(e.atributos_json || '{}').subtipo === def.sub; }
        catch (x) { return false; }
      }).length;
      filas.push({ etiqueta: def.etiqueta, dec: dec, rel: rel });
    });

    if (inst.familia === 'semaforo') {
      var decCuerpos = 0;
      CUERPOS.forEach(function (c) { decCuerpos += num(d[c[0]]); });
      if (decCuerpos) {
        var comp = Almacen.relevados().componentes.filter(function (k) {
          if (k.tipo !== 'cuerpo' || k.activo === false) return false;
          return elementos.some(function (e) { return e.id === k.id_elemento; });
        }).length;
        filas.push({ etiqueta: 'Cuerpos semafóricos', dec: decCuerpos, rel: comp });
      }
    }

    var h = document.createElement('h3');
    h.textContent = 'Avance del relevamiento';
    box.appendChild(h);

    if (!filas.length) {
      var p = document.createElement('p');
      p.className = 'sub';
      p.textContent = elementos.length
        ? elementos.length + ' elemento' + (elementos.length === 1 ? '' : 's') + ' relevado' + (elementos.length === 1 ? '' : 's') + '.'
        : 'Esta instalación no tiene conteos declarados. Cargá lo que encuentres.';
      box.appendChild(p);
      return box;
    }

    /* El número dice cuánto falta antes de leer la etiqueta.
       La barra de progreso no agregaba precisión, solo ruido. */
    filas.forEach(function (f) {
      var fila = document.createElement('div');
      fila.className = 'avance';

      var n = document.createElement('span');
      n.className = 'av-num' + (f.rel >= f.dec ? ' listo' : '');
      n.textContent = f.rel;
      var de = document.createElement('span');
      de.className = 'de';
      de.textContent = '/' + (f.dec % 1 ? f.dec.toFixed(1) : f.dec);
      n.appendChild(de);

      var et = document.createElement('span');
      et.className = 'av-et';
      et.textContent = f.etiqueta;

      fila.appendChild(n);
      fila.appendChild(et);
      box.appendChild(fila);
    });

    return box;
  }

  function relevado(inst) {
    var box = document.createElement('div');
    box.className = 'bloque';
    var elementos = Almacen.elementosDe(inst.inv);
    if (!elementos.length) return box;

    var h = document.createElement('h3');
    h.textContent = 'Relevado acá';
    box.appendChild(h);

    var ul = document.createElement('ul');
    ul.className = 'relevados';
    elementos.sort(function (a, b) {
      return String(b.fecha_alta).localeCompare(String(a.fecha_alta));
    }).forEach(function (e) {
      var li = document.createElement('li');
      var t = (CATALOGO.elementos[e.tipo] && CATALOGO.elementos[e.tipo].nombre) || e.tipo;
      var pend = Almacen.pendientes().elementos.some(function (p) { return p.id === e.id; });
      li.innerHTML = '<b></b><span class="num"></span>';
      var a = {};
      try { a = JSON.parse(e.atributos_json || '{}'); } catch (x) {}
      li.querySelector('b').textContent = t + (a.subtipo ? ' ' + etiquetaSubtipo(e.tipo, a.subtipo) : '');
      li.querySelector('span').textContent = pend ? 'sin subir'
        : (e.accuracy_m ? Math.round(e.accuracy_m) + ' m' : '');
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  function botonAgregar(inst) {
    var box = document.createElement('div');
    box.className = 'accion-fija';
    var b = document.createElement('button');
    b.className = 'boton';
    b.type = 'button';
    b.textContent = 'Agregar elemento';
    b.addEventListener('click', function () { elegirTipo(inst); });
    box.appendChild(b);
    return box;
  }

  function capitalizar(s) {
    if (!s) return '';
    s = String(s).toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* Devuelve la etiqueta legible de un subtipo del catálogo */
  function etiquetaSubtipo(tipo, id) {
    var def = CATALOGO.elementos[tipo];
    if (!def) return id;
    var campo = (def.campos || []).filter(function (c) { return c.id === 'subtipo'; })[0];
    if (!campo || !campo.opciones) return id;
    var op = campo.opciones.filter(function (o) {
      return (typeof o === 'string' ? o : o.id) === id;
    })[0];
    if (!op) return id;
    return (typeof op === 'string' ? op : op.label).toLowerCase();
  }

  /* ------------------- elegir qué se releva ------------------- */

  function elegirTipo(inst) {
    var permitidos = Object.keys(CATALOGO.elementos).filter(function (k) {
      var e = CATALOGO.elementos[k];
      if (!e.requiere_instalacion) return true;
      return !e.familias || e.familias.indexOf(inst.familia) >= 0;
    });

    var c = document.getElementById('vistaTipo');
    c.innerHTML = '';

    var h = document.createElement('div');
    h.className = 'bloque';
    h.innerHTML = '<h2>¿Qué vas a relevar?</h2>';
    c.appendChild(h);

    var porGrupo = {};
    permitidos.forEach(function (k) {
      var g = CATALOGO.elementos[k].grupo || 'Otros';
      (porGrupo[g] = porGrupo[g] || []).push(k);
    });

    Object.keys(porGrupo).forEach(function (g) {
      var t = document.createElement('h3');
      t.className = 'grupo';
      t.textContent = g;
      c.appendChild(t);
      var ul = document.createElement('ul');
      ul.className = 'lista';
      porGrupo[g].forEach(function (k) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.className = 'fila';
        b.type = 'button';
        b.innerHTML = '<span class="cruce"><b></b></span>';
        b.querySelector('b').textContent = CATALOGO.elementos[k].nombre || k;
        b.addEventListener('click', function () { iniciarCaptura(inst, k); });
        li.appendChild(b);
        ul.appendChild(li);
      });
      c.appendChild(ul);
    });

    App.irA('tipo');
  }

  /* ------------------- captura ------------------- */

  /* Captura de un elemento que no pertenece a ninguna esquina,
     como una camara de inspeccion a mitad de cuadra. Reusa todo
     el flujo: GPS, mapa y formulario.                          */
  function capturarSuelto(tipo, alTerminar) {
    enCaptura = {
      inst: { familia: '', inv: '', lat: null, lon: null, suelto: true },
      tipo: tipo, punto: null, original: null, alTerminar: alTerminar
    };
    App.irA('captura');
    pintarEsperaGPS();
    GPS.iniciar();
    GPS.on(alLeerGPS);
    alLeerGPS(GPS.posicion(), null);
  }

  function iniciarCaptura(inst, tipo) {
    enCaptura = { inst: inst, tipo: tipo, punto: null, original: null };
    App.irA('captura');
    pintarEsperaGPS();
    GPS.iniciar();
    GPS.on(alLeerGPS);
    /* Si ya hay una lectura, se muestra en el acto en vez de
       dejar el anillo en "buscando señal" hasta la siguiente. */
    alLeerGPS(GPS.posicion(), null);
  }

  function pintarEsperaGPS() {
    var c = document.getElementById('vistaCaptura');
    c.innerHTML = ''
      + '<div class="bloque">'
      +   '<h2>' + (CATALOGO.elementos[enCaptura.tipo].nombre || enCaptura.tipo) + '</h2>'
      +   '<p class="sub">Parate junto al equipo y esperá a que la precisión mejore.</p>'
      + '</div>'
      + '<div class="anillo" id="anillo">'
      +   '<span class="anillo-num" id="anilloNum">—</span>'
      +   '<span class="anillo-un">metros</span>'
      + '</div>'
      + '<p class="pista centrado" id="gpsTexto">Buscando señal</p>'
      + '<div class="bloque">'
      +   '<button class="boton" id="btnCapturar" type="button" style="width:100%" disabled>'
      +     'Capturar punto</button>'
      + '</div>';

    document.getElementById('btnCapturar').addEventListener('click', capturarPunto);
  }

  function alLeerGPS(l, err) {
    var num = document.getElementById('anilloNum');
    var anillo = document.getElementById('anillo');
    var txt = document.getElementById('gpsTexto');
    var btn = document.getElementById('btnCapturar');
    if (!num || !anillo) return;

    if (err || !l) {
      anillo.className = 'anillo' + (err ? ' mala' : '');
      num.textContent = '—';
      if (err) {
        txt.textContent = err.code === 1
          ? 'Permitile a la app usar la ubicación'
          : 'Sin señal de GPS';
      } else {
        /* Todavía no llegó ninguna lectura. No es un error:
           el GPS tarda entre 20 y 40 segundos en frío.      */
        txt.textContent = 'Buscando señal, puede tardar medio minuto';
      }
      return;
    }

    var cal = GPS.calidad(l.acc);
    anillo.className = 'anillo ' + cal;
    num.textContent = Math.round(l.acc);
    txt.textContent = GPS.texto(l.acc) + '  ·  ' + GPS.lecturasAcumuladas() + ' lecturas';
    btn.disabled = (cal === 'mala' || cal === 'nula');
  }

  function capturarPunto() {
    var p = GPS.capturar();
    if (!p) return;
    enCaptura.punto = p;
    enCaptura.original = { lat: p.lat, lon: p.lon };
    GPS.off(alLeerGPS);
    pintarAjuste();
  }

  function pintarAjuste() {
    var e = enCaptura;
    var c = document.getElementById('vistaCaptura');
    c.innerHTML = ''
      + '<div class="bloque">'
      +   '<h2>Ajustá la posición</h2>'
      +   '<p class="sub">Arrastrá o tocá el mapa para poner el pin donde está el equipo.</p>'
      + '</div>'
      + '<div id="mapa" class="mapa"></div>'
      + '<p class="pista" id="infoPunto"></p>'
      + '<div class="bloque acciones">'
      +   '<button class="boton tenue" id="btnVolverGPS" type="button">Volver a medir</button>'
      +   '<button class="boton" id="btnGuardar" type="button">Continuar</button>'
      + '</div>';

    /* La referencia es la coordenada de la esquina según el
       inventario. Un elemento suelto no tiene ninguna.        */
    var ref = (Mapa.esCoord(e.inst.lat) && Mapa.esCoord(e.inst.lon))
            ? { lat: e.inst.lat, lon: e.inst.lon } : null;
    Mapa.crear('mapa', { lat: e.punto.lat, lon: e.punto.lon, acc: e.punto.acc },
               { referencia: ref });
    Mapa.alMoverse(actualizarInfo);
    actualizarInfo();

    document.getElementById('btnVolverGPS').addEventListener('click', function () {
      Mapa.destruir();
      pintarEsperaGPS();
      GPS.on(alLeerGPS);
      alLeerGPS(GPS.posicion(), null);
    });
    document.getElementById('btnGuardar').addEventListener('click', pasarADatos);
  }

  /* ------------------- datos del elemento ------------------- */

  function pasarADatos() {
    var e = enCaptura;
    /* La coordenada se congela acá, antes de destruir el mapa */
    var fin = Mapa.posicionPin() || { lat: e.punto.lat, lon: e.punto.lon };
    e.final = fin;
    e.movido = Mapa.desplazamiento(e.original);
    Mapa.destruir();
    App.irA('datos');
    pintarDatos();
  }

  function pintarDatos() {
    var e = enCaptura;
    var def = CATALOGO.elementos[e.tipo];
    var c = document.getElementById('vistaDatos');

    c.innerHTML = ''
      + '<div class="bloque">'
      +   '<h2>' + (def.nombre || e.tipo) + '</h2>'
      +   '<p class="sub" id="resumenPunto"></p>'
      + '</div>'
      + '<div class="bloque" id="formulario"></div>'
      + '<div class="bloque acciones">'
      +   '<button class="boton tenue" id="btnVolverMapa" type="button">Volver al mapa</button>'
      +   '<button class="boton" id="btnGuardarEl" type="button">Guardar</button>'
      + '</div>';

    document.getElementById('resumenPunto').textContent =
      'Precisión ' + Math.round(e.punto.acc) + ' m'
      + (e.movido >= 1 ? '  ·  corregido ' + Math.round(e.movido) + ' m a mano' : '');

    Formulario.instalacionActual = e.inst.inv;
    e.form = Formulario.crear(document.getElementById('formulario'), def, { modo: 'calle' });

    document.getElementById('btnVolverMapa').addEventListener('click', function () {
      App.irA('captura', true);
      pintarAjuste();
    });
    document.getElementById('btnGuardarEl').addEventListener('click', guardar);
  }

  function actualizarInfo() {
    var e = enCaptura;
    var mov = Mapa.desplazamiento(e.original);
    var t = 'Precisión del GPS: ' + Math.round(e.punto.acc) + ' m'
          + '  ·  ' + e.punto.n + ' lecturas promediadas';
    if (e.punto.descartadas) t += ', ' + e.punto.descartadas + ' descartada'
                                 + (e.punto.descartadas === 1 ? '' : 's');
    if (e.punto.dispersion !== null) t += '  ·  dispersión ' + e.punto.dispersion + ' m';
    if (mov >= 1) t += '\nCorregiste ' + Math.round(mov) + ' m a mano.';
    document.getElementById('infoPunto').textContent = t;
  }

  function guardar() {
    var e = enCaptura;
    var faltan = e.form.faltantes();
    if (faltan.length) {
      App.avisarGuardado('Falta completar: ' + faltan.join(', '));
      return;
    }

    var reg = {
      id: Almacen.nuevoId('el'),
      tipo: e.tipo,
      familia: e.inst.familia,
      inv: e.inst.inv,
      lat: redondear(e.final.lat),
      lon: redondear(e.final.lon),
      lat_gps: redondear(e.original.lat),
      lon_gps: redondear(e.original.lon),
      accuracy_m: Math.round(e.punto.acc * 10) / 10,
      ajustado: e.movido >= 1,
      atributos_json: JSON.stringify(e.form.valores()),
      fotos: '',
      relevador: Almacen.pref('relevador') || '',
      fecha_alta: new Date().toISOString(),
      activo: true
    };

    Almacen.encolar('elementos', reg);
    Formulario.recordar(CATALOGO.elementos[e.tipo], e.form.valores());
    Sync.subirPendientes();

    var def = CATALOGO.elementos[e.tipo];
    var inst = e.inst;
    var cb = e.alTerminar;
    enCaptura = null;

    /* Pantalla de confirmación en vez de dejar al operario
       adivinando si guardó y sin una salida clara.           */
    confirmar(reg, def, inst, cb);
  }

  /* ------------------- confirmación ------------------- */

  function confirmar(reg, def, inst, cb) {
    var c = document.getElementById('vistaGuardado');
    var detalle = 'Precisión ' + Math.round(reg.accuracy_m) + ' m'
                + (reg.ajustado ? '  ·  ajustado a mano' : '');

    var html = ''
      + '<div class="exito">'
      +   '<span class="tilde">✓</span>'
      +   '<h2>' + (def.nombre || reg.tipo) + ' guardada</h2>'
      +   '<p class="sub">' + detalle + '</p>'
      + '</div>'
      + '<div class="bloque opciones">';

    var acciones = [];

    if (def.componentes && def.componentes.length) {
      var nomComp = CATALOGO.componentes[def.componentes[0]];
      acciones.push({ id: 'comp', label: 'Cargar sus ' +
        ((nomComp && nomComp.nombre) || 'componentes').toLowerCase() + 's', principal: true });
    }
    if (reg.tipo === 'camara_inspeccion') {
      acciones.push({ id: 'conectar', label: 'Conectar con otra cámara', principal: true });
    }
    acciones.push({ id: 'otro', label: 'Cargar otra ' + (def.nombre || '').toLowerCase() });
    acciones.push({ id: 'volver', label: inst.suelto ? 'Volver a la red' : 'Volver a la esquina' });

    acciones.forEach(function (a, i) {
      html += '<button class="boton' + (a.principal && i === 0 ? '' : ' tenue')
            + '" data-accion="' + a.id + '" type="button">' + a.label + '</button>';
    });
    html += '</div>';

    c.innerHTML = html;

    c.querySelectorAll('[data-accion]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.accion;
        if (a === 'comp') {
          abrirComponentes(inst, reg, def.componentes);
        } else if (a === 'conectar') {
          if (cb) cb(reg);
          Red.abrirCamara(reg);
        } else if (a === 'otro') {
          if (inst.suelto) capturarSuelto(reg.tipo, cb);
          else iniciarCaptura(inst, reg.tipo);
        } else {
          if (inst.suelto) { if (cb) cb(reg); App.volverARed(); }
          else { abrir(inst); App.irA('ficha', true); }
        }
      });
    });

    App.irA('guardado', true);
  }

  /* ------------------- componentes en cadena ------------------- */

  var enComponentes = null;

  function abrirComponentes(inst, elemento, tipos) {
    enComponentes = { inst: inst, elemento: elemento, tipos: tipos, form: null,
                      tipoActual: tipos[0] };
    App.irA('comp');
    pintarComponentes();
  }

  function pintarComponentes() {
    var s = enComponentes;
    var padre = CATALOGO.elementos[s.elemento.tipo];
    var c = document.getElementById('vistaComp');
    var puestos = Almacen.relevados().componentes.filter(function (k) {
      return k.id_elemento === s.elemento.id && k.activo !== false;
    });

    var html = ''
      + '<div class="bloque">'
      +   '<h2>¿Qué tiene esta ' + (padre.nombre || '').toLowerCase() + '?</h2>'
      +   '<p class="sub">Cargá uno por uno. Cuando termines, tocá Listo.</p>'
      + '</div>';

    if (puestos.length) {
      html += '<div class="bloque"><h3>Cargados</h3><ul class="relevados">';
      puestos.forEach(function (k) {
        var d = CATALOGO.componentes[k.tipo];
        var a = {};
        try { a = JSON.parse(k.atributos_json || '{}'); } catch (x) {}
        var et = a.tipo || a.subtipo || '';
        if (et && d && d.campos) {
          var cd = d.campos.filter(function (x) { return x.id === 'tipo'; })[0];
          if (cd) {
            var op = Formulario._opcionesDe(cd).filter(function (o) {
              return String(o.id) === String(et);
            })[0];
            if (op) et = op.label;
          }
        }
        html += '<li><b>' + ((d && d.nombre) || k.tipo) + '</b><span>' + et + '</span></li>';
      });
      html += '</ul></div>';
    }

    /* Selector de qué componente cargar, si hay más de uno */
    if (s.tipos.length > 1) {
      html += '<div class="bloque"><div class="campo"><label for="tipoComp">Tipo</label>'
            + '<select id="tipoComp">';
      s.tipos.forEach(function (t) {
        var d = CATALOGO.componentes[t];
        html += '<option value="' + t + '"' + (t === s.tipoActual ? ' selected' : '') + '>'
              + ((d && d.nombre) || t) + '</option>';
      });
      html += '</select></div></div>';
    }

    html += '<div class="bloque" id="formComp"></div>'
          + '<div class="bloque acciones">'
          +   '<button class="boton' + (puestos.length ? '' : ' tenue')
          +     '" id="btnListo" type="button">Terminar</button>'
          +   '<button class="boton' + (puestos.length ? ' tenue' : '')
          +     '" id="btnOtro" type="button">Agregar</button>'
          + '</div>';

    c.innerHTML = html;

    dibujarFormComponente();

    var sel = document.getElementById('tipoComp');
    if (sel) sel.addEventListener('change', function () {
      enComponentes.tipoActual = sel.value;
      dibujarFormComponente();
    });

    document.getElementById('btnOtro').addEventListener('click', agregarComponente);
    document.getElementById('btnListo').addEventListener('click', function () {
      var inst = enComponentes.inst;
      enComponentes = null;
      abrir(inst);
      App.irA('ficha', true);
    });
  }

  function dibujarFormComponente() {
    var s = enComponentes;
    var def = CATALOGO.componentes[s.tipoActual];
    Formulario.instalacionActual = s.inst.inv;
    s.form = Formulario.crear(document.getElementById('formComp'), def, { modo: 'calle' });
  }

  function agregarComponente() {
    var s = enComponentes;
    var faltan = s.form.faltantes();
    if (faltan.length) {
      App.avisarGuardado('Falta completar: ' + faltan.join(', '));
      return;
    }
    var reg = {
      id: Almacen.nuevoId('cp'),
      id_elemento: s.elemento.id,
      tipo: s.tipoActual,
      atributos_json: JSON.stringify(s.form.valores()),
      relevador: Almacen.pref('relevador') || '',
      fecha_alta: new Date().toISOString(),
      activo: true
    };
    Almacen.encolar('componentes', reg);
    Sync.subirPendientes();
    /* Se redibuja con el formulario limpio, listo para el
       siguiente. Sin volver a ningún menú.                 */
    pintarComponentes();
    App.avisarGuardado('Cargado');
  }

  function redondear(n) { return Math.round(n * 1e7) / 1e7; }

  function salir() {
    GPS.off(alLeerGPS);
    Mapa.destruir();
    enCaptura = null;
  }

  return {
    abrir: abrir,
    capturarSuelto: capturarSuelto,
    salir: salir,
    actual: function () { return actual; }
  };
})();