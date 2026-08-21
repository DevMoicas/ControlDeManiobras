// Color de relleno de una fila de Maniobras, elegido a mano como en una hoja
// de cálculo. Manda sobre el color que pinta el status; sin color, la fila
// vuelve sola a lo que diga su status.

/**
 * La paleta estándar de Google Sheets, tal cual.
 *
 * Ocho filas de diez: la de grises, la de colores puros y seis de tintes y
 * sombras. Es una tabla de datos, no lógica — está aquí y no en el componente
 * para que el orden de la rejilla sea evidente de un vistazo.
 */
export const PALETA_SHEETS = Object.freeze([
  ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"],
  ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"],
  ["#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc"],
  ["#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
  ["#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"],
  ["#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79"],
  ["#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"],
  ["#5b0f00", "#660000", "#783f04", "#7f6000", "#274e13", "#0c343d", "#1c4587", "#073763", "#20124d", "#4c1130"],
]);

/** Texto oscuro del sistema, el que ya usan las filas sin pintar. */
export const TEXTO_OSCURO = "#1f2937";
export const TEXTO_CLARO  = "#ffffff";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Solo "#rrggbb". Espeja la validación del serializer.
 *
 * Vale la pena tenerla también aquí: si un valor raro llegara a la tabla —de una
 * fila guardada antes de la validación, por ejemplo— la fila se pinta sin color
 * en vez de meter basura en el CSS.
 */
export function esColorValido(valor) {
  return typeof valor === "string" && HEX.test(valor);
}

/**
 * Luminancia relativa (WCAG): canales sRGB linealizados y ponderados.
 *
 * Se usa esta y no la media rápida de YIQ porque el ojo no pesa igual los tres
 * canales: un amarillo puro (#ffff00) y un azul puro (#0000ff) tienen una media
 * parecida y una luminancia opuesta. Con la media, el azul se llevaría texto
 * oscuro y sería ilegible.
 */
export function luminancia(hex) {
  const canales = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

/**
 * Qué color de texto se lee sobre ese relleno.
 *
 * La paleta de Sheets llega hasta el negro, así que sin esto las tres filas de
 * sombras dejarían la maniobra ilegible: texto oscuro sobre fondo oscuro. El
 * umbral 0.4 es donde el contraste con el texto oscuro del sistema deja de
 * cumplir 4.5:1.
 */
export function textoSobre(hex) {
  if (!esColorValido(hex)) return TEXTO_OSCURO;
  return luminancia(hex) > 0.4 ? TEXTO_OSCURO : TEXTO_CLARO;
}
