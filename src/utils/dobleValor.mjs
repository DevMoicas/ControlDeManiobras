// Los dos valores de un servicio Full dentro de una sola columna.
//
// Peso y Contenedor guardan sus dos valores en la MISMA celda de la base, y el
// histórico los separa de las dos formas: "23412 - 22000" y "WHLU5591210/WHSU6575360".
// El backend ya trata ambas como equivalentes (`_sumar_peso`, api/views.py:228, y
// su réplica en utils/sumarPeso.mjs, que parte por /[-/]/).
//
// El separador ORIGINAL se conserva a propósito. El backend imprime el contenedor
// tal cual en la celda C17 del documento (api/views.py:401), sin parsearlo: si al
// editar un contenedor reescribiéramos "A/B" como "A - B", estaríamos cambiando en
// silencio lo que sale impreso en ~77 registros que nadie pidió tocar.
//
// Módulo suelto y sin React, como utils/sumarPeso.mjs: se prueba con la stdlib.
//
//   node --test src/utils/dobleValor.test.mjs

// Primer '-' o '/' con los espacios que lo rodeen. Se captura entero para poder
// devolver la forma exacta que traía el dato ("-", " - ", "/", " / ").
const SEPARADOR = /\s*[-/]\s*/;

/**
 * Parte un valor doble en sus dos mitades.
 *
 * Corta en el PRIMER separador: los códigos de contenedor y las cantidades no
 * llevan separadores internos.
 *
 * @param   {string|number|null|undefined} valor
 * @returns {[string, string, string]} [primero, segundo, separador]
 *          El separador es el que traía el dato, o " - " si no había ninguno —
 *          así un valor simple que se convierte en doble usa la forma canónica.
 */
export function partirDoble(valor) {
  const s = String(valor ?? "");
  const m = s.match(SEPARADOR);
  if (!m) return [s.trim(), "", " - "];
  return [s.slice(0, m.index).trim(), s.slice(m.index + m[0].length).trim(), m[0]];
}

/**
 * Une dos valores con el separador dado.
 *
 * Sin segundo valor devuelve solo el primero: un separador colgando ("A - ")
 * acabaría escrito en la base y luego impreso en el documento.
 *
 * @param   {string} a
 * @param   {string} b
 * @param   {string} [separador=" - "]
 * @returns {string}
 */
export function unirDoble(a, b, separador = " - ") {
  const izq = String(a ?? "").trim();
  const der = String(b ?? "").trim();
  return der ? `${izq}${separador}${der}` : izq;
}
