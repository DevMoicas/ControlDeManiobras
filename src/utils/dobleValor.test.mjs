// node --test src/utils/dobleValor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { partirDoble, unirDoble, leerPar, partirTipoFull, unirTipoFull, cargaDeParte, tieneDosContenedores } from "./dobleValor.mjs";

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

// ── leerPar: los dos formatos de la carga conviven sin backfill ─────────────
test("formato nuevo: cada mitad en su columna", () => {
  assert.deepEqual(leerPar("WHLU5591210", "WHSU6575360"),
                   ["WHLU5591210", "WHSU6575360", " - "]);
});

test("formato viejo: las dos dentro de la primera columna", () => {
  assert.deepEqual(leerPar("WHLU5591210/WHSU6575360", ""),
                   ["WHLU5591210", "WHSU6575360", "/"]);
});

test("formato viejo: reconstruir con el separador leido devuelve el original", () => {
  // Si no, un registro editado imprimiria "A - B" donde el PDF decia "A/B".
  const original = "CAAU6047386 / MRKU4485916";
  const [a, b, sep] = leerPar(original, "");
  assert.equal(unirDoble(a, b, sep), original);
});

test("un solo contenedor: la segunda mitad queda vacia", () => {
  assert.deepEqual(leerPar("TLLU2899885", ""), ["TLLU2899885", "", " - "]);
});

test("el tipo se parte por pares, no por mitades sueltas", () => {
  assert.deepEqual(leerPar("20 - 40 / DC - HC", "", partirTipoFull),
                   ["20 / DC", "40 / HC", " - "]);
  assert.deepEqual(leerPar("40 / HC", "20 / DC", partirTipoFull),
                   ["40 / HC", "20 / DC", " - "]);
});

test("la columna 2 manda aunque la 1 traiga formato viejo", () => {
  // Fila ya migrada: nadie debe volver a partir la primera columna.
  assert.deepEqual(leerPar("A-B", "C"), ["A-B", "C", " - "]);
});

// ── Repartir la carga entre los dos contenedores del documento ──────────────
const FOLIO_VIEJO = {   // formato anterior a la 0035: los dos en la columna 1
  tipo: "20 - 40 / DC - HC",
  peso: "23412 - 22000",
  contenedor: "WHLU5591210/WHSU6575360",
  tipo_2: "", peso_2: "", contenedor_2: "",
};

const FOLIO_NUEVO = {   // cada mitad en su columna
  tipo: "20 / DC", peso: "23412", contenedor: "WHLU5591210",
  tipo_2: "40 / HC", peso_2: "22000", contenedor_2: "WHSU6575360",
};

test("'ambos' reconstruye el registro viejo tal cual, separador incluido", () => {
  // La garantia que sostiene todo: quien no toque el desplegable obtiene el
  // MISMO documento que antes de que el desplegable existiera.
  assert.deepEqual(cargaDeParte(FOLIO_VIEJO, "ambos"), {
    tipo: "20 - 40 / DC - HC",
    peso: "23412 - 22000",
    contenedor: "WHLU5591210/WHSU6575360",
  });
});

test("elegir el primer contenedor deja solo su mitad", () => {
  assert.deepEqual(cargaDeParte(FOLIO_VIEJO, "1"),
                   { tipo: "20 / DC", peso: "23412", contenedor: "WHLU5591210" });
});

test("elegir el segundo contenedor deja solo su mitad", () => {
  assert.deepEqual(cargaDeParte(FOLIO_NUEVO, "2"),
                   { tipo: "40 / HC", peso: "22000", contenedor: "WHSU6575360" });
});

test("el formato nuevo tambien se puede pedir entero", () => {
  assert.deepEqual(cargaDeParte(FOLIO_NUEVO, "ambos"), {
    tipo: "20 - 40 / DC - HC",
    peso: "23412 - 22000",
    contenedor: "WHLU5591210 - WHSU6575360",
  });
});

test("un sencillo no ofrece desplegable", () => {
  assert.equal(tieneDosContenedores({
    tipo: "40 / HC", peso: "23412", contenedor: "TLLU2899885",
    tipo_2: "", peso_2: "", contenedor_2: "",
  }), false);
});

test("con dos operadores no hay nada que elegir: manda el folio", () => {
  assert.equal(tieneDosContenedores({ ...FOLIO_NUEVO, dos_operadores: true }), false);
});

test("un full con dos contenedores y un solo operador si lo ofrece", () => {
  assert.equal(tieneDosContenedores(FOLIO_VIEJO), true);
  assert.equal(tieneDosContenedores(FOLIO_NUEVO), true);
});

test("dos operadores sobre un registro VIEJO: cada folio se lleva su mitad", () => {
  // El fallo del 2026-08-19: el backend mandaba las columnas _2 en crudo y en un
  // registro anterior a la 0035 estan vacias, asi que el folio del segundo
  // operador salia sin carga. El reparto tiene que partir la columna 1.
  const viejo = { ...FOLIO_VIEJO, dos_operadores: true };
  assert.deepEqual(cargaDeParte(viejo, "1"),
                   { tipo: "20 / DC", peso: "23412", contenedor: "WHLU5591210" });
  assert.deepEqual(cargaDeParte(viejo, "2"),
                   { tipo: "40 / HC", peso: "22000", contenedor: "WHSU6575360" });
});
