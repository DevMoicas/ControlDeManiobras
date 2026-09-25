import { useState } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { shift } from "@floating-ui/react";
import es from "date-fns/locale/es";
import { aDate, aBackend, aDateHora, aBackendHora } from "./fechaCelda.mjs";
import "./CeldaEditable.css";

registerLocale("es", es);

// El calendario se saca del árbol a un portal colgado del <body>. Si no, el
// `overflow` del panel de la tabla —que es deliberado, redondea las esquinas— lo
// recorta, y con pocas filas no se ve casi nada. Mismo remedio que ya lleva
// Movimientos Locales (ml-fecha-portal). react-datepicker crea el nodo solo si
// no existe. Id propio del componente: los otros 7 sitios con DatePicker no se
// tocan.
const FECHA_PORTAL_ID = "celda-fecha-portal";

// react-datepicker aplica flip() y offset(), pero NO shift(). flip solo voltea
// arriba/abajo: no corrige el eje horizontal, y estas tablas hacen scroll
// lateral, así que en las últimas columnas el calendario se salía por la
// derecha. shift() lo desliza para mantenerlo dentro del viewport.
const FECHA_MIDDLEWARE = [shift({ padding: 8 })];

/**
 * Celda de tabla que se edita con un clic encima, sin abrir el modal — el mismo
 * gesto que ya tiene la tabla de Maniobras (ManiobrasPage → FilaManiobra).
 * Enter o salir del foco guarda; Escape cancela.
 *
 * El estado de edición vive AQUÍ y no en la página a propósito: si viviera
 * arriba, cada tecla re-renderizaría todas las filas cargadas. Así solo se
 * repinta la celda que se está editando.
 *
 * - `valor`:  lo que se edita y se manda al backend (crudo).
 * - `texto`:  lo que se lee en la tabla cuando difiere del valor ($1,234.00,
 *             DD/MM/YYYY…). Si no se pasa, se muestra `valor`.
 * - `fecha`:  abre un DatePicker en vez de un input. Guarda al CERRAR el
 *             calendario, no en cada clic: elegir día es un paso intermedio.
 * - `fechaHora`: igual, pero con hora — el valor es un instante ISO, no un
 *             'YYYY-MM-DD'. Lo usa la Cita de Vacíos.
 * - `max`:    límite del SERIALIZER, que en varios campos es más estricto que el
 *             del modelo. Cortar aquí evita un 400 que el apiClient solo sabe
 *             mostrar como "HTTP 400".
 */
export default function CeldaEditable({ valor, texto, onGuardar, fecha = false, fechaHora = false, max, etiqueta }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");

  const abrir = () => {
    setBorrador(valor ?? "");
    setEditando(true);
  };

  // Acepta el valor por parametro porque limpiar con el aspa tiene que guardar
  // EN EL ACTO, sin esperar al estado. Los que la llaman sin argumento van
  // envueltos en una flecha a proposito: onBlur y onCalendarClose pasan un
  // evento como primer argumento y aqui se leeria como el valor a guardar.
  const confirmar = (nuevo = borrador) => {
    if (nuevo !== (valor ?? "")) onGuardar(nuevo);
    setEditando(false);
  };

  if (!editando) {
    // El guion no es decorativo: sin él una celda vacía no tendría superficie
    // donde hacer clic.
    const visible = texto ?? valor;
    return (
      <span
        className="celda-editable"
        title="Click para editar"
        role="button"
        tabIndex={0}
        onClick={abrir}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); abrir(); } }}
      >
        {visible || <em className="celda-editable-vacia">—</em>}
      </span>
    );
  }

  // Sin `onClickOutside`: el clic fuera ya cierra el calendario, así que
  // `onCalendarClose` cubre los dos casos con una sola escritura.
  if (fecha) return (
    <DatePicker
      autoFocus
      locale="es"
      dateFormat="dd/MM/yyyy"
      placeholderText="DD/MM/YYYY"
      className="date-picker-input"
      isClearable
      portalId={FECHA_PORTAL_ID}
      popperModifiers={FECHA_MIDDLEWARE}
      wrapperClassName="celda-fecha"
      selected={aDate(borrador)}
      onChange={(d) => {
        const nuevo = aBackend(d);
        setBorrador(nuevo);
        // El aspa es una edicion COMPLETA, no un paso intermedio como elegir
        // dia: se guarda al momento. Esperar a onCalendarClose la perdia, porque
        // limpiar no siempre cierra el calendario.
        if (d === null) confirmar(nuevo);
      }}
      onCalendarClose={() => confirmar()}
    />
  );

  // Mismo trato que `fecha` —se guarda al cerrar el calendario— porque elegir
  // el día y elegir la hora son dos pasos de la misma edición.
  if (fechaHora) return (
    <DatePicker
      autoFocus
      locale="es"
      showTimeSelect
      timeFormat="HH:mm"
      timeIntervals={15}
      dateFormat="dd/MM/yyyy HH:mm"
      placeholderText="DD/MM/YYYY HH:mm"
      className="date-picker-input"
      isClearable
      portalId={FECHA_PORTAL_ID}
      popperModifiers={FECHA_MIDDLEWARE}
      wrapperClassName="celda-fecha"
      selected={aDateHora(borrador)}
      onChange={(d) => {
        const nuevo = aBackendHora(d);
        setBorrador(nuevo);
        if (d === null) confirmar(nuevo);   // el aspa, igual que arriba
      }}
      onCalendarClose={() => confirmar()}
    />
  );

  return (
    <input
      type="text"
      autoFocus
      value={borrador}
      maxLength={max}
      aria-label={etiqueta}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => confirmar()}
      onKeyDown={(e) => {
        if (e.key === "Enter")  confirmar();
        if (e.key === "Escape") setEditando(false);
      }}
    />
  );
}
