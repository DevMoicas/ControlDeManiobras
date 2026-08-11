// node --test src/utils/dobleValor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { partirDoble, unirDoble } from "./dobleValor.mjs";

test("parte por guion, que es la forma canónica", () => {
  assert.deepEqual(partirDoble("23412 - 22000"), ["23412", "22000", " - "]);
});

test("parte por barra: es como viene la mayoría de los contenedores reales", () => {
  // Datos reales de producción (maniobras 4062, 4064).
  assert.deepEqual(
    partirDoble("WHLU5591210/WHSU6575360"),
    ["WHLU5591210", "WHSU6575360", "/"]
  );
  assert.deepEqual(
    partirDoble("CAAU6047386 / MRKU4485916"),
    ["CAAU6047386", "MRKU4485916", " / "]
  );
});

test("un solo valor deja la segunda mitad vacía", () => {
  assert.deepEqual(partirDoble("TLLU2899885"), ["TLLU2899885", "", " - "]);
  // Maniobra 4069: un contenedor con 14 espacios delante.
  assert.deepEqual(partirDoble("              TLLU2899885"), ["TLLU2899885", "", " - "]);
});

test("vacío y nulo no revientan", () => {
  assert.deepEqual(partirDoble(""),        ["", "", " - "]);
  assert.deepEqual(partirDoble(null),      ["", "", " - "]);
  assert.deepEqual(partirDoble(undefined), ["", "", " - "]);
});

test("corta en el PRIMER separador, no en el último", () => {
  assert.deepEqual(partirDoble("FOGO22050/CARGA SUELTA"), ["FOGO22050", "CARGA SUELTA", "/"]);
});

test("unir sin segundo valor no deja el separador colgando", () => {
  assert.equal(unirDoble("A", ""),      "A");
  assert.equal(unirDoble("A", "", "/"), "A");
});

test("unir usa el separador que se le pase", () => {
  assert.equal(unirDoble("A", "B"),       "A - B");
  assert.equal(unirDoble("A", "B", "/"),  "A/B");
});

// La invariante que de verdad importa: abrir la celda y editar UNA mitad no debe
// reescribir el formato de la otra. Si esto se rompe, editar un contenedor le
// cambia el separador a ~77 registros y con él lo que sale impreso en el PDF.
test("ida y vuelta: se conserva el separador original", () => {
  for (const original of [
    "23412 - 22000",
    "WHLU5591210/WHSU6575360",
    "CAAU6047386 / MRKU4485916",
    "8376/12117",
    "A-B",
    "TLLU2899885",
    "",
  ]) {
    const [a, b, sep] = partirDoble(original);
    assert.equal(unirDoble(a, b, sep), original.trim(), `round-trip de "${original}"`);
  }
});

test("editar solo la segunda mitad conserva la primera y el separador", () => {
  const [a, , sep] = partirDoble("WHLU5591210/WHSU6575360");
  assert.equal(unirDoble(a, "NUEVO1234567", sep), "WHLU5591210/NUEVO1234567");
});
