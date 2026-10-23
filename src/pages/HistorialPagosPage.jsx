import { Fragment, useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { apiClient } from "../api/apiClient";
import SearchBar from "../components/SearchBar/SearchBar";
import { filtrarBusqueda } from "../utils/buscar.mjs";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";

// HISTORIAL DE PAGOS (usuario, 2026-10-22): todos los pagos GUARDADOS en
// Compensación, también los cancelados, del más reciente al más viejo. Lo
// aplicado sale del servidor al cargar: refleja los abonos de ese momento.
// Se abona en Compensación. Aquí se puede CANCELAR un pago (solo admin):
// es el único sitio donde aparece uno ya aplicado entero.

const moneda = (v) => (v == null ? "—" :
  Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const fechaLegible = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const centavos = (v) => Math.round(Number(v || 0) * 100);
const ESTADOS = [["activa", "Activos"], ["cancelada", "Cancelados"], ["", "Todos"]];

export default function HistorialPagosPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const [acceso, setAcceso] = useState(null);
  const [pagos, setPagos] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("activa");
  const [abierto, setAbierto] = useState(null); // id del pago desplegado

  const cargar = () => apiClient.get("/pagos/").then(setPagos).catch((err) => setError(err.message));

  useEffect(() => {
    apiClient.get("/facturas/acceso/").then((a) => {
      setAcceso(a);
      if (a?.ver) cargar();
    }).catch(() => setAcceso({ ver: false }));
  }, []);

  const cancelar = async (p) => {
    if (!await preguntar({
      titulo: "Cancelar pago",
      mensaje: "Se cancelan también todos sus abonos y deja de contar en la cobranza. Las facturas que cubría vuelven a quedar sin cobrar. No se borra.",
      dato: `${fechaLegible(p.fecha)} · ${p.nombre || "Sin cliente"} · ${moneda(p.monto)}`,
      accion: "Cancelar pago",
      peligro: true,
    })) return;
    try {
      await apiClient.post(`/pagos/${p.id}/cancelar/`, {});
      alerta({ tipo: "exito", msg: "Pago cancelado." });
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo cancelar el pago." });
    }
  };

  if (!acceso) return <div className="nomina-container" />;
  if (!acceso.ver || error) {
    return (
      <div className="nomina-container">
        <div className="error-box">
          <h2 className="error-title">{error ? "No se pudo cargar" : "Sin acceso"}</h2>
          <p className="error-text">{error || "Finanzas es solo para dirección, comercial y administradores."}</p>
        </div>
      </div>
    );
  }

  const delEstado = (pagos ?? []).filter((p) => !estado || p.estado === estado);
  // La búsqueda mira lo que se ve en la fila (fecha como dd/mm/aaaa).
  const visibles = filtrarBusqueda(delEstado.map((p) => ({ ...p, fecha_legible: fechaLegible(p.fecha) })), busqueda);
  const columnas = acceso.cancelar ? 11 : 10;
  const total = visibles.reduce((n, p) => n + centavos(p.monto), 0) / 100;

  return (
    <div className="nomina-container">
      <div className="np-search">
        <SearchBar value={busqueda} onChange={setBusqueda}
          placeholder="Buscar por cliente, RFC, banco, clave de rastreo o fecha…" />
      </div>

      <div className="toolbar">
        <div className="fc-filtro" role="group" aria-label="Estado del pago">
          {ESTADOS.map(([valor, texto]) => (
            <button key={texto} aria-pressed={estado === valor} className={estado === valor ? "activo" : ""}
              onClick={() => setEstado(valor)}>{texto}</button>
          ))}
        </div>
        <div className="np-resumen">
          {visibles.length} {visibles.length === 1 ? "pago" : "pagos"} · {moneda(total)}
        </div>
      </div>

      <div className="table-responsive tabla-cabecera-fija">
        <table className="nomina-table cp-historial">
          <thead>
            <tr>
              <th aria-label="Detalle" />
              <th>Fecha</th><th>Cliente</th><th>RFC</th><th>Banco</th><th>Clave de rastreo</th>
              <th>Monto</th><th>Aplicado</th><th>Por aplicar</th><th>Estado</th>
              {acceso.cancelar && <th aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {pagos === null ? (
              <tr><td colSpan={columnas} className="np-vacio">Cargando pagos…</td></tr>
            ) : visibles.length === 0 ? (
              <tr><td colSpan={columnas} className="np-vacio">No hay pagos guardados.</td></tr>
            ) : visibles.map((p) => (
              <Fragment key={p.id}>
                <tr className={p.estado === "cancelada" ? "cp-cancelado" : undefined}>
                  <td>
                    <button type="button" className="fc-accion" aria-expanded={abierto === p.id}
                      aria-label={`Facturas abonadas con el pago del ${fechaLegible(p.fecha)}`}
                      onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                      {abierto === p.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {p.abonos.filter((a) => a.estado === "activa").length}
                    </button>
                  </td>
                  <td>{fechaLegible(p.fecha)}</td>
                  <td>{p.nombre || "—"}</td>
                  <td>{p.rfc || "—"}</td>
                  <td>{p.banco}</td>
                  <td>{p.clave_rastreo || "—"}</td>
                  <td className="fc-total">{moneda(p.monto)}</td>
                  <td className="fc-total">{moneda(p.aplicado)}</td>
                  <td className="fc-total">{moneda((centavos(p.monto) - centavos(p.aplicado)) / 100)}</td>
                  <td>{p.estado === "activa" ? "Activo" : "Cancelado"}</td>
                  {acceso.cancelar && (
                    <td>{p.estado === "activa" &&
                      <button className="fc-accion btn-cancelar-app" onClick={() => cancelar(p)}>Cancelar</button>}</td>
                  )}
                </tr>
                {abierto === p.id && (
                  <tr className="cp-detalle">
                    <td colSpan={columnas}>
                      {p.abonos.length === 0 ? "Este pago aún no se ha abonado a ninguna factura." : (
                        <ul>
                          {p.abonos.map((a) => (
                            <li key={a.id} className={a.estado === "cancelada" ? "cp-cancelado" : undefined}>
                              {a.factura} · {a.nombre || "—"} · parcialidad {a.parcialidad} · {moneda(a.monto)}
                              {a.estado === "cancelada" && " (cancelado)"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
