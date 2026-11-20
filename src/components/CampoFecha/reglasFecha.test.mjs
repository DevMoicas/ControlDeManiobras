// node --test src/components/CampoFecha/reglasFecha.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatear, interpretar, minutosDelDia } from "./reglasFecha.mjs";

const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

test("se enseña con los formatos de siempre", () => {
  const d = new Date(2026, 9, 2, 9, 5);
  assert.equal(formatear(d, "fecha"), "02/10/2026");
  assert.equal(formatear(d, "fechaHora"), "02/10/2026 09:05");
  assert.equal(formatear(d, "hora"), "09:05");
  assert.equal(formatear(d, "mes"), "10/2026");
  assert.equal(formatear(null, "fecha"), "");
  assert.equal(formatear(new Date("x"), "fecha"), "");
});

test("se entiende lo que se teclea con prisa", () => {
  for (const t of ["02/10/2026", "2/10/2026", "2/10/26", "2-10-2026", "02102026"]) {
    assert.deepEqual(ymd(interpretar(t, "fecha")), [2026, 10, 2], t);
  }
  const h = interpretar("2/10/2026 9:30", "fechaHora");
  assert.deepEqual([...ymd(h), h.getHours(), h.getMinutes()], [2026, 10, 2, 9, 30]);
  // Sin hora, en fecha y hora, cuenta como medianoche: no se pierde el día.
  assert.deepEqual(ymd(interpretar("2/10/2026", "fechaHora")), [2026, 10, 2]);
  assert.equal(interpretar("1430", "hora").getHours(), 14);
  assert.equal(interpretar("9", "hora").getHours(), 9);
  assert.deepEqual(ymd(interpretar("10/2026", "mes")).slice(0, 2), [2026, 10]);
});

test("vacío es borrar; lo que no se entiende es undefined, no una fecha", () => {
  assert.equal(interpretar("", "fecha"), null);
  assert.equal(interpretar("   ", "hora"), null);
  assert.equal(interpretar("mañana", "fecha"), undefined);
  assert.equal(interpretar("31/02/2026", "fecha"), undefined);
  assert.equal(interpretar("0/13/2026", "fecha"), undefined);
  assert.equal(interpretar("25:00", "hora"), undefined);
});

test("la hora suelta toma el día de la base", () => {
  const base = new Date(2026, 0, 5);
  assert.deepEqual(ymd(interpretar("08:00", "hora", base)), [2026, 1, 5]);
});

test("la rejilla de horas conserva una hora fuera de paso", () => {
  assert.equal(minutosDelDia(15).length, 96);
  const lista = minutosDelDia(15, 14 * 60 + 7);
  assert.equal(lista.length, 97);
  assert.equal(lista[lista.indexOf(14 * 60 + 7) - 1], 14 * 60);
});
