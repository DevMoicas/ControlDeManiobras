import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./CiudadSelector.css";

// Selector genérico sobre cualquier catálogo: la prop `endpoint` dice de dónde
// leer y `campo` qué propiedad de cada registro mostrar y guardar.
// Usos: orígenes y destinos (/origenes/, /destinos/ → campo "ciudad", el valor
// por defecto) y el coordinador de Vacíos (/empleados/?cargo=Coordinador →
// "nombre_trabajador"). `campo` tiene default para no tocar los usos anteriores.
export default function CiudadSelector({ endpoint, campo = "ciudad", currentValue, onSelect, disabled, placeholder = "— Asignar —" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [ciudades, setCiudades] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

  // Portal con position: fixed para que el overflow de la tabla no lo recorte.
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
    apiClient.getCatalogo(endpoint)
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
      // Con el portal la lista ya no está dentro de containerRef: excluirla a
      // mano o el mousedown la cerraría antes de que llegara el click.
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

      {open && coords && createPortal(
        <ul
          className="cds-dropdown"
          role="listbox"
          ref={dropRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {loadingList && <li className="cds-state">Cargando…</li>}
          {errorList && <li className="cds-state cds-state--error">{errorList}</li>}
          {!loadingList && !errorList && ciudades.length === 0 && (
            <li className="cds-state">No hay registros. Ve a Catálogos para agregar.</li>
          )}
          {!loadingList && !errorList && ciudades.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c[campo] === currentValue}
              className={`cds-option ${c[campo] === currentValue ? "cds-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(c[campo]); }}
            >
              {c[campo]}
              {c[campo] === currentValue && <span className="cds-check">✓</span>}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
