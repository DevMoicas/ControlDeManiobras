import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./PlacasSelector.css";

export default function PlacasSelector({ currentValue, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [tractos, setTractos] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setErrorList(null);
    apiClient.get("/tractos/")
      .then((res) => {
        const lista = Array.isArray(res) ? res : (res?.results ?? []);
        setTractos(lista);
      })
      .catch(() => setErrorList("Error al cargar tractos"))
      .finally(() => setLoadingList(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const keyHandler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  const handleSelect = (placas) => {
    setOpen(false);
    onSelect(placas);
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

      {open && (
        <ul className="ps-dropdown" role="listbox">
          {loadingList && <li className="ps-state">Cargando...</li>}
          {errorList && <li className="ps-state ps-state--error">{errorList}</li>}
          {!loadingList && !errorList && tractos.length === 0 && (
            <li className="ps-state">No hay tractos registrados</li>
          )}
          {!loadingList && !errorList && tractos.map((t) => (
            <li
              key={t.id}
              role="option"
              aria-selected={t.placas === currentValue}
              className={`ps-option ${t.placas === currentValue ? "ps-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(t.placas); }}
            >
              <span>{t.placas}</span>
              <span className="ps-eco">Eco: {t.no_eco}</span>
              {t.placas === currentValue && <span className="ps-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
