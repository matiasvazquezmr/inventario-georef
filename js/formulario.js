/* ============================================================
   FORMULARIO

   Arma los formularios leyendo el catalogo. Ningun campo esta
   escrito a mano aca: si mañana cambia lo que se releva de una
   columna, se toca catalogo.js y listo.

   Reglas:
   - En el celular solo se muestran los campos de origen
     'calle' o 'ambos'. Los de oficina no molestan en la vereda.
   - visible_si esconde campos que no aplican, en vivo.
   - Nada bloquea el guardado salvo los campos requeridos.
   ============================================================ */

var Formulario = (function () {

  function crear(contenedor, def, opciones) {
    var o = opciones || {};
    var modo = o.modo || 'calle';           // 'calle' | 'oficina'
    var valores = o.valores || {};
    var campos = (def.campos || []).filter(function (c) {
      if (modo === 'oficina') return true;
      return c.origen === 'calle' || c.origen === 'ambos' || !c.origen;
    });

    contenedor.innerHTML = '';
    var nodos = {};

    campos.forEach(function (c) {
      var fila = document.createElement('div');
      fila.className = 'campo';
      fila.dataset.campo = c.id;

      var lab = document.createElement('label');
      lab.setAttribute('for', 'f_' + c.id);
      lab.textContent = c.label + (c.requerido ? ' *' : '');
      fila.appendChild(lab);

      var control = crearControl(c, valores[c.id]);
      control.id = 'f_' + c.id;
      fila.appendChild(control);

      if (c.ayuda) {
        var ay = document.createElement('small');
        ay.textContent = c.ayuda;
        fila.appendChild(ay);
      }

      contenedor.appendChild(fila);
      nodos[c.id] = { def: c, fila: fila, control: control };
    });

    /* Los campos condicionales se recalculan cada vez que
       cambia algo, no solo al abrir.                        */
    function recalcular() {
      Object.keys(nodos).forEach(function (id) {
        var n = nodos[id];
        if (!n.def.visible_si) return;
        n.fila.hidden = !cumple(n.def.visible_si, leer(nodos));
      });
    }

    contenedor.addEventListener('change', recalcular);
    contenedor.addEventListener('input', recalcular);
    recalcular();

    return {
      valores: function () { return leer(nodos); },
      faltantes: function () { return validar(nodos); },
      nodos: nodos
    };
  }

  /* ------------------- controles ------------------- */

  function crearControl(c, valor) {
    switch (c.tipo) {

      case 'select':
        return armarSelect(c, valor);

      case 'multiselect':
        return armarMulti(c, valor);

      case 'booleano':
        return armarBooleano(c, valor);

      case 'numero':
      case 'entero': {
        var n = document.createElement('input');
        n.type = 'number';
        n.inputMode = c.tipo === 'entero' ? 'numeric' : 'decimal';
        if (c.tipo === 'entero') n.step = '1';
        if (valor !== undefined && valor !== null) n.value = valor;
        return n;
      }

      case 'fecha': {
        var f = document.createElement('input');
        f.type = 'date';
        if (valor) f.value = valor;
        return f;
      }

      case 'textarea': {
        var t = document.createElement('textarea');
        t.rows = 3;
        if (valor) t.value = valor;
        return t;
      }

      case 'texto_sugerido':
        return armarSugerido(c, valor);

      case 'ref_elemento':
        return armarRefElemento(c, valor);

      default: {
        var i = document.createElement('input');
        i.type = 'text';
        i.autocomplete = 'off';
        if (valor) i.value = valor;
        return i;
      }
    }
  }

  /* Las opciones pueden venir sueltas en el campo, o por
     referencia a una tabla del catálogo.                 */
  function opcionesDe(c) {
    if (c.opciones) {
      return c.opciones.map(function (o) {
        return (typeof o === 'string') ? { id: o, label: o }
                                       : { id: o.id, label: o.label || o.id };
      });
    }
    if (c.ref && CATALOGO.ref && CATALOGO.ref[c.ref]) {
      return CATALOGO.ref[c.ref].map(function (o) {
        if (typeof o === 'string') return { id: o, label: o };
        return { id: o.id, label: o.label || o.nombre || o.id };
      });
    }
    return [];
  }

  function armarSelect(c, valor) {
    var s = document.createElement('select');
    /* 'recordar' deja preseleccionada la ultima opcion usada. No
       es herencia silenciosa: el campo sigue a la vista y se puede
       cambiar. Sirve para no elegir la zona treinta veces por dia. */
    if ((valor === undefined || valor === null || valor === '') && c.recordar
        && typeof Almacen !== 'undefined') {
      valor = Almacen.pref('ultimo_' + c.id);
    }
    var vacio = document.createElement('option');
    vacio.value = '';
    vacio.textContent = c.requerido ? 'Elegí una opción' : 'Sin especificar';
    s.appendChild(vacio);
    opcionesDe(c).forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.label;
      if (String(valor) === String(o.id)) op.selected = true;
      s.appendChild(op);
    });
    return s;
  }

  /* Multiselección con casillas grandes: en la calle un
     <select multiple> es imposible de operar.             */
  function armarMulti(c, valor) {
    var caja = document.createElement('div');
    caja.className = 'multi';
    var elegidos = Array.isArray(valor) ? valor : [];
    opcionesDe(c).forEach(function (o) {
      var l = document.createElement('label');
      l.className = 'casilla';
      var i = document.createElement('input');
      i.type = 'checkbox';
      i.value = o.id;
      i.checked = elegidos.indexOf(o.id) >= 0;
      var s = document.createElement('span');
      s.textContent = o.label;
      l.appendChild(i);
      l.appendChild(s);
      caja.appendChild(l);
    });
    return caja;
  }

  /* Sí / No como dos botones, no como casilla: se toca mejor */
  function armarBooleano(c, valor) {
    var caja = document.createElement('div');
    caja.className = 'siono';
    [['si', 'Sí', true], ['no', 'No', false]].forEach(function (par) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.valor = par[0];
      b.textContent = par[1];
      if (valor === par[2]) b.className = 'elegido';
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(caja.children, function (x) { x.className = ''; });
        b.className = 'elegido';
        caja.dispatchEvent(new Event('change', { bubbles: true }));
      });
      caja.appendChild(b);
    });
    return caja;
  }

  function armarSugerido(c, valor) {
    var caja = document.createElement('div');
    var i = document.createElement('input');
    i.type = 'text';
    i.autocomplete = 'off';
    i.setAttribute('list', 'sug_' + c.id);
    if (valor) i.value = valor;
    var dl = document.createElement('datalist');
    dl.id = 'sug_' + c.id;
    (c.sugerencias || []).forEach(function (s) {
      var o = document.createElement('option');
      o.value = s;
      dl.appendChild(o);
    });
    caja.appendChild(i);
    caja.appendChild(dl);
    caja.className = 'sugerido';
    return caja;
  }

  /* Referencia a otro elemento ya relevado en la misma
     instalación. Sirve para decir en qué columna está el
     cuerpo, o qué columna sostiene la cámara.             */
  function armarRefElemento(c, valor) {
    var s = document.createElement('select');
    var vacio = document.createElement('option');
    vacio.value = '';
    vacio.textContent = 'Sin especificar';
    s.appendChild(vacio);

    var inv = Formulario.instalacionActual;
    var lista = (inv ? Almacen.elementosDe(inv) : []).filter(function (e) {
      return !c.filtro_tipo || e.tipo === c.filtro_tipo;
    });

    lista.forEach(function (e, i) {
      var op = document.createElement('option');
      op.value = e.id;
      var t = (CATALOGO.elementos[e.tipo] && CATALOGO.elementos[e.tipo].nombre) || e.tipo;
      var extra = '';
      try {
        var a = JSON.parse(e.atributos_json || '{}');
        if (a.ubicacion) extra = ' · ' + a.ubicacion;
        else if (a.subtipo) extra = ' · ' + a.subtipo;
      } catch (x) {}
      op.textContent = t + ' ' + (i + 1) + extra;
      if (valor === e.id) op.selected = true;
      s.appendChild(op);
    });

    if (!lista.length) {
      var d = c.filtro_tipo && CATALOGO.elementos[c.filtro_tipo];
      var nom = (d && d.nombre) ? d.nombre.toLowerCase() : 'elemento de ese tipo';
      vacio.textContent = 'Todavía no relevaste ningún ' + nom;
      s.disabled = true;
    }
    return s;
  }

  /* ------------------- lectura ------------------- */

  function leerControl(n) {
    var c = n.def, ctrl = n.control;
    switch (c.tipo) {
      case 'multiselect':
        return Array.prototype.filter.call(ctrl.querySelectorAll('input'), function (i) {
          return i.checked;
        }).map(function (i) { return i.value; });

      case 'booleano': {
        var e = ctrl.querySelector('.elegido');
        return e ? (e.dataset.valor === 'si') : null;
      }

      case 'texto_sugerido':
        return ctrl.querySelector('input').value.trim();

      case 'numero':
      case 'entero': {
        if (ctrl.value === '') return null;
        var v = parseFloat(ctrl.value);
        return isFinite(v) ? v : null;
      }

      default: {
        var val = ctrl.value;
        return (typeof val === 'string') ? val.trim() : val;
      }
    }
  }

  function leer(nodos) {
    var out = {};
    Object.keys(nodos).forEach(function (id) {
      var n = nodos[id];
      if (n.fila.hidden) return;          // lo oculto no se guarda
      var v = leerControl(n);
      if (v === '' || v === null || (Array.isArray(v) && !v.length)) return;
      out[id] = v;
    });
    return out;
  }

  function validar(nodos) {
    var faltan = [];
    Object.keys(nodos).forEach(function (id) {
      var n = nodos[id];
      if (!n.def.requerido || n.fila.hidden) return;
      var v = leerControl(n);
      if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) {
        faltan.push(n.def.label);
      }
    });
    return faltan;
  }

  /* ¿Se cumple la condición de visible_si? */
  function cumple(cond, valores) {
    return Object.keys(cond).every(function (campo) {
      var esperados = cond[campo];
      var actual = valores[campo];
      if (!Array.isArray(esperados)) esperados = [esperados];
      return esperados.some(function (e) { return String(e) === String(actual); });
    });
  }

  /* Guarda los valores de los campos marcados con 'recordar' */
  function recordar(def, valores) {
    if (typeof Almacen === 'undefined') return;
    (def.campos || []).forEach(function (c) {
      if (c.recordar && valores[c.id]) Almacen.pref('ultimo_' + c.id, valores[c.id]);
    });
  }

  return {
    crear: crear,
    recordar: recordar,
    instalacionActual: null,
    _opcionesDe: opcionesDe,
    _cumple: cumple
  };
})();

if (typeof module !== 'undefined') module.exports = Formulario;