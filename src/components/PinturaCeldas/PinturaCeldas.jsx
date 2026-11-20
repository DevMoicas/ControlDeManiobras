/**
 * PinturaCeldas
 * ─────────────────────────────────────────────────────────────────────────────
 * El segundo balde de pintura: rellena UNA celda en vez de la fila entera, como
 * en una hoja de cálculo. No sustituye al de la fila (ColorSelector) — para
 * señalar un dato, pintar la fila tapa los otros treinta.
 *
 * Dos formas de pintar, las dos disponibles a la vez:
 *
 *   · MODO PINTURA — el balde de la barra de la tabla, a la izquierda de
 *     "⇤ Inicio", abre la paleta; al elegir color el modo queda encendido y cada
 *     clic en una celda la pinta. Se apaga con Escape o volviendo a pulsarlo.
 *     Mientras está encendido, el cursor sobre las celdas pasa a cruz: la barra
 *     se va con el scroll y sin esa señal no se sabría que sigue puesto.
 *   · CLIC DERECHO sobre cualquier celda — abre la paleta ahí mismo y pinta solo
 *     esa. No hace falta encender nada.
 *
 * Por qué el modo hace falta: la celda YA usa su clic para abrir el editor. Sin
 * un modo, "clic para pintar" y "clic para editar" son el mismo gesto. Por eso
 * el handler va en captura, para quedarse el clic antes de que llegue a la celda.
 *
 * El panel es el mismo de ColorSelector —se importa su hoja— para que las dos
 * paletas de la app se vean idénticas sin duplicar el CSS.
 *
 * Uso:
 *   const pintura = usePinturaCeldas();
 *   <td {...pintura.celda(fila.colores, col.key, (colores) => guardar({ colores }))}>
 *   <PinturaCeldas pintura={pintura} />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { PaintBucket, Ban } from "lucide-react";
import { PALETA_SHEETS, estiloCelda } from "../../utils/colorFila.mjs";
import "../ColorSelector/ColorSelector.css";
import "./PinturaCeldas.css";

/** Valor de `activo` que DESPINTA en vez de pintar (el "sin relleno" de Excel). */
export const BORRAR = "borrar";

// Tamaño del panel, para no dejarlo salir por el borde de la ventana ni al
// abrirlo con el clic derecho ni al colgarlo del botón. Son 10 muestras de 20 +
// sus huecos + el aire del panel; el alto lo domina la rejilla de 8 filas más el
// botón de quitar.
const PANEL_ANCHO = 268;
const PANEL_ALTO = 290;
const MARGEN = 8;

/** Coordenadas del panel sin salirse de la ventana. */
function encajar(x, y) {
  return {
    top: Math.max(MARGEN, Math.min(y, window.innerHeight - PANEL_ALTO - MARGEN)),
    left: Math.max(MARGEN, Math.min(x, window.innerWidth - PANEL_ANCHO - MARGEN)),
  };
}

export function usePinturaCeldas() {
  // null = modo apagado. "#rrggbb" = pinta con ese color. BORRAR = despinta.
  const [activo, setActivo] = useState(null);
  // Panel abierto: { flotante: true } el del balde, o { x, y, actual, elegir }
  // el del clic derecho sobre una celda.
  const [panel, setPanel] = useState(null);

  // Escape apaga las dos cosas: primero el panel abierto y, si no hay, el modo.
  // Es la salida que espera cualquiera que se haya quedado pintando sin querer.
  useEffect(() => {
    const alPulsar = (e) => {
      if (e.key !== "Escape") return;
      setPanel((abierto) => {
        if (!abierto) setActivo(null);
        return null;
      });
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, []);

  useEffect(() => {
    // El cursor de cruz sobre las celdas es el aviso de que el modo sigue
    // encendido: el balde vive en la barra de la tabla y se va con el scroll.
    document.body.classList.toggle("pc-pintando", Boolean(activo));
    return () => document.body.classList.remove("pc-pintando");
  }, [activo]);

  const aplicar = useCallback((colores, campo, onGuardar, valor) => {
    const antes = colores ?? {};
    const nuevo = { ...antes };
    if (valor === BORRAR || valor == null) delete nuevo[campo];
    else nuevo[campo] = valor;
    // Repintar del mismo color no manda nada: en modo pintura es fácil dar dos
    // clics seguidos, y cada uno seria un PATCH que escribe lo que ya estaba.
    if (JSON.stringify(nuevo) === JSON.stringify(antes)) return;
    onGuardar(nuevo);
  }, []);

  /**
   * Props del <td>: el relleno de la celda, el clic que pinta cuando el modo
   * está encendido, y el clic derecho que abre la paleta. Se esparcen tal cual.
   *
   * `estiloBase` es el style que ya llevara la celda por su columna; el del
   * relleno va después para que gane, como gana en la cascada.
   */
  const celda = useCallback((colores, campo, onGuardar, estiloBase) => ({
    style: { ...(estiloBase ?? {}), ...(estiloCelda(colores, campo) ?? {}) },
    // En captura: la celda se queda el clic para abrir su editor, así que en
    // modo pintura hay que interceptarlo ANTES de que llegue a ella.
    onClickCapture: activo
      ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          aplicar(colores, campo, onGuardar, activo);
        }
      : undefined,
    onContextMenu: (e) => {
      // Sobre un campo abierto manda el menú del navegador: quien está
      // escribiendo espera cortar y pegar, no la paleta.
      if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      setPanel({
        x: e.clientX,
        y: e.clientY,
        actual: colores?.[campo] ?? null,
        elegir: (valor) => aplicar(colores, campo, onGuardar, valor),
      });
    },
  }), [activo, aplicar]);

  // Memoizado y, sobre todo, con `celda` estable: las filas de Maniobras van con
  // React.memo y reciben SOLO `celda`. Si cambiara de identidad en cada render
  // —o si dependiera de `panel`— abrir la paleta con el clic derecho volveria a
  // pintar las ~2000 filas de la tabla.
  return useMemo(
    () => ({ activo, setActivo, panel, setPanel, celda }),
    [activo, panel, celda],
  );
}

function Paleta({ actual, alElegir, alCerrar, posicion }) {
  useEffect(() => {
    const fuera = (e) => {
      if (e.target.closest?.(".color-selector__panel, .pc-boton")) return;
      alCerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [alCerrar]);

  return createPortal(
    <div
      className="color-selector__panel"
      role="dialog"
      aria-label="Color de la celda"
      style={posicion}
    >
      <button
        type="button"
        className="color-selector__restablecer"
        onClick={() => alElegir(BORRAR)}
      >
        <Ban size={14} />
        Sin relleno
      </button>

      <div className="color-selector__rejilla">
        {PALETA_SHEETS.flat().map((valor) => (
          <button
            key={valor}
            type="button"
            className={`color-selector__muestra${valor === actual ? " color-selector__muestra--activa" : ""}`}
            style={{ background: valor }}
            onClick={() => alElegir(valor)}
            aria-label={valor}
            title={valor}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}

export default function PinturaCeldas({ pintura }) {
  const { activo, setActivo, panel, setPanel } = pintura;
  const botonRef = useRef(null);

  const cerrar = useCallback(() => setPanel(null), [setPanel]);

  const alElegir = useCallback((valor) => {
    if (panel?.elegir) panel.elegir(valor);   // clic derecho: pinta esa celda
    else setActivo(valor);                    // balde: enciende el modo
    setPanel(null);
  }, [panel, setActivo, setPanel]);

  // El panel cuelga del botón cuando se abre desde la barra, y del cursor cuando
  // se abre con el clic derecho. Los dos casos pasan por el mismo recorte.
  const rect = panel?.desdeBoton ? botonRef.current?.getBoundingClientRect() : null;
  const posicion = rect
    ? encajar(rect.left, rect.bottom + 4)
    : encajar(panel?.x ?? 0, panel?.y ?? 0);

  const encendido = Boolean(activo);
  const muestra = activo && activo !== BORRAR ? activo : null;

  return (
    <>
      <button
        type="button"
        ref={botonRef}
        className={`pc-boton${encendido ? " pc-boton--activo" : ""}`}
        onClick={() => (encendido ? setActivo(null) : setPanel({ desdeBoton: true }))}
        aria-pressed={encendido}
        aria-label="Pintar celdas sueltas"
        title={
          encendido
            ? "Modo pintura encendido — clic en una celda para pintarla (Escape para salir)"
            : "Pintar celdas sueltas"
        }
      >
        <PaintBucket size={16} />
        {/* La barra con el color activo, igual que en el balde de la fila: el
            balde solo no dice de qué color se va a pintar. */}
        <span
          className={`pc-barra${muestra ? "" : " pc-barra--vacia"}`}
          style={muestra ? { background: muestra } : undefined}
        />
      </button>

      {panel && (
        <Paleta
          actual={panel.actual ?? muestra}
          alElegir={alElegir}
          alCerrar={cerrar}
          posicion={posicion}
        />
      )}
    </>
  );
}
