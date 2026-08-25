// Reglas puras del reporte de viaje del coordinador.
//
// Aquí vive lo que la pantalla necesita saber sin preguntarle al servidor: qué
// precarga el folio, cómo se traduce el botón de tres estados y cuánto valen los
// campos calculados MIENTRAS se escribe (el backend los recalcula al guardar).
//
// Ver docs/planes/PLAN_REPORTE_COORDINADORES.md (rama main).

// Los renglones de EN TRAYECTO que trae el papel, y con los que arranca el
// formulario. NO es un tope: desde el 2026-08-25 se pueden añadir más con un
// botón, y todos cuentan para el total del diésel y el rendimiento. Espejo de
// CARGAS_EN_EL_PAPEL del backend, que es lo que cabe en la plantilla del Excel.
export const CARGAS_EN_EL_PAPEL = 5;

// Para VacioStatusSelector, que acepta sus opciones por prop. Mismo truco que
// REPROGRAMADO_OPCIONES en VaciosPage: ningún componente nuevo.
export const SI_NO_OPCIONES = [
  { id: "si", label: "Sí", bg: "#dcfce7", fg: "#166534" },
  { id: "no", label: "No", bg: "#f3f4f6", fg: "#6b7280" },
];

export const RECOLECCION_OPCIONES = [
  { id: "propio",  label: "Propio",  bg: "#dbeafe", fg: "#1e40af" },
  { id: "tercero", label: "Tercero", bg: "#ffedd5", fg: "#9a3412" },
];

// ── El botón de Sí/No guarda TRES estados ────────────────────────────────────
// El selector manda "" al reelegir la opción que ya estaba puesta, y ese "" es
// justo el tercer estado que necesita el papel: sin contestar. No se colapsa a
// `false` (como sí hace VaciosPage, cuya columna es NOT NULL) porque null es lo
// que deja el "SI / NO" impreso intacto en el Excel para rodearlo a mano.
export const aTriEstado = (valor) => (valor === "si" ? true : valor === "no" ? false : null);
export const deTriEstado = (valor) => (valor === true ? "si" : valor === false ? "no" : "");

// ── La cita sale de dos columnas de la maniobra ──────────────────────────────
// FECHA Y HORA DE LA CITA del papel = `fecha_pis` (el día) + `horario` (la hora).
// El backend los manda por separado a propósito: unirlos allí obligaría a elegir
// una zona horaria en el servidor, y `horario` es la hora LOCAL a la que se
// capturó. Aquí el navegador ya está en esa zona.
//
// `horario` es texto libre: en la base conviven '14:00' y '9:00'.
export function citaDesdeManiobra(fechaPis, horario) {
  const dia  = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaPis ?? "").trim());
  const hora = /^(\d{1,2}):(\d{2})/.exec(String(horario ?? "").trim());
  // Hacen falta LOS DOS. Con solo el día habría que inventar una hora, y un
  // "00:00" en el papel se lee como una cita a medianoche, no como un hueco.
  if (!dia || !hora) return null;
  const [, anio, mes, d] = dia;
  const [, hh, mm] = hora;
  if (+hh > 23 || +mm > 59) return null;
  // Constructor por partes = hora LOCAL. new Date("2026-08-24T09:00Z") sería UTC
  // y la cita saldría corrida seis horas.
  return new Date(+anio, +mes - 1, +d, +hh, +mm).toISOString();
}

// ── Qué precarga el folio ────────────────────────────────────────────────────
// `maniobra` es una entrada de /maniobras/folios-recientes/, que es lo que
// devuelve FolioSelector al elegir. Se COPIA: el reporte se firma, así que no
// puede cambiar solo si alguien edita la maniobra después.
export function desdeFolio(maniobra) {
  if (!maniobra) return {};
  return {
    folio:              maniobra.folio || "",
    servicio:           maniobra.tipo_servicio || "",
    cliente:            maniobra.cliente_nombre || "",
    origen:             maniobra.origen || "",
    destino:            maniobra.destino || "",
    operador:           maniobra.operador || "",
    unidad:             maniobra.placas || "",
    remolque_1:         maniobra.remolque_1 || "",
    remolque_2:         maniobra.remolque_2 || "",
    // La ÚNICA fecha que se precarga. Ruta inicio/fin ya no: se capturan a mano
    // como el resto (decisión del usuario, 2026-08-24).
    cita:               citaDesdeManiobra(maniobra.fecha_pis, maniobra.horario),
  };
}

// ── Calculados ───────────────────────────────────────────────────────────────
// Copia de la regla del serializer, a propósito: el formulario los enseña
// MIENTRAS se escribe, y esperar al guardado para ver los kilómetros sería
// absurdo. Son dos restas; las pruebas de los dos lados usan los mismos números.
const numero = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

export function kmTotales({ km_inicial, km_final } = {}) {
  const ini = numero(km_inicial);
  const fin = numero(km_final);
  if (ini === null || fin === null) return null;
  return fin - ini;
}

export function litrosDiesel({ cargas } = {}) {
  return (cargas || []).reduce((suma, c) => suma + (numero(c?.litros_diesel) ?? 0), 0);
}

export function rendimiento(reporte) {
  const km = kmTotales(reporte);
  const litros = litrosDiesel(reporte);
  if (km === null || !litros) return null;
  return Math.round((km / litros) * 100) / 100;
}

// El TOTAL de cada renglón de diésel. El de la urea NO se calcula: el papel no
// trae precio por litro para ella, así que se captura.
export function totalCarga(carga) {
  const litros = numero(carga?.litros_diesel);
  const precio = numero(carga?.precio_litro);
  if (litros === null || precio === null) return null;
  return Math.round(litros * precio * 100) / 100;
}

// ── Estado inicial ───────────────────────────────────────────────────────────
export const CARGAS_VACIAS = Array.from({ length: CARGAS_EN_EL_PAPEL }, (_, i) => ({
  orden: i + 1, litros_diesel: "", precio_litro: "", litros_urea: "", total_urea: "",
}));

// Un renglón añadido con el botón: SOLO diésel. La urea no se amplía — el papel
// no la lleva más allá de sus cinco y no se pidió (usuario, 2026-08-25).
export function cargaNueva(cargas) {
  const ultimo = (cargas || []).reduce((max, c) => Math.max(max, c?.orden ?? 0), 0);
  return { orden: ultimo + 1, litros_diesel: "", precio_litro: "" };
}

export const REPORTE_VACIO = {
  folio: "", fecha: null, coordinador: "",
  servicio: "", cliente: "", recoleccion: "", origen: "", destino: "", operador: "",
  cita: null, salida_puerto: null, inicio_pactado: null, salida_real: null,
  unidad: "", remolque_1: "", remolque_2: "", km_inicial: "", km_final: "",
  llegada_cliente: null, descarga: null,
  litros_aceite: "", precio_aceite: "",
  reparacion: null, reparacion_que: "", reparacion_costo: "",
  rescate: null, rescate_unidad: "", rescate_operador: "",
  llegada_manzanillo: null, maniobra_vacio: null,
  patio_entrega: "", cita_vacio: null, unidad_vacio: "", operador_vacio: "",
  estadias: null, estadias_horas: "",
  comentarios: "",
  cargas: CARGAS_VACIAS,
};

// Los renglones que no tienen NADA escrito no se mandan: crearían cinco filas
// vacías en la base por cada reporte, y el upsert por `orden` los volvería a
// crear en cada guardado.
export function cargasConDatos(cargas) {
  return (cargas || []).filter((c) =>
    ["litros_diesel", "precio_litro", "litros_urea", "total_urea"]
      .some((k) => c?.[k] !== "" && c?.[k] !== null && c?.[k] !== undefined)
  );
}

// Los DecimalField y los enteros del backend rechazan "" (no es un número). Se
// mandan como null, que es lo que significa "sin capturar".
const NUMERICOS = [
  "km_inicial", "km_final", "litros_aceite", "precio_aceite",
  "reparacion_costo", "estadias_horas",
];

export function paraGuardar(reporte) {
  const salida = { ...reporte, cargas: cargasConDatos(reporte.cargas) };
  for (const campo of NUMERICOS) {
    if (salida[campo] === "" || salida[campo] === undefined) salida[campo] = null;
  }
  for (const carga of salida.cargas) {
    for (const campo of ["litros_diesel", "precio_litro", "litros_urea", "total_urea"]) {
      if (carga[campo] === "" || carga[campo] === undefined) carga[campo] = null;
    }
  }
  return salida;
}

// ── Avance: cuáles de los cuatro bloques del papel tienen algo ───────────────
// Los nombres van pegados a la regla para que no puedan desordenarse por
// separado: avance() devuelve un booleano por cada uno, EN ESTE ORDEN.
export const NOMBRES_BLOQUES = [
  "Identificación", "Información del viaje", "En trayecto", "Regreso",
];

const BLOQUES = [
  ["fecha", "coordinador", "cliente", "recoleccion", "origen", "destino", "operador",
   "cita", "salida_puerto", "inicio_pactado", "salida_real"],
  ["unidad", "remolque_1", "remolque_2", "km_inicial", "km_final",
   "llegada_cliente", "descarga"],
  ["litros_aceite", "precio_aceite", "reparacion", "reparacion_que", "reparacion_costo",
   "rescate", "rescate_unidad", "rescate_operador"],
  ["llegada_manzanillo", "maniobra_vacio", "patio_entrega", "cita_vacio",
   "unidad_vacio", "operador_vacio", "estadias", "estadias_horas"],
];

const conValor = (v) => v !== "" && v !== null && v !== undefined;

export function avance(reporte) {
  const bloques = BLOQUES.map((campos) => campos.some((c) => conValor(reporte?.[c])));
  // El combustible cuenta dentro del bloque EN TRAYECTO (el tercero).
  bloques[2] = bloques[2] || cargasConDatos(reporte?.cargas).length > 0;
  return bloques;
}
