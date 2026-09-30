import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Upload, X } from "lucide-react";
import { apiClient } from "../api/apiClient";
import { filtrarBusqueda } from "../utils/buscar.mjs";
import SearchBar from "../components/SearchBar/SearchBar";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import "./NominaPage.css";
import "./FacturacionPage.css";

// Facturación (Fase 1 de PLAN_MODULO_FINANZAS.md). Las facturas se CARGAN del
// Excel; nadie las escribe a mano. Quién entra lo decide el backend: esta
// pantalla solo pregunta a /facturas/acceso/ para no pintar lo que daría 403.
// Reutiliza la hoja de Nómina: es la misma familia de tablas del sistema.

const COLUMNAS = [
  { key: "nombre",        label: "Nombre" },
  { key: "rfc",           label: "RFC" },
  { key: "serie",         label: "Serie" },
  { key: "folio",         label: "Folio" },
  { key: "fecha_emision", label: "Fecha emisión" },
  { key: "vencimiento",   label: "Vence" },
  { key: "total",         label: "Total" },
  { key: "maniobra",      label: "Maniobra ligada" },
  { key: "cobrada",       label: "Cobrada" },
];

const moneda = (v) =>
  Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const fechaLegible = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// ponytail: trae todas las páginas de una vez. Son decenas de facturas al mes;
// si algún día la lista pesa, paginar en la tabla como Gastos (loadMore).
async function traerTodas(estado) {
  const filas = [];
  for (let pagina = 1; ; pagina++) {
    const data = await apiClient.get(`/facturas/?estado=${estado}&page=${pagina}`);
    filas.push(...(data?.results ?? []));
    if (!data?.next) return filas;
  }
}

export default function FacturacionPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const [acceso, setAcceso] = useState(null);
  const [estado, setEstado] = useState("activa");
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState(null);
  const tablaRef = useRef(null);
  const archivoRef = useRef(null);

  useEffect(() => {
    apiClient.get("/facturas/acceso/")
      .then(setAcceso)
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFilas(await traerTodas(estado));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [estado]);

  useEffect(() => { if (acceso?.ver) cargar(); }, [acceso, cargar]);

  const visibles = useMemo(() => filtrarBusqueda(filas, busqueda), [filas, busqueda]);

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    const datos = new FormData();
    datos.append("archivo", archivo);
    setSubiendo(true);
    try {
      setResumen(await apiClient.upload("/facturas/cargar/", datos));
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo cargar el archivo." });
    } finally {
      setSubiendo(false);
    }
  };

  // Se marca a mano (P27). Optimista: si el servidor dice que no, vuelve atrás.
  const alternarCobrada = async (f) => {
    const valor = !f.cobrada;
    const poner = (v) => setFilas((prev) => prev.map((x) => (x.id === f.id ? { ...x, cobrada: v } : x)));
    poner(valor);
    try {
      await apiClient.post(`/facturas/${f.id}/cobrada/`, { cobrada: valor });
    } catch (err) {
      poner(!valor);
      alerta({ tipo: "error", msg: err.message || "No se pudo marcar la factura." });
    }
  };

  const cambiarEstado = async (f) => {
    const cancelar = f.estado === "activa";
    if (!await preguntar({
      titulo: cancelar ? "Cancelar factura" : "Reactivar factura",
      mensaje: cancelar
        ? "Dejará de contar en las ventas y en los Ingresos de Gastos. No se borra: se puede reactivar."
        : "Volverá a contar en las ventas y en los Ingresos de Gastos.",
      dato: `${f.serie} ${f.folio} · ${moneda(f.total)}`,
      accion: cancelar ? "Cancelar factura" : "Reactivar",
      peligro: cancelar,
    })) return;
    try {
      await apiClient.post(`/facturas/${f.id}/${cancelar ? "cancelar" : "reactivar"}/`, {});
      setFilas((prev) => prev.filter((x) => x.id !== f.id));
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo cambiar el estado." });
    }
  };

  if (acceso && !acceso.ver) {
    return (
      <div className="nomina-container">
        <div className="error-box">
          <h2 className="error-title">Sin acceso</h2>
          <p className="error-text">Facturación es solo para dirección, comercial y administradores.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nomina-container">
        <div className="error-box">
          <h2 className="error-title">No se pudo cargar</h2>
          <p className="error-text">{error}</p>
        </div>
      </div>
    );
  }

  const columnas = acceso?.cancelar ? [...COLUMNAS, { key: "accion", label: "" }] : COLUMNAS;

  return (
    <div className="nomina-container">

      <div className="np-search">
        <SearchBar value={busqueda} onChange={setBusqueda}
          placeholder="Buscar por nombre, RFC, serie o folio…" />
      </div>

      <div className="toolbar">
        <div className="fc-filtro" role="group" aria-label="Estado de la factura">
          {[["activa", "Activas"], ["cancelada", "Canceladas"]].map(([valor, texto]) => (
            <button key={valor} aria-pressed={estado === valor}
              className={estado === valor ? "activo" : ""}
              onClick={() => setEstado(valor)}>
              {texto}
            </button>
          ))}
        </div>
        <div className="np-resumen">
          {visibles.length} {visibles.length === 1 ? "factura" : "facturas"}
        </div>
        <div className="toolbar-acciones">
          <input ref={archivoRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={subir} />
          <button className="np-btn-calendario" disabled={subiendo}
            onClick={() => archivoRef.current?.click()}
            title="Sube el Excel de facturación de Fraba o de Soluciones">
            <Upload size={18} /> {subiendo ? "Cargando…" : "Cargar Excel"}
          </button>
        </div>
      </div>

      {resumen && (
        <section className="fc-resumen" aria-live="polite">
          <button className="fc-cerrar" onClick={() => setResumen(null)} aria-label="Cerrar resumen">
            <X size={16} />
          </button>
          <p>
            <strong>{resumen.creadas}</strong> {resumen.creadas === 1 ? "factura nueva" : "facturas nuevas"},{" "}
            <strong>{resumen.ligadas}</strong> {resumen.ligadas === 1 ? "ligada" : "ligadas"} a su maniobra.
          </p>
          {resumen.omitidas.length > 0 && (
            <>
              <p className="fc-subtitulo">Se omitieron {resumen.omitidas.length}:</p>
              <ul>
                {resumen.omitidas.map((o) => (
                  <li key={o.fila}>Fila {o.fila} · {o.serie} {o.folio} — {o.motivo}</li>
                ))}
              </ul>
            </>
          )}
          {resumen.ambiguas.length > 0 && (
            <>
              <p className="fc-subtitulo">Quedaron pendientes de ligar porque varias maniobras las nombran:</p>
              <ul>
                {resumen.ambiguas.map((a) => (
                  <li key={`${a.serie}${a.folio}`}>{a.serie} {a.folio} — maniobras {a.maniobras.join(", ")}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <div className="bst-zona">
        <BarraScrollTabla contenedorRef={tablaRef} />
        <div className="table-responsive tabla-cabecera-fija" ref={tablaRef}>
          <table className="nomina-table">
            <thead>
              <tr>{columnas.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading || !acceso ? (
                <tr><td colSpan={columnas.length} className="np-vacio">Cargando facturas…</td></tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={columnas.length} className="np-vacio">
                    {estado === "activa" ? "No hay facturas. Carga el Excel de facturación." : "No hay facturas canceladas."}
                  </td>
                </tr>
              ) : visibles.map((f) => (
                <tr key={f.id}>
                  <td>{f.nombre}</td>
                  <td>{f.rfc}</td>
                  <td>{f.serie}</td>
                  <td>{f.folio}</td>
                  <td>{fechaLegible(f.fecha_emision)}</td>
                  {/* Emisión + días de crédito del cliente principal. Sin
                      principal no hay días que aplicar: queda fuera de la
                      antigüedad de saldos hasta que se ligue. */}
                  <td title={f.vencimiento ? undefined
                    : "Sin cliente principal: queda fuera de la antigüedad de saldos"}>
                    {f.vencimiento ? fechaLegible(f.vencimiento) : "—"}
                  </td>
                  <td className="fc-total">{moneda(f.total)}</td>
                  <td>
                    {f.maniobra ? (f.maniobra_folio || `Maniobra ${f.maniobra}`) : (
                      <span className="fc-pendiente"
                        title="Ninguna maniobra tiene este número en su No. Factura">
                        Pendiente de ligar
                      </span>
                    )}
                  </td>
                  <td className="fc-centro">
                    <input type="checkbox" className="fc-check" checked={f.cobrada}
                      onChange={() => alternarCobrada(f)}
                      aria-label={`${f.serie} ${f.folio}: ${f.cobrada ? "desmarcar" : "marcar"} como cobrada`} />
                  </td>
                  {acceso?.cancelar && (
                    <td>
                      <button className={f.estado === "activa" ? "fc-accion btn-cancelar-app" : "fc-accion"}
                        onClick={() => cambiarEstado(f)}>
                        {f.estado === "activa" ? "Cancelar" : "Reactivar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <BotonArriba />
    </div>
  );
}
