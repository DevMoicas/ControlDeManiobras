// ¿Hace falta la barra espejo? Solo cuando la nativa está fuera de alcance:
// la tabla desborda a lo ancho, se ve algo de ella en pantalla, y su borde
// inferior —donde el navegador pinta la barra nativa— cae bajo el pliegue.
//
// El +1 en el ancho absorbe los subpíxeles del zoom del navegador: sin él, una
// tabla que cabe justo se declara desbordada y saca una barra que no mueve nada.
//
// Aparte de decidir, esta condición se excluye a sí misma entre tablas
// apiladas: si el pie de una queda bajo el pliegue, la de debajo empieza fuera
// de la pantalla (top >= alto) y la de encima ya enseña la suya (bottom <=
// alto). Por eso una página con varias tablas nunca acumula barras.
export function haceFaltaBarra({ scrollWidth, clientWidth, top, bottom, alto }) {
  return scrollWidth > clientWidth + 1 && top < alto && bottom > alto;
}
