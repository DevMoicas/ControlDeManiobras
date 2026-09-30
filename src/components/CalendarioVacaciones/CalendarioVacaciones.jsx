import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X, Trash2 } from "lucide-react";
import { overlayMotion, contentMotion } from "../../animations/modalMotion";
import { apiClient } from "../../api/apiClient";
import { celdasDelMes } from "../../utils/torreControl.mjs";
import { textoSobre } from "../../utils/colorFila.mjs";
import CatalogoSelector from "../CiudadSelector/CiudadSelector";
import ColorSelector from "../ColorSelector/ColorSelector";
import { useAlerta } from "../Alertas/Alertas";
import { useConfirmacion } from "../Confirmacion/Confirmacion";
import "./CalendarioVacaciones.css";

/**
 * El calendario de vacaciones de la nómina.
 *
 * UN evento por día y no más: es la regla que pidió el usuario para que dos
 * empleados no salgan a la vez, y la impone la BASE (`fecha` es unique). Aquí no
 * se comprueba nada por adelantado a propósito — dos pestañas abiertas la
 * burlarían — sino que se enseña el 400 del servidor, que además dice de quién
 * es el día.
 *
 * El año entero se pide UNA vez y se navega en memoria: son 365 filas como
 * mucho, y una petición por mes haría parpadear la rejilla en cada flecha.
 *
 * @param {Function} props.onCerrar
 */

// La rejilla empieza en lunes, como la de la Torre de Control — de ahí que se
// reutilice su celdasDelMes(), que ya calcula los huecos de la primera semana.
const DIAS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const mesDe = (fecha) => fecha.slice(0, 7);

const nombreDelMes = (mes) => {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(anio, numero - 1, 1)
    .toLocaleDateString("es-MX", { month: "long", year: "numeric" });
};

// Color de respaldo cuando el evento se guardó sin elegir ninguno: el azul de
// los estados "en curso" del sistema. Sin él, el rectángulo sería invisible.
const COLOR_POR_DEFECTO = "#dbeafe";

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CalendarioVacaciones({ onCerrar }) {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();

  const hoy = useMemo(hoyISO, []);
  const anio = Number(hoy.slice(0, 4));
  // Arranca en el mes en curso, que es lo que se viene a mirar.
  const [mes, setMes] = useState(() => mesDe(hoy));
  const [dias, setDias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  // El evento que se está creando o editando: null = ninguno.
  const [borrador, setBorrador] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await apiClient.get(`/vacaciones/?anio=${anio}`);
      setDias(Array.isArray(data) ? data : (data?.results ?? []));
    } catch (error) {
      alerta({ tipo: "error", msg: "No se pudo cargar el calendario." });
    } finally {
      setCargando(false);
    }
  }, [anio, alerta]);

  useEffect(() => { cargar(); }, [cargar]);

  // Índice fecha → evento. Se recalcula solo cuando cambian los días, no en
  // cada repintado de la rejilla.
  const porFecha = useMemo(
    () => Object.fromEntries(dias.map((d) => [d.fecha, d])),
    [dias],
  );

  const celdas = useMemo(() => celdasDelMes(mes), [mes]);

  const numeroMes = Number(mes.slice(5, 7));
  const irA = (delta) => {
    const siguiente = numeroMes + delta;
    // Acotado al año en curso, que es lo que enseña el calendario.
    if (siguiente < 1 || siguiente > 12) return;
    setMes(`${anio}-${String(siguiente).padStart(2, "0")}`);
  };

  const abrirDia = (fecha) => {
    const existente = porFecha[fecha];
    setBorrador(existente
      ? { ...existente, desde: existente.fecha, hasta: existente.fecha }
      : { desde: fecha, hasta: fecha, empleado: null, empleado_nombre: "", nota: "", color: "" });
  };

  const guardar = async () => {
    if (!borrador.empleado) {
      alerta({ tipo: "error", msg: "Elige de quién son las vacaciones." });
      return;
    }
    setGuardando(true);
    try {
      if (borrador.id) {
        // Editar toca SOLO ese día: el rango es para dar de alta.
        await apiClient.patch(`/vacaciones/${borrador.id}/`, {
          empleado: borrador.empleado,
          nota: borrador.nota,
          color: borrador.color,
        });
      } else {
        await apiClient.post("/vacaciones/", {
          empleado: borrador.empleado,
          desde: borrador.desde,
          hasta: borrador.hasta,
          nota: borrador.nota,
          color: borrador.color,
        });
      }
      await cargar();
      setBorrador(null);
    } catch (error) {
      // El backend responde con `detail` diciendo qué día choca y de quién es.
      alerta({ tipo: "error", msg: error.message || "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  };

  // ponytail: borra UN día. Unas vacaciones de una semana se quitan en cinco
  // clics; si molesta, el sitio de arreglarlo es un borrado por rango en el
  // ViewSet, igual que el alta.
  const borrar = async () => {
    const ok = await preguntar({
      titulo: "Quitar el día",
      mensaje: `Se quitarán las vacaciones del ${borrador.desde.split("-").reverse().join("/")}.`,
      accion: "Quitar",
      peligro: true,
    });
    if (!ok) return;
    setGuardando(true);
    try {
      await apiClient.delete(`/vacaciones/${borrador.id}/`);
      await cargar();
      setBorrador(null);
    } catch (error) {
      alerta({ tipo: "error", msg: "No se pudo quitar el día." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <motion.div className="modal-overlay cv-overlay" {...overlayMotion}>
      <motion.div className="cv-modal" {...contentMotion}>

        <header className="cv-header">
          <h2 className="cv-titulo">Calendario de vacaciones</h2>
          <button className="cv-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>

        <div className="cv-barra-mes">
          <button
            className="cv-flecha"
            onClick={() => irA(-1)}
            disabled={numeroMes === 1}
            aria-label="Mes anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className="cv-mes">{nombreDelMes(mes)}</h3>
          <button
            className="cv-flecha"
            onClick={() => irA(1)}
            disabled={numeroMes === 12}
            aria-label="Mes siguiente"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="cv-rejilla-scroll">
          <div className="cv-rejilla">
            {DIAS.map((dia) => (
              <div key={dia} className="cv-dia-nombre">{dia}</div>
            ))}

            {celdas.map((fecha, i) => {
              if (!fecha) return <div key={`hueco-${i}`} className="cv-celda cv-celda-hueca" />;
              const evento = porFecha[fecha];
              const fondo = evento ? (evento.color || COLOR_POR_DEFECTO) : null;
              return (
                <button
                  key={fecha}
                  type="button"
                  className={`cv-celda ${fecha === hoy ? "cv-celda-hoy" : ""}`}
                  onClick={() => abrirDia(fecha)}
                  title={evento
                    ? `${evento.empleado_nombre}${evento.nota ? ` — ${evento.nota}` : ""}`
                    : "Registrar vacaciones"}
                >
                  <span className="cv-numero">{Number(fecha.slice(8))}</span>
                  {evento && (
                    <span
                      className="cv-evento"
                      style={{ background: fondo, color: textoSobre(fondo) }}
                    >
                      {evento.empleado_nombre}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {cargando && <p className="cv-cargando">Cargando…</p>}
        </div>

        <p className="cv-nota">
          Un solo empleado por día: es lo que evita que dos salgan de vacaciones a la vez.
        </p>

        {/* ── Alta y edición de un día ───────────────────────────────── */}
        <AnimatePresence>
          {borrador && (
            <motion.div className="cv-sub-overlay" {...overlayMotion}>
              <motion.div className="cv-evento-modal" {...contentMotion}>
                <h3 className="cv-evento-titulo">
                  {borrador.id ? "Editar vacaciones" : "Registrar vacaciones"}
                </h3>

                <div className="cv-campo">
                  <label>Empleado</label>
                  <CatalogoSelector
                    endpoint="/empleados/"
                    campo="nombre_trabajador"
                    placeholder="— Elegir empleado —"
                    currentValue={borrador.empleado_nombre || ""}
                    onSelect={(nombre, registro) => setBorrador((b) => ({
                      ...b,
                      // El id, no el nombre: dos homónimos serían la misma persona.
                      empleado: registro?.id ?? null,
                      empleado_nombre: nombre,
                    }))}
                  />
                </div>

                {/* Al editar no hay rango: se toca el día en el que se hizo clic.
                    El rango existe para dar de alta una semana de una vez. */}
                {borrador.id ? (
                  <div className="cv-campo">
                    <label>Día</label>
                    <output className="cv-lectura">
                      {borrador.desde.split("-").reverse().join("/")}
                    </output>
                  </div>
                ) : (
                  <div className="cv-campo cv-campo-doble">
                    <div>
                      <label htmlFor="cv-desde">Del</label>
                      <input
                        id="cv-desde"
                        type="date"
                        value={borrador.desde}
                        onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="cv-hasta">Al</label>
                      <input
                        id="cv-hasta"
                        type="date"
                        value={borrador.hasta}
                        min={borrador.desde}
                        onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="cv-campo">
                  <label htmlFor="cv-nota">Nota</label>
                  <input
                    id="cv-nota"
                    type="text"
                    maxLength={255}
                    placeholder="Opcional"
                    value={borrador.nota || ""}
                    onChange={(e) => setBorrador((b) => ({ ...b, nota: e.target.value }))}
                  />
                </div>

                <div className="cv-campo cv-campo-color">
                  <label>Color</label>
                  {/* El mismo balde que pinta las filas de Maniobras y Gastos:
                      la paleta ya está probada y el contraste del texto lo
                      resuelve textoSobre(). */}
                  <ColorSelector
                    color={borrador.color || null}
                    onSelect={(color) => setBorrador((b) => ({ ...b, color: color || "" }))}
                  />
                </div>

                <div className="cv-evento-acciones">
                  {borrador.id && (
                    <button
                      type="button"
                      className="cv-btn-borrar"
                      onClick={borrar}
                      disabled={guardando}
                    >
                      <Trash2 size={16} /> Quitar
                    </button>
                  )}
                  <span className="cv-espacio" />
                  <button
                    type="button"
                    className="cv-btn-cancelar"
                    onClick={() => setBorrador(null)}
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="cv-btn-guardar"
                    onClick={guardar}
                    disabled={guardando}
                  >
                    {guardando ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </motion.div>
  );
}
