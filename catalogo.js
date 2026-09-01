/* ============================================================
   CATALOGO v2 - Inventario georreferenciado
   Ente de la Movilidad Rosario - Direccion de Señalizacion Luminosa

   Reescrito sobre la estructura real de
   "20250916 - Inventario de Instalaciones Ciudad de Rosario"

   TRES NIVELES:
     1. INSTALACION  lo que ya tenes inventariado. Una coordenada
                     por cruce. Se importa, no se releva.
     2. ELEMENTO     lo que se releva con GPS en la calle. Cuelga
                     de una instalacion o de ninguna.
     3. COMPONENTE   vive dentro de un elemento. Sin coordenada
                     propia, hereda la del padre.

   CADA CAMPO DECLARA SU ORIGEN:
     'oficina'  solo editable desde el escritorio
     'calle'    se carga con el celular durante el relevamiento
     'ambos'    se puede completar en cualquiera de los dos
     'derivado' lo calcula la app, no se guarda ni se edita
   ============================================================ */

const CATALOGO = {

  meta: {
    version: 2,
    crs_origen: 'EPSG:22185',   // POSGAR 94 / Argentina Faja 5
    crs_trabajo: 'EPSG:4326'    // lo que usa Leaflet y el GeoJSON
  },

  /* ================================================================
     TABLAS DE REFERENCIA
     ================================================================ */

  ref: {
    zonas: [
      { id: 'Zona 1', nombre: 'Zona 1 (Norte)' },
      { id: 'Zona 2', nombre: 'Zona 2 (Sur)' }
    ],

    distritos: ['CENTRO', 'NORTE', 'NOROESTE', 'OESTE', 'SUDOESTE', 'SUR'],

    sistemas: ['OPTIMUS', 'SITRA', 'ICARUS', 'ECOTRAFIX'],

    conexiones: ['Multipar Telefónico', '4G', 'Fibra Óptica', 'Radio', 'Aislado'],

    /* SV es el unico campo que se carga. La orientacion es derivada:
       basta con el sentido para saber hacia donde va el flujo.      */
    sentidos: [
      { id: 'SV1', flujo: 'Norte - Sur',  hacia: 'Hacia Sur' },
      { id: 'SV2', flujo: 'Sur - Norte',  hacia: 'Hacia Norte' },
      { id: 'SV3', flujo: 'Este - Oeste', hacia: 'Hacia Oeste' },
      { id: 'SV4', flujo: 'Oeste - Este', hacia: 'Hacia Este' }
    ],

    /* Marca y modelo dejan de ser un campo de texto libre */
    controladores: [
      { marca: 'Kapsch',      modelos: ['RMY', 'RBY', 'ECOTRAFIX'] },
      { marca: 'Autotrol',    modelos: ['CT800DM'] },
      { marca: 'Mantelectric',modelos: ['S3300'] },
      { marca: 'Tacuar',      modelos: ['CET-234'] },
      { marca: 'Sin equipo',  modelos: ['SUBREGULADO'] }
    ],

    /* Configuraciones opticas reales, tomadas de las columnas
       de la planilla. El relevador elige de esta lista y el
       conteo cierra sin traduccion contra el inventario.        */
    cuerpos: [
      { id: '3x200',            label: '3x200',            clase: 'vehicular' },
      { id: '3x300',            label: '3x300',            clase: 'vehicular' },
      { id: '300+2x200',        label: '300 + 2x200',      clase: 'vehicular' },
      { id: 'peatonal',         label: 'Peatonal',         clase: 'peatonal'  },
      { id: 'giro_2x200_vv',    label: 'Giro 2x200 V-V',   clase: 'giro' },
      { id: 'giro_2x200_rv',    label: 'Giro 2x200 R-V',   clase: 'giro' },
      { id: 'giro_3x200_rrv',   label: 'Giro 3x200 R-R-V', clase: 'giro' },
      { id: 'giro_3x200_rav',   label: 'Giro 3x200 R-A-V', clase: 'giro' },
      { id: 'giro_2x300_vv',    label: 'Giro 2x300 V-V',   clase: 'giro' },
      { id: 'giro_2x300_rv',    label: 'Giro 2x300 R-V',   clase: 'giro' },
      { id: 'giro_3x300_rrv',   label: 'Giro 3x300 R-R-V', clase: 'giro' },
      { id: 'giro_3x300_rav',   label: 'Giro 3x300 R-A-V', clase: 'giro' }
    ]
  },

  /* ================================================================
     NIVEL 1 - INSTALACIONES
     El prefijo del inventario identifica la familia, asi un unico
     buscador resuelve todo: "1234" va a semaforo, "cmv-002" a PMV.
     ================================================================ */

  instalaciones: {

    semaforo: {
      nombre: 'Semáforo',
      prefijo: '',                       // inventario numerico puro
      color: '#e53935',
      campos: [
        { id: 'inv_sl',      label: 'N° inventario',    tipo: 'texto',  origen: 'oficina', clave: true },
        { id: 'id_g',        label: 'ID sistema municipal', tipo: 'texto', origen: 'oficina',
          ayuda: 'ID que devuelve el sistema al cargar la esquina, se usa en reclamos' },
        { id: 'calle_1',     label: 'Calle 1',          tipo: 'calle',  origen: 'oficina' },
        { id: 'calle_2',     label: 'Calle 2',          tipo: 'calle',  origen: 'oficina' },
        { id: 'distrito',    label: 'Distrito',         tipo: 'select', origen: 'oficina', ref: 'distritos' },
        { id: 'zona',        label: 'Zona',             tipo: 'select', origen: 'oficina', ref: 'zonas' },
        { id: 'clasificacion',label:'Clasificación',    tipo: 'select', origen: 'oficina',
          opciones: ['Semáforo', 'Escolar / Precaucional'] },
        { id: 'estado',      label: 'Estado',           tipo: 'select', origen: 'ambos',
          opciones: ['En Servicio', 'En Obra', 'Fuera de Servicio'] },

        // --- Sistema. Nada de esto se ve en la calle. ---
        { id: 'centralizado',label: 'Centralizado',     tipo: 'booleano', origen: 'oficina' },
        { id: 'sistema',     label: 'Sistema',          tipo: 'select', origen: 'oficina', ref: 'sistemas' },
        { id: 'modo_func',   label: 'Modo de funcionamiento', tipo: 'select', origen: 'oficina',
          opciones: ['Ordenador', 'Central', 'Local'] },
        { id: 'nro_cruce',   label: 'N° de cruce',      tipo: 'texto',  origen: 'oficina' },
        { id: 'nro_regulador',label:'N° de regulador',  tipo: 'texto',  origen: 'oficina' },
        { id: 'sub_area',    label: 'Sub área',         tipo: 'texto',  origen: 'oficina' },
        { id: 'central',     label: 'Central de zona',  tipo: 'ref_instalacion', origen: 'oficina',
          filtro_familia: 'central_zona' },
        { id: 'num_grupos',  label: 'Cantidad de grupos', tipo: 'entero', origen: 'oficina' },
        { id: 'num_planes',  label: 'Cantidad de planes', tipo: 'entero', origen: 'oficina' },
        { id: 'modo_inicial',label: 'Modo de funcionamiento inicial', tipo: 'select', origen: 'oficina',
          opciones: ['Tiempos fijos', 'Actuado total', 'Semiactuado'] },
        { id: 'conexion',    label: 'Conexión',         tipo: 'select', origen: 'oficina', ref: 'conexiones' },

        // --- Controlador ---
        { id: 'ctrl_marca',  label: 'Marca del controlador',  tipo: 'select', origen: 'ambos', ref: 'controladores.marca' },
        { id: 'ctrl_modelo', label: 'Modelo del controlador', tipo: 'select', origen: 'ambos', ref: 'controladores.modelo',
          depende_de: 'ctrl_marca' },
        { id: 'ctrl_serie',  label: 'N° de serie',      tipo: 'texto',  origen: 'ambos' },
        { id: 'subregulado_de', label: 'Subregulado de', tipo: 'ref_instalacion', origen: 'oficina',
          filtro_familia: 'semaforo',
          ayuda: 'Completar solo si este cruce no tiene controlador propio',
          visible_si: { ctrl_modelo: ['SUBREGULADO'] } },

        // --- Fechas ---
        { id: 'alta_ec',     label: 'Fecha de inauguración', tipo: 'fecha', origen: 'oficina' },
        { id: 'alta_sist',   label: 'Fecha de centralización', tipo: 'fecha', origen: 'oficina',
          ayuda: 'Cuando se incorpora al software de monitoreo' },
        { id: 'antiguedad',  label: 'Antigüedad (años)', tipo: 'entero', origen: 'derivado',
          formula: 'anios_desde(alta_ec)' },

        // --- Tipologia ---
        { id: 'tipo_cruce',  label: 'Tipo de cruce',    tipo: 'texto',  origen: 'oficina',
          ayuda: 'Tipología propia. La histórica quedó desactualizada, se recarga a mano.' },

        // --- Conteos declarados. Fuente de verdad para el control
        //     de completitud del relevamiento. ---
        { id: 'cant_mensulas', label: 'Columnas con ménsula', tipo: 'entero', origen: 'oficina', conteo_de: 'columna:mensula' },
        { id: 'cant_col_101',  label: 'Columnas 101',         tipo: 'entero', origen: 'oficina', conteo_de: 'columna:101' },
        { id: 'sonoro',        label: 'Tiene sonoro',         tipo: 'booleano', origen: 'ambos' },
        { id: 'cant_sonoros',  label: 'Cantidad de sonoros',  tipo: 'entero', origen: 'ambos',
          visible_si: { sonoro: [true] }, conteo_de: 'sonorizador' },
        { id: 'cant_cuerpos',  label: 'Cuerpos declarados por tipo', tipo: 'conteo_multiple',
          origen: 'oficina', ref: 'cuerpos', conteo_de: 'cuerpo' }
      ]
    },

    punto_medida: {
      nombre: 'Punto de medida',
      /* El prefijo ya dice la funcion, asi que FUNCION pasa a
         derivado en vez de ser un campo que se puede contradecir. */
      prefijos: { 'D': 'Demanda', 'E': 'Conteo' },
      color: '#43a047',
      campos: [
        { id: 'id_inv',      label: 'N° inventario',    tipo: 'texto', origen: 'oficina', clave: true },
        { id: 'funcion',     label: 'Función',          tipo: 'select', origen: 'derivado',
          formula: 'prefijo(id_inv)', opciones: ['Demanda', 'Conteo'] },
        { id: 'id_sist',     label: 'ID sistema',       tipo: 'texto', origen: 'oficina' },
        { id: 'inv_cruce',   label: 'Cruce al que pertenece', tipo: 'ref_instalacion', origen: 'oficina',
          filtro_familia: 'semaforo' },
        { id: 'calle_1',     label: 'Calle 1',          tipo: 'calle', origen: 'oficina' },
        { id: 'calle_2',     label: 'Calle 2',          tipo: 'calle', origen: 'oficina' },
        { id: 'zona',        label: 'Zona',             tipo: 'select', origen: 'oficina', ref: 'zonas' },
        { id: 'sistema',     label: 'Sistema',          tipo: 'select', origen: 'oficina', ref: 'sistemas' },
        { id: 'estado',      label: 'Estado',           tipo: 'select', origen: 'ambos',
          opciones: ['Funciona', 'No funciona'] },
        { id: 'accion',      label: 'Acción que ejecuta', tipo: 'texto_sugerido', origen: 'oficina',
          sugerencias: ['AFORO', 'ACTIVA SALIDA 1', 'ACTIVA SALIDA 2', 'ACTIVA GIRO 1',
                        'ACTIVA GIRO 2', 'ACTIVA BARRERA FFCC'],
          ayuda: 'Texto libre con sugerencias, se puede escribir cualquier otra' },
        { id: 'sentido',     label: 'Sentido',          tipo: 'select', origen: 'ambos', ref: 'sentidos' },
        { id: 'orientacion', label: 'Orientación',      tipo: 'texto', origen: 'derivado',
          formula: 'sentidos[sentido].flujo' },
        { id: 'nro_detectores', label: 'Cantidad de detectores', tipo: 'entero', origen: 'derivado',
          formula: 'contar_componentes(detector)' }
      ]
    },

    pmv: {
      nombre: 'Pantalla de mensajería variable',
      prefijo: 'CMV',
      color: '#fb8c00',
      requiere_cruce: false,     // puede estar a mitad de cuadra
      campos: [
        { id: 'id_inv',      label: 'N° inventario', tipo: 'texto', origen: 'oficina', clave: true },
        { id: 'calle_1',     label: 'Calle 1',       tipo: 'calle', origen: 'oficina' },
        { id: 'calle_2',     label: 'Calle 2 / altura', tipo: 'calle', origen: 'oficina' },
        { id: 'inv_cruce',   label: 'Cruce asociado', tipo: 'ref_instalacion', origen: 'oficina',
          filtro_familia: 'semaforo', requerido: false },
        { id: 'zona',        label: 'Zona',          tipo: 'select', origen: 'oficina', ref: 'zonas' },
        { id: 'sentido',     label: 'Sentido',       tipo: 'select', origen: 'ambos', ref: 'sentidos' },
        { id: 'orientacion', label: 'Orientación',   tipo: 'texto',  origen: 'derivado',
          formula: 'sentidos[sentido].hacia' },
        { id: 'resolucion',  label: 'Resolución',    tipo: 'select', origen: 'oficina',
          opciones: ['160 x 64', '240 x 120', '360 x 120', '432 x 144'] },
        { id: 'ip',          label: 'N° IP',         tipo: 'texto',  origen: 'oficina' },
        { id: 'modelo',      label: 'Modelo',        tipo: 'texto',  origen: 'oficina' },
        { id: 'estado',      label: 'Estado',        tipo: 'select', origen: 'ambos',
          opciones: ['Funciona', 'No funciona'] }
      ]
    },

    pov: {
      nombre: 'Pantalla de onda verde',
      prefijo: 'MV',
      color: '#26a69a',
      campos: [
        { id: 'id_inv',      label: 'N° inventario', tipo: 'texto', origen: 'oficina', clave: true },
        { id: 'inv_sl',      label: 'Cruce al que pertenece', tipo: 'ref_instalacion', origen: 'oficina',
          filtro_familia: 'semaforo' },
        { id: 'codigo',      label: 'Código',        tipo: 'texto',  origen: 'derivado',
          formula: '"CCT-" + semaforo(inv_sl).nro_regulador',
          ayuda: 'Se arma solo con el regulador del cruce' },
        { id: 'calle_1',     label: 'Calle 1',       tipo: 'calle',  origen: 'oficina' },
        { id: 'calle_2',     label: 'Calle 2',       tipo: 'calle',  origen: 'oficina' },
        { id: 'distrito',    label: 'Distrito',      tipo: 'select', origen: 'oficina', ref: 'distritos' },
        { id: 'zona',        label: 'Zona',          tipo: 'select', origen: 'oficina', ref: 'zonas' },
        { id: 'sub_area',    label: 'Sub área',      tipo: 'texto',  origen: 'oficina' },
        { id: 'sistema',     label: 'Sistema',       tipo: 'select', origen: 'oficina', ref: 'sistemas' },
        { id: 'sentido',     label: 'Sentido',       tipo: 'select', origen: 'ambos', ref: 'sentidos' },
        { id: 'cantidad',    label: 'Cantidad',      tipo: 'entero', origen: 'oficina' },
        { id: 'habilitacion',label: 'Fecha de habilitación', tipo: 'fecha', origen: 'oficina' },
        { id: 'estado',      label: 'Estado',        tipo: 'select', origen: 'ambos',
          opciones: ['Funciona', 'No funciona'] }
      ]
    },

    cctv: {
      nombre: 'Cámara CCTV',
      prefijo: 'CCTV',
      color: '#5e35b1',
      requiere_cruce: false,
      campos: [
        { id: 'id_inv',      label: 'N° inventario', tipo: 'texto', origen: 'oficina', clave: true },
        { id: 'calle_1',     label: 'Calle 1',       tipo: 'calle', origen: 'oficina' },
        { id: 'calle_2',     label: 'Calle 2',       tipo: 'calle', origen: 'oficina' },
        { id: 'zona',        label: 'Zona',          tipo: 'select', origen: 'oficina', ref: 'zonas' },
        { id: 'ubicacion',   label: 'Ubicación',     tipo: 'select', origen: 'ambos',
          opciones: ['Columna propia', 'Columna de alumbrado', 'Pescante de semáforo', 'Fachada'] },
        { id: 'id_columna',  label: 'Columna que la soporta', tipo: 'ref_elemento', origen: 'calle',
          filtro_tipo: 'columna' },
        { id: 'altura_m',    label: 'Altura de montaje (m)', tipo: 'numero', origen: 'calle' },
        { id: 'ip',          label: 'N° IP',         tipo: 'texto',  origen: 'oficina' },
        { id: 'modelo',      label: 'Modelo',        tipo: 'texto',  origen: 'ambos' },
        { id: 'estado',      label: 'Estado',        tipo: 'select', origen: 'ambos',
          opciones: ['Funciona', 'No funciona'] }
      ]
    },

    /* Nueva familia. Las fisicas se georreferencian, las virtuales no. */
    central_zona: {
      nombre: 'Central de zona',
      prefijo: 'CZ',
      color: '#00838f',
      requiere_cruce: false,
      campos: [
        { id: 'id_inv',      label: 'Identificación', tipo: 'texto', origen: 'oficina', clave: true },
        { id: 'tipo',        label: 'Tipo',           tipo: 'select', origen: 'oficina', requerido: true,
          opciones: ['Física', 'Virtual'] },
        { id: 'georreferenciable', label: 'Se releva en calle', tipo: 'booleano', origen: 'derivado',
          formula: 'tipo == "Física"',
          ayuda: 'Las virtuales no tienen ubicación física' },
        { id: 'calle_1',     label: 'Calle 1',        tipo: 'calle', origen: 'oficina',
          visible_si: { tipo: ['Física'] } },
        { id: 'calle_2',     label: 'Calle 2',        tipo: 'calle', origen: 'oficina',
          visible_si: { tipo: ['Física'] } },
        { id: 'zona',        label: 'Zona',           tipo: 'select', origen: 'oficina', ref: 'zonas' },
        { id: 'sistema',     label: 'Sistema',        tipo: 'select', origen: 'oficina', ref: 'sistemas' },
        { id: 'conexion_equipos', label: 'Conexión de los equipos', tipo: 'select', origen: 'oficina',
          opciones: ['Multipar Telefónico', '4G'],
          ayuda: 'Las físicas concentran multipar, las virtuales concentran 4G' },
        { id: 'sub_areas',   label: 'Sub áreas que concentra', tipo: 'texto', origen: 'oficina' },
        { id: 'cant_equipos',label: 'Controladores conectados', tipo: 'entero', origen: 'derivado',
          formula: 'contar_semaforos_con_central(id_inv)' },
        { id: 'alojamiento', label: 'Alojamiento',    tipo: 'select', origen: 'calle',
          visible_si: { tipo: ['Física'] },
          opciones: ['Gabinete en vía pública', 'Sala técnica', 'Dependencia municipal'] }
      ]
    }
  },

  /* ================================================================
     NIVEL 2 - ELEMENTOS
     Esto es lo que se releva con el GPS. Todo tiene coordenada
     propia, precision y posibilidad de ajuste manual.
     ================================================================ */

  elementos: {

    columna: {
      nombre: 'Columna', grupo: 'Señalización', requiere_instalacion: true, familias: ['semaforo'],
      campos: [
        { id: 'subtipo', label: 'Tipo', tipo: 'select', origen: 'calle', requerido: true,
          opciones: [
            { id: 'mensula', label: 'Con ménsula / pescante' },
            { id: '101',     label: 'Columna 101 (recta, 101 mm)' },
            { id: 'otra',    label: 'Otra' }
          ] },
        { id: 'ubicacion', label: 'Ubicación en la esquina', tipo: 'select', origen: 'calle',
          opciones: ['NE', 'NO', 'SE', 'SO', 'Cantero central', 'Media cuadra'] },
        { id: 'altura_m',  label: 'Altura (m)', tipo: 'numero', origen: 'calle' },
        { id: 'largo_pescante_m', label: 'Largo de pescante (m)', tipo: 'numero', origen: 'calle',
          visible_si: { subtipo: ['mensula'] } },
        { id: 'estado_pintura', label: 'Pintura', tipo: 'select', origen: 'calle',
          opciones: ['Buena', 'Regular', 'Mala'] },
        { id: 'estado', label: 'Estado general', tipo: 'select', origen: 'calle',
          opciones: ['Buena', 'Con daño', 'A reemplazar'] }
      ],
      /* Los cuerpos se cargan como componentes de la columna */
      componentes: ['cuerpo', 'sonorizador', 'pulsador']
    },

    gabinete_controlador: {
      nombre: 'Gabinete de controlador', grupo: 'Control', requiere_instalacion: true, familias: ['semaforo'],
      campos: [
        { id: 'ubicacion', label: 'Ubicación en la esquina', tipo: 'select', origen: 'calle',
          opciones: ['NE', 'NO', 'SE', 'SO'] },
        { id: 'montaje',   label: 'Montaje', tipo: 'select', origen: 'calle',
          opciones: ['Pedestal', 'Sobre columna', 'Mural'] },
        { id: 'estado',    label: 'Estado del gabinete', tipo: 'select', origen: 'calle',
          opciones: ['Bueno', 'Oxidado', 'Con daño', 'Sin puerta'] },
        { id: 'nro_medidor', label: 'N° de medidor', tipo: 'texto', origen: 'ambos' }
      ]
    },

    detector: {
      nombre: 'Detector / espira', grupo: 'Detección', requiere_instalacion: true, familias: ['punto_medida'],
      ayuda: 'Cada espira física del punto de medida, una por carril',
      campos: [
        { id: 'id_detector', label: 'ID del detector', tipo: 'texto', origen: 'oficina',
          ayuda: 'El número que le da el sistema, ej. 22603' },
        { id: 'carril',      label: 'Carril', tipo: 'texto', origen: 'calle' },
        { id: 'dimensiones', label: 'Dimensiones (m x m)', tipo: 'texto', origen: 'calle' },
        { id: 'dist_linea_pare_m', label: 'Distancia a línea de pare (m)', tipo: 'numero', origen: 'calle' },
        { id: 'estado',      label: 'Estado', tipo: 'select', origen: 'calle',
          opciones: ['Funciona', 'No funciona', 'No localizada'] }
      ]
    },

    /* --- Conexionado. Nada de esto existe hoy en el inventario. --- */

    camara_inspeccion: {
      nombre: 'Cámara de inspección', grupo: 'Obra civil', requiere_instalacion: false,
      campos: [
        { id: 'medidas',    label: 'Medidas internas (cm)', tipo: 'texto', origen: 'calle' },
        { id: 'tapa',       label: 'Tapa', tipo: 'select', origen: 'calle',
          opciones: ['Hormigón', 'Hierro fundido', 'Chapa', 'Sin tapa'] },
        { id: 'estado',     label: 'Estado', tipo: 'select', origen: 'calle',
          opciones: ['Buena', 'Con agua', 'Colmatada', 'Tapa rota', 'No localizada'] },
        { id: 'cant_ductos',label: 'Ductos que llegan', tipo: 'entero', origen: 'calle' },
        { id: 'contenido',  label: 'Contenido', tipo: 'multiselect', origen: 'calle',
          opciones: ['Cable de energía', 'Multipar telefónico', 'Fibra óptica',
                     'Reserva de fibra', 'Botella de empalme', 'Vacía'] },
        { id: 'bajo',       label: 'Ubicada bajo', tipo: 'select', origen: 'calle',
          opciones: ['Vereda', 'Calzada', 'Cantero'] }
      ]
    },

    botella_empalme: {
      nombre: 'Botella de empalme', grupo: 'Fibra óptica', requiere_instalacion: false,
      campos: [
        { id: 'alojamiento', label: 'Alojada en', tipo: 'select', origen: 'calle',
          opciones: ['Cámara de inspección', 'Aérea sobre poste', 'Gabinete', 'Enterrada'] },
        { id: 'id_camara',   label: 'Cámara de inspección', tipo: 'ref_elemento', origen: 'calle',
          filtro_tipo: 'camara_inspeccion', visible_si: { alojamiento: ['Cámara de inspección'] } },
        { id: 'modelo',      label: 'Marca / modelo', tipo: 'texto', origen: 'calle' },
        { id: 'cant_bandejas',label:'Bandejas', tipo: 'entero', origen: 'calle' },
        { id: 'fibras_empalmadas', label: 'Fibras empalmadas', tipo: 'entero', origen: 'calle' },
        { id: 'fibras_pasantes',   label: 'Fibras pasantes',   tipo: 'entero', origen: 'calle' },
        { id: 'reserva_m',   label: 'Reserva de cable (m)', tipo: 'numero', origen: 'calle' }
      ]
    },

    odf: {
      nombre: 'ODF', grupo: 'Fibra óptica', requiere_instalacion: false,
      campos: [
        { id: 'alojamiento', label: 'Alojado en', tipo: 'select', origen: 'calle',
          opciones: ['Gabinete de controlador', 'Rack', 'Caja mural', 'Pilar'] },
        { id: 'cant_puertos',    label: 'Puertos', tipo: 'entero', origen: 'ambos' },
        { id: 'puertos_ocupados',label: 'Puertos ocupados', tipo: 'entero', origen: 'ambos' },
        { id: 'conector',    label: 'Conector', tipo: 'select', origen: 'ambos',
          opciones: ['SC/APC', 'SC/UPC', 'LC/APC', 'LC/UPC', 'Mixto'] },
        { id: 'rotulo',      label: 'Identificación / rótulo', tipo: 'texto', origen: 'calle' }
      ]
    },

    switch_fo: {
      nombre: 'Switch', grupo: 'Fibra óptica', requiere_instalacion: false,
      campos: [
        { id: 'marca',   label: 'Marca',  tipo: 'texto', origen: 'ambos' },
        { id: 'modelo',  label: 'Modelo', tipo: 'texto', origen: 'ambos' },
        { id: 'ip',      label: 'IP de gestión', tipo: 'texto', origen: 'oficina' },
        { id: 'puertos_fo',  label: 'Puertos ópticos',  tipo: 'entero', origen: 'ambos' },
        { id: 'puertos_eth', label: 'Puertos ethernet', tipo: 'entero', origen: 'ambos' },
        { id: 'alimentacion',label: 'Alimentación', tipo: 'select', origen: 'calle',
          opciones: ['220V', 'PoE', '48V DC'] },
        { id: 'ups',     label: 'Tiene UPS', tipo: 'booleano', origen: 'calle' }
      ]
    },

    gabinete_fo: {
      nombre: 'Gabinete de fibra', grupo: 'Fibra óptica', requiere_instalacion: false,
      campos: [
        { id: 'medidas', label: 'Medidas (cm)', tipo: 'texto', origen: 'calle' },
        { id: 'montaje', label: 'Montaje', tipo: 'select', origen: 'calle',
          opciones: ['Sobre columna', 'Mural', 'Pilar a nivel de vereda'] },
        { id: 'contenido', label: 'Contenido', tipo: 'multiselect', origen: 'calle',
          opciones: ['ODF', 'Switch', 'Fuente', 'UPS', 'Reserva de fibra', 'Vacío'] }
      ]
    },

    acometida: {
      nombre: 'Acometida eléctrica', grupo: 'Obra civil', requiere_instalacion: false,
      campos: [
        { id: 'nro_medidor', label: 'N° de medidor', tipo: 'texto', origen: 'ambos' },
        { id: 'tipo',    label: 'Tipo', tipo: 'select', origen: 'calle',
          opciones: ['Pilar de medición', 'Tablero de paso', 'Sobre columna'] },
        { id: 'alimenta',label: 'Alimenta a', tipo: 'ref_instalacion', origen: 'ambos',
          filtro_familia: 'semaforo', multiple: true }
      ]
    }
  },

  /* ================================================================
     NIVEL 3 - COMPONENTES
     Sin coordenada propia. Heredan la del elemento padre.
     Resuelve "cuantos cuerpos hay por columna" sin obligar a
     marcar un punto GPS por cada foco.
     ================================================================ */

  componentes: {

    cuerpo: {
      nombre: 'Cuerpo semafórico',
      padre: 'columna',
      campos: [
        { id: 'tipo',    label: 'Configuración', tipo: 'select', origen: 'calle',
          requerido: true, ref: 'cuerpos' },
        { id: 'sentido', label: 'Sentido que regula', tipo: 'select', origen: 'calle', ref: 'sentidos' },
        { id: 'grupo',   label: 'Grupo', tipo: 'texto', origen: 'oficina',
          ayuda: 'Grupo de la programación UNE al que responde' },
        { id: 'tecnologia', label: 'Tecnología', tipo: 'select', origen: 'calle',
          opciones: ['LED', 'Incandescente'] },
        { id: 'estado',  label: 'Estado', tipo: 'select', origen: 'calle',
          opciones: ['Funciona', 'Con falla', 'Apagado'] }
      ]
    },

    sonorizador: {
      nombre: 'Sonorizador', padre: 'columna',
      campos: [
        { id: 'estado', label: 'Estado', tipo: 'select', origen: 'calle',
          opciones: ['Funciona', 'No funciona'] }
      ]
    },

    pulsador: {
      nombre: 'Pulsador peatonal', padre: 'columna',
      campos: [
        { id: 'estado', label: 'Estado', tipo: 'select', origen: 'calle',
          opciones: ['Funciona', 'No funciona'] }
      ]
    }
  },

  /* ================================================================
     TRAMOS - geometria de linea, recorrido grabado con GPS
     ================================================================ */

  tramos: {
    ducto: {
      nombre: 'Ducto / canalización', grupo: 'Obra civil',
      campos: [
        { id: 'cant_caños', label: 'Cantidad de caños', tipo: 'entero', origen: 'calle' },
        { id: 'diametro_mm',label: 'Diámetro (mm)', tipo: 'texto', origen: 'calle' },
        { id: 'material',   label: 'Material', tipo: 'select', origen: 'calle',
          opciones: ['PVC', 'PEAD', 'Hierro', 'Desconocido'] },
        { id: 'bajo',       label: 'Bajo', tipo: 'select', origen: 'calle',
          opciones: ['Vereda', 'Calzada', 'Cantero', 'Cruce de calle'] },
        { id: 'ocupacion',  label: 'Ocupación', tipo: 'select', origen: 'calle',
          opciones: ['Libre', 'Parcialmente ocupado', 'Lleno'] }
      ]
    },
    tendido_fo: {
      nombre: 'Tendido de fibra óptica', grupo: 'Fibra óptica',
      campos: [
        { id: 'cant_pelos', label: 'Cantidad de pelos', tipo: 'select', origen: 'ambos',
          opciones: ['6','12','24','48','96','144','Otro'] },
        { id: 'tipo_cable', label: 'Tipo de cable', tipo: 'select', origen: 'ambos',
          opciones: ['ADSS', 'Mini ADSS', 'Armado', 'Loose tube'] },
        { id: 'tendido',    label: 'Tendido', tipo: 'select', origen: 'calle', requerido: true,
          opciones: ['Subterráneo', 'Aéreo', 'Mixto'] },
        { id: 'anillo',     label: 'Anillo / troncal', tipo: 'texto', origen: 'oficina' }
      ]
    },
    tendido_electrico: {
      nombre: 'Tendido eléctrico', grupo: 'Obra civil',
      campos: [
        { id: 'seccion_mm2', label: 'Sección (mm²)', tipo: 'texto', origen: 'calle' },
        { id: 'tendido',     label: 'Tendido', tipo: 'select', origen: 'calle',
          opciones: ['Subterráneo', 'Aéreo'] },
        { id: 'tension',     label: 'Tensión', tipo: 'select', origen: 'calle',
          opciones: ['220V', '380V'] }
      ]
    }
  },

  /* ================================================================
     PARAMETROS
     ================================================================ */

  gps: {
    accuracy_aceptable_m: 8,
    accuracy_maxima_m: 20,
    lecturas_promedio: 5,
    track_min_dist_m: 3,
    track_max_accuracy_m: 15,
    track_tolerancia_simplif_m: 2
  },

  fotos: { max_por_elemento: 4, lado_max_px: 1280, calidad_jpeg: 0.7 },

  /* Control de completitud: compara conteo declarado vs relevado
     y muestra el avance por esquina.                              */
  completitud: {
    activo: true,
    tolerar_decimales: true,   // el inventario viejo tiene 0,5 y 4,5
    avisar_si_difiere: true
  }
};

if (typeof module !== 'undefined') module.exports = CATALOGO;
