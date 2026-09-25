// CITA ABIERTA: el patio que no exige hora recibe el vacío cuando se llegue, así
// que su celda de CITA lo dice sola en vez de quedarse en blanco.
//
// El valor se DERIVA del catálogo (Patio.con_cita) y no se guarda en el vacío:
// marcar un patio corrige de golpe todos los suyos, y no hay dos copias del
// mismo dato que se puedan contradecir. El backend aplica la misma regla al
// imprimir el reporte (_celda_reporte_vacios en api/views.py), porque el papel
// tiene que decir lo mismo que la pantalla.
import { fechaHoraParaMostrar } from "../components/CeldaEditable/fechaCelda.mjs";

/**
 * El catálogo de patios en forma de mapa `NOMBRE NORMALIZADO -> con_cita`.
 *
 * `vacios.patio` guarda el NOMBRE del patio y no un enlace, así que este mapa es
 * el único cruce que hay. Se normaliza a mayúsculas y sin espacios de sobra
 * porque una diferencia de mayúsculas diría "cita abierta" en un patio que sí
 * exige hora, y eso manda a un operador a presentarse a deshora.
 */
export function mapaDePatios(lista) {
  return new Map(lista.map((p) => [(p.nombre || "").trim().toUpperCase(), !!p.con_cita]));
}

/**
 * Lo que se lee en la columna CITA de un vacío.
 *
 * Solo se afirma lo que se sabe, en este orden:
 *   1. Una hora escrita a mano GANA: esto solo rellena el hueco.
 *   2. `patios` en null es "el catálogo todavía no ha llegado", distinto de
 *      "ningún patio exige cita": hasta que llegue, se calla.
 *   3. Sin patio, o con un patio que NO está en el catálogo, tampoco se dice
 *      nada. `vacios.patio` arrastra nombres sueltos del histórico ("CIMA",
 *      "CIMA ASIPONA", "SSA 9 PM 25 NOV"): de esos no se sabe si piden hora, y
 *      marcarlos en Catálogos no los alcanzaría nunca.
 *
 * @param {{cita?: string|null, patio?: string|null}} vacio
 * @param {Map<string, boolean>|null} patios el mapa de `mapaDePatios`.
 */
export function textoDeCita(vacio, patios) {
  const hora = fechaHoraParaMostrar(vacio.cita);
  if (hora || !patios) return hora;
  const conCita = patios.get((vacio.patio || "").trim().toUpperCase());
  return conCita === false ? "CITA ABIERTA" : "";
}
