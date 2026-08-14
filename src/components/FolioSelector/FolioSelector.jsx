import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./FolioSelector.css";

/**
 * FolioSelector
 * Muestra los últimos 30 folios de maniobras (con folio no vacío).
 * Al seleccionar, llama a onSelect(maniobraCompleta) con el objeto completo.
 *
 * Props:
 *   currentValue  string   — folio actualmente seleccionado (para mostrar en botón)
 *   onSelect      function — callback recibe el objeto maniobra completo
 *   disabled      boolean  — deshabilita el selector
 */
export default function FolioSelector({ currentValue, onSelect, disabled }) {
  const [abierto, setAbierto]     = useState(false);
  const [folios,  setFolios]      = useState([]);
  const [cargando, setCargando]   = useState(false);
  const [error,   setError]       = useState(null);
  const [coords,  setCoords]      = useState(null);
  const ref = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto, setAbierto, wrapperRef: ref, dropdownRef: dropRef });

  // El desplegable va en un portal con position: fixed para que no lo recorte el
  // overflow de la tabla ni lo tapen las filas de abajo (mismo patrón que
  // OperadorSelector y los demás selectores).
  const actualizarCoords = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (abierto) actualizarCoords();
  }, [abierto]);

  // Cargar folios al abrir el dropdown
  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setError(null);
    apiClient
      .getCatalogo("/maniobras/folios-recientes/")
      .then((data) => setFolios(data || []))
      .catch(() => setError("Error al cargar folios"))
      .finally(() => setCargando(false));
  }, [abierto]);

  // Cerrar con Escape o clic fuera
  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    // El dropdown ya no está dentro del wrapper (vive en el portal), así que hay
    // que exceptuarlo aparte: si no, el mousedown lo cerraría antes de que el
    // click llegara a la opción y no se podría elegir folio.
    const handleClick = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      setAbierto(false);
    };
    const reposicionar = () => actualizarCoords();
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [abierto]);

  const handleSeleccionar = (maniobra) => {
    onSelect(maniobra);
    setAbierto(false);
  };

  return (
    <div className="fsl-wrapper" ref={ref}>
      <button
        type="button"
        className="fsl-btn"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
      >
        {currentValue || "— Seleccionar folio —"}
      </button>

      {abierto && coords && createPortal(
        <div className="fsl-dropdown" ref={dropRef} style={{ top: coords.top, left: coords.left }}>
          {cargando && <div className="fsl-msg">Cargando...</div>}
          {error && <div className="fsl-msg fsl-error">{error}</div>}
          {!cargando && !error && folios.length === 0 && (
            <div className="fsl-msg">Sin folios registrados</div>
          )}
          {folios.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`fsl-item ${m.folio === currentValue ? "fsl-item--selected" : ""}`}
              onClick={() => handleSeleccionar(m)}
            >
              <span className="fsl-folio">{m.folio}</span>
              {m.origen && m.destino && (
                <span className="fsl-ruta">{m.origen} → {m.destino}</span>
              )}
              {m.operador && <span className="fsl-ruta">{m.operador}</span>}
              {m.cliente_nombre && <span className="fsl-ruta">{m.cliente_nombre}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
