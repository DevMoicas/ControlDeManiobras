// node --test src/utils/colorFila.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PALETA_SHEETS, TEXTO_OSCURO, TEXTO_CLARO,
  esColorValido, luminancia, textoSobre,
} from "./colorFila.mjs";

test("la paleta es la rejilla de Sheets: 8 filas de 10", () => {
  assert.equal(PALETA_SHEETS.length, 8);
  for (const fila of PALETA_SHEETS) assert.equal(fila.length, 10);
});

test("todos los colores de la paleta son hex válidos", () => {
  for (const fila of PALETA_SHEETS) {
    for (const color of fila) assert.ok(esColorValido(color), `inválido: ${color}`);
  }
});

test("esColorValido rechaza lo que no sea #rrggbb", () => {
  assert.ok(esColorValido("#ffd966"));
  assert.ok(esColorValido("#FFD966"));
  assert.ok(!esColorValido("#fff"));          // atajo de 3 dígitos: no se acepta
  assert.ok(!esColorValido("red"));
  assert.ok(!esColorValido("#ffd966; background-image: url(x)"));
  assert.ok(!esColorValido(null));
  assert.ok(!esColorValido(""));
});

test("sobre fondo claro, texto oscuro", () => {
  assert.equal(textoSobre("#ffffff"), TEXTO_OSCURO);
  assert.equal(textoSobre("#fff2cc"), TEXTO_OSCURO);   // amarillo claro
  assert.equal(textoSobre("#d9ead3"), TEXTO_OSCURO);   // verde claro
});

test("sobre fondo oscuro, texto claro", () => {
  assert.equal(textoSobre("#000000"), TEXTO_CLARO);
  assert.equal(textoSobre("#20124d"), TEXTO_CLARO);    // morado sombra 3
  assert.equal(textoSobre("#0b5394"), TEXTO_CLARO);    // azul sombra 2
});

test("el azul puro lleva texto claro y el amarillo puro texto oscuro", () => {
  // El caso que descarta la media rápida de YIQ: los dos rondan la misma media
  // de canales y tienen luminancia opuesta. Con la media, el azul saldría con
  // texto oscuro sobre fondo oscuro.
  assert.equal(textoSobre("#0000ff"), TEXTO_CLARO);
  assert.equal(textoSobre("#ffff00"), TEXTO_OSCURO);
});

test("la luminancia respeta los extremos", () => {
  assert.equal(luminancia("#000000"), 0);
  assert.equal(luminancia("#ffffff"), 1);
});

test("un color inválido no rompe: se asume texto oscuro", () => {
  // Una fila guardada antes de la validación no debe reventar la tabla.
  assert.equal(textoSobre("basura"), TEXTO_OSCURO);
  assert.equal(textoSobre(null), TEXTO_OSCURO);
});
