import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Upload, X } from "lucide-react";
import { apiClient } from "../api/apiClient";
import FiltrosLista, { conValor } from "../components/FiltrosLista/FiltrosLista";
import SearchBar from "../components/SearchBar/SearchBar";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import CampoFecha from "../components/CampoFecha/CampoFecha";
import { aDate, aBackend } from "../components/CeldaEditable/fechaCelda.mjs";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";

// Facturación (Fase 1 de PLAN_MODULO_FINANZAS.md), en dos páginas desde el
// 2026-10-15 (usuario):
// - FACTURACIÓN: una fila por factura de cada viaje. Nace al asignar el folio,
//   la serie y el folio salen del No. Factura de Control de viajes y el resto
//   del XML. Es la que manda en Cobrar, Dashboards e Ingresos. A mano solo se
//   capturan la fecha de cobro y la clave de rastreo.
// - AUDITORÍA (solo admin): el Excel de siempre, comparado 1-1 con Facturación.
// Quién entra lo decide el backend: esta pantalla solo pregunta a
// /facturas/acceso/ para no pintar lo que daría 403. Reutiliza la hoja de
// Nómina: es la misma familia de tablas del sistema.

const COLUMNAS_FACTURACION = [
  { key: "nombre",            label: "Cliente" },
  { key: "rfc",               label: "RFC" },
  { key: "serie",             label: "Serie" },
  { key: "folio",             label: "Folio" },
  { key: "fecha_emision",     label: "Fecha emisión" },
  { key: "vencimiento",       label: "Vence" },
  { key: "total",             label: "Total con IVA" },
  { key: "no_identificacion", label: "No. Identificación" },
  { key: "descripcion",       label: "Descripción" },
  { key: "maniobra",          label: "Maniobra" },
  { key: "fecha_cobro",       label: "Cobrada" },
  { key: "clave_rastreo",     label: "Clave de rastreo" },
];

const COLUMNAS_AUDITORIA = [
  { key: "nombre",        label: "Cliente" },
  { key: "rfc",           label: "RFC" },
  { key: "serie",         label: "Serie" },
  { key: "folio",         label: "Folio" },
  { key: "fecha_emision", label: "Fecha emisión" },
  { key: "vencimiento",   label: "Vence" },
  { key: "total",         label: "Total con IVA" },
  { key: "maniobra",      label: "Maniobra ligada" },
];

const moneda = (v) =>
  v == null ? "" : Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const fechaLegible = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const factura = (f) => (f.serie ? `${f.serie} ${f.folio}` : "Sin No. Factura");

// De 100 en 100 (usuario, 2026-10-16): la siguiente página llega al bajar por
// la tabla. La búsqueda y las fechas las aplica el SERVIDOR sobre todas las
// facturas; aquí solo verían las ya cargadas.
const traerPagina = (enAuditoria, filtros, page) => apiClient.get(
  `${enAuditoria ? "/facturas-excel/comparacion/" : "/facturas/"}?${new URLSearchParams(conValor({ ...filtros, page }))}`);

function Maniobra({ f }) {
  return f.maniobra ? (f.maniobra_folio || `Maniobra ${f.maniobra}`) : (
    <span className="fc-pendiente" title="Ninguna maniobra tiene este número en su No. Factura">
      Pendiente de ligar
    </span>
  );
}

function Vence({ f }) {
  // Emisión + días de crédito del cliente principal. Sin principal no hay días
  // que aplicar: queda fuera de la antigüedad de saldos hasta que se ligue.
  return (
    <td title={f.vencimiento || !f.fecha_emision ? undefined
      : "Sin cliente principal: queda fuera de la antigüedad de saldos"}>
      {f.vencimiento ? fechaLegible(f.vencimiento) : f.fecha_emision ? "—" : ""}
    </td>
  );
}

function Omitidas({ lista, nombre }) {
  if (!lista.length) return null;
  return (
    <>
      <p className="fc-subtitulo">Se omitieron {lista.length}:</p>
      <ul>
        {lista.map((o, i) => (
          <li key={i}>{nombre(o)} · {o.serie} {o.folio} — {o.motivo}</li>
        ))}
      </ul>
    </>
  );
}

// La clave se guarda al salir de la caja, no en cada tecla.
function ClaveRastreo({ f, guardar }) {
  const [texto, setTexto] = useState(f.clave_rastreo);
  useEffect(() => setTexto(f.clave_rastreo), [f.clave_rastreo]);
  return (
    <input className="fc-clave" value={texto} maxLength={50}
      aria-label={`Clave de rastreo de ${factura(f)}`}
      onChange={(e) => setTexto(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
      onBlur={() => texto !== f.clave_rastreo && guardar(f, { clave_rastreo: texto })} />
  );
}

export default function FacturacionPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const [acceso, setAcceso] = useState(null);
  const [estado, setEstado] = useState("activa");
  const [pagina, setPagina] = useState("facturacion");
  const [filas, setFilas] = useState([]);
  const [total, setTotal] = useState(0);          // `count` del servidor: todas las que cumplen
  const [siguiente, setSiguiente] = useState(null); // nº de la próxima página, o null
  const [cargandoMas, setCargandoMas] = useState(false);
  // La alerta de Auditoría: TODAS las que no cuadran, no solo la página.
  const [auditoria, setAuditoria] = useState({ distintas: [], solo_en_facturacion: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [buscar, setBuscar] = useState("");   // la búsqueda, 350 ms después
  // Por fecha de emisión (usuario, 2026-10-16).
  const [fechas, setFechas] = useState({});
  // Al teclear salen varias peticiones: solo vale la última.
  const ultima = useRef(0);
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState(null);
  const tablaRef = useRef(null);
  const archivoRef = useRef(null);

  useEffect(() => {
    apiClient.get("/facturas/acceso/")
      .then(setAcceso)
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBuscar(busqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  const enAuditoria = pagina === "auditoria";
  const filtros = useMemo(() => ({ estado, search: buscar, ...fechas }), [estado, buscar, fechas]);

  // Página 1 de nuevo: al entrar, al cambiar un filtro y tras cada escritura.
  const cargar = useCallback(async () => {
    const yo = ++ultima.current;
    setLoading(true);
    setError(null);
    try {
      const data = await traerPagina(enAuditoria, filtros, 1);
      if (yo !== ultima.current) return;
      setFilas(data.results);
      setTotal(data.count);
      setSiguiente(data.next ? 2 : null);
      if (enAuditoria) setAuditoria(data);
    } catch (err) {
      if (yo === ultima.current) setError(err.message);
    } finally {
      if (yo === ultima.current) setLoading(false);
    }
  }, [enAuditoria, filtros]);

  const cargarMas = async () => {
    if (!siguiente || cargandoMas || loading) return;
    const yo = ultima.current;
    setCargandoMas(true);
    try {
      const data = await traerPagina(enAuditoria, filtros, siguiente);
      if (yo !== ultima.current) return; // cambió un filtro mientras tanto
      setFilas((prev) => [...prev, ...data.results]);
      setSiguiente(data.next ? siguiente + 1 : null);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudieron cargar más facturas." });
    } finally {
      setCargandoMas(false);
    }
  };
  // La tabla tiene su propio scroll (tabla-cabecera-fija): a 300 px del final.
  const alBajar = (e) => {
    const t = e.currentTarget;
    if (t.scrollTop + t.clientHeight >= t.scrollHeight - 300) cargarMas();
  };

  useEffect(() => { if (acceso?.ver) cargar(); }, [acceso, cargar]);
  useEffect(() => setResumen(null), [pagina]);

  const visibles = filas;
  const distintas = auditoria.distintas;

  const subir = async (e) => {
    const archivos = [...(e.target.files ?? [])];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivos.length) return;
    const datos = new FormData();
    if (enAuditoria) datos.append("archivo", archivos[0]);
    else archivos.forEach((a) => datos.append("archivos", a));
    setSubiendo(true);
    try {
      setResumen(await apiClient.upload(enAuditoria ? "/facturas-excel/cargar/" : "/facturas/xml/", datos));
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo cargar el archivo." });
    } finally {
      setSubiendo(false);
    }
  };

  // Fecha de cobro y clave, a mano (P27). Optimista: si el servidor dice que
  // no, vuelve a lo que había.
  const guardarCobro = async (f, cambio) => {
    const poner = (datos) => setFilas((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...datos } : x)));
    poner(cambio);
    try {
      poner(await apiClient.post(`/facturas/${f.id}/cobro/`, cambio));
    } catch (err) {
      poner({ fecha_cobro: f.fecha_cobro, clave_rastreo: f.clave_rastreo });
      alerta({ tipo: "error", msg: err.message || "No se pudo guardar el cobro." });
    }
  };

  const cambiarEstado = async (f) => {
    const cancelar = f.estado === "activa";
    if (!await preguntar({
      titulo: cancelar ? "Cancelar factura" : "Reactivar factura",
      mensaje: enAuditoria
        ? (cancelar ? "Solo cambia el Excel de Auditoría; Facturación no se toca." : "Vuelve a contar en Auditoría.")
        : cancelar
          ? "Dejará de contar en las ventas y en los Ingresos de Gastos. No se borra: se puede reactivar."
          : "Volverá a contar en las ventas y en los Ingresos de Gastos.",
      dato: `${factura(f)} · ${moneda(f.total)}`,
      accion: cancelar ? "Cancelar factura" : "Reactivar",
      peligro: cancelar,
    })) return;
    try {
      await apiClient.post(`/${enAuditoria ? "facturas-excel" : "facturas"}/${f.id}/${cancelar ? "cancelar" : "reactivar"}/`, {});
      cargar();
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

  const propias = enAuditoria ? COLUMNAS_AUDITORIA : COLUMNAS_FACTURACION;
  const columnas = acceso?.cancelar ? [...propias, { key: "accion", label: "" }] : propias;

  return (
    <div className="nomina-container">

      <div className="fz-pestanas" role="tablist" aria-label="Facturación">
        {[["facturacion", "Facturación"], ["auditoria", "Auditoría"]]
          .filter(([clave]) => clave !== "auditoria" || acceso?.auditoria)
          .map(([clave, texto]) => (
          <button key={clave} role="tab" aria-selected={pagina === clave}
            className={pagina === clave ? "activo" : ""} onClick={() => setPagina(clave)}>
            {texto}
          </button>
        ))}
      </div>

      <div className="np-search">
        <SearchBar value={busqueda} onChange={setBusqueda}
          placeholder="Buscar por cliente, RFC, serie o folio…" />
      </div>

      <FiltrosLista endpoint="facturacion" soloFechas filtros={fechas} onChange={setFechas} />

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
          {total} {total === 1 ? "factura" : "facturas"}
        </div>
        <div className="toolbar-acciones">
          <input ref={archivoRef} type="file" hidden onChange={subir}
            accept={enAuditoria ? ".xlsx,.xls,.csv" : ".xml"} multiple={!enAuditoria} />
          <button className="np-btn-calendario" disabled={subiendo}
            onClick={() => archivoRef.current?.click()}
            title={enAuditoria ? "Sube el Excel de facturación de Fraba o de Soluciones"
              : "Sube uno o varios XML timbrados"}>
            <Upload size={18} /> {subiendo ? "Cargando…" : enAuditoria ? "Cargar Excel" : "Cargar XML"}
          </button>
        </div>
      </div>

      {enAuditoria && !loading && (distintas.length > 0 || auditoria.solo_en_facturacion.length > 0) && (
        <section className="fc-resumen fc-discrepancias" aria-live="polite">
          <p>
            <strong>{distintas.length + auditoria.solo_en_facturacion.length}</strong>{" "}
            {distintas.length + auditoria.solo_en_facturacion.length === 1
              ? "factura no coincide" : "facturas no coinciden"} con Facturación:
          </p>
          <ul>
            {distintas.map((f) => (
              <li key={f.id}>{factura(f)} · {f.nombre} — {f.diferencias.join(", ")}</li>
            ))}
            {auditoria.solo_en_facturacion.map((f) => (
              <li key={`f${f.id}`}>{factura(f)} · {f.nombre} — Está en Facturación y no en el Excel</li>
            ))}
          </ul>
        </section>
      )}

      {resumen && (
        <section className="fc-resumen" aria-live="polite">
          <button className="fc-cerrar" onClick={() => setResumen(null)} aria-label="Cerrar resumen">
            <X size={16} />
          </button>
          {enAuditoria ? (
            <p>
              <strong>{resumen.creadas}</strong> {resumen.creadas === 1 ? "factura nueva" : "facturas nuevas"} en Auditoría.
            </p>
          ) : (
            <p>
              <strong>{resumen.completadas}</strong> {resumen.completadas === 1 ? "factura completada" : "facturas completadas"}
              {resumen.sin_maniobra > 0 && (
                <>, <strong>{resumen.sin_maniobra}</strong> pendientes de ligar (ninguna maniobra tiene aún ese No. Factura)</>
              )}.
            </p>
          )}
          <Omitidas lista={resumen.omitidas} nombre={(o) => (enAuditoria ? `Fila ${o.fila}` : o.archivo)} />
        </section>
      )}

      <div className="bst-zona">
        <BarraScrollTabla contenedorRef={tablaRef} />
        <div className="table-responsive tabla-cabecera-fija" ref={tablaRef} onScroll={alBajar}>
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
                    {estado === "cancelada" ? "No hay facturas canceladas."
                      : enAuditoria ? "No hay facturas. Carga el Excel de facturación."
                      : "No hay facturas. Nacen al asignar el folio a un viaje."}
                  </td>
                </tr>
              ) : visibles.map((f) => (
                <tr key={f.id} className={f.diferencias?.length ? "fc-distinta" : undefined}
                  title={f.diferencias?.length ? `No coincide: ${f.diferencias.join(", ")}` : undefined}>
                  <td>{f.nombre}</td>
                  <td>{f.rfc}</td>
                  <td>{f.serie}</td>
                  <td>{f.folio}</td>
                  <td>{fechaLegible(f.fecha_emision)}</td>
                  <Vence f={f} />
                  <td className="fc-total">{moneda(f.total)}</td>
                  {!enAuditoria && <td>{f.no_identificacion}</td>}
                  {!enAuditoria && <td className="fc-descripcion">{f.descripcion}</td>}
                  <td><Maniobra f={f} /></td>
                  {!enAuditoria && (
                    <td className="fc-fecha">
                      <CampoFecha selected={aDate(f.fecha_cobro)} isClearable placeholderText="Sin cobrar"
                        onChange={(d) => guardarCobro(f, { fecha_cobro: aBackend(d) || null })} />
                    </td>
                  )}
                  {!enAuditoria && <td><ClaveRastreo f={f} guardar={guardarCobro} /></td>}
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
              {cargandoMas && (
                <tr><td colSpan={columnas.length} className="np-vacio">Cargando más…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BotonArriba />
    </div>
  );
}
