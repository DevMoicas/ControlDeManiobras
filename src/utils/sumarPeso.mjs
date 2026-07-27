// Suma de pesos — réplica del `_sumar_peso` del backend (api/views.py:226-243).
//
// Existe en el cliente porque el total hay que PINTARLO en el modal antes de
// generar, y lo que se pinta es exactamente lo que se manda: así no hay dos
// fuentes de verdad. El backend lo vuelve a pasar por su propio parseo, que
// acepta sin problema un número ya sumado.
//
// Módulo suelto y sin React a propósito, como src/hooks/inactividad.mjs: se
// prueba con la stdlib, sin arrastrar un framework de testing.
//
//   node --test src/utils/sumarPeso.test.mjs

/**
 * Suma todas las cantidades que vengan en los pesos recibidos.
 *
 * El peso de una maniobra puede traer varias cantidades separadas por '-' o '/'
 * (un full es "23412 - 22000"). Se aceptan N pesos para poder empatar folios.
 *
 * Las partes no numéricas se descartan en silencio, igual que el backend. Si no
 * queda ninguna, devuelve "" y no 0: un cero se escribiría en la celda como un
 * peso real de 0 KG, mientras que "" la deja en blanco.
 *
 * @param   {...(string|number|null|undefined)} pesos
 * @returns {number|""}
 */
export function sumarPeso(...pesos) {
  let total = 0;
  let encontrado = false;

  for (const bruto of pesos) {
    for (const parte of String(bruto ?? "").split(/[-/]/)) {
      const limpio = parte.trim();
      if (limpio === "") continue;

      const n = Number(limpio);
      // Number("") es 0 y Number("abc") es NaN — de ahí el guardia de arriba y
      // este isFinite, que además descarta "Infinity".
      if (Number.isFinite(n)) {
        total += n;
        encontrado = true;
      }
    }
  }

  return encontrado ? total : "";
}
