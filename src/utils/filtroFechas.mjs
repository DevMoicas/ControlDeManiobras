// Filtro de fechas EN PANTALLA, para tablas que llegan enteras (Facturación,
// Cuentas por pagar). Mismos campos que FiltrosLista: fecha, desde/hasta y mes.
// Las fechas son ISO ('2026-07-01' o con hora); se comparan como texto.

/** Si `iso` pasa los filtros. Sin filtros pasa todo; sin fecha, solo si no hay filtros. */
export function enFechas(iso, { fecha, desde, hasta, mes } = {}) {
  if (!fecha && !(desde && hasta) && !mes) return true;
  const dia = iso ? String(iso).slice(0, 10) : "";
  if (!dia) return false;
  if (fecha && dia !== fecha) return false;
  // El rango en cualquier orden, como en FiltrosLista.
  if (desde && hasta) {
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    if (dia < a || dia > b) return false;
  }
  return !mes || dia.startsWith(mes);
}
