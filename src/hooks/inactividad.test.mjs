// node --test src/hooks/inactividad.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoInicial, conActividad, conAceptar, conTick } from "./inactividad.mjs";

const T0  = 1_000_000;
const min = (n) => T0 + n * 60_000;

test("avisa a los 10 min y expira a los 20 si nadie hace nada", () => {
  let s = estadoInicial(T0);
  assert.equal(conTick(s, min(9)).accion, null);

  const aviso = conTick(s, min(10));
  assert.equal(aviso.accion, "avisar");
  s = aviso.estado;

  assert.equal(conTick(s, min(15)).accion, null, "el aviso no debe repetirse");
  assert.equal(conTick(s, min(20)).accion, "expirar");
});

test("con el aviso en pantalla, mover el raton NO salva la sesion", () => {
  let s = conTick(estadoInicial(T0), min(10)).estado;
  s = conActividad(s, min(11));  // el usuario mueve el ratón, pero no acepta
  assert.equal(conTick(s, min(20)).accion, "expirar");
});

test("aceptar por si solo tampoco reinicia el contador", () => {
  let s = conTick(estadoInicial(T0), min(10)).estado;
  s = conAceptar(s);             // acepta y se marcha sin tocar nada más
  assert.equal(conTick(s, min(20)).accion, "expirar");
});

test("tras aceptar, la actividad si reinicia el contador", () => {
  let s = conTick(estadoInicial(T0), min(10)).estado;
  s = conAceptar(s);
  s = conActividad(s, min(11));  // vuelve a trabajar
  assert.equal(conTick(s, min(20)).accion, null,      "la sesion sigue viva");
  assert.equal(conTick(s, min(21)).accion, "avisar",  "vuelve a avisar a los 10 min");
  assert.equal(conTick(s, min(31)).accion, "expirar", "y a expirar a los 20");
});

test("una vez expirado no vuelve a disparar", () => {
  const s = conTick(estadoInicial(T0), min(20)).estado;
  assert.equal(conTick(s, min(40)).accion, null);
});
