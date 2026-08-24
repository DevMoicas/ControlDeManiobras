// node --test src/utils/reporteViaje.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARGAS_POR_REPORTE, REPORTE_VACIO,
  aTriEstado, deTriEstado, desdeFolio,
  kmTotales, litrosDiesel, rendimiento, totalCarga,
  cargasConDatos, paraGuardar, avance, NOMBRES_BLOQUES, citaDesdeManiobra,
} from "./reporteViaje.mjs";

// ── El botón de Sí/No conserva tres estados ─────────────────────────────────
test("el botón traduce sí, no y sin contestar", () => {
  assert.equal(aTriEstado("si"), true);
  assert.equal(aTriEstado("no"), false);
  assert.equal(aTriEstado(""), null);     // reelegir = deseleccionar
  assert.equal(deTriEstado(true), "si");
  assert.equal(deTriEstado(false), "no");
  assert.equal(deTriEstado(null), "");
});

test("deseleccionar NO se colapsa a 'no'", () => {
  // Si se colapsara, un reporte a medio llenar afirmaría "No" en lo que nadie
  // ha contestado, y el Excel perdería el "SI / NO" que se rodea a mano.
  assert.notEqual(aTriEstado(""), false);
  assert.equal(aTriEstado(""), null);
});

test("ida y vuelta por los tres estados", () => {
  for (const v of [true, false, null]) assert.equal(aTriEstado(deTriEstado(v)), v);
});

// ── Precarga del folio ──────────────────────────────────────────────────────
test("el folio precarga lo que la maniobra ya sabe", () => {
  const precarga = desdeFolio({
    folio: "F-2279", tipo_servicio: "full", cliente_nombre: "YAZAKI",
    origen: "Manzanillo", destino: "Guadalajara", operador: "Juan Pérez",
    placas: "93-AF-2K", remolque_1: "R-101", remolque_2: "R-102",
  });
  assert.equal(precarga.folio, "F-2279");
  assert.equal(precarga.servicio, "full");
  assert.equal(precarga.cliente, "YAZAKI");
  assert.equal(precarga.unidad, "93-AF-2K");
  assert.equal(precarga.remolque_1, "R-101");
});

test("ruta inicio y fin YA NO se precargan", () => {
  // Decisión del usuario, 2026-08-24: se capturan a mano como el resto.
  const precarga = desdeFolio({
    folio: "F-2279",
    ruta_inicio: "2026-08-24T12:00:00Z", ruta_fin: "2026-08-26T18:40:00Z",
  });
  assert.equal(precarga.inicio_pactado, undefined);
  assert.equal(precarga.llegada_manzanillo, undefined);
});

test("la cita se precarga con fecha_pis + horario", () => {
  const precarga = desdeFolio({ folio: "F-2279", fecha_pis: "2026-08-24", horario: "9:00" });
  assert.equal(precarga.cita, new Date(2026, 7, 24, 9, 0).toISOString());
});

test("una maniobra sin cita la deja para capturar a mano", () => {
  const precarga = desdeFolio({ folio: "F-2279" });
  assert.equal(precarga.cita, null);
  assert.equal(precarga.cliente, "");
});

// ── La cita: fecha_pis + horario ────────────────────────────────────────────
test("la cita se arma en hora LOCAL, no en UTC", () => {
  // Si se armara como UTC, en Manzanillo (UTC-6) una cita de las 9:00 se
  // imprimiria a las 3:00. Se compara contra un Date local construido igual.
  assert.equal(citaDesdeManiobra("2026-08-24", "9:00"),
               new Date(2026, 7, 24, 9, 0).toISOString());
  assert.equal(citaDesdeManiobra("2026-08-24", "14:00"),
               new Date(2026, 7, 24, 14, 0).toISOString());
});

test("acepta la hora con y sin cero delante", () => {
  // En la base conviven '9:00' y '14:00'.
  assert.equal(citaDesdeManiobra("2026-08-24", "09:00"),
               citaDesdeManiobra("2026-08-24", "9:00"));
});

test("sin fecha o sin hora no hay cita", () => {
  // Con solo el dia habria que inventar una hora, y un "00:00" en el papel se
  // lee como una cita a medianoche, no como un hueco por llenar.
  assert.equal(citaDesdeManiobra("2026-08-24", ""), null);
  assert.equal(citaDesdeManiobra("", "9:00"), null);
  assert.equal(citaDesdeManiobra(null, null), null);
  assert.equal(citaDesdeManiobra(undefined, undefined), null);
});

test("una hora imposible no se cuela", () => {
  assert.equal(citaDesdeManiobra("2026-08-24", "25:00"), null);
  assert.equal(citaDesdeManiobra("2026-08-24", "9:99"), null);
  assert.equal(citaDesdeManiobra("2026-08-24", "manana"), null);
});

test("sin maniobra no precarga nada", () => {
  assert.deepEqual(desdeFolio(null), {});
});

// ── Calculados: los mismos números que las pruebas del backend ──────────────
test("km totales es la resta", () => {
  assert.equal(kmTotales({ km_inicial: 124500, km_final: 125380 }), 880);
});

test("km totales es null mientras falte un operando", () => {
  assert.equal(kmTotales({ km_inicial: 124500 }), null);
  assert.equal(kmTotales({ km_final: 125380 }), null);
  assert.equal(kmTotales({ km_inicial: "", km_final: "" }), null);
  assert.equal(kmTotales({}), null);
});

test("el rendimiento suma el diésel de todas las cargas", () => {
  // Mismos números que test_el_rendimiento_suma_el_diesel_de_todas_las_cargas
  // en api/test_reporte_viaje.py: 880 km entre 300 + 100 litros.
  const reporte = {
    km_inicial: 124500, km_final: 125380,
    cargas: [{ litros_diesel: "300" }, { litros_diesel: "100" }],
  };
  assert.equal(litrosDiesel(reporte), 400);
  assert.equal(rendimiento(reporte), 2.2);
});

test("el rendimiento es null sin km o sin litros", () => {
  assert.equal(rendimiento({ cargas: [{ litros_diesel: "300" }] }), null);
  assert.equal(rendimiento({ km_inicial: 1, km_final: 2, cargas: [] }), null);
  assert.equal(rendimiento({ km_inicial: 1, km_final: 2, cargas: [{ litros_diesel: "0" }] }), null);
});

test("el total de un renglón es litros por precio", () => {
  assert.equal(totalCarga({ litros_diesel: "300", precio_litro: "24.80" }), 7440);
  assert.equal(totalCarga({ litros_diesel: "300" }), null);
  assert.equal(totalCarga({}), null);
});

// ── Qué se manda al guardar ─────────────────────────────────────────────────
test("los renglones vacíos no se mandan", () => {
  assert.equal(REPORTE_VACIO.cargas.length, CARGAS_POR_REPORTE);
  assert.equal(cargasConDatos(REPORTE_VACIO.cargas).length, 0);
  const conUno = [...REPORTE_VACIO.cargas];
  conUno[1] = { ...conUno[1], litros_diesel: "300" };
  assert.deepEqual(cargasConDatos(conUno).map((c) => c.orden), [2]);
});

test("los numéricos vacíos viajan como null, no como cadena", () => {
  // Los DecimalField y los enteros del backend rechazan "" con un 400.
  const salida = paraGuardar({ ...REPORTE_VACIO, folio: "F-2279" });
  for (const campo of ["km_inicial", "km_final", "litros_aceite", "precio_aceite",
                       "reparacion_costo", "estadias_horas"]) {
    assert.equal(salida[campo], null, campo);
  }
});

test("un renglón a medias manda null en lo que le falta", () => {
  const reporte = { ...REPORTE_VACIO, cargas: [{ orden: 1, litros_diesel: "300",
    precio_litro: "", litros_urea: "", total_urea: "" }] };
  const [carga] = paraGuardar(reporte).cargas;
  assert.equal(carga.litros_diesel, "300");
  assert.equal(carga.precio_litro, null);
  assert.equal(carga.total_urea, null);
});

// ── Avance ──────────────────────────────────────────────────────────────────
test("hay un nombre por cada bloque del avance", () => {
  // Si se desordenan, la bolita diría el bloque equivocado en el tooltip.
  assert.equal(NOMBRES_BLOQUES.length, avance(REPORTE_VACIO).length);
});

test("un reporte vacío no tiene ningún bloque empezado", () => {
  assert.deepEqual(avance(REPORTE_VACIO), [false, false, false, false]);
});

test("cada bloque se enciende con cualquiera de sus campos", () => {
  assert.deepEqual(avance({ ...REPORTE_VACIO, coordinador: "Ali" }),
                   [true, false, false, false]);
  assert.deepEqual(avance({ ...REPORTE_VACIO, km_inicial: 1 }),
                   [false, true, false, false]);
  assert.deepEqual(avance({ ...REPORTE_VACIO, patio_entrega: "Norte" }),
                   [false, false, false, true]);
});

test("el combustible enciende el bloque EN TRAYECTO", () => {
  const cargas = [...REPORTE_VACIO.cargas];
  cargas[0] = { ...cargas[0], litros_diesel: "300" };
  assert.deepEqual(avance({ ...REPORTE_VACIO, cargas }), [false, false, true, false]);
});

test("un Sí/No contestado con NO cuenta como capturado", () => {
  // false no es "vacío": alguien contestó. Si no contara, el avance mentiría.
  assert.deepEqual(avance({ ...REPORTE_VACIO, rescate: false }),
                   [false, false, true, false]);
});
