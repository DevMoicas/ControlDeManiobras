// Búsqueda con exclusiones para las tablas.
//
// La caja de búsqueda de las páginas filtraba con un `includes` a secas: servía
// para "enséñame esto" pero no para "quítame esto", que es lo que hace falta
// cuando un solo operador llena media pantalla y estorba para leer el resto.
//
// Misma caja, sin UI nueva. La consulta se lee por términos:
//
//   zuñiga              → solo las filas que contengan "zuñiga"
//   -zuñiga             → todas MENOS las que contengan "zuñiga"
//   "jose zuñiga"       → frase exacta (con espacios dentro)
//   -"jose zuñiga"      → excluye esa frase exacta
//   pendiente -zuñiga   → las dos cosas a la vez (Y lógico)
//
// Sin acentos y sin mayúsculas POR LOS DOS LADOS: NFD descompone la ñ en n +
// tilde, así que "zuniga" también encuentra "Zúñiga". Es lo que se quiere en
// campos que teclea a mano una persona distinta cada vez (operador_entrega,
// cita, cd): nadie escribe el mismo nombre igual dos veces.
//
// Filtra SOLO sobre las filas ya cargadas, igual que antes: la tabla pagina con
// scroll infinito y esto no cambia lo que pide el backend.
//
// Módulo suelto y sin React, como utils/dobleValor.mjs: se prueba con la stdlib.
//
//   node --test src/utils/buscar.test.mjs

const sinAcentos = (s) =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// El texto buscable de un valor de la fila.
//
// Listas y objetos se aplanan a mano porque String() los deja en "[object
// Object]" y entonces buscar "object" casa con media tabla. Las listas de
// `costos_extra` (Maniobras) se buscan por el nombre del concepto —`movimiento`,
// que es lo que la gente escribe— y los objetos como `formulas` (Gastos) por sus
// valores, así que el desglose "=150+230" también se encuentra.
const texto = (v) =>
  sinAcentos(
    Array.isArray(v) ? v.map((c) => c?.movimiento ?? c ?? "").join(" ")
    : v && typeof v === "object" ? Object.values(v).join(" ")
    : v
  );

// Un término es una frase entre comillas o una palabra suelta, con un '-'
// delante opcional. El orden importa: las comillas primero, si no "jose se
// partiría por el espacio y la frase dejaría de ser una frase.
const TERMINO = /-?"[^"]*"|\S+/g;

/**
 * Parte la consulta en lo que hay que incluir y lo que hay que excluir.
 *
 * @param   {string} consulta lo que hay escrito en la caja
 * @returns {{incluir: string[], excluir: string[]}} términos ya normalizados
 */
function parsear(consulta) {
  const incluir = [];
  const excluir = [];
  for (const bruto of String(consulta ?? "").match(TERMINO) ?? []) {
    const negado = bruto.startsWith("-");
    const texto = sinAcentos((negado ? bruto.slice(1) : bruto).replaceAll('"', ""));
    // Un '-' suelto, o unas comillas vacías, no son un término: se ignoran para
    // que la tabla no se vacíe entera mientras se está a medio teclear.
    if (texto) (negado ? excluir : incluir).push(texto);
  }
  return { incluir, excluir };
}

/**
 * Las filas que casan con la consulta.
 *
 * Mira TODOS los valores de la fila, como hacía el filtro que sustituye.
 *
 * @param   {object[]} filas    las que ya están cargadas
 * @param   {string}   consulta lo escrito en la caja de búsqueda
 * @returns {object[]} las mismas filas si no hay nada que filtrar
 */
export function filtrarBusqueda(filas, consulta) {
  const { incluir, excluir } = parsear(consulta);
  if (!incluir.length && !excluir.length) return filas;
  return filas.filter((fila) => {
    const valores = Object.values(fila).map(texto);
    const hay = (t) => valores.some((v) => v.includes(t));
    return incluir.every(hay) && !excluir.some(hay);
  });
}
