import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./PatioSelector.css";

export default function PatioSelector({ currentValue, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [patios, setPatios] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

  // El desplegable se renderiza en un portal con position: fixed para que no lo
  // recorte el overflow de la tabla (mismo patrón que VacioStatusSelector).
  // Sin esto, el patio de las últimas filas se cortaba y no se podía asignar.
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
    apiClient.getCatalogo("/patios/")
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
      // Con el portal la lista ya NO está dentro de containerRef: hay que
      // excluirla a mano. Si no, el mousedown sobre una opción cerraría el
      // desplegable antes de que llegara el click y la selección se perdería.
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

  const handleSelect = (nombre) => {
    setOpen(false);
    onSelect(nombre === currentValue ? "" : nombre);   // reelegir = deseleccionar
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

      {open && coords && createPortal(
        <ul
          className="ps-dropdown"
          role="listbox"
          ref={dropRef}
          style={{ top: coords.top, left: coords.left }}
        >
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
        </ul>,
        document.body
      )}
    </div>
  );
}
