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
