import { test } from "node:test";
import assert from "node:assert/strict";
import { sumarPeso } from "./sumarPeso.mjs";
import { pesoDeFolios } from "./sumarPeso.mjs";

test("un solo valor se devuelve tal cual", () => {
  assert.equal(sumarPeso("23412"), 23412);
});

test("un full trae dos cantidades separadas por guion y se suman", () => {
  assert.equal(sumarPeso("23412 - 22000"), 45412);
});

test("la barra tambien separa, con y sin espacios", () => {
  assert.equal(sumarPeso("8376/12117"), 20493);
  assert.equal(sumarPeso("8376 / 12117"), 20493);
});

test("el empate suma los pesos de los dos folios", () => {
  assert.equal(sumarPeso("23412 - 22000", "15000"), 60412);
});

test("un folio sin peso no estorba al otro", () => {
  assert.equal(sumarPeso("15000", ""), 15000);
  assert.equal(sumarPeso("", "15000"), 15000);
});

test("descarta las partes no numericas y suma el resto", () => {
  assert.equal(sumarPeso("12000 - roto"), 12000);
});

// El caso que justifica devolver "" en vez de 0: la celda tiene que quedar en
// blanco, porque un 0 se leeria como un peso real de 0 KG.
test("si nada es numerico devuelve cadena vacia, no cero", () => {
  assert.equal(sumarPeso(""), "");
  assert.equal(sumarPeso("N/A"), "");
  assert.equal(sumarPeso(null, undefined), "");
});

// ── El peso que va a la bitácora: cargaDeParte + sumarPeso ───────────────────
// Es la COMPOSICIÓN que se rompió, no ninguna de las dos por separado. Desde la
// 0035 cada mitad de un Full tiene su columna; leyendo solo `peso`, el segundo
// contenedor se quedaba fuera y el documento salía con la mitad del peso.
test("un Full con cada mitad en su columna suma los DOS pesos", () => {
  assert.equal(pesoDeFolios([{ peso: "23412", peso_2: "22000", parte: "ambos" }]),
               45412);
});

test("un registro anterior a la 0035 sigue sumando igual", () => {
  // Los dos pesos dentro de la primera columna, que es como se guardaban antes.
  assert.equal(pesoDeFolios([{ peso: "23412 - 22000", peso_2: "", parte: "ambos" }]),
               45412);
});

test("empatar los dos folios de un Full repartido no cuenta ningún peso dos veces", () => {
  // Las dos filas de /folios-recientes/ traen la carga ENTERA; lo que las
  // distingue es `parte`. Sin mirarla, empatarlas sumaría 90824.
  const carga = { peso: "23412", peso_2: "22000" };
  assert.equal(
    pesoDeFolios([{ ...carga, parte: "1" }, { ...carga, parte: "2" }]),
    45412,
  );
});
