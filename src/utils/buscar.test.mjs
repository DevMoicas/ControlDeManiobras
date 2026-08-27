// node --test src/utils/buscar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarBusqueda } from "./buscar.mjs";

// Tres vacíos como los que devuelve /vacios/: dos del mismo operador y uno de otro.
const FILAS = [
  { id: 1, contenedor: "WHLU5591210", operador_entrega: "JOSE ZUÑIGA FLORES", status: "pendiente" },
  { id: 2, contenedor: "TLLU2899885", operador_entrega: "Jose Zuniga Flores",  status: "entregado" },
  { id: 3, contenedor: "CAAU6047386", operador_entrega: "MARIO LOPEZ",         status: "pendiente" },
];

const ids = (filas) => filas.map((f) => f.id);

test("sin consulta devuelve TODO, y el mismo array (no copia)", () => {
  assert.equal(filtrarBusqueda(FILAS, ""), FILAS);
  assert.equal(filtrarBusqueda(FILAS, "   "), FILAS);
  assert.equal(filtrarBusqueda(FILAS, null), FILAS);
});

// El motivo por el que existe este módulo.
test("'-' excluye: quita al operador que estorba y deja el resto", () => {
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "-zuñiga")), [3]);
});

test("la exclusión ignora acentos y la ñ: da igual cómo lo teclee cada uno", () => {
  // La fila 1 lleva Ñ y la 2 lleva N; las dos tienen que caer con cualquiera.
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "-zuniga")), [3]);
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "-ZUÑIGA")), [3]);
});

test("sin '-' se busca como siempre", () => {
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "zuniga")), [1, 2]);
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "TLLU2899885")), [2]);
});

test("varios términos se acumulan: incluir Y excluir a la vez", () => {
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "pendiente -zuñiga")), [3]);
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "-zuñiga -mario")), []);
});

test("las comillas mantienen la frase entera", () => {
  assert.deepEqual(ids(filtrarBusqueda(FILAS, '"jose zuniga flores"')), [1, 2]);
  assert.deepEqual(ids(filtrarBusqueda(FILAS, '-"jose zuniga"')), [3]);
  // Sin comillas serían dos términos sueltos: "flores" solo no está en Mario.
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "jose flores")), [1, 2]);
});

test("un '-' a medio teclear no vacía la tabla", () => {
  assert.deepEqual(ids(filtrarBusqueda(FILAS, "-")), [1, 2, 3]);
  assert.deepEqual(ids(filtrarBusqueda(FILAS, '-""')), [1, 2, 3]);
});

test("nulos y números en la fila no revientan", () => {
  const raras = [{ id: 4, operador_entrega: null, peso: 23412, extra: undefined }];
  assert.deepEqual(ids(filtrarBusqueda(raras, "23412")), [4]);
  assert.deepEqual(ids(filtrarBusqueda(raras, "-23412")), []);
});

test("las listas de objetos se buscan por su concepto, no por [object Object]", () => {
  // `costos_extra` de Maniobras: sin aplanar, "object" casaba con media tabla.
  const conCostos = [
    { id: 5, folio: "A1", costos_extra: [{ movimiento: "MANIOBRA EXTRA", costo: 500 }] },
    { id: 6, folio: "A2", costos_extra: [] },
  ];
  assert.deepEqual(ids(filtrarBusqueda(conCostos, "maniobra extra")), [5]);
  assert.deepEqual(ids(filtrarBusqueda(conCostos, "-maniobra")), [6]);
  assert.deepEqual(ids(filtrarBusqueda(conCostos, "object")), []);
});

test("los objetos de la fila se buscan por sus valores, no por [object Object]", () => {
  // `formulas` de Gastos: {"casetas_ida": "=150+230"}. Sin aplanar, "object"
  // casaría con TODAS las filas de la tabla.
  const gastos = [
    { id: 7, casetas_ida: "380.00", formulas: { casetas_ida: "=150+230" } },
    { id: 8, casetas_ida: "500.00", formulas: {} },
  ];
  assert.deepEqual(ids(filtrarBusqueda(gastos, "object")), []);
  assert.deepEqual(ids(filtrarBusqueda(gastos, "150+230")), [7]);
});
