/**
 * StatusSelector.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dropdown inline para cambiar el status de una Maniobra directamente en la tabla.
 *
 * Multi-selección con tope de 2 (MAX_STATUSES):
 *  - Clic en una opción no seleccionada → la añade (si aún cabe).
 *  - Clic en una opción ya seleccionada → la quita, dejando la otra intacta.
 *  - Al llegar a 2, las opciones restantes se deshabilitan en vez de ignorar el
 *    clic en silencio: así el usuario ve POR QUÉ no puede elegir una tercera.
 *  - Entregado (STATUS_EXCLUSIVO) es la excepción: no se suma, sustituye. Nunca
 *    se deshabilita por el tope y al marcarlo la maniobra se queda solo con él.
 *  - El desplegable NO se cierra al seleccionar: hay que poder elegir el segundo
 *    status (o corregirse) sin reabrirlo. Cierra por clic fuera, Escape o trigger.
 *
 * Seguridad / UX:
 *  - Solo emite onSelect con valores canónicos (joinStatusIds ordena por prioridad).
 *  - Muestra spinner mientras la petición está en vuelo (prop `loading`).
 *  - Accesible: role="listbox", aria-multiselectable, aria-selected, aria-disabled.
 *    useDropdownNav ya salta las opciones con aria-disabled al navegar con flechas,
 *    así que el tope de 2 también se respeta con teclado sin tocar ese hook.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import {
  MANIOBRA_STATUSES_LIST,
  MAX_STATUSES,
  parseStatusValue,
  joinStatusIds,
  alternarStatus,
  STATUS_EXCLUSIVO,
  formatStatusLabel,
  getStatusConfig,
} from "../../config/statusConfig";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./StatusSelector.css";

/**
 * @param {Object}   props
 * @param {string|null} props.currentStatus - Valor crudo: "activo" | "activo,quemada" | null
 * @param {Function} props.onSelect         - Callback(nuevoValor: string|null) — ya canónico
 * @param {boolean}  [props.loading]        - true mientras el PATCH está en vuelo
 */
export default function StatusSelector({ currentStatus, onSelect, loading = false }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const listboxId = useId(); // id único, seguro para múltiples instancias en la misma tabla
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: listRef });

  // El desplegable se renderiza en un portal con position: fixed para que no lo
  // recorte el overflow de la tabla (mismo patrón que VacioStatusSelector).
  // Sin esto, el status de las últimas filas se cortaba y no se podía cambiar.
  const actualizarCoords = () => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (open) actualizarCoords();
  }, [open]);

  const selectedIds = parseStatusValue(currentStatus);
  const isFull = selectedIds.length >= MAX_STATUSES;
  // El trigger se pinta con el color del status que domina (Lázaro > Activo >
  // Quemada > Pendiente), el mismo que pinta la fila. Con 1 status se ve igual
  // que siempre; con 2, los puntos de color revelan cuál es el otro.
  const predominante = getStatusConfig(currentStatus);

  // ── Cierre al click fuera + reposicionado ──────────────────────────────────
  // Ojo: con el portal, la lista YA NO está dentro de containerRef, así que hay
  // que excluirla explícitamente. Si no, el mousedown sobre una opción cerraría
  // el desplegable — y aquí eso importa el doble, porque por diseño NO se cierra
  // al seleccionar (hay que poder elegir el segundo status).
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      if (listRef.current && listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const reposicionar = () => actualizarCoords();
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
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
    // alternarStatus resuelve quitar/añadir, el tope de 2 y la regla del status
    // exclusivo. joinStatusIds ordena por prioridad y devuelve null si queda vacío.
    const valor = joinStatusIds(alternarStatus(selectedIds, statusId));

    // Red de seguridad: si el clic no cambia nada (opción ya deshabilitada por el
    // tope), no se dispara un PATCH que escribiría exactamente lo que ya había.
    if (valor === joinStatusIds(selectedIds)) return;

    onSelect(valor);
    // Ojo: no se cierra el desplegable — el usuario puede querer elegir el segundo.
  }, [selectedIds, onSelect]);

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
        className={`status-selector__trigger ${predominante?.badgeClass ?? "status-selector__trigger--vacio"} ${loading ? "status-selector__trigger--loading" : ""}`}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={`Cambiar status: ${formatStatusLabel(currentStatus)}`}
        disabled={loading}
        title="Cambiar status"
      >
        {loading ? (
          <span className="status-selector__spinner" aria-hidden="true" />
        ) : (
          <>
            {/* Un punto por status seleccionado (1 o 2), en orden de prioridad */}
            <span className="status-selector__dots" aria-hidden="true">
              {selectedIds.length === 0 ? (
                <span className="status-selector__dot status-selector__dot--vacio" />
              ) : (
                selectedIds.map((id) => (
                  <span key={id} className={`status-selector__dot status-selector__dot--${id}`} />
                ))
              )}
            </span>
            <span className="status-selector__label">
              {formatStatusLabel(currentStatus)}
            </span>
            <span className="status-selector__chevron" aria-hidden="true">
              {open ? "▲" : "▼"}
            </span>
          </>
        )}
      </button>

      {/* ── Lista de opciones ────────────────────────────────────────────── */}
      {open && coords && createPortal(
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={`Seleccionar status (máximo ${MAX_STATUSES})`}
          className="status-selector__list"
          style={{ top: coords.top, left: coords.left }}
        >
          {MANIOBRA_STATUSES_LIST.map((config) => {
            const isSelected = selectedIds.includes(config.id);
            // Deshabilitada: ya hay 2 y esta no es una de ellas. Entregado se
            // libra del tope porque sustituye a lo que hubiera en vez de sumarse.
            const isDisabled = isFull && !isSelected && config.id !== STATUS_EXCLUSIVO;
            return (
              <li
                key={config.id}
                role="option"
                aria-selected={isSelected}
                aria-disabled={isDisabled}
                className={`status-selector__option ${config.badgeClass} ${isSelected ? "status-selector__option--selected" : ""} ${isDisabled ? "status-selector__option--disabled" : ""}`}
                title={isDisabled ? `Máximo ${MAX_STATUSES} status: quita uno para elegir otro` : undefined}
                onClick={() => { if (!isDisabled) handleSelect(config.id); }}
                onKeyDown={(e) => {
                  // Enter lo maneja useDropdownNav (vía click) para no duplicar la selección
                  if (e.key === " ") {
                    e.preventDefault();
                    if (!isDisabled) handleSelect(config.id);
                  }
                }}
                tabIndex={isDisabled ? -1 : 0}
              >
                <span className={`status-selector__dot status-selector__dot--${config.id}`} aria-hidden="true" />
                {config.label}
                {isSelected && (
                  <span className="status-selector__check" aria-hidden="true">✓</span>
                )}
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
