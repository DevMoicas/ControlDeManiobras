// node --test src/utils/citaAbierta.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapaDePatios, textoDeCita } from "./citaAbierta.mjs";

const PATIOS = mapaDePatios([
  { nombre: "APM TERMINAL", con_cita: true },
  { nombre: "HUTCHISON",    con_cita: false },
]);

test("el patio que no exige cita lo dice en la celda", () => {
  assert.equal(textoDeCita({ patio: "HUTCHISON" }, PATIOS), "CITA ABIERTA");
});

test("el patio que exige cita deja la celda vacía: la hora hay que pedirla", () => {
  assert.equal(textoDeCita({ patio: "APM TERMINAL" }, PATIOS), "");
});

test("una hora escrita a mano gana al patio", () => {
  const cita = new Date(2026, 8, 13, 14, 30).toISOString();
  assert.equal(textoDeCita({ patio: "HUTCHISON", cita }, PATIOS), "13/09/2026 14:30");
});

test("sin patio no se afirma nada", () => {
  assert.equal(textoDeCita({ patio: "" }, PATIOS), "");
  assert.equal(textoDeCita({}, PATIOS), "");
});

test("un patio que no está en el catálogo tampoco dice nada", () => {
  // El histórico de `vacios.patio` va lleno de estos, y marcarlos en Catálogos
  // no los alcanzaría: el cruce es por nombre exacto.
  assert.equal(textoDeCita({ patio: "CIMA ASIPONA" }, PATIOS), "");
});

test("mayúsculas y espacios de sobra no cambian el patio", () => {
  assert.equal(textoDeCita({ patio: " apm terminal " }, PATIOS), "");
  assert.equal(textoDeCita({ patio: " hutchison " }, PATIOS), "CITA ABIERTA");
});

test("sin catálogo todavía no se dice nada", () => {
  assert.equal(textoDeCita({ patio: "HUTCHISON" }, null), "");
});
