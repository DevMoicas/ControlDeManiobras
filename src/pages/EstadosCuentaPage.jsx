import { Fragment, useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Download, Loader } from "lucide-react";
import { apiClient } from "../api/apiClient";
import { filtrarBusqueda } from "../utils/buscar.mjs";
import { useAlerta } from "../components/Alertas/Alertas";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";
import "../components/Dashboards/Dashboards.css";

// ESTADOS DE CUENTA (usuario, 2026-10-21). Formato de
// docs/planes/codigo_estados_de_cuenta.html (rama main): Resumen de cartera y
// Clientes y saldos; "Gestionar facturas" no, eso es Facturación.
//
// Todo sale de /facturas/cuentas-por-cobrar/: las facturas activas SIN fecha de
// cobro, por su SALDO pendiente (usuario, 2026-10-22): los abonos de
// Compensación ya restan. El estatus lo pone el backend, que es el mismo que
// imprime el PDF.

const EMPRESAS = [["fraba", "Fraba"], ["soluciones", "Soluciones"]];
const NOMBRE_EMPRESA = Object.fromEntries(EMPRESAS);
const ESTATUS = [["en_tiempo", "En tiempo", "✓"], ["por_vencer", "Por vencer", "◷"], ["vencida", "Vencida", "!"]];
const ETIQUETA = Object.fromEntries(ESTATUS.map(([k, t, s]) => [k, `${s} ${t}`]));

const moneda = (v) => Number(v || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const suma = (filas) => filas.reduce((n, f) => n + Number(f.saldo || 0), 0);
const fechaLarga = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX",
  { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
const dias = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
// El peor estatus del cliente manda.
const estatusGeneral = (filas) => ["vencida", "por_vencer"].find((e) => filas.some((f) => f.estatus === e)) ?? "en_tiempo";

export default function EstadosCuentaPage() {
  const alerta = useAlerta();
  const [acceso, setAcceso] = useState(null);
  const [facturas, setFacturas] = useState(null);
  const [empresa, setEmpresa] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [generando, setGenerando] = useState(null); // clave del cliente en curso
  const [abiertos, setAbiertos] = useState(() => new Set()); // clientes desplegados

  useEffect(() => {
    apiClient.get("/facturas/acceso/").then(setAcceso).catch(() => setAcceso({ ver: false }));
  }, []);
  useEffect(() => {
    if (!acceso?.ver) return;
    apiClient.get("/facturas/cuentas-por-cobrar/").then((d) => setFacturas(d.facturas)).catch((err) => {
      setFacturas([]);
      alerta({ tipo: "error", msg: err.message });
    });
  }, [acceso, alerta]);

  if (!acceso) return <div className="nomina-container" />;
  if (!acceso.ver) {
    return (
      <div className="nomina-container">
        <div className="error-box">
          <h2 className="error-title">Sin acceso</h2>
          <p className="error-text">Finanzas es solo para dirección, comercial y administradores.</p>
        </div>
      </div>
    );
  }

  const filas = (facturas ?? []).filter((f) => !empresa || f.empresa === empresa);
  const conVencimiento = filas.filter((f) => f.vencimiento);
  const sinCliente = filas.filter((f) => !f.cliente_principal_id);

  // Un renglón por cliente Y empresa: el estado de cuenta es de una sola serie.
  // Sin cliente principal se agrupa por el receptor del XML (usuario, 2026-10-23)
  // para que salgan TODAS las sin cobrar; sin días de crédito no hay estatus ni PDF.
  const grupos = Object.values(filas.reduce((acc, f) => {
    const id = f.cliente_principal_id;
    const clave = `${f.empresa}|${id ?? `xml:${f.nombre}`}`;
    (acc[clave] ??= { clave, id, nombre: id ? f.cliente_principal : f.nombre || "Sin receptor", empresa: f.empresa, filas: [] })
      .filas.push(f);
    return acc;
  }, {})).sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.empresa.localeCompare(b.empresa));
  const buscados = new Set(filtrarBusqueda(grupos.map((g) => ({ nombre: g.nombre, clave: g.clave })), busqueda)
    .map((g) => g.clave));
  const visibles = grupos.filter((g) => buscados.has(g.clave)
    && (!filtroEstatus || (g.id && estatusGeneral(g.filas) === filtroEstatus)));

  const alternar = (clave) => setAbiertos((prev) => {
    const sig = new Set(prev);
    if (!sig.delete(clave)) sig.add(clave);
    return sig;
  });

  const generar = async (g) => {
    setGenerando(g.clave);
    try {
      const blob = await apiClient.download("/documentos/estado-cuenta/",
        { cliente: g.id, empresa: g.empresa, formato: "pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ESTADO DE CUENTA ${g.nombre} ${NOMBRE_EMPRESA[g.empresa].toUpperCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo generar el estado de cuenta." });
    } finally {
      setGenerando(null);
    }
  };

  return (
    <div className="nomina-container">
      <div className="ec-cabecera">
        <div>
          <h2>Resumen de cartera</h2>
          <p className="db-nota">Facturas sin cobrar al {fechaLarga(new Date().toLocaleDateString("en-CA"))}.</p>
        </div>
        <div className="fc-filtro" role="group" aria-label="Empresa">
          {[["", "Todas"], ...EMPRESAS].map(([v, t]) => (
            <button key={v} aria-pressed={empresa === v} className={empresa === v ? "activo" : ""}
              onClick={() => setEmpresa(v)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="db-kpis">
        {[["Total de cartera", moneda(suma(filas))],
          ["Total vencido al día", moneda(suma(filas.filter((f) => f.estatus === "vencida")))],
          ["Promedio de días de crédito", `${conVencimiento.length ? Math.round(conVencimiento
            .reduce((n, f) => n + dias(f.fecha_emision, f.vencimiento), 0) / conVencimiento.length) : 0} días`],
          ["Facturas por vencer", filas.filter((f) => f.estatus === "por_vencer").length],
        ].map(([titulo, valor]) => (
          <div key={titulo} className="db-kpi"><span className="db-kpi-titulo">{titulo}</span><strong>{valor}</strong></div>
        ))}
      </div>
      {!empresa && (
        <div className="ec-desglose">
          {EMPRESAS.map(([v, t]) => {
            const deEsta = filas.filter((f) => f.empresa === v);
            return <div key={v}><strong>{t}</strong><span>{moneda(suma(deEsta))} · {deEsta.length} facturas</span></div>;
          })}
        </div>
      )}
      {sinCliente.length > 0 && (
        <p className="db-aviso">
          {sinCliente.length} factura(s) por {moneda(suma(sinCliente))} sin cliente principal (sin maniobra ligada o
          con una dirección sin cliente): salen por el receptor del XML, sin vencimiento ni estado de cuenta en PDF.
        </p>
      )}

      <h2 className="ec-titulo">Clientes y saldos</h2>
      <div className="ec-filtros">
        <label>Buscar cliente
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Escribe un nombre" />
        </label>
        <label>Estatus general
          <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value)}>
            <option value="">Todos</option>
            {ESTATUS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <div className="ec-leyenda" aria-label="Leyenda de estatus">
          {ESTATUS.map(([v]) => <span key={v} className={`ec-badge ec-${v}`}>{ETIQUETA[v]}</span>)}
        </div>
      </div>

      <div className="table-responsive">
        <table className="nomina-table">
          <thead>
            <tr>
              <th>Cliente</th><th>Empresa</th><th>Cartera</th><th>Vencido</th>
              <th>Próximo vencimiento</th><th>Estatus</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {!facturas ? (
              <tr><td colSpan={7} className="np-vacio">Cargando…</td></tr>
            ) : visibles.length === 0 ? (
              <tr><td colSpan={7} className="np-vacio">No hay clientes para estos filtros.</td></tr>
            ) : visibles.map((g) => {
              const proximo = g.filas.filter((f) => f.estatus !== "vencida")
                .map((f) => f.vencimiento).sort()[0];
              const estatus = estatusGeneral(g.filas);
              const abierto = abiertos.has(g.clave);
              return (
                <Fragment key={g.clave}>
                <tr>
                  <td>
                    <button type="button" className="ec-cliente" aria-expanded={abierto}
                      onClick={() => alternar(g.clave)}>
                      {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <strong>{g.nombre}</strong>
                    </button>
                  </td>
                  <td>{NOMBRE_EMPRESA[g.empresa]}</td>
                  <td className="fc-total">{moneda(suma(g.filas))}</td>
                  <td className="fc-total">{moneda(suma(g.filas.filter((f) => f.estatus === "vencida")))}</td>
                  <td>{fechaLarga(proximo)}</td>
                  <td>{g.id ? <span className={`ec-badge ec-${estatus}`}>{ETIQUETA[estatus]}</span> : "Sin cliente principal"}</td>
                  <td>
                    <button className="fc-accion" disabled={generando !== null || !g.id} onClick={() => generar(g)}
                      title={g.id ? undefined : "Liga sus facturas a un cliente principal para generar el PDF"}>
                      {generando === g.clave
                        ? <><Loader size={14} className="ec-girando" /> Generando…</>
                        : <><Download size={14} /> Generar estado de cuenta</>}
                    </button>
                  </td>
                </tr>
                {abierto && (
                  <tr className="ec-detalle">
                    <td colSpan={7}>
                      {/* Las mismas filas del renglón: facturas sin cobrar, por su saldo. */}
                      <table>
                        <thead>
                          <tr><th>Factura</th><th>Emisión</th><th>Vencimiento</th><th>Saldo</th><th>Estatus</th></tr>
                        </thead>
                        <tbody>
                          {[...g.filas].sort((a, b) => (a.vencimiento ?? "").localeCompare(b.vencimiento ?? ""))
                            .map((f) => (
                              <tr key={f.id}>
                                <td>{`${f.serie ?? ""}${f.folio ?? ""}` || "—"}</td>
                                <td>{fechaLarga(f.fecha_emision)}</td>
                                <td>{fechaLarga(f.vencimiento)}</td>
                                <td className="fc-total">{moneda(f.saldo)}</td>
                                <td>{f.estatus
                                  ? <span className={`ec-badge ec-${f.estatus}`}>{ETIQUETA[f.estatus]}</span>
                                  : "—"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
