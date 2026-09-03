// node --test src/utils/formulaSuma.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarSuma, prepararPayload } from "./formulaSuma.mjs";

// El caso que pidió el usuario: cinco casetas pagadas por separado.
test("suma el desglose de casetas", () => {
  assert.equal(evaluarSuma("=150+230+430+320+320"), "1450.00");
});

test("acepta decimales y espacios alrededor de los signos", () => {
  assert.equal(evaluarSuma("=150.50+230"),   "380.50");
  assert.equal(evaluarSuma("= 150 + 230 "),  "380.00");
});

test("también resta", () => {
  assert.equal(evaluarSuma("=1200-150"), "1050.00");
  assert.equal(evaluarSuma("=-50+20"),   "-30.00");
});

test("un solo número con '=' se normaliza a 2 decimales", () => {
  assert.equal(evaluarSuma("=150"), "150.00");
});

// La suma en centavos: en coma flotante 0.1+0.2 da 0.30000000000000004 y eso
// acabaría escrito en una celda de dinero.
test("no arrastra el error de la coma flotante", () => {
  assert.equal(evaluarSuma("=0.1+0.2"),     "0.30");
  assert.equal(evaluarSuma("=1.15+2.15"),   "3.30");
});

// Sin '=' NO se toca nada: es lo que impide que una descripción se convierta
// en un número a espaldas de quien la escribió.
test("sin '=' se queda tal cual", () => {
  assert.equal(evaluarSuma("150+230"), "150+230");
  assert.equal(evaluarSuma("150"),     "150");
  assert.equal(evaluarSuma("CASETAS IDA Y VUELTA"), "CASETAS IDA Y VUELTA");
});

test("una fórmula rota vuelve intacta: la decide el serializer, no esto", () => {
  for (const roto of ["=150+", "=+", "=", "=150+abc", "=150*2", "=(150+230)", "=150,230"]) {
    assert.equal(evaluarSuma(roto), roto, roto);
  }
});

test("vacío y nulo no revientan (la celda vacía viaja como null)", () => {
  assert.equal(evaluarSuma(""), "");
  assert.equal(evaluarSuma(null), null);
  assert.equal(evaluarSuma(undefined), undefined);
});


// ── prepararPayload: la fórmula se guarda aparte y sobrevive ───────────────

test("una fórmula nueva se guarda en formulas y la celda viaja con el total", () => {
  assert.deepEqual(
    prepararPayload({ id: 3, casetas_ida: "=150+230+430+320+320", formulas: {} }),
    { id: 3, casetas_ida: "1450.00", formulas: { casetas_ida: "=150+230+430+320+320" } }
  );
});

// El caso que rompe en silencio: useGastos escribe con PUT (la fila ENTERA), así
// que al editar otra columna la fórmula vuelve a pasar por aquí como número.
test("editar otro campo no borra la fórmula de una celda que sigue cuadrando", () => {
  const fila = {
    casetas_ida: "1450.00", gasto_diesel: "800",
    formulas: { casetas_ida: "=150+230+430+320+320" },
  };
  assert.deepEqual(prepararPayload(fila).formulas, { casetas_ida: "=150+230+430+320+320" });
});

test("escribir el total a mano olvida la fórmula: ya no es su desglose", () => {
  const fila = { casetas_ida: "500", formulas: { casetas_ida: "=150+230" } };
  assert.deepEqual(prepararPayload(fila), { casetas_ida: "500", formulas: {} });
});

test("vaciar la celda olvida la fórmula", () => {
  const fila = { casetas_ida: "", formulas: { casetas_ida: "=150+230" } };
  assert.deepEqual(prepararPayload(fila), { casetas_ida: "", formulas: {} });
});

test("los campos que no son de dinero no se evalúan nunca", () => {
  // Una fórmula en la Descripción convertiría la nota de la persona en un número.
  const fila = { descripcion_gastos: "=150+230", unidad: "=1+1" };
  assert.deepEqual(prepararPayload(fila),
                   { descripcion_gastos: "=150+230", unidad: "=1+1", formulas: {} });
});

test("una fila sin formulas previas no revienta", () => {
  assert.deepEqual(prepararPayload({ casetas_ida: "=1+2" }),
                   { casetas_ida: "3.00", formulas: { casetas_ida: "=1+2" } });
});
