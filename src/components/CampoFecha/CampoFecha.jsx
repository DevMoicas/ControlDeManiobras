import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import {
  useFloating, autoUpdate, offset, flip, shift, FloatingPortal,
  useDismiss, useInteractions,
} from "@floating-ui/react";
import { addYears } from "date-fns";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { formatear, interpretar, minutosDelDia } from "./reglasFecha.mjs";
import "./CampoFecha.css";

// Selector de fecha de TODO el sistema (sustituye a react-datepicker,
// usuario 2026-10-12). Acepta los mismos props que se le pasaban a aquel
// —selected, onChange, showTimeSelect, showTimeSelectOnly, isClearable,
// onCalendarClose, placeholderText, className, wrapperClassName, id,
// autoFocus, disabled— para que cambiar uno por otro sea cambiar la etiqueta y
// nada más: los conversores de cada página (aDate/aBackend…) no se tocan.
// Los props de formato de aquel (locale, dateFormat, timeFormat, portalId,
// popperModifiers…) se ignoran: aquí el formato lo da el modo.
//
// Lo que cambia en el USO:
// - Navegar de mes (flechas o desplegables) NO elige día. Solo un clic en un
//   día cambia el valor — con el anterior, cambiar de mes movía la fecha.
// - Se puede escribir: 2/10/26, 02102026, 9:30… (ver reglasFecha.mjs). Lo que
//   no se entiende devuelve la caja a su valor, no guarda basura.
// - Botón "Hoy" y, con hora, horas de 15 en 15 junto al calendario.
// - El calendario va en un portal posicionado con floating-ui: no lo recorta
//   el overflow de las tablas ni lo tapa el overlay de un modal.

const AHORA = new Date();
const PRIMER_MES = new Date(2015, 0);
const ULTIMO_MES = addYears(new Date(AHORA.getFullYear(), 11), 5);
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
               "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const dosDigitos = (n) => String(n).padStart(2, "0");

/** El día de `dia` con la hora de `hora` (o 00:00). */
const conHora = (dia, hora) => {
  const d = new Date(dia);
  d.setHours(hora ? hora.getHours() : 0, hora ? hora.getMinutes() : 0, 0, 0);
  return d;
};

export default function CampoFecha({
  selected = null, onChange, modo: modoProp,
  showTimeSelect = false, showTimeSelectOnly = false, timeIntervals = 15,
  isClearable = false, onCalendarClose, placeholderText, className = "",
  wrapperClassName = "", id, autoFocus = false, disabled = false,
}) {
  const modo = modoProp
    ?? (showTimeSelectOnly ? "hora" : showTimeSelect ? "fechaHora" : "fecha");
  const valor = selected instanceof Date && !isNaN(selected) ? selected : null;

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(formatear(valor, modo));
  const [mes, setMes] = useState(valor ?? AHORA);
  const listaHoras = useRef(null);

  // La caja sigue al valor mientras no se esté escribiendo en ella.
  const escribiendo = useRef(false);
  const clave = valor ? valor.getTime() : null;
  useEffect(() => {
    if (!escribiendo.current) setTexto(formatear(valor, modo));
  }, [clave, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  // onCalendarClose se avisa DESPUÉS del render del cierre: así quien guarda
  // al cerrar (CeldaEditable, la tabla de Maniobras) ya lee el valor nuevo.
  const alCerrar = useRef(onCalendarClose);
  alCerrar.current = onCalendarClose;
  const estabaAbierto = useRef(false);
  useEffect(() => {
    if (estabaAbierto.current && !abierto) alCerrar.current?.();
    estabaAbierto.current = abierto;
  }, [abierto]);

  // Al abrir, la hora elegida se lleva al centro de SU lista (scrollTop y no
  // scrollIntoView, que movería también la página).
  // En el siguiente frame: FloatingPortal monta su nodo un render después.
  useEffect(() => {
    if (!abierto) return;
    const id = requestAnimationFrame(() => {
      const ul = listaHoras.current;
      const activo = ul?.querySelector(".activo");
      if (activo) ul.scrollTop = activo.offsetTop - ul.clientHeight / 2;
    });
    return () => cancelAnimationFrame(id);
  }, [abierto]);

  const abrir = () => {
    if (disabled || abierto) return;
    setMes(valor ?? new Date());
    setAbierto(true);
  };

  const elegir = (d) => {
    escribiendo.current = false;
    setTexto(formatear(d, modo));
    if ((d?.getTime() ?? null) !== clave) onChange?.(d);
  };

  /** Lo tecleado: se guarda si se entiende, si no la caja vuelve a su valor. */
  const confirmarTexto = () => {
    if (!escribiendo.current) return;
    escribiendo.current = false;
    const d = interpretar(texto, modo, valor ?? new Date());
    if (d === undefined) setTexto(formatear(valor, modo));
    else elegir(d);
  };

  const cerrar = () => { confirmarTexto(); setAbierto(false); };

  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open: abierto,
    onOpenChange: (abrirlo) => (abrirlo ? abrir() : cerrar()),
    placement: "bottom-start",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  // ── Contenido del desplegable, por modo ──
  const calendario = (
    <DayPicker
      mode="single"
      locale={es}
      selected={valor ?? undefined}
      month={mes}
      onMonthChange={setMes}
      captionLayout="dropdown"
      startMonth={PRIMER_MES}
      endMonth={ULTIMO_MES}
      showOutsideDays
      onSelect={(dia) => {
        // Reelegir el día puesto lo deselecciona en react-day-picker: aquí se
        // queda como está (borrar es el aspa, no un segundo clic).
        if (!dia) return;
        if (modo === "fechaHora") return elegir(conHora(dia, valor));
        elegir(dia);
        setAbierto(false);
      }}
    />
  );

  const minutoActual = valor ? valor.getHours() * 60 + valor.getMinutes() : null;
  const horas = (
    <ul className="campo-fecha-horas" role="listbox" aria-label="Hora" ref={listaHoras}>
      {minutosDelDia(timeIntervals, minutoActual).map((m) => (
        <li key={m}>
          <button
            type="button"
            role="option"
            aria-selected={m === minutoActual}
            className={m === minutoActual ? "activo" : ""}
            onClick={() => {
              const d = new Date(valor ?? new Date());
              d.setHours(Math.floor(m / 60), m % 60, 0, 0);
              elegir(d);
              if (modo === "hora") setAbierto(false);
            }}
          >
            {dosDigitos(Math.floor(m / 60))}:{dosDigitos(m % 60)}
          </button>
        </li>
      ))}
    </ul>
  );

  const anioMes = mes.getFullYear();
  const meses = (
    <div className="campo-fecha-meses">
      <div className="campo-fecha-anio">
        <button type="button" aria-label="Año anterior"
                onClick={() => setMes(new Date(anioMes - 1, 0))}><ChevronLeft size={16} /></button>
        <strong>{anioMes}</strong>
        <button type="button" aria-label="Año siguiente"
                onClick={() => setMes(new Date(anioMes + 1, 0))}><ChevronRight size={16} /></button>
      </div>
      <div className="campo-fecha-rejilla">
        {MESES.map((nombre, i) => {
          const activo = valor && valor.getFullYear() === anioMes && valor.getMonth() === i;
          return (
            <button key={nombre} type="button" className={activo ? "activo" : ""}
                    onClick={() => { elegir(new Date(anioMes, i, 1)); setAbierto(false); }}>
              {nombre}
            </button>
          );
        })}
      </div>
    </div>
  );

  const hoy = () => {
    const ahora = new Date();
    if (modo === "fecha") { elegir(conHora(ahora, null)); setAbierto(false); }
    else if (modo === "mes") { elegir(new Date(ahora.getFullYear(), ahora.getMonth(), 1)); setAbierto(false); }
    else if (modo === "fechaHora") { ahora.setSeconds(0, 0); elegir(ahora); setMes(ahora); }
    else { elegir(conHora(valor ?? ahora, ahora)); setAbierto(false); }
  };

  return (
    <div
      className={`campo-fecha ${isClearable ? "campo-fecha--limpiable" : ""} ${wrapperClassName}`}
    >
      <input
        ref={refs.setReference}
        id={id}
        type="text"
        inputMode={modo === "hora" ? "numeric" : "text"}
        autoComplete="off"
        className={className}
        placeholder={placeholderText}
        value={texto}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        {...getReferenceProps({
          onFocus: abrir,
          // Cerrado el calendario, salir de la caja es lo único que guarda lo
          // tecleado. Abierto, de eso se encarga el cierre.
          onBlur: () => { if (!abierto) confirmarTexto(); },
          onClick: abrir,
          onChange: (e) => { escribiendo.current = true; setTexto(e.target.value); },
          onKeyDown: (e) => {
            if (e.key === "Enter") { e.preventDefault(); cerrar(); }
            else if (e.key === "Tab") cerrar();
            else if (e.key === "ArrowDown") abrir();
          },
        })}
      />
      {isClearable && valor && !disabled && (
        <button
          type="button"
          className="campo-fecha-limpiar"
          aria-label="Borrar fecha"
          title="Borrar"
          // mousedown y no click: así el input no pierde el foco ni reabre.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { elegir(null); setAbierto(false); }}
        >
          <X size={14} />
        </button>
      )}

      {abierto && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            // Oculto hasta tener posición: si no, el primer frame sale en (0,0).
            style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
            className={`campo-fecha-pop campo-fecha-pop--${modo}${isPositioned ? " campo-fecha-pop--listo" : ""}`}
            role="dialog"
            // Sin esto, un clic dentro del calendario quita el foco a la caja.
            onMouseDown={(e) => { if (e.target.tagName !== "SELECT") e.preventDefault(); }}
            {...getFloatingProps()}
          >
            <div className="campo-fecha-cuerpo">
              {(modo === "fecha" || modo === "fechaHora") && calendario}
              {(modo === "fechaHora" || modo === "hora") && horas}
              {modo === "mes" && meses}
            </div>
            <div className="campo-fecha-pie">
              <button type="button" onClick={hoy}>
                {modo === "hora" || modo === "fechaHora" ? "Ahora" : modo === "mes" ? "Este mes" : "Hoy"}
              </button>
              {isClearable && valor && (
                <button type="button" onClick={() => { elegir(null); setAbierto(false); }}>Borrar</button>
              )}
              {modo === "fechaHora" && (
                <button type="button" className="campo-fecha-listo" onClick={cerrar}>Listo</button>
              )}
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
