// node --test src/utils/torreControl.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  numeroDeNoEco, ordenPorNoEco, mesDe, mesHoy, desplazarMes,
  celdasDelMes, pendientesDeMesesAnteriores, mesMinimoNavegable, fechaHoy,
} from "./torreControl.mjs";

const bolita = (no_eco, fecha) => ({ no_eco, fecha });

test("el orden es por número, no alfabético", () => {
  // Datos reales de producción: unos con espacio y cero, otros sin nada.
  const orden = ordenPorNoEco([
    bolita("NO.10"), bolita("NO. 2"), bolita("NO. 12"), bolita("NO. 01"),
  ]).map((u) => u.no_eco);
  assert.deepEqual(orden, ["NO. 01", "NO. 2", "NO.10", "NO. 12"]);
});

test("sin relleno de cero, que es donde el orden de texto falla", () => {
  // Formato "NO.1, NO.2, NO.10": el sort() de texto daría 1, 10, 11, 2.
  const orden = ordenPorNoEco([
    bolita("NO.1"), bolita("NO.11"), bolita("NO.2"), bolita("NO.10"),
  ]).map((u) => u.no_eco);
  assert.deepEqual(orden, ["NO.1", "NO.2", "NO.10", "NO.11"]);
});

test("un No. Eco sin número va al final y no se cuela en medio", () => {
  const orden = ordenPorNoEco([
    bolita("SIN NUMERO"), bolita("NO.5"), bolita("NO.1"),
  ]).map((u) => u.no_eco);
  assert.deepEqual(orden, ["NO.1", "NO.5", "SIN NUMERO"]);
});

test("numeroDeNoEco lee el número aunque cambie el formato", () => {
  assert.equal(numeroDeNoEco("NO. 01"), 1);
  assert.equal(numeroDeNoEco("NO.10"), 10);
  assert.equal(numeroDeNoEco("no 7"), 7);
  assert.equal(numeroDeNoEco(null), Number.POSITIVE_INFINITY);
});

test("mesDe corta la fecha sin construir un Date", () => {
  // Si esto se implementara con new Date("2026-08-01"), en México (UTC-6)
  // devolvería "2026-07": medianoche UTC es el 31 de julio a las 18:00 local.
  assert.equal(mesDe("2026-08-01"), "2026-08");
  assert.equal(mesDe("2026-01-31"), "2026-01");
});

test("mesHoy usa el reloj local", () => {
  assert.equal(mesHoy(new Date(2026, 7, 21)), "2026-08");
  assert.equal(mesHoy(new Date(2026, 0, 1)), "2026-01");
});

test("fechaHoy usa el reloj local y rellena con cero", () => {
  assert.equal(fechaHoy(new Date(2026, 7, 5)), "2026-08-05");
  assert.equal(fechaHoy(new Date(2026, 11, 31)), "2026-12-31");
});

test("desplazarMes cruza el cambio de año en los dos sentidos", () => {
  assert.equal(desplazarMes("2026-08", -1), "2026-07");
  assert.equal(desplazarMes("2026-01", -1), "2025-12");
  assert.equal(desplazarMes("2026-12", 1), "2027-01");
  assert.equal(desplazarMes("2026-08", 0), "2026-08");
});

test("la rejilla empieza en lunes y cuadra los días del mes", () => {
  // Agosto de 2026 empieza en sábado: cinco huecos antes del día 1.
  const celdas = celdasDelMes("2026-08");
  assert.deepEqual(celdas.slice(0, 6), [null, null, null, null, null, "2026-08-01"]);
  assert.equal(celdas.filter(Boolean).length, 31);
  assert.equal(celdas.at(-1), "2026-08-31");
});

test("febrero bisiesto y no bisiesto", () => {
  assert.equal(celdasDelMes("2028-02").filter(Boolean).length, 29);
  assert.equal(celdasDelMes("2026-02").filter(Boolean).length, 28);
});

test("el aviso mira cualquier mes anterior, no solo el inmediato", () => {
  const bolitas = [
    bolita("NO.1", "2026-07-15"),   // dos meses atrás: también cuenta
    bolita("NO.4", "2026-08-30"),   // el mes anterior
    bolita("NO.7", "2026-09-03"),   // el mes en curso: no cuenta
  ];
  const pendientes = pendientesDeMesesAnteriores(bolitas, "2026-09").map((b) => b.no_eco);
  assert.deepEqual(pendientes, ["NO.1", "NO.4"]);
});

test("sin nada atrás, no hay aviso", () => {
  const bolitas = [bolita("NO.7", "2026-09-03")];
  assert.deepEqual(pendientesDeMesesAnteriores(bolitas, "2026-09"), []);
});

test("la flecha atrás llega hasta la bolita más antigua", () => {
  const bolitas = [
    bolita("NO.1", "2026-07-15"),
    bolita("NO.4", "2026-08-30"),
  ];
  assert.equal(mesMinimoNavegable(bolitas, "2026-09"), "2026-07");
});

test("sin bolitas ocupadas no se puede retroceder", () => {
  assert.equal(mesMinimoNavegable([], "2026-09"), "2026-09");
});

test("una bolita del mes en curso no abre la flecha atrás", () => {
  const bolitas = [bolita("NO.7", "2026-09-03")];
  assert.equal(mesMinimoNavegable(bolitas, "2026-09"), "2026-09");
});
