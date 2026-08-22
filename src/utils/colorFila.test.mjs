// node --test src/utils/colorFila.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PALETA_SHEETS, TEXTO_OSCURO, TEXTO_CLARO,
  esColorValido, luminancia, textoSobre, contraste,
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


test("en los tonos medios gana la tinta oscura, que es donde fallaba el umbral fijo", () => {
  // Con el umbral de 0.4 estos salían en blanco. La tinta oscura contrasta casi
  // el doble sobre ellos.
  for (const medio of ["#6d9eeb", "#93c47d", "#f6b26b", "#76a5af", "#c27ba0"]) {
    assert.equal(textoSobre(medio), TEXTO_OSCURO, `fallo en ${medio}`);
  }
});

test("el texto elegido siempre contrasta al menos tanto como el otro", () => {
  for (const fila of PALETA_SHEETS) {
    for (const color of fila) {
      const fondo = luminancia(color);
      const elegido = luminancia(textoSobre(color));
      const otro = luminancia(textoSobre(color) === TEXTO_OSCURO ? TEXTO_CLARO : TEXTO_OSCURO);
      assert.ok(
        contraste(fondo, elegido) >= contraste(fondo, otro),
        `${color}: se eligió el texto con menos contraste`,
      );
    }
  }
});

test("contraste: los extremos conocidos de la escala WCAG", () => {
  // Negro sobre blanco es 21:1, el máximo. Un color consigo mismo, 1:1.
  assert.equal(Math.round(contraste(luminancia("#000000"), luminancia("#ffffff"))), 21);
  assert.equal(contraste(luminancia("#808080"), luminancia("#808080")), 1);
});
