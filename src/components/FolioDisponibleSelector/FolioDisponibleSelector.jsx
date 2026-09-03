import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./FolioDisponibleSelector.css";

/**
 * FolioDisponibleSelector
 * Los 5 siguientes folios LIBRES de la tabla que toca (Manzanillo o Lázaro).
 * "Libre" = ningún registro de maniobras lo tiene asignado; lo decide el backend
 * en GET /folios/disponibles/.
 *
 * No confundir con FolioSelector (components/FolioSelector), que lista maniobras
 * recientes para autollenar documentos: eso es otra cosa.
 *
 * Props:
 *   tabla         "manzanillo" | "lazaro" | null — la dicta la plaza del viaje
 *   currentValue  string   — folio ya asignado (se muestra aunque no esté en la lista)
 *   onSelect      function — recibe el código elegido
 *   disabled      boolean
 */
export default function FolioDisponibleSelector({ tabla, currentValue, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [folios, setFolios] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

  // Portal con position: fixed para que el overflow de la tabla no lo recorte
  // (mismo patrón que CiudadSelector, que vive en la celda de al lado).
  const actualizarCoords = () => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (open) actualizarCoords();
  }, [open]);

  // apiClient.get, NO getCatalogo: el caché de 45s serviría folios que otro
  // usuario ya tomó. Aquí "libre" tiene que significar libre AHORA.
  useEffect(() => {
    if (!open || !tabla) return;
    setCargando(true);
    setError(null);
    apiClient.get(`/folios/disponibles/?tabla=${tabla}`)
      .then((res) => setFolios(Array.isArray(res) ? res : (res?.results ?? [])))
      .catch(() => setError("Error al cargar folios"))
      .finally(() => setCargando(false));
  }, [open, tabla]);

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

  const handleSelect = (codigo) => {
    setOpen(false);
    onSelect(codigo === currentValue ? "" : codigo);   // reelegir = liberar el folio
  };

  const etiqueta = currentValue || (tabla ? "— Elegir folio —" : "Elige origen o destino");

  return (
    <div className="fds-container" ref={containerRef}>
      <button
        type="button"
        className={`fds-trigger ${currentValue ? "" : "fds-trigger--empty"}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={disabled || !tabla}
        title={tabla ? undefined : "La plaza de origen (o destino) decide la tabla de folios"}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{etiqueta}</span>
        <span className="fds-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && coords && createPortal(
        <ul
          className="fds-dropdown"
          role="listbox"
          ref={dropRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {/* Quitar el folio asignado. Hace falta una fila propia porque el folio
              que ya tiene la maniobra NUNCA sale en /folios/disponibles/ (está
              usado, por definición), así que el "reelegir = liberar" de abajo no
              tiene dónde pulsarse. Va fuera de los estados de carga: liberar no
              necesita la lista, y así se puede soltar el folio aunque la
              petición falle. */}
          {currentValue && (
            <>
              <li
                role="option"
                aria-selected={false}
                className="fds-option fds-option--quitar"
                onClick={(e) => { e.stopPropagation(); handleSelect(""); }}
              >
                <span>Quitar folio</span>
                <span className="fds-codigo">{currentValue}</span>
              </li>
              <li role="presentation" className="fds-separador" />
            </>
          )}

          {cargando && <li className="fds-state">Cargando…</li>}
          {error && <li className="fds-state fds-state--error">{error}</li>}
          {!cargando && !error && folios.length === 0 && (
            <li className="fds-state">No quedan folios libres. Ve a Folios para añadir.</li>
          )}
          {!cargando && !error && folios.map((f) => (
            <li
              key={f.id}
              role="option"
              aria-selected={f.codigo === currentValue}
              className={`fds-option ${f.codigo === currentValue ? "fds-option--selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleSelect(f.codigo); }}
            >
              <span className="fds-codigo">{f.codigo}</span>
              {f.asignacion && <span className="fds-asignacion">{f.asignacion}</span>}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
