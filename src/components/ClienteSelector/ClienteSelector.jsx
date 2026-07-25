import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./ClienteSelector.css";

/**
 * ClienteSelector
 * Lista todos los clientes registrados. Al seleccionar, llama a onSelect(clienteCompleto).
 *
 * Props:
 *   currentValue  string   — nombre del cliente actualmente seleccionado
 *   onSelect      function — callback recibe el objeto cliente completo
 *   disabled      boolean
 */
export default function ClienteSelector({ currentValue, onSelect, disabled }) {
  const [abierto,  setAbierto]  = useState(false);
  const [coords,   setCoords]   = useState(null);
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error,    setError]    = useState(null);
  const ref = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto, setAbierto, wrapperRef: ref, dropdownRef: dropRef });

  // Portal con position: fixed para que el overflow de la tabla no lo recorte.
  const actualizarCoords = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (abierto) actualizarCoords();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setError(null);
    apiClient
      .getCatalogo("/clientes/")
      .then((data) => setClientes(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => setError("Error al cargar clientes"))
      .finally(() => setCargando(false));
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    const handleClick = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      // Con el portal la lista ya no está dentro de ref: excluirla a mano o el
      // mousedown la cerraría antes de que llegara el click.
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

  const handleSeleccionar = (cliente) => {
    // reelegir el mismo = deseleccionar (objeto vacío para limpiar todos los campos)
    const vacio = { nombre_cliente: "", domicilio: "", colonia: "", ciudad: "" };
    onSelect(cliente.nombre_cliente === currentValue ? vacio : cliente);
    setAbierto(false);
  };

  return (
    <div className="csl-wrapper" ref={ref}>
      <button
        type="button"
        className="csl-btn"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
      >
        {currentValue || "— Seleccionar cliente —"}
      </button>

      {abierto && coords && createPortal(
        <div
          className="csl-dropdown"
          ref={dropRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {cargando && <div className="csl-msg">Cargando...</div>}
          {error && <div className="csl-msg csl-error">{error}</div>}
          {!cargando && !error && clientes.length === 0 && (
            <div className="csl-msg">Sin clientes registrados</div>
          )}
          {clientes.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`csl-item ${c.nombre_cliente === currentValue ? "csl-item--selected" : ""}`}
              onClick={() => handleSeleccionar(c)}
            >
              <span className="csl-nombre">{c.nombre_cliente}</span>
              {c.ciudad && <span className="csl-ciudad">{c.ciudad}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
