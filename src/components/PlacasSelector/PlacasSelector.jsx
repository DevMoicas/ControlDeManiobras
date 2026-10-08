import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./PlacasSelector.css";

export default function PlacasSelector({ currentValue, onSelect, disabled, transportista, todas }) {
  // todas → tractos propios + unidades de TODOS los terceros (para placas_pis).
  // Transportista tercero (≠ FRABA CONTAINER) → solo sus unidades.
  // propio/sin transportista → tractos internos.
  const esTercero = transportista && transportista.trim().toUpperCase() !== "FRABA CONTAINER";
  const [open, setOpen] = useState(false);
  const [tractos, setTractos] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

  // Portal con position: fixed para que el overflow de la tabla no recorte la
  // lista (mismo patrón que PendientePagadoSelector).
  const actualizarCoords = () => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (open) actualizarCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setErrorList(null);
    const arr = (res) => (Array.isArray(res) ? res : (res?.results ?? []));
    const peticion = todas
      ? Promise.all([apiClient.getCatalogo("/tractos/"), apiClient.getCatalogo("/unidades-terceros/")])
          .then(([t, u]) => [...arr(t), ...arr(u).map((x) => ({ id: x.id, placas: x.placas, transportista: x.transportista }))])
      : apiClient.getCatalogo(esTercero
            ? `/unidades-terceros/?transportista=${encodeURIComponent(transportista)}`
            : "/tractos/")
          .then((res) => (esTercero ? arr(res).map((x) => ({ id: x.id, placas: x.placas, transportista: x.transportista })) : arr(res)));
    peticion
      .then(setTractos)
      .catch(() => setErrorList("Error al cargar unidades"))
      .finally(() => setLoadingList(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transportista, todas]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const keyHandler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const reposicionar = () => actualizarCoords();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [open]);

  const handleSelect = (tracto) => {
    setOpen(false);
    // Retrocompatible: 1er arg = placas (string), 2º arg = tracto completo
    // reelegir la misma = deseleccionar
    onSelect(tracto.placas === currentValue ? "" : tracto.placas, tracto);
  };

  return (
    <div className="ps-container" ref={containerRef}>
      <button
        type="button"
        className={`ps-trigger ${currentValue ? "" : "ps-trigger--empty"}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentValue || "— Seleccionar —"}</span>
        <span className="ps-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && coords && createPortal(
        <ul
          ref={dropRef}
          className="ps-dropdown"
          style={{ top: coords.top, left: coords.left }}
          role="listbox"
        >
          {loadingList && <li className="ps-state">Cargando...</li>}
          {errorList && <li className="ps-state ps-state--error">{errorList}</li>}
          {!loadingList && !errorList && tractos.length === 0 && (
            <li className="ps-state">No hay tractos registrados</li>
          )}
          {!loadingList && !errorList && tractos.map((t) => (
            <li
              key={`${t.no_eco || "t3"}-${t.id}`}
              role="option"
              aria-selected={t.placas === currentValue}
              className={`ps-option ${t.placas === currentValue ? "ps-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(t); }}
            >
              <span>{t.placas}</span>
              {t.no_eco
                ? <span className="ps-eco">Eco: {t.no_eco}</span>
                : t.transportista && <span className="ps-eco">{t.transportista}</span>}
              {t.placas === currentValue && <span className="ps-check">✓</span>}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
