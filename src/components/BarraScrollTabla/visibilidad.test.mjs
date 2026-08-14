import { test } from "node:test";
import assert from "node:assert/strict";
import { haceFaltaBarra } from "./visibilidad.mjs";

const ALTO = 800; // alto de la ventana en todos los casos

// Tabla ancha que empieza arriba y sigue por debajo del pliegue: es el caso
// para el que existe la barra.
const DESBORDA_Y_SIGUE = {
  scrollWidth: 2400, clientWidth: 1200, top: 100, bottom: 1900, alto: ALTO,
};

test("tabla ancha con el pie bajo el pliegue: hace falta", () => {
  assert.equal(haceFaltaBarra(DESBORDA_Y_SIGUE), true);
});

test("si la tabla cabe a lo ancho, no hace falta", () => {
  assert.equal(
    haceFaltaBarra({ ...DESBORDA_Y_SIGUE, scrollWidth: 1200 }),
    false,
  );
});

// Zoom del navegador: scrollWidth se queda un subpixel por encima de clientWidth
// sin que haya nada que recorrer.
test("un pixel de diferencia no cuenta como desbordar", () => {
  assert.equal(
    haceFaltaBarra({ ...DESBORDA_Y_SIGUE, scrollWidth: 1201 }),
    false,
  );
});

test("si el pie de la tabla ya se ve, la nativa basta", () => {
  assert.equal(haceFaltaBarra({ ...DESBORDA_Y_SIGUE, bottom: 700 }), false);
});

test("tabla entera por debajo de la pantalla: nada que mostrar", () => {
  assert.equal(
    haceFaltaBarra({ ...DESBORDA_Y_SIGUE, top: 900, bottom: 2600 }),
    false,
  );
});

test("tabla entera por encima: nada que mostrar", () => {
  assert.equal(
    haceFaltaBarra({ ...DESBORDA_Y_SIGUE, top: -1900, bottom: -100 }),
    false,
  );
});

// La garantía de la que depende Catálogos (5 tablas) y Folios (2): con varias
// tablas apiladas, como mucho una pide barra. Se simulan tres seguidas y se
// recorre la página entera comprobando que nunca hay dos a la vez.
test("con tablas apiladas nunca hacen falta dos barras", () => {
  const alturaTabla = 600;
  const hueco = 40;
  const tablas = [0, 1, 2].map((i) => ({
    inicio: i * (alturaTabla + hueco),
    fin: i * (alturaTabla + hueco) + alturaTabla,
  }));

  for (let scrollY = 0; scrollY <= 2000; scrollY += 10) {
    const visibles = tablas.filter((t) =>
      haceFaltaBarra({
        scrollWidth: 2400,
        clientWidth: 1200,
        top: t.inicio - scrollY,
        bottom: t.fin - scrollY,
        alto: ALTO,
      }),
    );
    assert.ok(
      visibles.length <= 1,
      `en scrollY=${scrollY} pedirian barra ${visibles.length} tablas`,
    );
  }
});
