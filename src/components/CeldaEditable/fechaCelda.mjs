// Conversores YYYY-MM-DD (backend) ↔ Date (DatePicker) de la celda editable.
// Van en un .mjs aparte del .jsx solo para poder probarlos con node:test, igual
// que sumarPeso.mjs: el ida y vuelta es donde se cuela el clásico desfase de un
// día si se mezcla hora local con UTC.

export function aDate(valor) {
  const partes = String(valor ?? "").split("-");
  if (partes.length !== 3) return null;
  // Constructor local (no Date.parse): "2026-08-13" parseado como ISO es UTC y
  // al oeste de Greenwich se lee como el día 12.
  const d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  return isNaN(d.getTime()) ? null : d;
}

export function aBackend(date) {
  if (!date) return "";
  // Getters locales, no toISOString(), por el mismo motivo.
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// ── Fecha CON hora ───────────────────────────────────────────────────────────
// La cita de Vacíos se guarda como instante (timestamptz, en UTC) y no como el
// par fecha + hora que usan las fechas que se recortan a día. Aquí no hay
// desfase que evitar: el navegador convierte a la hora local al leer y de vuelta
// a UTC al escribir, que es justo lo que se quiere.

/** ISO del backend → Date para el calendario. null si no hay o no se entiende. */
export function aDateHora(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/** Date → ISO para el backend. Cadena vacía si no hay, como aBackend(). */
export function aBackendHora(date) {
  return date ? date.toISOString() : "";
}

/** Instante → "DD/MM/AAAA HH:mm" en la hora del navegador. "" si no hay. */
export function fechaHoraParaMostrar(valor) {
  const d = aDateHora(valor);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
