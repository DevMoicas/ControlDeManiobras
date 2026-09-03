// node --test src/config/statusConfig.test.mjs
//
// Solo cubre la regla del status EXCLUSIVO (Entregado): es la única lógica con
// ramas del archivo. El resto (parse/join/prioridad) es data.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alternarStatus, STATUS_EXCLUSIVO, joinStatusIds, getStatusConfig, MAX_STATUSES,
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
