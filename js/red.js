/* ============================================================
   RED DE DUCTOS

   Modelo:
     nodo   = camara de inspeccion (el unico tipo de nodo)
     tramo  = conexion DECLARADA entre dos camaras
     obstruccion = punto sobre un tramo, ubicado por distancia

   Regla que no se rompe nunca: la conexion la declara una
   persona. Dos camaras cercanas NO implican ducto entre ellas.
   En una esquina puede haber cuatro camaras y un solo ducto.
   ============================================================ */

var Red = (function () {

  var camaraActual = null;
  var tramoActual = null;
  var enConexion = null;
  var enObstruccion = null;

  /* ------------------- helpers de datos ------------------- */

  function camaras() {
    return Almacen.relevados().elementos.filter(function (e) {
      return e.tipo === 'camara_inspeccion' && e.activo !== false
          && typeof e.lat === 'number' && isFinite(e.lat)
          && typeof e.lon === 'number' && isFinite(e.lon);
    });
  }

  function camaraPorId(id) {
    var c = camaras().filter(function (x) { return x.id === id; });
    return c.length ? c[0] : null;
  }

  function tramos() {
    return Almacen.relevados().tramos.filter(function (t) {
      return t.activo !== false;
    });
  }

  /* Tramos que tocan una camara, sin importar en que punta quedo */
  function tramosDe(idCamara) {
    return tramos().filter(function (t) {
      return t.id_origen === idCamara || t.id_destino === idCamara;
    });
  }

  function yaConectadas(a, b) {
    return tramos().some(function (t) {
      return (t.id_origen === a && t.id_destino === b)
          || (t.id_origen === b && t.id_destino === a);
    });
  }

  function obstruccionesDe(idTramo) {
    return (Almacen.relevados().obstrucciones || []).filter(function (o) {
      return o.id_tramo === idTramo && o.activo !== false;
    });
  }

  function attrs(reg) {
    try { return JSON.parse(reg.atributos_json || '{}'); } catch (e) { return {}; }
  }

  function etiquetaCamara(c) {
    var a = attrs(c);
    var partes = [];
    if (a.zona) partes.push(a.zona);
    if (a.bajo) partes.push(a.bajo);
    if (c.inv) partes.push('inv. ' + c.inv);
    return partes.join('  ·  ') || 'Sin datos';
  }

  /* ------------------- geometría del tramo ------------------- */

  /* Puntos que definen la linea del tramo. Si se grabo el
     recorrido caminando se usa eso; si no, la recta entre las
     dos camaras.                                              */
  function lineaDe(t) {
    if (t.geometria_json) {
      try {
        var p = JSON.parse(t.geometria_json);
        if (p && p.length >= 2) return p;
      } catch (e) {}
    }
    var a = camaraPorId(t.id_origen), b = camaraPorId(t.id_destino);
    if (!a || !b) return null;
    return [[a.lat, a.lon], [b.lat, b.lon]];
  }

  function largoGeometrico(linea) {
    var s = 0;
    for (var i = 1; i < linea.length; i++) {
      s += POSGAR.distancia(linea[i - 1][0], linea[i - 1][1], linea[i][0], linea[i][1]);
    }
    return s;
  }

  /* Punto a "dist" metros del extremo indicado, recorriendo la
     linea. Si el largo declarado difiere del geometrico, se
     escala: el caño real es mas largo que la recta.            */
  function puntoSobre(t, desdeId, dist) {
    var linea = lineaDe(t);
    if (!linea) return null;
    if (t.id_destino === desdeId) linea = linea.slice().reverse();

    var geom = largoGeometrico(linea);
    if (geom <= 0) return null;

    var declarado = parseFloat(t.largo_m);
    var d = dist;
    if (isFinite(declarado) && declarado > 0) d = dist * (geom / declarado);
    if (d <= 0) return { lat: linea[0][0], lon: linea[0][1] };
    if (d >= geom) return { lat: linea[linea.length - 1][0], lon: linea[linea.length - 1][1] };

    var acum = 0;
    for (var i = 1; i < linea.length; i++) {
      var seg = POSGAR.distancia(linea[i - 1][0], linea[i - 1][1], linea[i][0], linea[i][1]);
      if (acum + seg >= d) {
        var f = (d - acum) / seg;
        return {
          lat: linea[i - 1][0] + (linea[i][0] - linea[i - 1][0]) * f,
          lon: linea[i - 1][1] + (linea[i][1] - linea[i - 1][1]) * f
        };
      }
      acum += seg;
    }
    return { lat: linea[linea.length - 1][0], lon: linea[linea.length - 1][1] };
  }

  /* ------------------- pantalla: lista de cámaras ------------------- */

  function abrirLista() {
    var c = document.getElementById('vistaRed');
    if (!c) return;
    /* Hace falta acá también: desde esta solapa se puede entrar
       directo a capturar sin haber pasado por ninguna ficha.   */
    GPS.iniciar();
    var pos = GPS.posicion();
    var lista = camaras();

    if (pos) {
      lista.forEach(function (x) {
        x._d = POSGAR.distancia(pos.lat, pos.lon, x.lat, x.lon);
      });
      lista.sort(function (a, b) { return a._d - b._d; });
    } else {
      lista.sort(function (a, b) {
        return String(b.fecha_alta).localeCompare(String(a.fecha_alta));
      });
    }

    var html = ''
      + '<div class="bloque">'
      +   '<h2>Red de ductos</h2>'
      +   '<p class="sub">' + lista.length + ' cámara' + (lista.length === 1 ? '' : 's')
      +   ' relevada' + (lista.length === 1 ? '' : 's') + '  ·  '
      +   tramos().length + ' tramo' + (tramos().length === 1 ? '' : 's') + '</p>'
      + '</div>'
      + '<div class="bloque">'
      +   '<button class="boton" id="btnNuevaCamara" type="button" style="width:100%">'
      +     'Relevar cámara nueva</button>'
      + '</div>';

    if (!lista.length) {
      html += '<div class="vacio"><p><b>Todavía no hay cámaras</b></p>'
            + '<p>Empezá relevando una. Después vas a poder conectarlas entre sí.</p></div>';
    } else {
      html += '<h3 class="grupo">' + (pos ? 'Más cercanas' : 'Últimas relevadas') + '</h3>'
            + '<ul class="lista" id="listaCamaras"></ul>';
    }

    c.innerHTML = html;

    document.getElementById('btnNuevaCamara')
      .addEventListener('click', nuevaCamaraSuelta);

    var ul = document.getElementById('listaCamaras');
    if (!ul) return;

    lista.slice(0, 30).forEach(function (cam) {
      var n = tramosDe(cam.id).length;
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.className = 'fila';
      b.type = 'button';
      b.dataset.familia = 'civil';

      var cuerpo = document.createElement('span');
      cuerpo.className = 'cruce';
      var t = document.createElement('b');
      t.textContent = 'Cámara  ·  ' + (attrs(cam).zona || 'sin zona');
      var s = document.createElement('span');
      s.textContent = etiquetaCamara(cam) + '  ·  '
                    + (n ? n + ' tramo' + (n === 1 ? '' : 's') : 'sin conectar');
      cuerpo.appendChild(t);
      cuerpo.appendChild(s);
      b.appendChild(cuerpo);

      if (cam._d !== undefined) {
        var d = document.createElement('span');
        d.className = 'dist' + (cam._d <= 25 ? ' pegado' : '');
        d.textContent = Math.round(cam._d) + ' m';
        b.appendChild(d);
      }

      b.addEventListener('click', function () { abrirCamara(cam); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  /* Relevar una cámara que no pertenece a ninguna esquina.
     Reusa todo el flujo de captura del módulo de ficha.      */
  function nuevaCamaraSuelta() {
    Ficha.capturarSuelto('camara_inspeccion', function () { abrirLista(); });
  }

  /* ------------------- pantalla: una cámara ------------------- */

  function abrirCamara(cam) {
    camaraActual = cam;
    var c = document.getElementById('vistaCamara');
    var a = attrs(cam);
    var conectados = tramosDe(cam.id);

    var html = ''
      + '<div class="bloque">'
      +   '<h2>Cámara de inspección</h2>'
      +   '<p class="sub">' + etiquetaCamara(cam) + '</p>';

    var datos = [['Estado', a.estado], ['Tapa', a.tapa], ['Medidas', a.medidas],
                 ['Ductos que llegan', a.cant_ductos],
                 ['Contenido', Array.isArray(a.contenido) ? a.contenido.join(', ') : a.contenido]]
                .filter(function (p) { return p[1]; });
    if (datos.length) {
      html += '<dl class="datos">';
      datos.forEach(function (p) {
        html += '<dt>' + p[0] + '</dt><dd>' + p[1] + '</dd>';
      });
      html += '</dl>';
    }
    if (a.observaciones) {
      html += '<p class="obs">' + a.observaciones + '</p>';
    }
    html += '</div>';

    html += '<div class="bloque"><h3>Conectada con</h3>';
    if (!conectados.length) {
      html += '<p class="sub">Todavía no declaraste ningún ducto desde esta cámara.</p>';
    } else {
      html += '<ul class="relevados" id="listaTramos"></ul>';
    }
    html += '</div>';

    html += '<div class="bloque">'
          +   '<button class="boton" id="btnConectar" type="button" style="width:100%">'
          +     'Conectar con otra cámara</button>'
          + '</div>';

    c.innerHTML = html;

    var ul = document.getElementById('listaTramos');
    if (ul) conectados.forEach(function (t) {
      var otra = camaraPorId(t.id_origen === cam.id ? t.id_destino : t.id_origen);
      var ta = attrs(t);
      var obs = obstruccionesDe(t.id).filter(function (o) {
        return attrs(o).estado !== 'Reparada';
      }).length;

      var li = document.createElement('li');
      li.className = 'tocable';
      var b = document.createElement('b');
      b.textContent = otra ? ('Hacia otra cámara  ·  ' + etiquetaCamara(otra))
                           : 'Cámara no encontrada';
      var s = document.createElement('span');
      s.textContent = (ta.cruce || '') + '  ·  ' + Math.round(t.largo_m || 0) + ' m'
                    + (obs ? '  ·  ' + obs + ' obstrucción' + (obs === 1 ? '' : 'es') : '');
      if (obs) s.className = 'alerta';
      li.appendChild(b);
      li.appendChild(s);
      li.addEventListener('click', function () { abrirTramo(t); });
      ul.appendChild(li);
    });

    document.getElementById('btnConectar')
      .addEventListener('click', function () { elegirDestino(cam); });

    App.irA('camara');
  }

  /* ------------------- conectar dos cámaras ------------------- */

  function elegirDestino(cam) {
    var otras = camaras().filter(function (x) {
      return x.id !== cam.id && !yaConectadas(cam.id, x.id);
    });
    otras.forEach(function (x) {
      x._d = POSGAR.distancia(cam.lat, cam.lon, x.lat, x.lon);
    });
    otras.sort(function (a, b) { return a._d - b._d; });

    var c = document.getElementById('vistaConectar');
    var html = ''
      + '<div class="bloque">'
      +   '<h2>¿Con cuál está conectada?</h2>'
      +   '<p class="sub">Ordenadas por distancia. Que estén cerca no significa '
      +   'que haya ducto: elegí solo la que sabés que está unida por caño.</p>'
      + '</div>';

    if (!otras.length) {
      html += '<div class="vacio"><p><b>No hay otras cámaras disponibles</b></p>'
            + '<p>Relevá otra cámara, o ya las conectaste a todas.</p></div>';
      c.innerHTML = html;
      App.irA('conectar');
      return;
    }

    html += '<ul class="lista" id="listaDestinos"></ul>';
    c.innerHTML = html;

    var ul = document.getElementById('listaDestinos');
    otras.slice(0, 20).forEach(function (x) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.className = 'fila';
      b.type = 'button';
      var cu = document.createElement('span');
      cu.className = 'cruce';
      var t = document.createElement('b');
      t.textContent = 'Cámara  ·  ' + (attrs(x).zona || 'sin zona');
      var s = document.createElement('span');
      s.textContent = etiquetaCamara(x);
      cu.appendChild(t); cu.appendChild(s);
      var d = document.createElement('span');
      d.className = 'dist';
      d.textContent = Math.round(x._d) + ' m';
      b.appendChild(cu); b.appendChild(d);
      b.addEventListener('click', function () { datosDelTramo(cam, x); });
      li.appendChild(b);
      ul.appendChild(li);
    });

    App.irA('conectar');
  }

  function datosDelTramo(a, b) {
    var recta = POSGAR.distancia(a.lat, a.lon, b.lat, b.lon);
    enConexion = { a: a, b: b, recta: recta };

    var c = document.getElementById('vistaTramoNuevo');
    c.innerHTML = ''
      + '<div class="bloque">'
      +   '<h2>Datos del ducto</h2>'
      +   '<p class="sub">Entre estas dos cámaras hay ' + Math.round(recta)
      +   ' m en línea recta.</p>'
      + '</div>'
      + '<div class="bloque">'
      +   '<div class="campo">'
      +     '<label for="largoTramo">Longitud del ducto (m)</label>'
      +     '<input id="largoTramo" type="number" inputmode="decimal" value="'
      +        Math.round(recta) + '">'
      +     '<small>Si la conocés, corregila. El caño casi siempre es más largo '
      +     'que la recta.</small>'
      +   '</div>'
      +   '<div class="campo">'
      +     '<label for="origenLargo">¿De dónde sale ese número?</label>'
      +     '<select id="origenLargo">'
      +       '<option value="estimado">Estimado en línea recta</option>'
      +       '<option value="medido">Medido en obra</option>'
      +       '<option value="plano">De un plano o expediente</option>'
      +     '</select>'
      +     '<small>Importa: sobre una longitud estimada no se puede ubicar '
      +     'una obstrucción con precisión.</small>'
      +   '</div>'
      + '</div>'
      + '<div class="bloque" id="formTramo"></div>'
      + '<div class="bloque acciones">'
      +   '<button class="boton tenue" id="btnCancelarTramo" type="button">Cancelar</button>'
      +   '<button class="boton" id="btnGuardarTramo" type="button">Guardar ducto</button>'
      + '</div>';

    enConexion.form = Formulario.crear(document.getElementById('formTramo'),
                                       CATALOGO.tramos.ducto, { modo: 'calle' });

    document.getElementById('btnCancelarTramo').addEventListener('click', function () {
      enConexion = null;
      abrirCamara(a);
    });
    document.getElementById('btnGuardarTramo').addEventListener('click', guardarTramo);

    App.irA('tramoNuevo');
  }

  function guardarTramo() {
    var e = enConexion;
    var faltan = e.form.faltantes();
    if (faltan.length) {
      App.avisarGuardado('Falta completar: ' + faltan.join(', '));
      return;
    }
    var largo = parseFloat(document.getElementById('largoTramo').value);
    if (!isFinite(largo) || largo <= 0) {
      App.avisarGuardado('Poné una longitud válida');
      return;
    }

    var vals = e.form.valores();
    vals.origen_largo = document.getElementById('origenLargo').value;

    var reg = {
      id: Almacen.nuevoId('tr'),
      tipo: 'ducto',
      id_origen: e.a.id,
      id_destino: e.b.id,
      geometria_json: '',
      n_puntos: 0,
      largo_m: Math.round(largo * 10) / 10,
      atributos_json: JSON.stringify(vals),
      relevador: Almacen.pref('relevador') || '',
      fecha_alta: new Date().toISOString(),
      activo: true
    };

    Almacen.encolar('tramos', reg);
    if (vals.zona) Almacen.pref('ultima_zona', vals.zona);
    Sync.subirPendientes();

    var cam = e.a;
    enConexion = null;
    abrirCamara(cam);
    App.avisarGuardado('Ducto guardado');
  }

  /* ------------------- pantalla: un tramo ------------------- */

  function abrirTramo(t) {
    tramoActual = t;
    var a = attrs(t);
    var o = camaraPorId(t.id_origen), d = camaraPorId(t.id_destino);
    var obs = obstruccionesDe(t.id);
    var estimado = a.origen_largo === 'estimado';

    var c = document.getElementById('vistaTramo');
    var html = ''
      + '<div class="bloque">'
      +   '<h2>Ducto</h2>'
      +   '<p class="sub">' + (a.cruce || '') + '  ·  ' + Math.round(t.largo_m) + ' m'
      +   '  ·  zona ' + (a.zona || '?') + '</p>'
      +   '<dl class="datos">'
      +     '<dt>Desde</dt><dd>' + (o ? etiquetaCamara(o) : '?') + '</dd>'
      +     '<dt>Hasta</dt><dd>' + (d ? etiquetaCamara(d) : '?') + '</dd>'
      +     (a.material ? '<dt>Material</dt><dd>' + a.material + '</dd>' : '')
      +     (a.cant_caños ? '<dt>Caños</dt><dd>' + a.cant_caños + '</dd>' : '')
      +     (a.ocupacion ? '<dt>Ocupación</dt><dd>' + a.ocupacion + '</dd>' : '')
      +   '</dl>'
      + '</div>';

    if (estimado) {
      html += '<div class="aviso"><b>La longitud es estimada</b>'
            + 'Se calculó en línea recta entre las dos cámaras. Una obstrucción '
            + 'registrada acá va a quedar ubicada de forma aproximada.</div>';
    }

    html += '<div class="bloque"><h3>Obstrucciones</h3>';
    if (!obs.length) {
      html += '<p class="sub">Sin obstrucciones registradas.</p>';
    } else {
      html += '<ul class="relevados" id="listaObs"></ul>';
    }
    html += '</div>'
          + '<div class="bloque">'
          +   '<button class="boton" id="btnObs" type="button" style="width:100%">'
          +     'Registrar obstrucción</button>'
          + '</div>';

    c.innerHTML = html;

    var ul = document.getElementById('listaObs');
    if (ul) obs.forEach(function (x) {
      var xa = attrs(x);
      var li = document.createElement('li');
      var b = document.createElement('b');
      b.textContent = xa.tipo || 'Obstrucción';
      var s = document.createElement('span');
      var ubic = x.metodo === 'sin_ubicar' ? 'sin ubicar'
               : (x.extension_m > 0
                  ? 'entre ' + Math.round(x.dist_m) + ' y '
                    + Math.round(x.dist_m + x.extension_m) + ' m'
                  : 'a ' + Math.round(x.dist_m) + ' m');
      s.textContent = ubic + '  ·  ' + (xa.severidad || '')
                    + (xa.estado ? '  ·  ' + xa.estado : '');
      if (xa.estado !== 'Reparada') s.className = 'alerta';
      li.appendChild(b); li.appendChild(s);
      ul.appendChild(li);
    });

    document.getElementById('btnObs')
      .addEventListener('click', function () { nuevaObstruccion(t); });

    App.irA('tramo');
  }

  /* ------------------- obstrucciones ------------------- */

  function nuevaObstruccion(t) {
    enObstruccion = { tramo: t, metodo: 'una_punta' };
    pintarObstruccion();
    App.irA('obstruccion');
  }

  function pintarObstruccion() {
    var s = enObstruccion, t = s.tramo;
    var o = camaraPorId(t.id_origen), d = camaraPorId(t.id_destino);
    var c = document.getElementById('vistaObstruccion');

    var html = ''
      + '<div class="bloque">'
      +   '<h2>Obstrucción</h2>'
      +   '<p class="sub">El ducto está enterrado, así que no se marca con GPS: '
      +   'se ubica por los metros que entró la varilla.</p>'
      + '</div>'
      + '<div class="bloque">'
      +   '<div class="campo"><label for="metodoObs">¿Cómo lo saben?</label>'
      +   '<select id="metodoObs">';
    CATALOGO.obstrucciones.metodos.forEach(function (m) {
      html += '<option value="' + m.id + '"' + (m.id === s.metodo ? ' selected' : '') + '>'
            + m.label + '</option>';
    });
    html += '</select><small id="ayudaMetodo"></small></div>';

    if (s.metodo !== 'sin_ubicar') {
      html += '<div class="campo"><label for="desdeObs">Sondearon desde</label>'
            + '<select id="desdeObs">'
            + '<option value="' + t.id_origen + '">' + (o ? etiquetaCamara(o) : 'Cámara A') + '</option>'
            + '<option value="' + t.id_destino + '">' + (d ? etiquetaCamara(d) : 'Cámara B') + '</option>'
            + '</select></div>'
            + '<div class="campo"><label for="distObs">Metros que entró la varilla</label>'
            + '<input id="distObs" type="number" inputmode="decimal" min="0" max="'
            + Math.round(t.largo_m) + '">'
            + '<small>El ducto mide ' + Math.round(t.largo_m) + ' m.</small></div>';
    }

    if (s.metodo === 'dos_puntas') {
      html += '<div class="campo"><label for="distObs2">Metros desde la otra cámara</label>'
            + '<input id="distObs2" type="number" inputmode="decimal" min="0" max="'
            + Math.round(t.largo_m) + '">'
            + '<small>Con los dos valores se calcula cuánto ocupa la obstrucción.</small></div>';
    }

    html += '</div>'
          + '<p class="pista" id="resultadoObs" style="padding:0 14px"></p>'
          + '<div class="bloque" id="formObs"></div>'
          + '<div class="bloque acciones">'
          +   '<button class="boton tenue" id="btnCancelarObs" type="button">Cancelar</button>'
          +   '<button class="boton" id="btnGuardarObs" type="button">Guardar</button>'
          + '</div>';

    c.innerHTML = html;

    s.form = Formulario.crear(document.getElementById('formObs'),
                              CATALOGO.obstrucciones, { modo: 'calle' });

    var sel = document.getElementById('metodoObs');
    sel.addEventListener('change', function () {
      enObstruccion.metodo = sel.value;
      pintarObstruccion();
    });

    ['distObs', 'distObs2', 'desdeObs'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener('input', calcular);
      if (n) n.addEventListener('change', calcular);
    });

    var m = CATALOGO.obstrucciones.metodos.filter(function (x) { return x.id === s.metodo; })[0];
    document.getElementById('ayudaMetodo').textContent = m ? m.ayuda : '';

    document.getElementById('btnCancelarObs').addEventListener('click', function () {
      enObstruccion = null;
      abrirTramo(t);
    });
    document.getElementById('btnGuardarObs').addEventListener('click', guardarObstruccion);

    calcular();
  }

  /* Calcula posicion y extension, y avisa si los numeros no
     cierran. Que 30 + 45 de menos que el largo del tramo no es
     un error: es la obstruccion ocupando el hueco.             */
  function calcular() {
    var s = enObstruccion, t = s.tramo;
    var salida = document.getElementById('resultadoObs');
    if (!salida) return;

    if (s.metodo === 'sin_ubicar') {
      salida.textContent = 'Queda marcado el tramo completo, sin ubicación precisa.';
      s.calculo = { dist: null, extension: 0, punto: null };
      return;
    }

    var desde = document.getElementById('desdeObs').value;
    var d1 = parseFloat(document.getElementById('distObs').value);
    if (!isFinite(d1)) { salida.textContent = ''; s.calculo = null; return; }

    if (d1 > t.largo_m) {
      salida.textContent = 'La varilla entró más que el largo del ducto ('
                         + Math.round(t.largo_m) + ' m). Revisá el dato.';
      s.calculo = null;
      return;
    }

    var extension = 0, texto = '';
    if (s.metodo === 'dos_puntas') {
      var d2 = parseFloat(document.getElementById('distObs2').value);
      if (!isFinite(d2)) {
        salida.textContent = 'Cargá también los metros desde la otra cámara.';
        s.calculo = null;
        return;
      }
      var hueco = t.largo_m - d1 - d2;
      if (hueco < -2) {
        salida.textContent = 'Los dos sondeos se superponen ' + Math.round(-hueco)
          + ' m. O el largo del ducto está mal, o una medición no es correcta.';
        s.calculo = null;
        return;
      }
      extension = Math.max(0, hueco);
      texto = extension < 1
        ? 'Tapón puntual a ' + Math.round(d1) + ' m.'
        : 'La obstrucción ocupa ' + Math.round(extension) + ' m, entre los '
          + Math.round(d1) + ' y los ' + Math.round(d1 + extension) + ' m.';
    } else {
      texto = 'Ubicada a ' + Math.round(d1) + ' m de la cámara elegida.';
    }

    var punto = puntoSobre(t, desde, d1 + extension / 2);
    s.calculo = { dist: d1, extension: extension, desde: desde, punto: punto };

    if (attrs(t).origen_largo === 'estimado') {
      texto += ' La ubicación es aproximada porque el largo del ducto es estimado.';
    }
    salida.textContent = texto;
  }

  function guardarObstruccion() {
    var s = enObstruccion;
    if (!s.calculo) {
      App.avisarGuardado('Revisá los metros antes de guardar');
      return;
    }
    var faltan = s.form.faltantes();
    if (faltan.length) {
      App.avisarGuardado('Falta completar: ' + faltan.join(', '));
      return;
    }

    var reg = {
      id: Almacen.nuevoId('ob'),
      id_tramo: s.tramo.id,
      metodo: s.metodo,
      desde_camara: s.calculo.desde || '',
      dist_m: s.calculo.dist === null ? '' : s.calculo.dist,
      extension_m: s.calculo.extension || 0,
      lat: s.calculo.punto ? Math.round(s.calculo.punto.lat * 1e7) / 1e7 : '',
      lon: s.calculo.punto ? Math.round(s.calculo.punto.lon * 1e7) / 1e7 : '',
      atributos_json: JSON.stringify(s.form.valores()),
      relevador: Almacen.pref('relevador') || '',
      fecha_alta: new Date().toISOString(),
      activo: true
    };

    Almacen.encolar('obstrucciones', reg);
    Sync.subirPendientes();

    var t = s.tramo;
    enObstruccion = null;
    abrirTramo(t);
    App.avisarGuardado('Obstrucción registrada');
  }

  /* ------------------- salida ------------------- */

  function salir() {
    enConexion = null;
    enObstruccion = null;
  }

  function refrescar() {
    if (camaraActual) {
      var c = camaraPorId(camaraActual.id);
      if (c) abrirCamara(c);
    }
  }

  return {
    abrirLista: abrirLista,
    abrirCamara: abrirCamara,
    abrirTramo: abrirTramo,
    refrescar: refrescar,
    salir: salir,
    camaras: camaras,
    tramos: tramos,
    puntoSobre: puntoSobre,
    largoGeometrico: largoGeometrico,
    _lineaDe: lineaDe
  };
})();

if (typeof module !== 'undefined') module.exports = Red;