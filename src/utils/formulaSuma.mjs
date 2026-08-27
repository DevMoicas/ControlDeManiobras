// Sumas desglosadas en las celdas de dinero, al estilo de Excel.
//
// Cinco casetas se pagan de una en una pero en la tabla hay UNA columna. Antes
// había que sacar la calculadora, escribir el total y perder el desglose. Ahora
// se escribe la misma fórmula que se escribiría en Excel:
//
//   =150+230+430+320+320   →   1450.00
//   =150.50+230            →   380.50
//   =1200-150              →   1050.00   (también resta)
//
// El '=' es OBLIGATORIO, como en Excel: sin él, "150+230" es texto y se queda
// tal cual. Así una descripción o una unidad nunca se convierten en un número
// por accidente — solo se toca lo que la persona marcó como fórmula.
//
// NO se usa eval() ni new Function(): esto viaja a un campo de dinero y aquí no
// entra nada que no sean cifras, '+', '-' y espacios. Lo que no case con eso se
// devuelve intacto y el serializer decide (400) como hacía antes.
//
// La columna de dinero guarda el TOTAL —es un DecimalField(10,2) y ahí no cabe
// una suma—, y el texto de la fórmula se guarda aparte, en Gasto.formulas
// (jsonb, migración 0058). Así al volver a abrir la celda se lee el desglose,
// como en Excel: la celda enseña 1450.00 y al editarla aparece =150+230+430.
//
// Módulo suelto y sin React, como utils/dobleValor.mjs: se prueba con la stdlib.
//
//   node --test src/utils/formulaSuma.test.mjs

// Una fórmula ENTERA: '=' y a partir de ahí solo números separados por + o -.
// Anclada por los dos lados a propósito: "=150+abc" no es media suma, no es una
// suma, y se devuelve intacta.
const FORMULA = /^=\s*[-+]?\s*\d+(?:\.\d+)?(?:\s*[-+]\s*\d+(?:\.\d+)?)*$/;

const TERMINO = /([+-]?)(\d+(?:\.\d+)?)/g;

/**
 * Resuelve una fórmula de suma; cualquier otra cosa vuelve tal cual.
 *
 * Suma en centavos enteros, no en flotantes: 0.1 + 0.2 en coma flotante da
 * 0.30000000000000004 y eso acabaría en una celda de dinero. Cada término se
 * redondea a 2 decimales, que es la precisión de la columna.
 *
 * @param   {*} texto lo que se escribió en la celda
 * @returns {*} el total con 2 decimales, o el mismo `texto` si no era fórmula
 */
export function evaluarSuma(texto) {
  const s = String(texto ?? "").trim();
  if (!FORMULA.test(s)) return texto;
  let centavos = 0;
  for (const [, signo, numero] of s.slice(1).replace(/\s+/g, "").matchAll(TERMINO)) {
    centavos += (signo === "-" ? -1 : 1) * Math.round(Number(numero) * 100);
  }
  return (centavos / 100).toFixed(2);
}

// Campos de la fila de gastos donde una fórmula tiene sentido: los de dinero.
// En un campo de texto como `descripcion_gastos` convertiría la nota de la
// persona en un número. `gastos_totales` no está: lo calcula el backend.
//
// Copia deliberada de CAMPOS_CON_FORMULA en api/Serializers.py, que es quien
// manda: esta lista solo evita mandar algo que allí se rechazaría con un 400.
export const CAMPOS_CON_FORMULA = [
  "casetas_ida", "casetas_regreso", "gastos_adicionales", "entregado",
  "gasto_tag", "gasto_diesel", "comision_operador", "reparaciones", "facturado",
];

// ¿El número que hay en la celda sigue siendo el resultado de esa fórmula?
const esSuResultado = (formula, valor) =>
  valor != null && valor !== "" && evaluarSuma(formula) === Number(valor).toFixed(2);

/**
 * El payload listo para el backend: fórmulas resueltas y guardadas aparte.
 *
 * La columna de dinero se queda con el TOTAL (es lo que suma Gasto.save()) y el
 * texto de la fórmula viaja en `formulas`, para poder volver a enseñarlo al
 * editar. Es lo mismo que hace Excel: la celda enseña 1450 y la barra enseña
 * =150+230+430+320+320.
 *
 * Se aplica al payload entero en useGastos, que es por donde pasan los tres
 * sitios donde se escribe un gasto: celda, fila nueva y modal.
 *
 * Una fórmula se OLVIDA sola cuando su celda deja de valer lo que ella suma —
 * alguien escribió el total a mano, o vació la celda. Mientras el número
 * cuadre, sobrevive a los PUT de los demás campos, que mandan la fila entera.
 *
 * @param   {object} datos payload de POST/PUT
 * @returns {object} copia; el original no se toca
 */
export function prepararPayload(datos) {
  const salida = { ...datos };
  const formulas = { ...(datos.formulas ?? {}) };
  for (const campo of CAMPOS_CON_FORMULA) {
    const entrada = salida[campo];
    const texto = typeof entrada === "string" ? entrada.trim() : "";
    const total = texto && evaluarSuma(texto);
    if (total && total !== texto) {
      formulas[campo] = texto;
      salida[campo] = total;
    } else if (formulas[campo] && !esSuResultado(formulas[campo], entrada)) {
      delete formulas[campo];
    }
  }
  salida.formulas = formulas;
  return salida;
}
