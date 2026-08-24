// Folio de un servicio Full: el mismo código del talonario con "-2" al final.
//
// El vínculo entre maniobra y folio es la CADENA, no una FK (la tabla maniobras
// es managed=False), así que el sufijo se aplica RENOMBRANDO el folio en el
// catálogo, no escribiendo un texto distinto en la maniobra: si los dos códigos
// divergen, /folios/disponibles/ vuelve a ofrecer el número como libre y dos
// maniobras acaban en el mismo folio de papel.
//
// Solo la columna FOLIO. Un Full repartido entre dos operadores gasta un folio
// por operador y cada uno lleva UN contenedor, así que ahí ninguno de los dos
// ampara un full: con folio_2 puesto el sufijo se retira (decidido con el
// usuario, 2026-08-24).

export const SUFIJO_FULL = "-2";

// "F-2279-2" sí lo lleva; "F-2" no: quitárselo dejaría "F", que no es un folio.
// Los códigos base son "{letra}-{numero}" y "{letra}-LCR-{numero}", así que en
// uno ya sufijado el carácter anterior al sufijo es siempre un dígito.
export function tieneSufijoFull(codigo) {
  const c = codigo ?? "";
  return c.endsWith(SUFIJO_FULL) && /\d$/.test(c.slice(0, -SUFIJO_FULL.length));
}

export function sinSufijoFull(codigo) {
  return tieneSufijoFull(codigo) ? codigo.slice(0, -SUFIJO_FULL.length) : (codigo ?? "");
}

// Cómo debe llamarse el folio de esta maniobra. "" si no tiene folio.
//
// tipo_servicio === "full" explícito, NO esServicioFull(): esa función cae a la
// heurística del contenedor largo cuando el campo viene vacío, y con ella tocar
// un registro viejo renombraría su folio sin que nadie haya pulsado Full.
// Deseleccionar el tipo de servicio también retira el sufijo: es justo el clic
// equivocado del que hay que poder volver.
export function codigoFolioFull({ folio, folio_2, tipo_servicio } = {}) {
  if (!folio) return "";
  const base = sinSufijoFull(folio);
  return tipo_servicio === "full" && !folio_2 ? base + SUFIJO_FULL : base;
}
