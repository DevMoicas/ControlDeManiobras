import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./TipoServicioSelector.css";

// Tipo de servicio de la maniobra. Lo elige el usuario: ya NO se infiere del
// largo del contenedor ni del texto "CARGA SUELTA". Los ids deben coincidir con
// Maniobra.TIPO_SERVICIO_CHOICES del backend.
export const TIPOS_SERVICIO = [
  { id: "sencillo",     label: "Sencillo" },
  { id: "full",         label: "Full" },
  { id: "carga_suelta", label: "Carga suelta" },
];

function getTipoStyle(tipo) {
  switch (tipo) {
    case "sencillo":     return { background: "#dbeafe", color: "#1e40af" };
    case "full":         return { background: "#ede9fe", color: "#5b21b6" };
    case "carga_suelta": return { background: "#ffedd5", color: "#9a3412" };
    default:             return { background: "#f3f4f6", color: "#6b7280" };
  }
}

export function getTipoServicioLabel(tipo) {
  const found = TIPOS_SERVICIO.find((t) => t.id === tipo);
  return found ? found.label : (tipo || "—");
}

// ¿El registro es Full? Lo dictamina tipo_servicio. Los registros anteriores a
// ese campo no lo traen: para ellos se conserva la heurística vieja (contenedor
// de más de 12 caracteres), igual que hace el backend al generar documentos.
export function esServicioFull(registro) {
  const servicio = registro?.tipo_servicio;
  if (servicio) return servicio === "full";
  return (registro?.contenedor || "").length > 12;
}

export default function TipoServicioSelector({ currentValue, onSelect, loading, disabled }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
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

  const bloqueado = loading || disabled;

  const handleSelect = (tipoId) => {
    setOpen(false);
    // Reelegir el mismo = deseleccionar, el patrón del resto de selectores.
    // Maniobra.tipo_servicio es null=True, blank=True y los registros anteriores
    // al campo viven en NULL: vaciarlo devuelve la maniobra a ese estado, en el
    // que esServicioFull() cae a la heurística del contenedor.
    onSelect(tipoId === currentValue ? "" : tipoId);
  };

  return (
    <div className="tss-container" ref={containerRef}>
      <button
        type="button"
        className="tss-trigger"
        style={getTipoStyle(currentValue)}
        onClick={(e) => { e.stopPropagation(); if (!bloqueado) setOpen((o) => !o); }}
        disabled={bloqueado}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? <span className="tss-spinner" /> : null}
        <span className="tss-label">{getTipoServicioLabel(currentValue)}</span>
        {!loading && <span className="tss-chevron">{open ? "▲" : "▼"}</span>}
      </button>

      {open && coords && createPortal(
        <ul
          className="tss-dropdown"
          role="listbox"
          ref={dropRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {TIPOS_SERVICIO.map((t) => (
            <li
              key={t.id}
              role="option"
              aria-selected={t.id === currentValue}
              className={`tss-option ${t.id === currentValue ? "tss-option--selected" : ""}`}
              style={getTipoStyle(t.id)}
              onClick={(e) => { e.stopPropagation(); handleSelect(t.id); }}
            >
              {t.label}
              {t.id === currentValue && <span className="tss-check">✓</span>}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
