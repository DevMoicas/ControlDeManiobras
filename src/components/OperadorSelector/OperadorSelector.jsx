import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./OperadorSelector.css";

export default function OperadorSelector({ currentValue, onSelect, disabled, transportista }) {
  // Transportista tercero (≠ FRABA CONTAINER) → lista sus operadores registrados
  // en Terceros; propio/sin transportista → choferes internos.
  const esTercero = transportista && transportista.trim().toUpperCase() !== "FRABA CONTAINER";
  const [open, setOpen] = useState(false);
  const [choferes, setChoferes] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const dropRef = useRef(null);
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: dropRef });

  // El desplegable se renderiza en un portal con position: fixed para que no lo
  // recorte el overflow de la tabla (mismo patrón que PendientePagadoSelector).
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
    const url = esTercero
      ? `/operadores-terceros/?transportista=${encodeURIComponent(transportista)}`
      : "/choferes/";
    apiClient.getCatalogo(url)
      .then((res) => {
        const lista = Array.isArray(res) ? res : (res?.results ?? []);
        if (esTercero) {
          setChoferes(lista.map((o) => ({ id: o.id, nombre: o.nombre, licenciaVencida: false })));
          return;
        }
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const conVigencia = lista.map((c) => {
          let vencida = false;
          if (c.fecha_vencimiento_licencia) {
            const fechaVenc = new Date(c.fecha_vencimiento_licencia + "T00:00:00");
            vencida = fechaVenc < hoy;
          }
          return { ...c, licenciaVencida: vencida };
        });
        setChoferes(conVigencia);
      })
      .catch(() => setErrorList("Error al cargar choferes"))
      .finally(() => setLoadingList(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transportista]);

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

  const handleSelect = (nombre) => {
    setOpen(false);
    onSelect(nombre === currentValue ? "" : nombre);   // reelegir = deseleccionar
  };

  return (
    <div className="op-container" ref={containerRef}>
      <button
        type="button"
        className={`op-trigger ${currentValue ? "" : "op-trigger--empty"}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentValue || "— Asignar —"}</span>
        <span className="op-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && coords && createPortal(
        <ul
          ref={dropRef}
          className="op-dropdown"
          style={{ top: coords.top, left: coords.left }}
          role="listbox"
        >
          {loadingList && (
            <li className="op-state">Cargando…</li>
          )}
          {errorList && (
            <li className="op-state op-state--error">{errorList}</li>
          )}
          {!loadingList && !errorList && choferes.length === 0 && (
            <li className="op-state">No hay choferes registrados</li>
          )}
          {!loadingList && !errorList && choferes.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.nombre === currentValue}
              aria-disabled={c.licenciaVencida}
              className={`op-option ${c.nombre === currentValue ? "op-option--selected" : ""} ${c.licenciaVencida ? "op-option--vencido" : ""}`}
              title={c.licenciaVencida ? "Licencia vencida — no se puede asignar" : ""}
              onClick={(e) => { e.stopPropagation(); if (!c.licenciaVencida) handleSelect(c.nombre); }}
            >
              {c.nombre}
              {c.licenciaVencida && <span className="op-badge-vencido"> (Licencia vencida)</span>}
              {c.nombre === currentValue && <span className="op-check">✓</span>}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
