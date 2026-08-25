import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { overlayMotion, contentMotion } from "../../animations/modalMotion";
import { apiClient } from "../../api/apiClient";
import { textoDelPar } from "../../utils/dobleValor.mjs";
import { STATUS_MAP } from "../../config/statusConfig";
import "./Seguimientos.css";

// Qué estados se resumen y con qué nombre. Los colores NO se escriben aquí: salen
// de STATUS_MAP, que es la fuente única de los status (ver config/statusConfig.js),
// así que la bolita siempre es el mismo color que la fila de la tabla.
const FILAS = [
  { id: "activo",    etiqueta: "ACTIVOS" },
  { id: "pendiente", etiqueta: "PENDIENTES" },
];

// Cada cuánto se vuelven a pedir los conteos. Los status se cambian desde
// Maniobras, y volver al inicio desmonta y remonta esta pantalla, así que ese
// camino ya se refresca solo; el intervalo cubre dejar el inicio abierto
// mientras otra persona los mueve. Un minuto: son dos COUNT(*) y el dato es un
// resumen, no un marcador en vivo.
const REFRESCO_MS = 60_000;

// YYYY-MM-DD (backend) → DD/MM/YYYY. Copiada de ManiobrasPage, que la tiene
// como función local: extraerla obligaría a tocar esa pantalla sin necesidad.
const fechaParaMostrar = (valor) => {
  const [y, m, d] = (valor ?? "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : (valor || "—");
};

// El desglose de PENDIENTES, en el orden pedido por el usuario (2026-08-25).
//
// key2 marca las tres columnas de un Full, que desde la migración 0035 guardan
// cada mitad en SU columna: sin leer la segunda, un Full enseñaba un solo
// contenedor. textoDelPar() las une venga el dato en el formato que venga
// (ver utils/dobleValor.mjs) — es la misma función que usa la tabla de
// Maniobras, que tuvo este mismo fallo.
const COLUMNAS_PENDIENTES = [
  { key: "fecha_pis",               label: "Fecha PIS",       fecha: true },
  { key: "horario",                 label: "Horario" },
  { key: "contenedor",              label: "Contenedor",      key2: "contenedor_2" },
  { key: "tipo",                    label: "Tipo de carga",   key2: "tipo_2", esTipo: true },
  { key: "peso",                    label: "Peso",            key2: "peso_2" },
  { key: "origen",                  label: "Origen" },
  { key: "destino",                 label: "Destino" },
  { key: "cliente",                 label: "Cliente" },
  { key: "fecha_entrega_mercancia", label: "Fecha de entrega", fecha: true },
];

// Lo que se pinta en una celda del desglose.
function celda(maniobra, col) {
  if (col.fecha) return fechaParaMostrar(maniobra[col.key]);
  const valor = col.key2
    ? textoDelPar(maniobra[col.key], maniobra[col.key2], col.esTipo)
    : maniobra[col.key];
  return valor || "—";
}

/**
 * Lista de las maniobras pendientes que siguen en piso.
 *
 * sin_asignar=1 es el criterio: sin transportista y sin operador. Con
 * cualquiera de los dos puesto ya hay quien la mueva y sale de viaje, así que
 * no tiene sentido verla aquí.
 *
 * Orden por fecha_pis ascendente — arriba la que lleva más tiempo esperando,
 * al revés que la tabla de Maniobras. El id desempata dentro del mismo día.
 */
function ListaPendientes() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    apiClient
      .get("/maniobras/?status=pendiente&sin_asignar=1&ordering=fecha_pis,id")
      .then((datos) => { if (!cancelado) setFilas(datos.results ?? datos); })
      // Un fallo no puede parecerse a "no hay ninguna": misma lección que los
      // conteos de arriba.
      .catch(() => { if (!cancelado) setError(true); });
    return () => { cancelado = true; };
  }, []);

  if (error)  return <p className="seg-modal-estado seg-modal-estado--error">No se pudo cargar la lista.</p>;
  if (!filas) return <p className="seg-modal-estado">Cargando…</p>;
  if (filas.length === 0) return <p className="seg-modal-estado">No hay pendientes en piso.</p>;

  return (
    // ponytail: se ven los que quepan en una página de la API (60). Hoy hay 2;
    // si algún día pasan de 60, paginar aquí.
    <div className="seg-modal-scroll">
      <table className="seg-tabla">
        <thead>
          <tr>
            {COLUMNAS_PENDIENTES.map((col) => (
              <th key={col.key} className="seg-th">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => (
            <tr key={m.id}>
              {COLUMNAS_PENDIENTES.map((col) => (
                <td key={col.key} className="seg-td">{celda(m, col)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModalDesglose({ tipo, onCerrar }) {
  // Escape cierra: es lo que espera cualquiera con un modal abierto.
  useEffect(() => {
    const alPulsar = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  const titulo = tipo === "activo" ? "Servicios activos" : "Pendientes en piso";

  return (
    <motion.div
      className="seg-modal-overlay"
      {...overlayMotion}
      onClick={onCerrar}
    >
      <motion.div
        className="seg-modal"
        {...contentMotion}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        // El clic dentro no debe cerrar; solo el del fondo.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="seg-modal-header">
          <h2 className="seg-modal-titulo">{titulo}</h2>
          <button type="button" className="seg-modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="seg-modal-body">
          {tipo === "pendiente"
            ? <ListaPendientes />
            : <p className="seg-modal-estado">El desglose de activos está pendiente.</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Seguimientos
 * Resumen corto de cuántas maniobras hay activas y pendientes. Cada fila abre
 * su desglose.
 */
export default function Seguimientos() {
  const [conteos, setConteos] = useState(null);
  const [error,   setError]   = useState(false);
  const [abierto, setAbierto] = useState(null);   // "activo" | "pendiente" | null

  useEffect(() => {
    // El intervalo puede resolver una petición después de desmontar; la bandera
    // evita tocar el estado de un componente que ya no está.
    let cancelado = false;

    const pedir = () => {
      apiClient
        .get("/maniobras/resumen-status/")
        .then((datos) => {
          if (cancelado) return;
          setConteos(datos);
          // Se limpia al acertar: con refresco automático, un fallo pasajero de
          // red dejaría el aviso puesto para siempre aunque ya vuelva a haber datos.
          setError(false);
        })
        // Un fallo NO puede parecerse a "no hay ninguna": un cero es un dato y una
        // consulta caída no lo es. Misma lección que las alertas de vencimiento.
        .catch(() => { if (!cancelado) setError(true); });
    };

    pedir();
    // Con la pestaña en segundo plano no hay nadie mirando: no tiene sentido
    // gastar una consulta por minuto en una pantalla que nadie ve.
    const id = setInterval(() => { if (!document.hidden) pedir(); }, REFRESCO_MS);

    return () => { cancelado = true; clearInterval(id); };
  }, []);

  return (
    <aside className="seg-panel" aria-label="Seguimientos">
      <h2 className="seg-header">SEGUIMIENTOS</h2>
      <div className="seg-cuerpo">
        {error ? (
          <p className="seg-fallo">No se pudo cargar el resumen.</p>
        ) : (
          FILAS.map(({ id, etiqueta }) => (
            <button
              key={id}
              type="button"
              className="seg-fila seg-fila--boton"
              onClick={() => setAbierto(id)}
              title={`Ver el desglose de ${etiqueta.toLowerCase()}`}
            >
              <span className="seg-bolita" style={{ background: STATUS_MAP[id].color }} />
              <span className="seg-etiqueta">{etiqueta}</span>
              <span className="seg-numero">{conteos ? conteos[id] : "—"}</span>
            </button>
          ))
        )}
      </div>

      <AnimatePresence>
        {abierto && <ModalDesglose tipo={abierto} onCerrar={() => setAbierto(null)} />}
      </AnimatePresence>
    </aside>
  );
}
