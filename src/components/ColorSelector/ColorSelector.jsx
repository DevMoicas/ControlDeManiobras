/**
 * ColorSelector.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Balde de pintura para rellenar una fila de Maniobras a mano, como en una hoja
 * de cálculo. Vive pegado al StatusSelector y usa su mismo patrón de portal.
 *
 * Jerarquía: el color elegido MANDA sobre el que pinta el status. "Restablecer"
 * guarda null y la fila vuelve sola al color de su status — no hay que recordar
 * cuál era, porque el status nunca se pierde al pintar.
 *
 * La rejilla es la paleta estándar de Google Sheets (ver colorFila.mjs).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { PaintBucket, Ban } from "lucide-react";
import { PALETA_SHEETS, esColorValido } from "../../utils/colorFila.mjs";
import useDropdownNav from "../../hooks/useDropdownNav";
import "./ColorSelector.css";

// Aire mínimo entre el panel y el borde de la ventana.
const MARGEN = 8;

/**
 * @param {Object} props
 * @param {string|null} props.color   - "#rrggbb" o null (sin pintar)
 * @param {Function} props.onSelect   - Callback(color: string|null)
 * @param {boolean} [props.loading]   - true mientras el PATCH está en vuelo
 */
export default function ColorSelector({ color, onSelect, loading = false }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  useDropdownNav({ abierto: open, setAbierto: setOpen, wrapperRef: containerRef, dropdownRef: panelRef });

  const pintado = esColorValido(color) ? color : null;

  // Portal con position: fixed, igual que StatusSelector: sin esto el overflow
  // de la tabla recorta el panel en las últimas filas y no se puede elegir.
  //
  // Se coloca bajo el botón, pero PEGADO al borde de la ventana cuando no cabe:
  // en Gastos el balde vive en la última columna (Acciones) y el panel se salía
  // por la derecha, y en las últimas filas se salía por abajo. Se mide el panel
  // ya montado —por eso se pinta oculto hasta tener coordenadas— en vez de
  // repetir aquí su tamaño del CSS, que acabaría desfasado.
  const actualizarCoords = () => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    const ancho = panel?.width ?? 0;
    const alto = panel?.height ?? 0;

    const left = Math.max(MARGEN, Math.min(r.left, window.innerWidth - ancho - MARGEN));
    // Si no cabe debajo se abre hacia arriba, y si tampoco, se pega al borde:
    // más vale desplazado que cortado.
    const top = r.bottom + 4 + alto + MARGEN <= window.innerHeight
      ? r.bottom + 4
      : Math.max(MARGEN, r.top - 4 - alto);

    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (open) actualizarCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      // Con el portal, el panel ya NO está dentro de containerRef: hay que
      // excluirlo a mano o el mousedown sobre un color cerraría antes de elegir.
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const reposicionar = () => actualizarCoords();
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const elegir = useCallback((valor) => {
    setOpen(false);                       // elegido el color, no queda nada que hacer
    if (valor !== (pintado ?? null)) onSelect(valor);
  }, [pintado, onSelect]);

  return (
    <div
      className="color-selector"
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="color-selector__trigger"
        onClick={() => { if (!loading) setOpen((prev) => !prev); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={loading}
        title={pintado ? `Color de la fila: ${pintado}` : "Pintar la fila"}
      >
        <PaintBucket size={16} />
        {/* Barra inferior con el color actual, como en Excel y Sheets: el balde
            solo, sin la barra, no dice de qué color se va a pintar. */}
        <span
          className={`color-selector__barra${pintado ? "" : " color-selector__barra--vacia"}`}
          style={pintado ? { background: pintado } : undefined}
        />
      </button>

      {open && createPortal(
        <div
          className="color-selector__panel"
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label="Color de la fila"
          // Oculto —que no `display: none`— hasta tener coordenadas: hace falta
          // que ocupe su sitio para poder medirlo, pero no que se vea saltar.
          style={{
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            visibility: coords ? undefined : "hidden",
          }}
        >
          <button
            type="button"
            className="color-selector__restablecer"
            onClick={() => elegir(null)}
          >
            <Ban size={14} />
            Restablecer
          </button>

          <div className="color-selector__rejilla">
            {PALETA_SHEETS.flat().map((valor) => (
              <button
                key={valor}
                type="button"
                className={`color-selector__muestra${valor === pintado ? " color-selector__muestra--activa" : ""}`}
                style={{ background: valor }}
                onClick={() => elegir(valor)}
                aria-label={valor}
                title={valor}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
