/**
 * statusConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fuente única de verdad para los status de Maniobra.
 * Importa desde aquí en ManiobrasPage, Dashboard, StatusBadge, etc.
 *
 * Uso:
 *   import { STATUS_MAP, MANIOBRA_STATUSES_LIST, getStatusConfig } from './statusConfig';
 *
 * Nunca uses strings literales de status fuera de este archivo.
 *
 * ── Multi-status ────────────────────────────────────────────────────────────
 * Una maniobra puede tener HASTA 2 status a la vez. El backend los guarda en un
 * solo campo separados por coma ("activo,quemada"), siempre en orden de PRIORIDAD
 * descendente — nunca en el orden en que el usuario los eligió.
 *
 * Ese orden canónico es lo que hace que todo lo demás sea trivial:
 *   · El primer segmento es SIEMPRE el color que gana en la fila.
 *   · El backend rechaza un combo mal ordenado por sí solo (no es un choice válido),
 *     sin que nadie tenga que validar el orden a mano.
 *
 * Por eso `joinStatusIds` ordena antes de unir: es la única puerta de salida hacia
 * el backend, y garantiza la forma canónica venga como venga la selección.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** @typedef {'activo' | 'pendiente' | 'quemada' | 'cancelado' | 'por_salir' | 'entregado'} ManiobraStatus */

/**
 * Valor tal y como viaja//se guarda: un id, dos ids separados por coma, o null.
 * @typedef {string | null} StatusValue
 */

/**
 * @typedef {Object} StatusConfig
 * @property {ManiobraStatus} id       - Valor que se envía al backend (snake_case)
 * @property {string}  label           - Texto visible para el usuario
 * @property {string}  rowClass        - Clase CSS aplicada a la <tr> de la tabla
 * @property {string}  badgeClass      - Clase CSS aplicada al <StatusBadge>
 * @property {string}  color           - Color hex principal (para uso directo si necesario)
 * @property {string}  emoji           - Ícono semántico para lectores de pantalla / tooltips
 */

/** @type {Record<ManiobraStatus, StatusConfig>} */
export const STATUS_MAP = Object.freeze({
  activo: Object.freeze({
    id:         "activo",
    label:      "Activo / En viaje",
    rowClass:   "row-status--activo",
    badgeClass: "badge-status--activo",
    color:      "#c6e5b1",
    emoji:      "🟢",
  }),
  pendiente: Object.freeze({
    id:         "pendiente",
    label:      "Pendiente",
    rowClass:   "row-status--pendiente",
    badgeClass: "badge-status--pendiente",
    color:      "#96c6e0",
    emoji:      "🔵",
  }),
  quemada: Object.freeze({
    // El id NO cambia: es lo que hay guardado en `maniobras.status` de todo el
    // historico y lo que valida STATUS_CHOICES en el backend. Aqui solo se
    // cambia lo que se LEE.
    id:         "quemada",
    label:      "Quemada/En falso",
    rowClass:   "row-status--quemada",
    badgeClass: "badge-status--quemada",
    color:      "#ff6961",
    emoji:      "🔴",
  }),
  // Mismo color que QUEMADA a propósito (usuario, 2026-08-26): los dos son finales
  // de viaje que no salieron bien y en la fila se leen igual. Son status distintos
  // —se filtran por separado— pero comparten lectura visual.
  cancelado: Object.freeze({
    id:         "cancelado",
    label:      "Cancelado",
    rowClass:   "row-status--cancelado",
    badgeClass: "badge-status--cancelado",
    color:      "#ff6961",
    emoji:      "🔴",
  }),
  por_salir: Object.freeze({
    id:         "por_salir",
    label:      "Lázaro",
    rowClass:   "row-status--por-salir",
    badgeClass: "badge-status--por-salir",
    color:      "#c7b0d4",
    emoji:      "🟣",
  }),
  // Entregado NO pinta la fila: `rowClass` va vacia a proposito para que la <tr>
  // se quede con el color por defecto de la tabla, sin una regla CSS que lo
  // repinte de blanco. Es ademas el unico status EXCLUSIVO (ver STATUS_EXCLUSIVO).
  entregado: Object.freeze({
    id:         "entregado",
    label:      "Entregado",
    rowClass:   "",
    badgeClass: "badge-status--entregado",
    color:      "#ffffff",
    emoji:      "⚪",
  }),
});

/**
 * Lista ordenada de configs — útil para renderizar <select> / <ul> de opciones.
 * @type {ReadonlyArray<StatusConfig>}
 */
export const MANIOBRA_STATUSES_LIST = Object.freeze(Object.values(STATUS_MAP));

/** Máximo de status simultáneos por maniobra. */
export const MAX_STATUSES = 2;

/**
 * Jerarquía de color: cuando hay 2 status, el de más arriba es el que pinta la fila.
 * Lázaro (por_salir) siempre domina; si no está, domina Activo.
 * Debe coincidir con el orden de los combos en STATUS_CHOICES del backend (models.py).
 * @type {ReadonlyArray<ManiobraStatus>}
 */
export const PRIORITY_ORDER = Object.freeze([
  "por_salir",  // Lázaro — gana siempre
  "activo",
  "quemada",
  "cancelado",  // pegado a Quemada: comparten color, así que el orden entre
                // los dos no cambia lo que se ve, solo fija la forma canónica
  "pendiente",
  // Entregado nunca comparte fila con otro status, asi que su sitio aqui no
  // decide ningun color. Esta igualmente porque parseStatusValue/joinStatusIds
  // consultan indexOf(): sin el daria -1 y lo ordenaria por delante de todos.
  "entregado",
]);

/**
 * Convierte el valor crudo del backend en una lista de ids válidos.
 * Tolerante a basura: descarta ids desconocidos y recorta a MAX_STATUSES.
 *
 * @param {StatusValue | undefined} raw  - "activo" | "activo,quemada" | null
 * @returns {ManiobraStatus[]} 0, 1 o 2 ids válidos
 */
export function parseStatusValue(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => isValidStatus(id))
    .slice(0, MAX_STATUSES);
}

/**
 * Convierte una lista de ids en el valor canónico que espera el backend:
 * ordenado por prioridad y unido por coma. Es la ÚNICA puerta de salida.
 *
 * @param {ManiobraStatus[]} ids
 * @returns {StatusValue} "por_salir,activo" | "activo" | null (si va vacío)
 */
export function joinStatusIds(ids) {
  const limpios = [...new Set(ids)].filter((id) => isValidStatus(id));
  if (limpios.length === 0) return null;
  return limpios
    .sort((a, b) => PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b))
    .slice(0, MAX_STATUSES)
    .join(",");
}

/**
 * El unico status que no admite compañero: marcarlo deja la maniobra solo con
 * el, y marcar cualquier otro estando puesto lo sustituye. Por eso `entregado`
 * no tiene combos en STATUS_CHOICES (backend/models.py): "entregado,activo" no
 * es un choice valido, asi que el propio backend rechaza la combinacion con un
 * 400 aunque alguien la mandara saltandose el selector.
 * @type {ManiobraStatus}
 */
export const STATUS_EXCLUSIVO = "entregado";

/**
 * Nueva seleccion tras hacer clic en `id`, con la regla del status exclusivo.
 * Pura: es la logica del selector, aqui para poder probarla sin React.
 *
 *   ya estaba          -> se quita
 *   es el exclusivo    -> se queda solo el
 *   habia el exclusivo -> lo sustituye
 *   ninguno            -> se añade si cabe (tope MAX_STATUSES)
 *
 * @param {ManiobraStatus[]} seleccionados
 * @param {ManiobraStatus} id
 * @returns {ManiobraStatus[]}
 */
export function alternarStatus(seleccionados, id) {
  if (seleccionados.includes(id)) return seleccionados.filter((s) => s !== id);
  if (id === STATUS_EXCLUSIVO) return [id];
  const resto = seleccionados.filter((s) => s !== STATUS_EXCLUSIVO);
  return resto.length >= MAX_STATUSES ? resto : [...resto, id];
}

/**
 * El status que manda visualmente: el de mayor prioridad de los seleccionados.
 *
 * @param {StatusValue | undefined} raw
 * @returns {ManiobraStatus | null}
 */
export function getPredominantStatusId(raw) {
  const ids = parseStatusValue(raw);
  if (ids.length === 0) return null;
  // No asumimos que venga ordenado: lo resolvemos por prioridad igualmente.
  return ids.reduce((mejor, id) =>
    PRIORITY_ORDER.indexOf(id) < PRIORITY_ORDER.indexOf(mejor) ? id : mejor
  );
}

/**
 * Devuelve la config del status PREDOMINANTE de un valor (simple o combo).
 * Si el id no existe, retorna `null` sin lanzar excepción.
 *
 * Acepta tanto "activo" como "por_salir,activo" — de ahí que las filas de la tabla
 * (que hacen getStatusConfig(m.status)?.rowClass) sigan pintando un único color,
 * el del status de mayor prioridad, sin que ellas sepan nada de combos.
 *
 * @param {StatusValue | undefined} raw
 * @returns {StatusConfig | null}
 */
export function getStatusConfig(raw) {
  const id = getPredominantStatusId(raw);
  return id ? STATUS_MAP[id] : null;
}

/**
 * Valida que un string sea UN status conocido (un solo id, sin combos).
 * Útil para validar cada pieza suelta.
 *
 * @param {string} statusId
 * @returns {boolean}
 */
export function isValidStatus(statusId) {
  return Object.prototype.hasOwnProperty.call(STATUS_MAP, statusId);
}

/**
 * ¿Este valor tiene al menos un status?
 *
 * Cuidado: NO uses isValidStatus() para esto. Un combo como "activo,quemada" no es
 * una key de STATUS_MAP, así que isValidStatus() lo daría por falso y lo trataría
 * como "sin status" — que es justo lo contrario de la verdad.
 *
 * @param {StatusValue | undefined} raw
 * @returns {boolean}
 */
export function hasAnyStatus(raw) {
  return parseStatusValue(raw).length > 0;
}

/**
 * Valida el valor COMPLETO que se va a mandar al backend en el PATCH.
 * Acepta null (limpiar), un id, o dos ids válidos y distintos.
 *
 * @param {StatusValue | undefined} raw
 * @returns {boolean}
 */
export function isValidStatusValue(raw) {
  if (raw == null) return true; // limpiar el status es válido
  if (typeof raw !== "string") return false;

  const piezas = raw.split(",").map((id) => id.trim());
  if (piezas.length === 0 || piezas.length > MAX_STATUSES) return false;
  if (new Set(piezas).size !== piezas.length) return false; // sin duplicados
  return piezas.every((id) => isValidStatus(id));
}

/**
 * Texto del selector: "Activo / En viaje" o "Lázaro + Quemada".
 *
 * @param {StatusValue | undefined} raw
 * @returns {string}
 */
export function formatStatusLabel(raw) {
  const ids = parseStatusValue(raw);
  if (ids.length === 0) return "Sin status";
  return ids
    .sort((a, b) => PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b))
    .map((id) => STATUS_MAP[id].label)
    .join(" + ");
}
