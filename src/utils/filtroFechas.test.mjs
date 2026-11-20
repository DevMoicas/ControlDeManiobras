import { test } from "node:test";
import assert from "node:assert/strict";
import { enFechas } from "./filtroFechas.mjs";

test("sin filtros pasa todo, también sin fecha", () => {
  assert.equal(enFechas(null, {}), true);
  assert.equal(enFechas("2026-07-01", { fecha: "" }), true);
});

test("con filtro, la fila sin fecha no pasa", () => {
  assert.equal(enFechas(null, { mes: "2026-07" }), false);
});

test("fecha exacta, aunque venga con hora", () => {
  assert.equal(enFechas("2026-07-01T10:00:00Z", { fecha: "2026-07-01" }), true);
  assert.equal(enFechas("2026-07-02", { fecha: "2026-07-01" }), false);
});

test("rango inclusivo y en cualquier orden; con una sola punta no filtra", () => {
  assert.equal(enFechas("2026-07-31", { desde: "2026-07-01", hasta: "2026-07-31" }), true);
  assert.equal(enFechas("2026-07-15", { desde: "2026-07-31", hasta: "2026-07-01" }), true);
  assert.equal(enFechas("2026-08-01", { desde: "2026-07-01", hasta: "2026-07-31" }), false);
  assert.equal(enFechas("2025-01-01", { desde: "2026-07-01" }), true);
});

test("mes", () => {
  assert.equal(enFechas("2026-07-09", { mes: "2026-07" }), true);
  assert.equal(enFechas("2026-08-09", { mes: "2026-07" }), false);
});
