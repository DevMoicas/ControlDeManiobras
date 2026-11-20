// Escalera de recompresión para las imágenes pegadas con Ctrl+V. Aquí vive solo
// la parte pura —la aritmética de cada intento— porque <canvas> no existe en
// Node y esto es lo único que se puede probar con node:test. El dibujado real
// está en FotoModal.jsx.
//
// Orden a propósito: primero se baja calidad, que casi no se nota y recorta
// mucho peso; solo cuando la calidad toca suelo se empieza a reducir el tamaño,
// que sí destruye información (un pantallazo de texto se vuelve ilegible).

export const INICIAL  = { escala: 1, calidad: 0.85 };
export const INTENTOS = 5;

const CALIDAD_SUELO = 0.5;

export function siguienteIntento({ escala, calidad }) {
  if (calidad > CALIDAD_SUELO) {
    return { escala, calidad: Math.max(CALIDAD_SUELO, calidad - 0.15) };
  }
  // Calidad agotada: se encoge y se recupera algo de calidad, que sobre menos
  // píxeles ya cuesta poco.
  return { escala: escala * 0.75, calidad: 0.7 };
}

// Un canvas de 0 px lanza, así que el mínimo es 1.
export function medidas(ancho, alto, escala) {
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto:  Math.max(1, Math.round(alto  * escala)),
  };
}
