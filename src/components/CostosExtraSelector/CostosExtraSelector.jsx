import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/apiClient";
import "./CostosExtraSelector.css";

/**
 * Selección MÚLTIPLE de costos extra para una maniobra.
 *
 * Se diferencia de los demás selectores (PatioSelector, RemolqueSelector…) en
 * dos cosas, y solo en dos:
 *
 *   1. Marca varias opciones a la vez, así que la selección vive en un estado
 *      interno mientras el desplegable está abierto.
 *   2. Avisa al cerrar, no en cada clic. Marcar cuatro conceptos son cuatro
 *      clics; con aviso por clic serían cuatro PATCH y cuatro notificaciones
 *      para una sola decisión del usuario.
 *
 * Lo demás es el patrón portal + position:fixed que ya usan los otros: sin él,
 * el overflow de la tabla de Maniobras recorta la lista en las últimas filas.
 */
export default function CostosExtraSelector({ seleccionados = [], onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [opciones, setOpciones] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorList, setErrorList] = useState(null);
  // Copia de trabajo mientras está abierto. Al cerrar se compara con la de
  // fuera y solo entonces se avisa.
  const [borrador, setBorrador] = useState([]);
  const containerRef = useRef(null);
  const dropRef = useRef(null);

  const actualizarCoords = () => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  };

  useLayoutEffect(() => {
    if (open) actualizarCoords();
  }, [open]);

  const abrir = () => {
    setBorrador(seleccionados);
    setOpen(true);
  };

  const cerrar = () => {
    setOpen(false);
    const antes = [...seleccionados].sort((a, b) => a - b).join(",");
    const ahora = [...borrador].sort((a, b) => a - b).join(",");
    if (antes !== ahora) onChange(borrador);
  };

  const alternar = (id) => {
    setBorrador((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setErrorList(null);
    // ponytail: solo la primera página (PAGE_SIZE=60 global). Mismo techo que
    // PatioSelector y los demás selectores de catálogo; a partir de 60 costos
    // extra habría que paginar o pedir ?page_size, y entonces se hace en todos.
    apiClient.getCatalogo("/costos-extra/")
      .then((res) => setOpciones(Array.isArray(res) ? res : (res?.results ?? [])))
      .catch(() => setErrorList("Error al cargar costos extra"))
      .finally(() => setLoadingList(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      // Con el portal la lista ya NO está dentro de containerRef: hay que
      // excluirla a mano o el mousedown sobre una opción cerraría el
      // desplegable antes de que llegara el click.
      if (dropRef.current && dropRef.current.contains(e.target)) return;
      cerrar();
    };
    const keyHandler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        // Escape descarta: cerrar() guardaría lo que se llevara marcado, que no
        // es lo que espera nadie al pulsar Escape.
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
    // Sin array de dependencias A PROPÓSITO: cerrar() lee `borrador`, y con
    // [open] el listener se quedaría con la copia del primer render — guardaría
    // la selección vacía. Solo se registra con el desplegable abierto (el
    // return de arriba), así que reengancharlo por render no cuesta nada.
  });

  const cuantos = seleccionados.length;

  return (
    <div className="cxs-container" ref={containerRef}>
      <button
        type="button"
        className={`cxs-trigger ${cuantos ? "" : "cxs-trigger--empty"}`}
        onClick={(e) => { e.stopPropagation(); if (open) cerrar(); else abrir(); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{cuantos ? `${cuantos} seleccionado${cuantos > 1 ? "s" : ""}` : "— Asignar —"}</span>
        <span className="cxs-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && coords && createPortal(
        <ul
          className="cxs-dropdown"
          role="listbox"
          aria-multiselectable="true"
          ref={dropRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {loadingList && <li className="cxs-state">Cargando…</li>}
          {errorList && <li className="cxs-state cxs-state--error">{errorList}</li>}
          {!loadingList && !errorList && opciones.length === 0 && (
            <li className="cxs-state">
              No hay costos extra registrados. Ve a Finanzas → Costos extra para agregar.
            </li>
          )}
          {!loadingList && !errorList && opciones.map((c) => {
            const marcado = borrador.includes(c.id);
            return (
              <li
                key={c.id}
                role="option"
                aria-selected={marcado}
                className={`cxs-option ${marcado ? "cxs-option--selected" : ""}`}
                onClick={(e) => { e.stopPropagation(); alternar(c.id); }}
              >
                <span className="cxs-marca" aria-hidden="true">{marcado ? "☑" : "☐"}</span>
                <span className="cxs-movimiento">{c.movimiento}</span>
                {/* Sin importe: al asignar conceptos a una maniobra solo se
                    elige CUÁLES, y las tarifas a la vista convertían el
                    desplegable en una lista de precios (usuario, 2026-08-26).
                    Se siguen viendo en Finanzas → Costos extra, que es su sitio,
                    y el importe que se cobra se congela igual al seleccionar. */}
              </li>
            );
          })}
          {!loadingList && !errorList && opciones.length > 0 && (
            <li className="cxs-pie">
              <button type="button" className="cxs-listo" onClick={(e) => { e.stopPropagation(); cerrar(); }}>
                Listo
              </button>
            </li>
          )}
        </ul>,
        document.body
      )}
    </div>
  );
}

// El backend manda el decimal como cadena ("500.00") para no perder precisión.
export function formatearCosto(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
