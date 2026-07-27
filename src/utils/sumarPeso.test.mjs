import { test } from "node:test";
import assert from "node:assert/strict";
import { sumarPeso } from "./sumarPeso.mjs";

test("un solo valor se devuelve tal cual", () => {
  assert.equal(sumarPeso("23412"), 23412);
});

test("un full trae dos cantidades separadas por guion y se suman", () => {
  assert.equal(sumarPeso("23412 - 22000"), 45412);
});

test("la barra tambien separa, con y sin espacios", () => {
  assert.equal(sumarPeso("8376/12117"), 20493);
  assert.equal(sumarPeso("8376 / 12117"), 20493);
});

test("el empate suma los pesos de los dos folios", () => {
  assert.equal(sumarPeso("23412 - 22000", "15000"), 60412);
});

test("un folio sin peso no estorba al otro", () => {
  assert.equal(sumarPeso("15000", ""), 15000);
  assert.equal(sumarPeso("", "15000"), 15000);
});

test("descarta las partes no numericas y suma el resto", () => {
  assert.equal(sumarPeso("12000 - roto"), 12000);
});

// El caso que justifica devolver "" en vez de 0: la celda tiene que quedar en
// blanco, porque un 0 se leeria como un peso real de 0 KG.
test("si nada es numerico devuelve cadena vacia, no cero", () => {
  assert.equal(sumarPeso(""), "");
  assert.equal(sumarPeso("N/A"), "");
  assert.equal(sumarPeso(null, undefined), "");
});
