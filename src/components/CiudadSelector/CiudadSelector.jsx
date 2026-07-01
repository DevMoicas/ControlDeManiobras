import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../api/apiClient";
import "./CiudadSelector.css";

// Selector genérico de ciudades para catálogos cuyo registro tiene { id, ciudad }.
// Reutilizado para orígenes (/origenes/) y destinos (/destinos/) vía la prop endpoint.
export default function CiudadSelector({ endpoint, currentValue, onSelect, disabled, placeholder = "— Asignar —" }) {
  const [open, setOpen] = useState(false);
  const [ciudades, setCiudades] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setErrorList(null);
    apiClient.get(endpoint)
      .then((res) => {
        const lista = Array.isArray(res) ? res : (res?.results ?? []);
        setCiudades(lista);
      })
      .catch(() => setErrorList("Error al cargar registros"))
      .finally(() => setLoadingList(false));
  }, [open, endpoint]);

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

  const handleSelect = (ciudad) => {
    setOpen(false);
    onSelect(ciudad === currentValue ? "" : ciudad);   // reelegir = deseleccionar
  };

  return (
    <div className="cds-container" ref={containerRef}>
      <button
        type="button"
        className={`cds-trigger ${currentValue ? "" : "cds-trigger--empty"}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentValue || placeholder}</span>
        <span className="cds-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <ul className="cds-dropdown" role="listbox">
          {loadingList && <li className="cds-state">Cargando…</li>}
          {errorList && <li className="cds-state cds-state--error">{errorList}</li>}
          {!loadingList && !errorList && ciudades.length === 0 && (
            <li className="cds-state">No hay registros. Ve a Catálogos para agregar.</li>
          )}
          {!loadingList && !errorList && ciudades.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.ciudad === currentValue}
              className={`cds-option ${c.ciudad === currentValue ? "cds-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(c.ciudad); }}
            >
              {c.ciudad}
              {c.ciudad === currentValue && <span className="cds-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
