import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./PatioSelector.css";

export default function PatioSelector({ currentValue, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [patios, setPatios] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setErrorList(null);
    apiClient.get("/patios/")
      .then((res) => {
        const lista = Array.isArray(res) ? res : (res?.results ?? []);
        setPatios(lista);
      })
      .catch(() => setErrorList("Error al cargar patios"))
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

  const handleSelect = (nombre) => {
    setOpen(false);
    onSelect(nombre);
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
        <span>{currentValue || "— Asignar —"}</span>
        <span className="ps-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <ul className="ps-dropdown" role="listbox">
          {loadingList && (
            <li className="ps-state">Cargando…</li>
          )}
          {errorList && (
            <li className="ps-state ps-state--error">{errorList}</li>
          )}
          {!loadingList && !errorList && patios.length === 0 && (
            <li className="ps-state">
              No hay patios registrados. Ve a No. Eco → Patios para agregar.
            </li>
          )}
          {!loadingList && !errorList && patios.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.nombre === currentValue}
              className={`ps-option ${p.nombre === currentValue ? "ps-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(p.nombre); }}
            >
              {p.nombre}
              {p.nombre === currentValue && <span className="ps-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
