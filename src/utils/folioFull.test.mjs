// node --test src/utils/folioFull.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { SUFIJO_FULL, tieneSufijoFull, sinSufijoFull, codigoFolioFull } from "./folioFull.mjs";

test("reconoce el sufijo sobre los dos formatos de código", () => {
  assert.ok(tieneSufijoFull("F-2279-2"));
  assert.ok(tieneSufijoFull("R-LCR-323-2"));
  assert.ok(!tieneSufijoFull("F-2279"));
  assert.ok(!tieneSufijoFull("R-LCR-323"));
});

test("F-2 no lleva sufijo: quitárselo dejaría 'F'", () => {
  assert.ok(!tieneSufijoFull("F-2"));
  assert.equal(sinSufijoFull("F-2"), "F-2");
  assert.ok(!tieneSufijoFull("A-LCR-2"));
});

test("sinSufijoFull es idempotente y tolera vacíos", () => {
  assert.equal(sinSufijoFull("F-2279-2"), "F-2279");
  assert.equal(sinSufijoFull("F-2279"), "F-2279");
  assert.equal(sinSufijoFull(""), "");
  assert.equal(sinSufijoFull(null), "");
});

test("Full sin repartir: el folio lleva el sufijo", () => {
  assert.equal(codigoFolioFull({ folio: "F-2279", tipo_servicio: "full" }), "F-2279" + SUFIJO_FULL);
  assert.equal(codigoFolioFull({ folio: "R-LCR-323", tipo_servicio: "full" }), "R-LCR-323-2");
});

test("no se aplica dos veces", () => {
  assert.equal(codigoFolioFull({ folio: "F-2279-2", tipo_servicio: "full" }), "F-2279-2");
});

test("dejar de ser Full devuelve el código base", () => {
  for (const tipo of ["sencillo", "carga_suelta", "", null, undefined]) {
    assert.equal(codigoFolioFull({ folio: "F-2279-2", tipo_servicio: tipo }), "F-2279", `tipo: ${tipo}`);
  }
});

test("Full repartido en dos operadores: ningún folio lleva sufijo", () => {
  assert.equal(codigoFolioFull({ folio: "F-2279-2", folio_2: "F-2280", tipo_servicio: "full" }), "F-2279");
});

test("sin folio no hay nada que renombrar", () => {
  assert.equal(codigoFolioFull({ folio: "", tipo_servicio: "full" }), "");
  assert.equal(codigoFolioFull({}), "");
  assert.equal(codigoFolioFull(), "");
});

test("la heurística del contenedor largo NO dispara el sufijo", () => {
  // esServicioFull() daría true aquí; codigoFolioFull mira solo tipo_servicio.
  assert.equal(codigoFolioFull({ folio: "F-2279", contenedor: "MSCU1234567 / TCLU7654321" }), "F-2279");
});
