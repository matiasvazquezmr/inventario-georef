/* ============================================================
   IMPORTADOR - Inventario de Instalaciones -> hojas limpias

   Corre dentro de la MISMA planilla del inventario.
   Requiere que posgar.gs este cargado en el proyecto.

   Que hace:
     1. Lee las 5 pestañas originales sin tocarlas
     2. Normaliza nombres de calle y arma un padron canonico
     3. Reproyecta POSGAR 94 faja 5 -> WGS84
     4. Valida contra los links de Street View donde existan
     5. Detecta coordenadas faltantes, fuera de rango,
        sospechosas e intercambiadas entre filas hermanas
     6. Escribe: instalaciones / calles / revisar

   Ejecutar: importarTodo()
   ============================================================ */

var IMP = {
  VERSION: '2.2',   // 2.1 = criterio geografico | 2.2 = conserva la fila original
  ORIGEN: {
    semaforo:     { hoja: 'Semaforos',        prefijo: '' },
    punto_medida: { hoja: 'Puntos de medida', prefijo: '' },
    pmv:          { hoja: 'Pantallas MV',     prefijo: 'CMV' },
    pov:          { hoja: 'Pantallas OV',     prefijo: 'MV' },
    cctv:         { hoja: 'CCTV',             prefijo: 'CCTV' }
  },
  DESTINO: { instalaciones: 'instalaciones', calles: 'calles', revisar: 'revisar' },

  // Umbrales de control
  DIF_STREETVIEW_AVISO: 60,   // m: por encima, se marca para revisar
  DIF_SWAP_FACTOR: 2.0,       // el cruce debe ser al menos 2x mejor para declarar swap
  LEV_MAX_TYPO: 2             // distancia de edicion para sospechar errata
};

/* ================= NORMALIZACION DE CALLES ================= */

function normalizarCalle(s) {
  if (s === null || s === undefined) return '';
  var t = String(s).toUpperCase().trim();
  // saca acentos
  t = t.replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
       .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U');
  t = t.replace(/Ñ/g, '~');           // preserva la eñe como caracter unico
  t = t.replace(/[^A-Z0-9~ \-\/]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/~/g, 'Ñ');
  return t;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                        prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    for (j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/* Sufijos que marcan una calzada distinta a proposito.
   BAIGORRIA y BAIGORRIA - COLECTORA no son la misma calle.   */
IMP.SUFIJOS_DISTINTOS = ['COLECTORA', 'SUR', 'NORTE', 'ESTE', 'OESTE', 'BIS'];

/* Dos usos de la misma calle nunca estan a mas de esto.
   Si dos nombres parecidos aparecen lejos, son calles distintas. */
IMP.DIST_MISMA_CALLE_M = 400;

function soloSufijoDeliberado(tokensExtra) {
  if (!tokensExtra.length) return false;
  for (var i = 0; i < tokensExtra.length; i++) {
    var t = tokensExtra[i].replace(/^-+/, '');
    if (t === '' || t === '-') continue;
    if (IMP.SUFIJOS_DISTINTOS.indexOf(t) < 0) return false;
  }
  return true;
}

/* Distancia minima entre los puntos donde se usa cada nombre.
   Si una es errata de la otra, van a coincidir en el mismo lugar. */
function distanciaEntreCalles(pa, pb) {
  if (!pa.puntos.length || !pb.puntos.length) return null;
  var min = Infinity;
  for (var i = 0; i < pa.puntos.length; i++) {
    for (var j = 0; j < pb.puntos.length; j++) {
      var d = POSGAR.distancia(pa.puntos[i].lat, pa.puntos[i].lon,
                               pb.puntos[j].lat, pb.puntos[j].lon);
      if (d < min) min = d;
    }
  }
  return min === Infinity ? null : min;
}

function detectarCallesDuplicadas(padron) {
  var nombres = Object.keys(padron).sort();
  var pares = [];
  var candidatosAbrev = {};   // nombre corto -> [nombres largos]

  for (var i = 0; i < nombres.length; i++) {
    for (var k = i + 1; k < nombres.length; k++) {
      var A = nombres[i], B = nombres[k];
      var ta = A.split(' '), tb = B.split(' ');

      var esA = ta.length <= tb.length;
      var corta = esA ? ta : tb, larga = esA ? tb : ta;
      var nCorta = esA ? A : B, nLarga = esA ? B : A;

      var esPrefijo = corta.length > 0 && corta.length < larga.length;
      for (var z = 0; z < corta.length && esPrefijo; z++) {
        if (corta[z] !== larga[z]) esPrefijo = false;
      }

      if (esPrefijo) {
        // "X" vs "X - COLECTORA" son calzadas distintas a proposito
        if (soloSufijoDeliberado(larga.slice(corta.length))) continue;

        var dA = distanciaEntreCalles(padron[nCorta], padron[nLarga]);
        if (dA !== null && dA > IMP.DIST_MISMA_CALLE_M) continue;

        (candidatosAbrev[nCorta] = candidatosAbrev[nCorta] || []).push(nLarga);
        pares.push({ a: nCorta, b: nLarga, motivo: 'nombre incompleto',
                     usos_a: padron[nCorta].usos, usos_b: padron[nLarga].usos,
                     dist: dA, corto: nCorta });
        continue;
      }

      /* Errata: solo distancia 1, la variante rara con pocos usos, y
         encima usada en el mismo lugar que la comun. Sin el criterio
         geografico se marcaban calles reales como PIAMONTE/VIAMONTE. */
      if (Math.abs(A.length - B.length) <= 1 && A.length >= 5) {
        if (levenshtein(A, B) !== 1) continue;

        var raro = padron[A].usos <= padron[B].usos ? A : B;
        var comun = raro === A ? B : A;
        if (padron[raro].usos > 2) continue;      // la errata aparece poco
        if (padron[comun].usos < 3) continue;     // la buena aparece varias veces

        var dE = distanciaEntreCalles(padron[raro], padron[comun]);
        if (dE === null || dE > IMP.DIST_MISMA_CALLE_M) continue;

        pares.push({ a: comun, b: raro, motivo: 'errata',
                     usos_a: padron[comun].usos, usos_b: padron[raro].usos, dist: dE });
      }
    }
  }

  /* Abreviatura ambigua: "ACEVEDO" podria ser dos calles distintas.
     Eso no se puede resolver solo, hay que mirarlo a mano.        */
  Object.keys(candidatosAbrev).forEach(function (corto) {
    if (candidatosAbrev[corto].length > 1) {
      pares = pares.filter(function (p) { return p.corto !== corto; });
      pares.push({ a: corto, b: candidatosAbrev[corto].join('  ó  '),
                   motivo: 'abreviatura ambigua, resolver a mano',
                   usos_a: padron[corto].usos, usos_b: '', dist: null });
    }
  });

  return pares;
}

/* ================= LECTURA ================= */

function leerPestania(nombre) {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!h) return null;
  var ultFila = h.getLastRow(), ultCol = h.getLastColumn();
  if (ultFila < 2) return [];
  var datos = h.getRange(1, 1, ultFila, ultCol).getValues();
  var cab = datos.shift().map(function (c) { return String(c).trim(); });
  var out = [];
  for (var i = 0; i < datos.length; i++) {
    var vacia = datos[i].every(function (v) { return v === '' || v === null; });
    if (vacia) continue;
    var o = { _fila: i + 2 };
    for (var j = 0; j < cab.length; j++) if (cab[j]) o[cab[j]] = datos[i][j];
    out.push(o);
  }
  return out;
}

/* Busca una columna por varios nombres posibles, sin importar
   mayusculas ni espacios. Las pestañas no son consistentes.   */
function col(fila, nombres) {
  for (var i = 0; i < nombres.length; i++) {
    var buscado = nombres[i].toUpperCase().replace(/[\s.°º]/g, '');
    for (var k in fila) {
      if (k.toUpperCase().replace(/[\s.°º]/g, '') === buscado) {
        var v = fila[k];
        return (v === '' || v === null || v === undefined) ? null : v;
      }
    }
  }
  return null;
}

/* ================= IMPORTACION ================= */

function importarTodo() {
  var padron = {};       // calle normalizada -> { usos, variantes }
  var filas = [];        // instalaciones normalizadas
  var avisos = [];       // para la hoja "revisar"

  Object.keys(IMP.ORIGEN).forEach(function (familia) {
    var cfg = IMP.ORIGEN[familia];
    var datos = leerPestania(cfg.hoja);
    if (datos === null) {
      avisos.push(['-', familia, '-', 'FALTA HOJA', 'No se encontró la pestaña "' + cfg.hoja + '"', '']);
      return;
    }

    datos.forEach(function (r) {
      /* Ojo con el orden: en Pantallas OV conviven ID_INV_SL
         (MV-059, el inventario propio) e INV_SL (683, el cruce
         del que cuelga). El propio siempre gana.               */
      var inv = col(r, ['ID_INV_SL', 'INV_SL']);
      if (inv === null) return;
      inv = String(inv).replace(/\s*-\s*/, '-').trim();   // "D - 001" -> "D-001"

      var c1 = normalizarCalle(col(r, ['CALLE 1']));
      var c2 = normalizarCalle(col(r, ['CALLE 2']));
      var callesDeLaFila = [];
      [c1, c2].forEach(function (c) {
        if (!c) return;
        if (!padron[c]) padron[c] = { usos: 0, familias: {}, puntos: [] };
        padron[c].usos++;
        padron[c].familias[familia] = true;
        callesDeLaFila.push(c);
      });

      var dx = POSGAR.parseCoordDetalle(col(r, ['COORD_X']));
      var dy = POSGAR.parseCoordDetalle(col(r, ['COORD_Y']));
      var x = dx.valor, y = dy.valor;

      var huboReescalado = (dx.escala !== 1 && dx.escala !== 0) ||
                           (dy.escala !== 1 && dy.escala !== 0);

      var lat = null, lon = null, estadoCoord = 'ok';
      if (x === null || y === null) {
        estadoCoord = 'sin coordenada';
        avisos.push([inv, familia, r._fila, 'SIN COORDENADA',
                     'COORD_X o COORD_Y vacío', '']);
      } else if (!POSGAR.coordEnRango(x, y)) {
        estadoCoord = 'fuera de rango';
        avisos.push([inv, familia, r._fila, 'FUERA DE RANGO',
                     'x=' + x + ' y=' + y + ' cae afuera de Rosario', '']);
      } else {
        var g = POSGAR.aLatLon(x, y);
        lat = g.lat; lon = g.lon;
        callesDeLaFila.forEach(function (c) {
          padron[c].puntos.push({ lat: lat, lon: lon });
        });
        if (huboReescalado) {
          avisos.push([inv, familia, r._fila, 'SEPARADOR DECIMAL',
                       'Origen ' + col(r, ['COORD_X']) + ' / ' + col(r, ['COORD_Y']) +
                       ' leído como entero por la configuración regional',
                       'Corregido a ' + x.toFixed(3) + ' / ' + y.toFixed(3)]);
        }
      }

      // Validacion contra Street View si la fila tiene link
      var maps = col(r, ['MAPS']);
      var difSV = null;
      var sv = POSGAR.latLonDeMaps(maps);
      if (sv && lat !== null) {
        difSV = POSGAR.distancia(lat, lon, sv.lat, sv.lon);
        if (difSV > IMP.DIF_STREETVIEW_AVISO) {
          avisos.push([inv, familia, r._fila, 'DIFIERE DE STREET VIEW',
                       Math.round(difSV) + ' m de diferencia', '']);
        }
      }

      /* Se guarda la fila original entera. Es lo que permite que
         la app muestre los conteos declarados (ménsulas, columnas
         101, cuerpos por configuración) y los compare contra lo
         que se va relevando en la calle.                         */
      var crudo = {};
      Object.keys(r).forEach(function (k) {
        if (k === '_fila') return;
        var v = r[k];
        if (v === '' || v === null || v === undefined) return;
        crudo[k] = (v instanceof Date) ? v.toISOString().slice(0, 10) : v;
      });

      filas.push({
        familia: familia,
        inv: inv,
        fila_origen: r._fila,
        datos_json: JSON.stringify(crudo),
        id_g: col(r, ['ID_G']),
        id_sist: col(r, ['ID_SIST']),
        /* El semaforo es el cruce, no cuelga de otro */
        inv_cruce: familia === 'semaforo' ? null : col(r, ['ID_INV_CRUCE', 'INV_SL']),
        calle_1: c1,
        calle_2: c2,
        distrito: col(r, ['Distrito']),
        zona: col(r, ['ZONA']),
        coord_x: x,
        coord_y: y,
        lat: lat,
        lon: lon,
        estado_coord: estadoCoord,
        dif_streetview_m: difSV === null ? '' : Math.round(difSV * 10) / 10,
        sv_lat: sv ? sv.lat : null,
        sv_lon: sv ? sv.lon : null
      });
    });
  });

  detectarIntercambiadas(filas, avisos);

  detectarCallesDuplicadas(padron).forEach(function (p) {
    avisos.push(['-', 'calles', '-', 'CALLE DUPLICADA',
                 p.a + '  /  ' + p.b + '  (' + p.motivo + ')',
                 p.usos_a + ' vs ' + p.usos_b + ' usos'
                 + (p.dist === null ? '' : ', a ' + Math.round(p.dist) + ' m')]);
  });

  detectarInvDuplicados(filas, avisos);

  escribirInstalaciones(filas);
  escribirCalles(padron);
  escribirRevisar(avisos);

  var conCoord = filas.filter(function (f) { return f.lat !== null; }).length;
  var msg = 'Importador v' + IMP.VERSION + '\n\n'
          + filas.length + ' instalaciones importadas\n'
          + conCoord + ' con coordenada válida\n'
          + Object.keys(padron).length + ' calles en el padrón\n'
          + avisos.length + ' avisos para revisar';
  SpreadsheetApp.getUi().alert('Importación terminada', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  return msg;
}

/* Filas hermanas = misma familia y mismo cruce/esquina.
   Si al cruzar las coordenadas ambas mejoran contra su
   Street View, casi seguro estan invertidas.              */
function detectarIntercambiadas(filas, avisos) {
  var grupos = {};
  filas.forEach(function (f) {
    if (f.lat === null || f.sv_lat === null) return;
    var k = f.familia + '|' + (f.inv_cruce || (f.calle_1 + '/' + f.calle_2));
    (grupos[k] = grupos[k] || []).push(f);
  });

  Object.keys(grupos).forEach(function (k) {
    var g = grupos[k];
    for (var i = 0; i < g.length; i++) {
      for (var j = i + 1; j < g.length; j++) {
        var A = g[i], B = g[j];
        var propio = POSGAR.distancia(A.lat, A.lon, A.sv_lat, A.sv_lon)
                   + POSGAR.distancia(B.lat, B.lon, B.sv_lat, B.sv_lon);
        var cruzado = POSGAR.distancia(A.lat, A.lon, B.sv_lat, B.sv_lon)
                    + POSGAR.distancia(B.lat, B.lon, A.sv_lat, A.sv_lon);
        if (cruzado * IMP.DIF_SWAP_FACTOR < propio) {
          avisos.push([A.inv + ' / ' + B.inv, A.familia,
                       A.fila_origen + ' / ' + B.fila_origen,
                       'COORDENADAS INTERCAMBIADAS',
                       'Error actual ' + Math.round(propio) + ' m, cruzadas ' + Math.round(cruzado) + ' m',
                       'Verificar y permutar']);
        }
      }
    }
  });
}

function detectarInvDuplicados(filas, avisos) {
  var porClave = {};
  filas.forEach(function (f) {
    var k = f.familia + '|' + f.inv;
    (porClave[k] = porClave[k] || []).push(f);
  });
  Object.keys(porClave).forEach(function (k) {
    var g = porClave[k];
    if (g.length < 2) return;
    avisos.push([g[0].inv, g[0].familia,
                 g.map(function (f) { return f.fila_origen; }).join(' / '),
                 'INVENTARIO DUPLICADO',
                 'El mismo número aparece ' + g.length + ' veces', '']);
  });
}

/* ================= ESCRITURA ================= */

function hojaLimpia(nombre, cabecera) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  h.clear();
  h.getRange(1, 1, 1, cabecera.length).setValues([cabecera]).setFontWeight('bold');
  h.setFrozenRows(1);
  return h;
}

function escribirInstalaciones(filas) {
  var cab = ['familia', 'inv', 'id_g', 'id_sist', 'inv_cruce', 'calle_1', 'calle_2',
             'distrito', 'zona', 'coord_x', 'coord_y', 'lat', 'lon',
             'estado_coord', 'dif_streetview_m', 'fila_origen', 'datos_json'];
  var h = hojaLimpia(IMP.DESTINO.instalaciones, cab);
  if (!filas.length) return;
  var out = filas.map(function (f) {
    return cab.map(function (c) { return f[c] === null || f[c] === undefined ? '' : f[c]; });
  });
  h.getRange(2, 1, out.length, cab.length).setValues(out);
  h.getRange(2, 12, out.length, 2).setNumberFormat('0.000000');   // lat / lon
}

function escribirCalles(padron) {
  var cab = ['calle', 'usos', 'familias'];
  var h = hojaLimpia(IMP.DESTINO.calles, cab);
  var nombres = Object.keys(padron).sort();
  if (!nombres.length) return;
  var out = nombres.map(function (n) {
    return [n, padron[n].usos, Object.keys(padron[n].familias).join(', ')];
  });
  h.getRange(2, 1, out.length, cab.length).setValues(out);
}

function escribirRevisar(avisos) {
  var cab = ['inventario', 'familia', 'fila origen', 'problema', 'detalle', 'sugerencia'];
  var h = hojaLimpia(IMP.DESTINO.revisar, cab);
  h.getRange(1, 8).setValue('Importador v' + IMP.VERSION + ' - ' + new Date().toLocaleString());
  if (!avisos.length) {
    h.getRange(2, 1).setValue('Sin observaciones');
    return;
  }
  h.getRange(2, 1, avisos.length, cab.length).setValues(avisos);
}

/* ================= REPARACION IN SITU =================
   El importador ya corrige la magnitud al vuelo, asi que esto
   es opcional. Sirve si ademas queres dejar sanas las pestañas
   originales, por ejemplo porque las usa otra gente.
   Pide confirmacion antes de escribir.
   ====================================================== */

function repararCoordenadas() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plan = [];

  Object.keys(IMP.ORIGEN).forEach(function (familia) {
    var nombre = IMP.ORIGEN[familia].hoja;
    var h = ss.getSheetByName(nombre);
    if (!h || h.getLastRow() < 2) return;

    var cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0]
                .map(function (c) { return String(c).trim().toUpperCase(); });
    var cx = cab.indexOf('COORD_X') + 1, cy = cab.indexOf('COORD_Y') + 1;
    if (!cx || !cy) return;

    var n = h.getLastRow() - 1;
    var vx = h.getRange(2, cx, n, 1).getValues();
    var vy = h.getRange(2, cy, n, 1).getValues();

    for (var i = 0; i < n; i++) {
      [[vx, cx], [vy, cy]].forEach(function (par) {
        var orig = par[0][i][0];
        if (orig === '' || orig === null) return;
        var d = POSGAR.parseCoordDetalle(orig);
        if (d.valor === null || d.escala === 1) return;
        if (d.escala === 0) {
          plan.push({ hoja: nombre, fila: i + 2, colNum: par[1],
                      antes: orig, despues: null });
        } else {
          plan.push({ hoja: nombre, fila: i + 2, colNum: par[1],
                      antes: orig, despues: d.valor });
        }
      });
    }
  });

  var corregibles = plan.filter(function (p) { return p.despues !== null; });
  var perdidos    = plan.filter(function (p) { return p.despues === null; });

  if (!plan.length) {
    ui.alert('Reparar coordenadas', 'No hay valores para corregir.', ui.ButtonSet.OK);
    return;
  }

  var muestra = corregibles.slice(0, 5).map(function (p) {
    return '  ' + p.hoja + ' fila ' + p.fila + ':  ' + p.antes + '  ->  ' + p.despues;
  }).join('\n');

  var msg = corregibles.length + ' valores se van a corregir.\n'
          + (perdidos.length ? perdidos.length + ' no se pudieron interpretar y quedan como están.\n' : '')
          + '\nEjemplos:\n' + muestra
          + '\n\nEsto modifica las pestañas originales. ¿Continuar?';

  if (ui.alert('Reparar coordenadas', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  corregibles.forEach(function (p) {
    ss.getSheetByName(p.hoja).getRange(p.fila, p.colNum)
      .setValue(p.despues).setNumberFormat('0.000');
  });

  ui.alert('Listo', corregibles.length + ' valores corregidos.', ui.ButtonSet.OK);
}

/* ================= MENU ================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Inventario')
    .addItem('Importar y validar', 'importarTodo')
    .addSeparator()
    .addItem('Reparar coordenadas del origen', 'repararCoordenadas')
    .addToUi();
}