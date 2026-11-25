import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { apiClient } from "../api/apiClient";
import { useAuthContext } from "../context/AuthContext";
import PlacasSelector from "../components/PlacasSelector/PlacasSelector";
import RemolqueSelector from "../components/RemolqueSelector/RemolqueSelector";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";
import "./MantenimientoPage.css";

// Mantenimiento (menú principal) y Viajes > Gastos > Gastos mantenimiento
// (usuario, 2026-11-25). Las dos son la misma pantalla con otros campos: tabla,
// registrar, editar (todos) y borrar (solo admin; el backend también lo exige).
// Cada registro es de un vehículo propio O de un remolque, nunca de los dos.
//
// El formulario va en un overlay y no en <dialog>.showModal(): los selectores
// pintan su lista en un portal sobre <body>, y el modal nativo deja inerte todo
// lo que queda fuera de él.

const fechaLegible = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
// El backend guarda 10 decimales: se enseña sin los ceros de relleno.
const km = (v) => (v == null ? "" : String(v).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""));
const moneda = (v) => (v == null || v === "" ? "" :
  Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const METODOS = [["efectivo", "Efectivo"], ["tdc", "TDC"], ["tdd", "TDD"]];
const NOMBRE_METODO = Object.fromEntries(METODOS);

// Cada campo propio de la página: cómo se pinta en la tabla y en el formulario.
const texto = (name, label, placeholder) => ({
  name, label,
  celda: (g) => g[name],
  campo: (g) => <label key={name}>{label}<textarea name={name} required rows={2} placeholder={placeholder} defaultValue={g?.[name] ?? ""} /></label>,
});
const decimal = (name, label, decimales, formato) => ({
  name, label, numerica: true,
  celda: (g) => formato(g[name]),
  campo: (g) => (
    <label key={name}>{label}
      <input name={name} type="text" inputMode="decimal" required defaultValue={g ? km(g[name]) : ""}
        pattern={`\\d{1,10}(\\.\\d{1,${decimales}})?`} title={`Solo números; hasta ${decimales} decimales, con punto.`} />
    </label>
  ),
});

const fecha = (label) => ({
  name: "fecha", label: "Fecha",
  celda: (g) => fechaLegible(g.fecha),
  campo: (g) => <label key="fecha">{label}<input name="fecha" type="date" required defaultValue={g?.fecha ?? ""} /></label>,
});

const PAGINAS = {
  mantenimiento: {
    titulo: "Mantenimiento",
    lead: "Lo que se le cambió a cada unidad propia o remolque.",
    endpoint: "/mantenimientos/",
    vacio: "Aún no hay mantenimientos registrados.",
    campos: [
      texto("que_cambio", "Qué cambió"),
      fecha("Fecha del movimiento"),
      decimal("kilometraje", "Kilometraje", 10, km),
      texto("descripcion_pieza", "Descripción de la pieza", "Original, genérica…"),
    ],
  },
  gastos: {
    titulo: "Gastos mantenimiento",
    lead: "Lo que costó cada mantenimiento y cómo se pagó.",
    endpoint: "/gastos-mantenimiento/",
    vacio: "Aún no hay gastos de mantenimiento.",
    campos: [
      fecha("Fecha del gasto"),
      texto("descripcion", "Descripción del gasto"),
      decimal("monto", "Monto", 2, moneda),
      {
        name: "metodo_pago", label: "Método de pago",
        celda: (g) => NOMBRE_METODO[g.metodo_pago] ?? g.metodo_pago,
        // 3 opciones a la vista: radios, no <select>.
        campo: (g) => (
          <fieldset key="metodo_pago" className="gm-metodo">
            <legend>Método de pago</legend>
            {METODOS.map(([v, t]) => (
              <label key={v}><input type="radio" name="metodo_pago" value={v} required defaultChecked={g?.metodo_pago === v} />{t}</label>
            ))}
          </fieldset>
        ),
      },
    ],
  },
};

function Registros({ pagina }) {
  const { titulo, lead, endpoint, vacio, campos } = PAGINAS[pagina];
  const { isAdmin } = useAuthContext();
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  // null: cerrado · {}: registro nuevo · fila: edición de esa fila.
  const [editando, setEditando] = useState(null);
  const [unidad, setUnidad] = useState("");
  const [remolque, setRemolque] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await apiClient.get(endpoint);
      // ponytail: solo la primera página de la API (60). Paginar cuando haya más.
      setFilas(data.results ?? data);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    } finally {
      setCargando(false);
    }
  }, [endpoint, alerta]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (fila = {}) => {
    setUnidad(fila.unidad ?? "");
    setRemolque(fila.remolque ?? "");
    setEditando(fila);
  };

  const guardar = async (e) => {
    e.preventDefault();
    // Los dos selectores no son controles de formulario: se validan aquí.
    if (!unidad && !remolque) {
      alerta({ tipo: "error", msg: "Elige un vehículo o un remolque." });
      return;
    }
    setGuardando(true);
    try {
      const datos = { ...Object.fromEntries(new FormData(e.target)), unidad, remolque };
      await (editando.id
        ? apiClient.patch(`${endpoint}${editando.id}/`, datos)
        : apiClient.post(endpoint, datos));
      setEditando(null);
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message?.startsWith("HTTP 400")
        ? "Revisa los datos: falta algo o hay un valor no válido." : err.message });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (g) => {
    if (!await preguntar({
      titulo: "Borrar registro",
      mensaje: "Se borra para siempre.",
      dato: `${g.unidad || g.remolque} · ${campos[0].celda(g)}`,
      accion: "Borrar", peligro: true,
    })) return;
    try {
      await apiClient.delete(`${endpoint}${g.id}/`);
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    }
  };

  const columnas = 1 + campos.length + 1;

  return (
    <div className="nomina-container">
      <header>
        <h1 className="noeco-title">{titulo}</h1>
        <p className="cp-lead">{lead}</p>
      </header>

      <div className="toolbar">
        <div className="np-resumen">{filas.length} registros</div>
        <div className="toolbar-acciones">
          <button className="np-btn-calendario" onClick={() => abrir()}>
            <Plus size={18} aria-hidden="true" /> Registrar
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="nomina-table">
          <thead>
            <tr>
              <th>Vehículo/Remolque</th>
              {campos.map((c) => <th key={c.name}>{c.label}</th>)}
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {cargando && filas.length === 0 ? (
              <tr><td colSpan={columnas} className="np-vacio">Cargando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={columnas} className="np-vacio">{vacio}</td></tr>
            ) : filas.map((g) => (
              <tr key={g.id}>
                {/* Uno u otro: comparten columna (usuario, 2026-11-25). */}
                <td>{g.unidad || g.remolque}</td>
                {campos.map((c) => (
                  <td key={c.name} style={c.numerica ? { fontVariantNumeric: "tabular-nums" } : undefined}>{c.celda(g)}</td>
                ))}
                <td>
                  <div className="gm-acciones">
                    <button className="fc-accion" onClick={() => abrir(g)}>Editar</button>
                    {isAdmin && <button className="fc-accion btn-cancelar-app" onClick={() => borrar(g)}>Borrar</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {editando && (
          <Formulario titulo={`${editando.id ? "Editar" : "Registrar"} · ${titulo}`} onCerrar={() => setEditando(null)}
            onGuardar={guardar} guardando={guardando}>
            {/* Uno u otro: elegir uno vacía el otro. Sin transportista,
                PlacasSelector lista solo las unidades propias. */}
            <div className="fz-campo-tipo">Vehículo
              <PlacasSelector currentValue={unidad} onSelect={(p) => { setUnidad(p); if (p) setRemolque(""); }} />
            </div>
            <div className="fz-campo-tipo">Remolque
              <RemolqueSelector currentValue={remolque} onSelect={(p) => { setRemolque(p); if (p) setUnidad(""); }} mostrarEco />
            </div>
            <p className="gm-nota">Elige un vehículo o un remolque, no los dos.</p>
            {campos.map((c) => c.campo(editando.id ? editando : null))}
          </Formulario>
        )}
      </AnimatePresence>
    </div>
  );
}

function Formulario({ titulo, onCerrar, onGuardar, guardando, children }) {
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
          <h2 id="gm-titulo">{titulo}</h2>
          {children}
          <div className="fz-dialogo-acciones">
            <button type="button" className="btn-cancelar-app" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function MantenimientoPage() {
  return <Registros pagina="mantenimiento" />;
}

export function GastosMantenimientoPage() {
  return <Registros pagina="gastos" />;
}
