import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Upload, X } from "lucide-react";
import { apiClient } from "../api/apiClient";
import FiltrosLista, { conValor } from "../components/FiltrosLista/FiltrosLista";
import SearchBar from "../components/SearchBar/SearchBar";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import { useAutoRefresco } from "../hooks/useAutoRefresco";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";

// Facturación (Fase 1 de PLAN_MODULO_FINANZAS.md), en dos páginas desde el
// 2026-10-15 (usuario):
// - FACTURACIÓN: una fila por factura de cada viaje. Nace al asignar el folio,
//   la serie y el folio salen del No. Factura de Control de viajes y el resto
//   del XML. Es la que manda en Cobrar, Dashboards e Ingresos. La fecha de
//   cobro y la clave de rastreo ya no se capturan: las pone Compensación al
//   cubrir el total (usuario, 2026-10-22).
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
  { key: "saldo_pendiente",   label: "Saldo pendiente" },
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

function Maniobra({ f, onSugerir }) {
  // Una factura que cobró varios servicios: se liga a uno y los demás van al lado.
  const otras = f.comparte_con?.length ? (
    <span className="fc-pendiente" title="Esta factura cobra también estos servicios">
      {" + "}{f.comparte_con.join(", ")}
    </span>
  ) : null;
  return f.maniobra ? <>{f.maniobra_folio || `Maniobra ${f.maniobra}`}{otras}</> : (
    <>
      <span className="fc-pendiente" title="Ninguna maniobra tiene este número en su No. Factura">
        Pendiente de ligar
      </span>
      {onSugerir && <button className="fc-accion fc-sugerir" onClick={onSugerir}>Sugerencias</button>}
    </>
  );
}

// Sugerencias para una factura pendiente de ligar (usuario, 2026-11-23): las
// busca el backend por contenedor, referencia o pedimento de la descripción
// del XML. Ligar pide confirmación con la ficha de la maniobra.
const ruta = (m) => [m.origen, m.destino].filter(Boolean).join(" → ");

function FichaManiobra({ m }) {
  const datos = [["Folio", m.folio], ["Cliente", m.cliente], ["Servicio", m.tipo_servicio],
    ["Ruta", ruta(m)], ["Contenedor", m.contenedor], ["Referencia", m.referencia],
    ["Pedimento", m.pedimento], ["Fecha PIS", fechaLegible(m.fecha_pis)],
    ["Entrega", fechaLegible(m.fecha_entrega_mercancia)], ["Unidad", m.unidad]];
  return (
    <dl className="fc-ficha">
      {datos.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

function Sugerencias({ f, onCerrar, onLigada }) {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const dialogo = useRef(null);
  const [lista, setLista] = useState(null);

  useEffect(() => { dialogo.current?.showModal(); }, []);
  useEffect(() => {
    apiClient.get(`/facturas/${f.id}/sugerencias/`).then(setLista)
      .catch((err) => { setLista([]); alerta({ tipo: "error", msg: err.message || "No se pudieron buscar sugerencias." }); });
  }, [f.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ligar = async (m) => {
    if (!await preguntar({
      titulo: "Ligar factura",
      mensaje: `Se escribirá ${f.factura} en el No. Factura de esta maniobra, como si se capturara en Control de viajes. Verifica que sea la correcta.`,
      detalle: <FichaManiobra m={m} />,
      accion: "Ligar",
    })) return;
    try {
      await apiClient.post(`/facturas/${f.id}/ligar/`, { maniobra: m.id });
      alerta({ tipo: "ok", msg: `${f.factura} quedó ligada a ${m.folio || `la maniobra ${m.id}`}.` });
      onLigada(f.id);
      dialogo.current?.close();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo ligar la factura." });
    }
  };

  return (
    <dialog ref={dialogo} className="fc-sugerencias" aria-labelledby="fc-sug-titulo" onClose={onCerrar}>
      <h1 id="fc-sug-titulo">Maniobras sugeridas para {f.factura}</h1>
      {lista === null ? <p>Buscando…</p> : !lista.length ? (
        <p>Ninguna maniobra sin No. Factura tiene el contenedor, la referencia o el pedimento de esta
          factura. Lígala capturando su No. Factura en Control de viajes.</p>
      ) : (
        <ul>
          {lista.map((m) => (
            <li key={m.id}>
              <div>
                <strong>{m.folio || `Maniobra ${m.id}`}</strong> · {m.cliente || "Sin cliente"}
                {ruta(m) && <> · {ruta(m)}</>}
                <span className="fc-coincide">Coincide por {m.coincide.join(", ")}</span>
              </div>
              <button className="fc-accion" onClick={() => ligar(m)}>Ligar</button>
            </li>
          ))}
        </ul>
      )}
      <button className="fc-cerrar" onClick={() => dialogo.current?.close()} aria-label="Cerrar sugerencias">
        <X size={16} />
      </button>
    </dialog>
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

function Botonera({ etiqueta, opciones, valor, onChange }) {
  return (
    <div className="fc-filtro" role="group" aria-label={etiqueta}>
      {opciones.map(([v, texto]) => (
        <button key={v} aria-pressed={valor === v}
          className={valor === v ? "activo" : ""} onClick={() => onChange(v)}>
          {texto}
        </button>
      ))}
    </div>
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
  // Orden y empresa (usuario, 2026-10-28): los aplica el servidor, como la
  // búsqueda, porque la tabla va de 100 en 100. Ver ordenar_facturas.
  const [orden, setOrden] = useState("fecha");
  const [empresa, setEmpresa] = useState("");
  // Al teclear salen varias peticiones: solo vale la última.
  const ultima = useRef(0);
  const [subiendo, setSubiendo] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [sugerir, setSugerir] = useState(null); // {id, factura} con la ventana abierta
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
  const filtros = useMemo(() => ({ estado, search: buscar, ...fechas, orden, empresa }),
    [estado, buscar, fechas, orden, empresa]);

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

  // Lo que cambie otra persona, sin el "Cargando" ni volver a la página 1: se
  // piden otra vez las mismas páginas que ya hay en pantalla.
  const refrescar = async () => {
    if (loading || cargandoMas) return;
    const yo = ultima.current;
    const paginas = Math.max(1, siguiente ? siguiente - 1 : Math.ceil(filas.length / 100));
    try {
      const datos = await Promise.all(Array.from({ length: paginas },
        (_, i) => traerPagina(enAuditoria, filtros, i + 1)));
      if (yo !== ultima.current) return; // cambió un filtro mientras tanto
      setFilas(datos.flatMap((d) => d.results));
      setTotal(datos[0].count);
      setSiguiente(datos.at(-1).next ? paginas + 1 : null);
      if (enAuditoria) setAuditoria(datos[0]);
    } catch {
      // Se reintenta con el siguiente cambio.
    }
  };
  // Maniobra: el No. Factura de Control de viajes es lo que liga cada factura.
  useAutoRefresco("finanzas", refrescar, {
    query: `de=${enAuditoria ? "facturaexcel,factura" : "factura,maniobra"}`,
    activo: Boolean(acceso?.ver),
  });
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
      const r = await apiClient.upload(enAuditoria ? "/facturas-excel/cargar/" : "/facturas/xml/", datos);
      setResumen(r);
      // Aviso al subir (usuario, 2026-11-23): el No. Factura no está en ninguna maniobra.
      const sueltas = r.no_registradas ?? [];
      const nombres = sueltas.map((x) => x.factura).join(", ");
      if (sueltas.length) alerta({ tipo: "aviso", msg: (sueltas.length === 1
        ? `La factura ${nombres} no está registrada en ninguna maniobra. Queda pendiente de ligar.`
        : `Las facturas ${nombres} no están registradas en ninguna maniobra. Quedan pendientes de ligar.`)
        + (sueltas.some((x) => x.sugeridas) ? " Revisa las maniobras sugeridas en el resumen." : "") });
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo cargar el archivo." });
    } finally {
      setSubiendo(false);
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
        <Botonera etiqueta="Estado de la factura" valor={estado} onChange={setEstado}
          opciones={[["activa", "Activas"], ["cancelada", "Canceladas"]]} />
        {!enAuditoria && (
          <>
            <Botonera etiqueta="Ordenar por" valor={orden} onChange={setOrden}
              opciones={[["fecha", "Por fecha"], ["factura", "Por No. factura"]]} />
            <Botonera etiqueta="Empresa" valor={empresa} onChange={setEmpresa}
              opciones={[["", "Todas"], ["fraba", "Fraba"], ["soluciones", "Soluciones"]]} />
          </>
        )}
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
          {!enAuditoria && resumen.no_registradas?.length > 0 && (
            <ul className="fc-sueltas">
              {resumen.no_registradas.map((x) => (
                <li key={x.id}>
                  {x.factura} —{" "}
                  {x.sugeridas ? (
                    <button className="fc-accion" onClick={() => setSugerir(x)}>
                      Ver {x.sugeridas} {x.sugeridas === 1 ? "maniobra sugerida" : "maniobras sugeridas"}
                    </button>
                  ) : "sin sugerencias: captura su No. Factura en Control de viajes"}
                </li>
              ))}
            </ul>
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
                  <td><Maniobra f={f} onSugerir={enAuditoria ? null
                    : () => setSugerir({ id: f.id, factura: factura(f) })} /></td>
                  {!enAuditoria && <td className="fc-total">{moneda(f.saldo_pendiente)}</td>}
                  {!enAuditoria && <td>{f.fecha_cobro ? fechaLegible(f.fecha_cobro) : "Sin cobrar"}</td>}
                  {!enAuditoria && <td>{f.clave_rastreo}</td>}
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

      {sugerir && (
        <Sugerencias f={sugerir} onCerrar={() => setSugerir(null)}
          onLigada={(id) => {
            setResumen((r) => r && { ...r, no_registradas: r.no_registradas?.filter((x) => x.id !== id) });
            cargar();
          }} />
      )}

      <BotonArriba />
    </div>
  );
}
