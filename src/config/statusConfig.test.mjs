// node --test src/config/statusConfig.test.mjs
//
// Cubre la regla del status EXCLUSIVO (Entregado) y la jerarquía de color, que es
// data pero decide qué se ve: si alguien reordena PRIORITY_ORDER sin querer, la
// tabla cambia de color en silencio y nada más lo avisa.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alternarStatus, STATUS_EXCLUSIVO, joinStatusIds, getStatusConfig, MAX_STATUSES,
  getPredominantStatusId,
} from "./statusConfig.js";

test("Entregado sustituye a lo que hubiera, aunque ya haya dos", () => {
  assert.deepEqual(alternarStatus([], "entregado"), ["entregado"]);
  assert.deepEqual(alternarStatus(["activo"], "entregado"), ["entregado"]);
  assert.deepEqual(alternarStatus(["por_salir", "activo"], "entregado"), ["entregado"]);
});

test("marcar otro status estando Entregado lo sustituye a él", () => {
  assert.deepEqual(alternarStatus(["entregado"], "activo"), ["activo"]);
});

test("nunca sale un combo con Entregado dentro", () => {
  for (const otro of ["activo", "pendiente", "quemada", "cancelado", "por_salir"]) {
    for (const combo of [alternarStatus([otro], "entregado"), alternarStatus(["entregado"], otro)]) {
      assert.equal(combo.includes(STATUS_EXCLUSIVO) && combo.length > 1, false,
        `combo invalido: ${combo}`);
    }
  }
});

test("desmarcar Entregado deja la maniobra sin status", () => {
  assert.equal(joinStatusIds(alternarStatus(["entregado"], "entregado")), null);
});

test("el resto de status siguen combinándose de dos en dos", () => {
  assert.deepEqual(alternarStatus(["activo"], "quemada"), ["activo", "quemada"]);
  // Tope: el tercero no entra y la selección se queda como estaba.
  const dos = alternarStatus(["activo"], "quemada");
  assert.equal(dos.length, MAX_STATUSES);
  assert.deepEqual(alternarStatus(dos, "pendiente"), dos);
  // Quitar uno conserva el otro.
  assert.deepEqual(alternarStatus(dos, "activo"), ["quemada"]);
});

test("Entregado deja la fila en el color por defecto (sin clase)", () => {
  assert.equal(getStatusConfig("entregado").rowClass, "");
  assert.equal(getStatusConfig("activo").rowClass, "row-status--activo");
});

// ── Jerarquía de color (cambiada el 2026-09-25) ──────────────────────────────
// quemada > cancelado > pendiente > por_salir (Lázaro) > activo

test("Quemada/En falso pinta sobre todos los demás", () => {
  for (const otro of ["cancelado", "pendiente", "por_salir", "activo"]) {
    assert.equal(getPredominantStatusId(joinStatusIds(["quemada", otro])), "quemada",
      `quemada deberia ganarle a ${otro}`);
  }
});

test("el orden canónico sigue la jerarquía nueva", () => {
  assert.equal(joinStatusIds(["activo", "quemada"]),      "quemada,activo");
  assert.equal(joinStatusIds(["activo", "cancelado"]),    "cancelado,activo");
  assert.equal(joinStatusIds(["activo", "pendiente"]),    "pendiente,activo");
  assert.equal(joinStatusIds(["por_salir", "pendiente"]), "pendiente,por_salir");
  assert.equal(joinStatusIds(["activo", "por_salir"]),    "por_salir,activo");
});

test("Lázaro ya no gana: solo le queda Activo por debajo", () => {
  assert.equal(getPredominantStatusId("quemada,por_salir"),   "quemada");
  assert.equal(getPredominantStatusId("pendiente,por_salir"), "pendiente");
  assert.equal(getPredominantStatusId("por_salir,activo"),    "por_salir");
});

test("las filas ya guardadas con el orden viejo repintan solas", () => {
  // Lo que hay hoy en `maniobras.status`: el color se recalcula por prioridad,
  // no se lee del primer segmento, asi que no hace falta migrar datos.
  assert.equal(getPredominantStatusId("activo,quemada"),    "quemada");
  assert.equal(getPredominantStatusId("activo,pendiente"),  "pendiente");
  assert.equal(getPredominantStatusId("por_salir,quemada"), "quemada");
});
