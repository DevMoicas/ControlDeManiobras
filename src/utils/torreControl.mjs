// Lógica pura de la torre de control.
//
// Todo trabaja con TEXTOS "AAAA-MM-DD" y "AAAA-MM", nunca con objetos Date
// construidos a partir de esos textos: `new Date("2026-08-21")` es medianoche
// UTC y en México (UTC-6) se pinta como el día 20. Comparando texto con texto,
// el día que guardó el backend es el día que se ve. Los únicos Date que se
// construyen aquí llevan (año, mes, día) por separado, que sí es hora local.

// Dos bolitas por unidad: la VERDE marca el día en que sale y la ROJA el día en
// que vuelve. Copia de BOLITAS_POR_UNIDAD en api/models.py del backend: son dos
// repositorios distintos y un valor que cambia una vez en la vida no justifica
// un endpoint de configuración. Si se cambia aquí, cambiar allí.
export const BOLITAS_POR_UNIDAD = 2;

export const INDICE_INICIO = 1;   // bolita verde
export const INDICE_FIN    = 2;   // bolita roja

/**
 * El primer nombre de un operador: "ANTONIO FRANCO" → "ANTONIO".
 *
 * En la tabla de la torre no cabe el nombre completo y el apellido no distingue
 * nada entre once operadores.
 */
export function primerNombre(nombre) {
  return String(nombre ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * El día local de una fecha-hora del backend: "2026-08-03T08:00:00-06:00" → "2026-08-03".
 *
 * Aquí SÍ se construye un Date a partir del texto, y es correcto: la cadena trae
 * su huso horario explícito, así que Date la sitúa bien y los getters locales
 * devuelven el día del calendario de aquí. La trampa de la que se avisa arriba
 * es otra —parsear un "AAAA-MM-DD" pelado, que se interpreta como UTC—.
 */
export function diaDeFechaHora(fechaHora) {
  if (!fechaHora) return null;
  const d = new Date(fechaHora);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRIMER_NUMERO = /\d+/;

/** El número dentro de un No. Eco: "NO. 01" → 1, "NO.10" → 10. */
export function numeroDeNoEco(noEco) {
  const encontrado = PRIMER_NUMERO.exec(String(noEco ?? ""));
  // Sin número no hay forma de ordenarlo: va al final en vez de mezclarse.
  return encontrado ? Number(encontrado[0]) : Number.POSITIVE_INFINITY;
}

/**
 * Ordena unidades por el NÚMERO de su No. Eco, no por su texto.
 *
 * Los datos reales mezclan "NO. 01" (con espacio y cero) y "NO.10" (sin ellos).
 * Un sort() de texto acierta hoy por casualidad —los números van rellenos con
 * cero— y falla en cuanto alguien teclee "NO.2" junto a "NO.10", que es el
 * formato hacia el que se quería migrar. Comparando números da igual el formato.
 */
export function ordenPorNoEco(unidades) {
  return [...unidades].sort((a, b) => {
    const diferencia = numeroDeNoEco(a.no_eco) - numeroDeNoEco(b.no_eco);
    // Empate (dos sin número, o el mismo número escrito distinto): alfabético,
    // para que el orden no dependa de cómo vinieran en la respuesta.
    return diferencia || String(a.no_eco).localeCompare(String(b.no_eco));
  });
}

/** "2026-08-21" → "2026-08" */
export function mesDe(fecha) {
  return String(fecha).slice(0, 7);
}

/** El mes en curso según el reloj local. */
export function mesHoy(hoy = new Date()) {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

/** El día de hoy en el mismo formato que guarda el backend, en hora local. */
export function fechaHoy(hoy = new Date()) {
  return `${mesHoy(hoy)}-${String(hoy.getDate()).padStart(2, "0")}`;
}

/** "2026-01" con delta -1 → "2025-12". Aritmética de meses sin Date. */
export function desplazarMes(mes, delta) {
  const [anio, numero] = mes.split("-").map(Number);
  const total = anio * 12 + (numero - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Las casillas de la rejilla del mes, empezando en lunes.
 *
 * Devuelve null por cada hueco antes del día 1, y "AAAA-MM-DD" por cada día.
 * La rejilla se pinta con esto tal cual: 7 columnas, 5 o 6 filas.
 */
export function celdasDelMes(mes) {
  const [anio, numero] = mes.split("-").map(Number);
  // getDay() da 0 en domingo; (n + 6) % 7 lo convierte en semana que empieza en lunes.
  const huecos = (new Date(anio, numero - 1, 1).getDay() + 6) % 7;
  // Día 0 del mes siguiente = último día de este. Cubre febrero y los bisiestos.
  const dias = new Date(anio, numero, 0).getDate();

  const celdas = Array(huecos).fill(null);
  for (let dia = 1; dia <= dias; dia++) {
    celdas.push(`${mes}-${String(dia).padStart(2, "0")}`);
  }
  return celdas;
}

/**
 * Las bolitas que se quedaron ocupadas en un mes anterior al que se muestra.
 *
 * Mira CUALQUIER mes anterior y no solo el inmediato: una bolita olvidada en
 * julio tiene que delatarse en septiembre igual que la de agosto, o la unidad
 * queda bloqueada sin que nadie lo sepa.
 */
export function pendientesDeMesesAnteriores(bolitas, mesActual) {
  return bolitas.filter((bolita) => mesDe(bolita.fecha) < mesActual);
}

/**
 * Hasta dónde puede retroceder la flecha: el mes de la bolita ocupada más
 * antigua, y ni uno más. Sin bolitas pendientes, no hay hacia dónde ir atrás.
 *
 * El límite es un dato y no un número fijo de meses a propósito: con un tope de
 * "un mes atrás", una bolita de julio sería inalcanzable en septiembre —ni en
 * UNIDADES LIBRES, porque sigue ocupada, ni en ninguna pantalla— y su unidad
 * quedaría bloqueada para siempre.
 */
export function mesMinimoNavegable(bolitas, mesActual) {
  return bolitas.reduce(
    (minimo, bolita) => (mesDe(bolita.fecha) < minimo ? mesDe(bolita.fecha) : minimo),
    mesActual,
  );
}
