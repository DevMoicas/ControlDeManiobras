/**
 * StatusBadge.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Badge visual reutilizable para mostrar el status de una Maniobra.
 * No tiene estado ni lógica de red — puramente presentacional.
 *
 * Uso en tabla:
 *   <StatusBadge statusId={maniobra.status} />
 *
 * Uso en dashboard (compacto):
 *   <StatusBadge statusId="activo" size="sm" />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getStatusConfig } from "../config/statusConfig";
import "./StatusBadge.css";

/**
 * @param {Object}  props
 * @param {string}  props.statusId     - Uno de: 'activo' | 'pendiente' | 'quemada' | 'por_salir'
 * @param {'sm'|'md'} [props.size='md'] - Tamaño del badge
 * @param {boolean} [props.showEmoji=false] - Muestra el emoji delante del label
 */
export default function StatusBadge({ statusId, size = "md", showEmoji = false }) {
  const config = getStatusConfig(statusId);

  // Status desconocido — renderiza un fallback neutro sin romper la UI
  if (!config) {
    return (
      <span className="status-badge status-badge--unknown" aria-label="Status desconocido">
        —
      </span>
    );
  }

  return (
    <span
      className={`status-badge status-badge--${size} ${config.badgeClass}`}
      aria-label={`Status: ${config.label}`}
      title={config.label}
    >
      {showEmoji && (
        <span aria-hidden="true" className="status-badge__emoji">
          {config.emoji}
        </span>
      )}
      {config.label}
    </span>
  );
}