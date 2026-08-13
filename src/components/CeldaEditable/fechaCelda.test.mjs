import { test } from "node:test";
import assert from "node:assert/strict";
import { aDate, aBackend } from "./fechaCelda.mjs";

test("ida y vuelta no mueve el dia", () => {
  assert.equal(aBackend(aDate("2026-08-13")), "2026-08-13");
  assert.equal(aBackend(aDate("2026-01-01")), "2026-01-01");
  assert.equal(aBackend(aDate("2026-12-31")), "2026-12-31");
});

test("mes y dia salen con dos digitos", () => {
  assert.equal(aBackend(new Date(2026, 0, 5)), "2026-01-05");
});

// Lo que hace la celda al abrirse sobre un registro sin fecha: el DatePicker
// necesita null, no un Invalid Date, o pinta "NaN".
test("vacio o malformado devuelve null, no Invalid Date", () => {
  assert.equal(aDate(""), null);
  assert.equal(aDate(null), null);
  assert.equal(aDate(undefined), null);
  assert.equal(aDate("13/08/2026"), null);
  assert.equal(aDate("no es fecha"), null);
});

// Lo que hace al limpiar la celda con la X del DatePicker: guardar "" y no
// "1970-01-01", que el backend aceptaria como fecha real.
test("sin fecha se guarda cadena vacia", () => {
  assert.equal(aBackend(null), "");
  assert.equal(aBackend(undefined), "");
});
