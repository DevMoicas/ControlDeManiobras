import { test } from "node:test";
import assert from "node:assert/strict";
import { INICIAL, INTENTOS, siguienteIntento, medidas } from "./comprimirImagen.mjs";

// Lo que tiene que cumplir la escalera: cada intento pesa menos que el anterior.
// Si un paso no encoge nada, el bucle de FotoModal daría INTENTOS vueltas
// generando el mismo JPEG y acabaría rechazando una imagen que sí cabía.
test("cada intento aprieta mas que el anterior", () => {
  let previo = INICIAL;
  for (let i = 0; i < INTENTOS; i++) {
    const actual = siguienteIntento(previo);
    const coste  = (p) => p.escala * p.escala * p.calidad;
    assert.ok(
      coste(actual) < coste(previo),
      `el intento ${i + 1} no reduce nada: ${JSON.stringify(actual)}`
    );
    previo = actual;
  }
});

// Bajar calidad es barato; reducir píxeles destruye el texto de un pantallazo.
// Por eso lo primero que se toca es la calidad, no la escala.
test("primero baja la calidad y solo despues encoge", () => {
  const primero = siguienteIntento(INICIAL);
  assert.equal(primero.escala, 1);
  assert.ok(primero.calidad < INICIAL.calidad);
});

test("agotada la calidad, empieza a encoger", () => {
  let p = INICIAL;
  for (let i = 0; i < INTENTOS; i++) p = siguienteIntento(p);
  assert.ok(p.escala < 1, "tras agotar los intentos la escala sigue en 1");
});

test("la calidad nunca cae a cero ni se vuelve negativa", () => {
  let p = INICIAL;
  for (let i = 0; i < 20; i++) {
    p = siguienteIntento(p);
    assert.ok(p.calidad > 0 && p.calidad <= 1, `calidad fuera de rango: ${p.calidad}`);
    assert.ok(p.escala > 0, `escala fuera de rango: ${p.escala}`);
  }
});

// canvas.width = 0 lanza. Una imagen muy estrecha (un recorte de una línea)
// encogida varias veces llega a esto.
test("las medidas nunca bajan de 1 px", () => {
  assert.deepEqual(medidas(1920, 1080, 1), { ancho: 1920, alto: 1080 });
  assert.deepEqual(medidas(1920, 1080, 0.5), { ancho: 960, alto: 540 });
  assert.deepEqual(medidas(3, 1, 0.01), { ancho: 1, alto: 1 });
  assert.deepEqual(medidas(1, 1, 0.0001), { ancho: 1, alto: 1 });
});
