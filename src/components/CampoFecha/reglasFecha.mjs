// Reglas puras de CampoFecha: qué se enseña en la caja y cómo se lee lo que se
// escribe. Aparte del componente para poder probarlas con node --test.
import { format, parse, isValid } from "date-fns";

// Lo que se ve en la caja, por modo. Los mismos formatos que tenía
// react-datepicker, para que nadie note el cambio al leer.
export const FORMATO = {
  fecha: "dd/MM/yyyy",
  fechaHora: "dd/MM/yyyy HH:mm",
  hora: "HH:mm",
  mes: "MM/yyyy",
};

// Lo que se acepta al ESCRIBIR, además del formato de arriba: lo que teclea la
// gente con prisa (sin ceros, año corto, sin separadores).
const ENTRADAS = {
  fecha: ["d/M/yyyy", "d/M/yy", "d-M-yyyy", "d.M.yyyy", "ddMMyyyy", "ddMMyy"],
  fechaHora: ["d/M/yyyy H:mm", "d/M/yy H:mm", "d/M/yyyy HHmm", "d/M/yyyy", "d/M/yy"],
  hora: ["H:mm", "HHmm", "Hmm", "H"],
  mes: ["M/yyyy", "M/yy", "M-yyyy", "yyyy-MM"],
};

export const formatear = (fecha, modo) =>
  fecha instanceof Date && isValid(fecha) ? format(fecha, FORMATO[modo]) : "";

/**
 * Texto tecleado → Date. `null` = caja vacía (borrar). `undefined` = no se
 * entiende: quien llama devuelve la caja a su valor anterior en vez de guardar
 * basura. `base` da el día a una hora suelta (modo "hora").
 */
export function interpretar(texto, modo, base = new Date()) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  for (const patron of [FORMATO[modo], ...ENTRADAS[modo]]) {
    const d = parse(t, patron, base);
    // El año acotado: "1/1/1" se parsea como el año 1 y date-fns lo da por
    // válido. Ninguna fecha de este sistema cae fuera de ese rango.
    if (isValid(d) && d.getFullYear() >= 1990 && d.getFullYear() <= 2100) return d;
  }
  return undefined;
}

/** Las horas del desplegable: cada `paso` minutos, más la que ya esté puesta
 *  si no cae en la rejilla (14:07 tecleado no puede desaparecer de la lista). */
export function minutosDelDia(paso = 15, actual = null) {
  const lista = [];
  for (let m = 0; m < 24 * 60; m += paso) lista.push(m);
  if (actual !== null && !lista.includes(actual)) {
    lista.push(actual);
    lista.sort((a, b) => a - b);
  }
  return lista;
}
