import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { apiClient } from "../api/apiClient";
import PlacasSelector from "../components/PlacasSelector/PlacasSelector";
import RemolqueSelector from "../components/RemolqueSelector/RemolqueSelector";
import { useAlerta } from "../components/Alertas/Alertas";
import "./NominaPage.css";
import "./FinanzasCaptura.css";
import "./GastosMantenimientoPage.css";

// Viajes > Gastos > Gastos mantenimiento (usuario, 2026-11-25): tabla y un botón
// para registrar. No se edita ni se borra (el backend solo acepta GET y POST).
// Misma tabla y mismo formulario que Cuentas por pagar, pero en un overlay y no
// en <dialog>.showModal(): los selectores pintan su lista en un portal sobre
// <body>, y el modal nativo deja inerte todo lo que queda fuera de él.

const fechaLegible = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
// El backend guarda 10 decimales: se enseña sin los ceros de relleno.
const km = (v) => (v == null ? "" : String(v).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""));

export default function GastosMantenimientoPage() {
  const alerta = useAlerta();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [unidad, setUnidad] = useState("");
  const [remolque, setRemolque] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await apiClient.get("/gastos-mantenimiento/");
      // ponytail: solo la primera página de la API (60). Paginar cuando haya más.
      setFilas(data.results ?? data);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    } finally {
      setCargando(false);
    }
  }, [alerta]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = () => {
    setUnidad("");
    setRemolque("");
    setAbierto(true);
  };

  const crear = async (e) => {
    e.preventDefault();
    // Los dos selectores no son controles de formulario: se validan aquí.
    if (!unidad || !remolque) {
      alerta({ tipo: "error", msg: "Elige el vehículo y el remolque." });
      return;
    }
    setGuardando(true);
    try {
      await apiClient.post("/gastos-mantenimiento/", { ...Object.fromEntries(new FormData(e.target)), unidad, remolque });
      setAbierto(false);
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message?.startsWith("HTTP 400")
        ? "Revisa los datos: falta algo o hay un valor no válido." : err.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="nomina-container">
      <header>
        <h1 className="noeco-title">Gastos mantenimiento</h1>
        <p className="cp-lead">Lo que se le cambió a cada unidad propia y a su remolque.</p>
      </header>

      <div className="toolbar">
        <div className="np-resumen">{filas.length} registros</div>
        <div className="toolbar-acciones">
          <button className="np-btn-calendario" onClick={abrir}>
            <Plus size={18} aria-hidden="true" /> Registrar gasto
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="nomina-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Vehículo</th><th>Remolque</th><th>Qué cambió</th>
              <th>Kilometraje</th><th>Descripción de la pieza</th>
            </tr>
          </thead>
          <tbody>
            {cargando && filas.length === 0 ? (
              <tr><td colSpan={6} className="np-vacio">Cargando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={6} className="np-vacio">Aún no hay gastos de mantenimiento.</td></tr>
            ) : filas.map((g) => (
              <tr key={g.id}>
                <td>{fechaLegible(g.fecha)}</td>
                <td>{g.unidad}</td>
                <td>{g.remolque}</td>
                <td>{g.que_cambio}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{km(g.kilometraje)}</td>
                <td>{g.descripcion_pieza}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {abierto && <Registro onCerrar={() => setAbierto(false)} onGuardar={crear} guardando={guardando}
          unidad={unidad} setUnidad={setUnidad} remolque={remolque} setRemolque={setRemolque} />}
      </AnimatePresence>
    </div>
  );
}

function Registro({ onCerrar, onGuardar, guardando, unidad, setUnidad, remolque, setRemolque }) {
  // Escape cierra. En window y no en document: la lista abierta de un selector
  // escucha en document y hace stopPropagation, así que su Escape cierra solo
  // la lista y no el formulario a medio llenar.
  useEffect(() => {
    const alPulsar = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  return (
    <motion.div className="gm-overlay" {...overlayMotion} onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <motion.div className="fz-dialogo gm-dialogo" role="dialog" aria-modal="true" aria-labelledby="gm-titulo" {...contentMotion}>
        <form onSubmit={onGuardar}>
          <h2 id="gm-titulo">Registrar gasto de mantenimiento</h2>
          {/* Sin transportista, PlacasSelector lista solo las unidades propias. */}
          <div className="fz-campo-tipo">Vehículo
            <PlacasSelector currentValue={unidad} onSelect={(p) => setUnidad(p)} />
          </div>
          <div className="fz-campo-tipo">Remolque
            <RemolqueSelector currentValue={remolque} onSelect={(p) => setRemolque(p)} mostrarEco />
          </div>
          <label>Qué cambió<textarea name="que_cambio" required rows={2} /></label>
          <label>Fecha del movimiento<input name="fecha" type="date" required /></label>
          <label>Kilometraje
            <input name="kilometraje" type="text" inputMode="decimal" required
              pattern="\d{1,10}(\.\d{1,10})?" title="Solo números; hasta 10 decimales, con punto." />
          </label>
          <label>Descripción de la pieza
            <textarea name="descripcion_pieza" required rows={2} placeholder="Original, genérica…" />
          </label>
          <div className="fz-dialogo-acciones">
            <button type="button" className="btn-cancelar-app" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
