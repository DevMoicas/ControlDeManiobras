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
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** @typedef {'activo' | 'pendiente' | 'quemada' | 'por_salir'} ManiobraStatus */

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
    color:      "#64f198",
    emoji:      "🟢",
  }),
  pendiente: Object.freeze({
    id:         "pendiente",
    label:      "Pendiente",
    rowClass:   "row-status--pendiente",
    badgeClass: "badge-status--pendiente",
    color:      "#6c98f7",
    emoji:      "🔵",
  }),
  quemada: Object.freeze({
    id:         "quemada",
    label:      "Quemada",
    rowClass:   "row-status--quemada",
    badgeClass: "badge-status--quemada",
    color:      "#f35c5c",
    emoji:      "🔴",
  }),
  por_salir: Object.freeze({
    id:         "por_salir",
    label:      "Por salir",
    rowClass:   "row-status--por-salir",
    badgeClass: "badge-status--por-salir",
    color:      "#a782e7",
    emoji:      "🟣",
  }),
});

/**
 * Lista ordenada de configs — útil para renderizar <select> / <ul> de opciones.
 * @type {ReadonlyArray<StatusConfig>}
 */
export const MANIOBRA_STATUSES_LIST = Object.freeze(Object.values(STATUS_MAP));

/**
 * Devuelve la config de un status dado.
 * Si el id no existe, retorna `null` sin lanzar excepción.
 *
 * @param {string | null | undefined} statusId
 * @returns {StatusConfig | null}
 */
export function getStatusConfig(statusId) {
  if (!statusId || typeof statusId !== "string") return null;
  return STATUS_MAP[statusId] ?? null;
}

/**
 * Valida que un string sea un status conocido.
 * Útil antes de enviar al backend.
 *
 * @param {string} statusId
 * @returns {boolean}
 */
export function isValidStatus(statusId) {
  return Object.prototype.hasOwnProperty.call(STATUS_MAP, statusId);
}