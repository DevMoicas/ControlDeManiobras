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

// "20 / DC" → ["20", "DC"]  (el formato que emite TipoSplitInput)
export function partesDelPar(par) {
  const p = String(par ?? "").split("/");
  return [(p[0] || "").trim(), (p[1] || "").trim()];
}

// "20 - 40 / DC - HC" → ["20 / DC", "40 / HC"]
export function partirTipoFull(tipo) {
  const [izquierda, derecha] = partesDelPar(tipo);
  const [n1, n2] = partirDoble(izquierda);
  const [l1, l2] = partirDoble(derecha);
  return [
    n1 || l1 ? `${n1} / ${l1}` : "",
    n2 || l2 ? `${n2} / ${l2}` : "",
  ];
}

// ["20 / DC", "40 / HC"] → "20 - 40 / DC - HC"
export function unirTipoFull(par1, par2) {
  const [n1, l1] = partesDelPar(par1);
  const [n2, l2] = partesDelPar(par2);
  const numeros = unirDoble(n1, n2);
  const letras  = unirDoble(l1, l2);
  return numeros || letras ? `${numeros} / ${letras}` : "";
}

/**
 * Las dos mitades de una carga, venga en el formato que venga.
 *
 * Desde la migración 0035 cada mitad vive en SU columna (tipo/tipo_2,
 * peso/peso_2, contenedor/contenedor_2). Los registros anteriores guardan las
 * dos dentro de la primera ("A - B", "A/B"): no hubo backfill a propósito.
 * Escribir va siempre a las dos columnas, así que cada fila pasa al formato
 * nuevo la primera vez que se edita.
 *
 * Devuelve también el separador original para poder reconstruir la cadena tal
 * cual la traía: el contenedor se imprime literal en la celda C17 del documento
 * (api/views.py), y convertir "A/B" en "A - B" cambiaría lo que sale en el PDF
 * de ~77 registros que nadie pidió tocar.
 *
 * @param {string} valor   columna 1
 * @param {string} valor2  columna 2 — vacía en los registros del formato viejo
 * @param {function} [partir=partirDoble] cómo partir el formato viejo
 * @returns {[string, string, string]} [primero, segundo, separador]
 */
export function leerPar(valor, valor2, partir = partirDoble) {
  const segundo = String(valor2 ?? "").trim();
  if (segundo) return [String(valor ?? "").trim(), segundo, " - "];
  const [a, b] = partir(valor);
  // partirTipoFull no devuelve separador; el de las cargas simples sí importa.
  const sep = partir === partirDoble ? partirDoble(valor)[2] : " - ";
  return [a, b, sep];
}

/**
 * El par ENTERO como texto, para la celda de la tabla cuando no se está editando.
 *
 * Es el contrario exacto de leerPar(): lee las dos columnas y las vuelve a unir.
 * Sin esto la celda pintaba solo `valor`, así que un Full ya migrado a la 0035
 * —con la segunda mitad en su propia columna— enseñaba UN contenedor y al
 * abrirlo aparecían dos. Los registros del formato viejo no lo notaban: los dos
 * valores vivían en la primera columna y se veían de casualidad.
 *
 * Reconstruye con el separador ORIGINAL, igual que cargaDeParte("ambos"): la
 * celda tiene que enseñar lo mismo que se imprime en el documento.
 *
 * @param {string} valor   columna 1
 * @param {string} valor2  columna 2
 * @param {boolean} [esTipo=false] TIPO DE CARGA usa su propio formato ("20 / DC")
 * @returns {string}
 */
export function textoDelPar(valor, valor2, esTipo = false) {
  if (esTipo) {
    const [a, b] = leerPar(valor, valor2, partirTipoFull);
    return unirTipoFull(a, b);
  }
  const [a, b, sep] = leerPar(valor, valor2);
  return unirDoble(a, b, sep);
}

/**
 * El texto de una celda con su unidad pegada a CADA cifra.
 *
 * "23412 - 22000" + "KG" → "23412 KG - 22000 KG". Un Full lleva dos pesos y
 * cada uno es su propia cantidad, así que la unidad va en los dos.
 *
 * Es SOLO presentación: quien llama pinta el resultado, nunca lo guarda. El
 * valor de la base no se toca — los documentos imprimen el peso tal cual está.
 *
 * Se conserva el separador original, igual que textoDelPar().
 *
 * @param {string} texto   el par ya compuesto (lo que enseña la celda)
 * @param {string} unidad  "KG"
 * @returns {string} "" si no hay nada que etiquetar
 */
export function conUnidad(texto, unidad) {
  const [a, b, sep] = partirDoble(texto);
  if (!a) return "";
  return b ? `${a} ${unidad}${sep}${b} ${unidad}` : `${a} ${unidad}`;
}

/**
 * ¿La carga de este folio trae un segundo contenedor que se pueda acotar?
 *
 * Sirve para decidir si el modal ofrece el desplegable 1 / 2 / Los dos. Cuando
 * la maniobra ya tiene DOS operadores no hay nada que elegir: cada folio trae
 * lo suyo y el documento no debe poder contradecir lo guardado.
 *
 * @param {object} folio fila de /maniobras/folios-recientes/
 * @returns {boolean}
 */
export function tieneDosContenedores(folio) {
  if (!folio || folio.dos_operadores) return false;
  const [, tipo2] = leerPar(folio.tipo, folio.tipo_2, partirTipoFull);
  const [, peso2] = leerPar(folio.peso, folio.peso_2);
  const [, cont2] = leerPar(folio.contenedor, folio.contenedor_2);
  return Boolean(tipo2 || peso2 || cont2);
}

/**
 * La carga que va al documento según el contenedor elegido.
 *
 * "ambos" reconstruye la cadena EXACTA que traía el registro —mismo separador
 * incluido—, así que un documento en el que nadie toca el desplegable sale
 * idéntico a como salía antes de que existiera.
 *
 * @param {object} folio fila de /maniobras/folios-recientes/
 * @param {"ambos"|"1"|"2"} parte
 * @returns {{tipo: string, peso: string, contenedor: string}}
 */
export function cargaDeParte(folio, parte) {
  const [tipo1, tipo2]       = leerPar(folio.tipo, folio.tipo_2, partirTipoFull);
  const [peso1, peso2, sepP] = leerPar(folio.peso, folio.peso_2);
  const [cont1, cont2, sepC] = leerPar(folio.contenedor, folio.contenedor_2);
  if (parte === "1") return { tipo: tipo1, peso: peso1, contenedor: cont1 };
  if (parte === "2") return { tipo: tipo2, peso: peso2, contenedor: cont2 };
  return {
    tipo:       unirTipoFull(tipo1, tipo2),
    peso:       unirDoble(peso1, peso2, sepP),
    contenedor: unirDoble(cont1, cont2, sepC),
  };
}
