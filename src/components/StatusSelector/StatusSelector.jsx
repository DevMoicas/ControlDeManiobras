/**
 * StatusSelector.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dropdown inline para cambiar el status de una Maniobra directamente en la tabla.
 *
 * Seguridad / UX:
 *  - Solo emite onSelect con valores validados por statusConfig.
 *  - Cierra al hacer click fuera (useEffect con mousedown).
 *  - Cierra con Escape.
 *  - Muestra spinner mientras la petición está en vuelo (prop `loading`).
 *  - Accesible: role="listbox", aria-expanded, aria-selected.
 *  - No filtra el status actual de la lista (el usuario puede ver cuál es el actual).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { MANIOBRA_STATUSES_LIST, getStatusConfig } from "../../config/statusConfig";
import "./StatusSelector.css";

/**
 * @param {Object}   props
 * @param {string}   props.currentStatus  - Status actual de la maniobra
 * @param {Function} props.onSelect       - Callback(newStatusId: string)
 * @param {boolean}  [props.loading]      - true mientras el PATCH está en vuelo
 */
export default function StatusSelector({ currentStatus, onSelect, loading = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const listboxId = useId(); // id único, seguro para múltiples instancias en la misma tabla

  const currentConfig = getStatusConfig(currentStatus);

  // ── Cierre al click fuera ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Cierre con Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleToggle = useCallback(() => {
    if (!loading) setOpen((prev) => !prev);
  }, [loading]);

  const handleSelect = useCallback((statusId) => {
    setOpen(false);
    if (statusId !== currentStatus) {
      onSelect(statusId);
    }
  }, [currentStatus, onSelect]);

  return (
    <div
      className="status-selector"
      ref={containerRef}
      // Evita que el click en el selector propague y abra el modal de edición
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Botón trigger ───────────────────────────────────────────────── */}
      <button
        type="button"
        className={`status-selector__trigger ${currentConfig?.badgeClass ?? ""} ${loading ? "status-selector__trigger--loading" : ""}`}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={`Cambiar status: ${currentConfig?.label ?? "Sin status"}`}
        disabled={loading}
        title="Cambiar status"
      >
        {loading ? (
          <span className="status-selector__spinner" aria-hidden="true" />
        ) : (
          <>
            <span className="status-selector__dot" aria-hidden="true" />
            <span className="status-selector__label">
              {currentConfig?.label ?? "Sin status"}
            </span>
            <span className="status-selector__chevron" aria-hidden="true">
              {open ? "▲" : "▼"}
            </span>
          </>
        )}
      </button>

      {/* ── Lista de opciones ────────────────────────────────────────────── */}
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Seleccionar status"
          className="status-selector__list"
        >
          {MANIOBRA_STATUSES_LIST.map((config) => {
            const isSelected = config.id === currentStatus;
            return (
              <li
                key={config.id}
                role="option"
                aria-selected={isSelected}
                className={`status-selector__option ${config.badgeClass} ${isSelected ? "status-selector__option--selected" : ""}`}
                onClick={() => handleSelect(config.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(config.id);
                  }
                }}
                tabIndex={0}
              >
                <span className="status-selector__dot" aria-hidden="true" />
                {config.label}
                {isSelected && (
                  <span className="status-selector__check" aria-hidden="true">✓</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}