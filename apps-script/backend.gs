/* ============================================================
   BACKEND - App de relevamiento
   Va en el mismo proyecto de Apps Script que posgar.gs e
   importador.gs, sobre la planilla del inventario.

   Publicar: Implementar > Nueva implementacion > Aplicacion web
     Ejecutar como: Yo
     Quien tiene acceso: Cualquier persona
   ============================================================ */

var API = {
  VERSION: '1.1',

  // Lectura, las produce el importador
  H_INSTALACIONES: 'instalaciones',
  H_CALLES:        'calles',

  // Escritura, las crea este script
  H_ELEMENTOS:   'elementos',
  H_COMPONENTES: 'componentes',
  H_TRAMOS:      'tramos',
  H_OBSTRUCCIONES: 'obstrucciones',
  H_RELEVADORES: 'relevadores',
  H_CAMPANIAS:   'campanias',

  CARPETA_FOTOS: 'Relevamiento - Fotos'
};

var COLS_ELEMENTOS = [
  'id', 'tipo', 'familia', 'inv', 'lat', 'lon', 'lat_gps', 'lon_gps',
  'accuracy_m', 'ajustado', 'atributos_json', 'fotos', 'relevador',
  'fecha_alta', 'fecha_mod', 'activo'
];

var COLS_COMPONENTES = [
  'id', 'id_elemento', 'tipo', 'atributos_json', 'relevador',
  'fecha_alta', 'fecha_mod', 'activo'
];

var COLS_OBSTRUCCIONES = [
  'id', 'id_tramo', 'metodo', 'desde_camara', 'dist_m', 'extension_m',
  'lat', 'lon', 'atributos_json', 'relevador', 'fecha_alta', 'fecha_mod', 'activo'
];

var COLS_TRAMOS = [
  'id', 'tipo', 'id_origen', 'id_destino', 'geometria_json', 'n_puntos',
  'largo_m', 'atributos_json', 'relevador', 'fecha_alta', 'fecha_mod', 'activo'
];

/* =========================== GET =========================== */

function doGet(e) {
  try {
    var p = e.parameter || {};
    switch (p.accion) {

      case 'ping':
        return json({ ok: true, version: API.VERSION, ts: ahora() });

      /* Carga inicial. Todo lo que la app necesita para funcionar
         sin señal el resto del dia.                              */
      case 'padron':
        return json({
          ok: true,
          ts: ahora(),
          instalaciones: leer(API.H_INSTALACIONES),
          calles:        leer(API.H_CALLES).map(function (c) { return c.calle; }),
          relevadores:   leer(API.H_RELEVADORES),
          campanias:     leerActivos(API.H_CAMPANIAS)
        });

      /* Sincronizacion incremental: solo lo que cambio desde la
         ultima vez. Es lo que permite que la cuadrilla vea en el
         dia lo que fueron cargando los demas sin bajar todo.     */
      case 'cambios':
        return json({
          ok: true,
          ts: ahora(),
          elementos:   desde(API.H_ELEMENTOS, p.desde),
          componentes: desde(API.H_COMPONENTES, p.desde),
          tramos:       desde(API.H_TRAMOS, p.desde),
          obstrucciones: desde(API.H_OBSTRUCCIONES, p.desde)
        });

      case 'geojson':
        return json(geoJSON(p.tipo));

      default:
        return json({ ok: false, error: 'Acción no reconocida' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* =========================== POST ==========================
   El front manda Content-Type: text/plain para evitar el
   preflight CORS, que Apps Script no responde.
   =========================================================== */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var body = JSON.parse(e.postData.contents);

    switch (body.accion) {
      case 'guardar':
        return json({
          ok: true,
          ts: ahora(),
          elementos:   body.elementos   ? guardar(API.H_ELEMENTOS,   COLS_ELEMENTOS,   body.elementos)   : null,
          componentes: body.componentes ? guardar(API.H_COMPONENTES, COLS_COMPONENTES, body.componentes) : null,
          tramos:      body.tramos      ? guardar(API.H_TRAMOS,      COLS_TRAMOS,      body.tramos)      : null,
          obstrucciones: body.obstrucciones
            ? guardar(API.H_OBSTRUCCIONES, COLS_OBSTRUCCIONES, body.obstrucciones) : null
        });

      case 'foto':
        return json(subirFoto(body));

      case 'baja':
        return json(baja(body.hoja, body.id, body.relevador));

      default:
        return json({ ok: false, error: 'Acción no reconocida' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ====================== ESCRITURA ==========================
   Idempotente. El id lo genera el celular, asi que reenviar
   el mismo lote actualiza en vez de duplicar.
   =========================================================== */

function guardar(nombre, cols, registros) {
  if (!registros || !registros.length) return { insertados: 0, actualizados: 0 };

  var hoja = hojaDe(nombre, cols);
  var ult = hoja.getLastRow();
  var ts = ahora();

  var indice = {};
  if (ult > 1) {
    var ids = hoja.getRange(2, 1, ult - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) indice[String(ids[i][0])] = i + 2;
  }

  var nuevas = [], res = { insertados: 0, actualizados: 0, ids: [] };

  registros.forEach(function (reg) {
    reg.fecha_mod = ts;
    if (reg.activo === undefined) reg.activo = true;
    if (!reg.fecha_alta) reg.fecha_alta = ts;

    var fila = cols.map(function (c) {
      var v = reg[c];
      if (v === undefined || v === null) return '';
      return (typeof v === 'object') ? JSON.stringify(v) : v;
    });

    var f = indice[String(reg.id)];
    if (f) { hoja.getRange(f, 1, 1, cols.length).setValues([fila]); res.actualizados++; }
    else   { nuevas.push(fila); res.insertados++; }
    res.ids.push(reg.id);
  });

  if (nuevas.length) {
    hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, cols.length).setValues(nuevas);
  }
  return res;
}

function baja(nombre, id, relevador) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 2) return { ok: false, error: 'Hoja vacía' };
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var cAct = cab.indexOf('activo') + 1, cMod = cab.indexOf('fecha_mod') + 1;
  var ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      hoja.getRange(i + 2, cAct).setValue(false);
      if (cMod) hoja.getRange(i + 2, cMod).setValue(ahora());
      return { ok: true, id: id };
    }
  }
  return { ok: false, error: 'No encontrado' };
}

function subirFoto(body) {
  var carpeta = carpetaDe(API.CARPETA_FOTOS);
  var blob = Utilities.newBlob(Utilities.base64Decode(body.base64), 'image/jpeg',
                               body.id_elemento + '_' + body.seq + '.jpg');
  var f = carpeta.createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, file_id: f.getId(), url: f.getUrl(), id_elemento: body.id_elemento };
}

/* ========================= GEOJSON ========================= */

function geoJSON(filtroTipo) {
  var feats = [];

  leerActivos(API.H_ELEMENTOS).forEach(function (el) {
    if (filtroTipo && el.tipo !== filtroTipo) return;
    if (!el.lat || !el.lon) return;
    feats.push({ type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(el.lon), Number(el.lat)] },
      properties: aplanar(el) });
  });

  /* Las obstrucciones ya vienen con su punto calculado sobre
     el ducto, asi que salen como puntos en el GeoJSON.        */
  leerActivos(API.H_OBSTRUCCIONES).forEach(function (ob) {
    if (filtroTipo && filtroTipo !== 'obstruccion') return;
    if (!ob.lat || !ob.lon) return;
    var p = aplanar(ob);
    p.tipo = 'obstruccion';
    feats.push({ type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(ob.lon), Number(ob.lat)] },
      properties: p });
  });

  leerActivos(API.H_TRAMOS).forEach(function (tr) {
    if (filtroTipo && tr.tipo !== filtroTipo) return;
    var pts;
    try { pts = JSON.parse(tr.geometria_json); } catch (x) { return; }
    if (!pts || pts.length < 2) return;
    feats.push({ type: 'Feature',
      geometry: { type: 'LineString',
                  coordinates: pts.map(function (p) { return [p[1], p[0]]; }) },
      properties: aplanar(tr) });
  });

  return { type: 'FeatureCollection', features: feats };
}

function aplanar(reg) {
  var out = {};
  Object.keys(reg).forEach(function (k) {
    if (k === 'atributos_json' || k === 'geometria_json') return;
    out[k] = reg[k];
  });
  try {
    var a = JSON.parse(reg.atributos_json || '{}');
    Object.keys(a).forEach(function (k) {
      out[k] = Array.isArray(a[k]) ? a[k].join(' | ') : a[k];
    });
  } catch (x) {}
  return out;
}

/* ======================= UTILIDADES ======================== */

function ahora() { return new Date().toISOString(); }

function hojaDe(nombre, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(nombre);
  if (!h && cols) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  if (!h) throw new Error('No existe la hoja: ' + nombre);
  return h;
}

function leer(nombre) {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!h || h.getLastRow() < 2) return [];
  var d = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues();
  var cab = d.shift();
  return d.map(function (fila) {
    var o = {};
    cab.forEach(function (c, i) { if (c) o[c] = fila[i]; });
    return o;
  }).filter(function (o) {
    return Object.keys(o).some(function (k) { return o[k] !== ''; });
  });
}

function leerActivos(nombre) {
  try {
    return leer(nombre).filter(function (r) {
      return r.activo === true || r.activo === 'TRUE' || r.activo === '' || r.activo === undefined;
    });
  } catch (x) { return []; }
}

function desde(nombre, ts) {
  var todo = leerActivos(nombre);
  if (!ts) return todo;
  return todo.filter(function (r) { return String(r.fecha_mod) > String(ts); });
}

function carpetaDe(nombre) {
  var it = DriveApp.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nombre);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}

/* Correr una vez desde el editor para crear las hojas de escritura */
function prepararHojas() {
  hojaDe(API.H_ELEMENTOS, COLS_ELEMENTOS);
  hojaDe(API.H_COMPONENTES, COLS_COMPONENTES);
  hojaDe(API.H_TRAMOS, COLS_TRAMOS);
  hojaDe(API.H_OBSTRUCCIONES, COLS_OBSTRUCCIONES);
  hojaDe(API.H_RELEVADORES, ['id', 'nombre', 'zona', 'activo']);
  hojaDe(API.H_CAMPANIAS, ['id', 'nombre', 'tipo_elemento', 'filtro_zona',
                           'filtro_calle', 'asignado_a', 'activo']);
}