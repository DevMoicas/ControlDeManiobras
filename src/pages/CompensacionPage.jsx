import { useState, useEffect, useRef } from "react";
import { RotateCcw, Plus, Upload, Save, X } from "lucide-react";
import { apiClient } from "../api/apiClient";
import CampoFecha from "../components/CampoFecha/CampoFecha";
import { aBackend } from "../components/CeldaEditable/fechaCelda.mjs";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";

// COMPENSACIÓN (usuario, 2026-10-22).
// Arriba, los PAGOS tal como llegaron al banco: se leen del CSV de movimientos
// (o se capturan a mano), se revisan en una lista y se guardan con "Guardar
// pagos". Su monto es lo que suma la Cobranza. Debajo, los pagos guardados que
// aún tienen algo por aplicar, numerados del más viejo al más reciente.
// Abajo se reparte cada pago a mano en abonos, uno por factura. Al cubrir el
// total de una factura, el backend la marca cobrada con la fecha y la clave
// del pago: es la única vía al cobro.

const moneda = (v) => (v == null ? "—" :
  Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const fechaLegible = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const centavos = (v) => Math.round(Number(v || 0) * 100);
const porAplicarDe = (p) => (centavos(p.monto) - centavos(p.aplicado)) / 100;
// El formato que pidió el usuario, tal cual: Folio / emisión / RFC / cliente / saldo.
// "Saldo" aquí es lo que vale la factura (su total).
const linea = (f) => [`${f.serie} ${f.folio}`.trim(), fechaLegible(f.fecha_emision) || "Sin XML",
  f.rfc || "—", f.nombre || "—", moneda(f.total)].join(" / ");
const motivoNoAbonable = (f) => (f.estado !== "activa" ? "Cancelada" : f.total == null ? "Sin XML" : null);
const mensajeError = (err, otro) => (err.message?.startsWith("HTTP 400")
  ? "Revisa los datos: falta algo o hay un valor no válido." : err.message || otro);

const MANUAL_VACIO = { fecha: null, monto: "", clave_rastreo: "", banco: "", rfc: "" };

export default function CompensacionPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const archivoRef = useRef(null);
  const [acceso, setAcceso] = useState(null);
  const [bancos, setBancos] = useState([]);
  const [clientes, setClientes] = useState([]);

  // Pagos leídos o capturados que aún NO se guardan. Se pierden al salir.
  const [borrador, setBorrador] = useState([]);
  const [manual, setManual] = useState(MANUAL_VACIO);
  const [leyendo, setLeyendo] = useState(false);
  const [guardandoPagos, setGuardandoPagos] = useState(false);
  // Pagos guardados con algo por aplicar, del más viejo al más reciente.
  const [porAplicar, setPorAplicar] = useState([]);

  const [pagoId, setPagoId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [factura, setFactura] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [parcialidad, setParcialidad] = useState("");
  const [abonos, setAbonos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const cargarPorAplicar = () => apiClient.get("/pagos/por-aplicar/")
    .then((d) => { setPorAplicar(d || []); return d || []; })
    .catch(() => { setPorAplicar([]); return []; });

  useEffect(() => {
    apiClient.get("/facturas/acceso/").then((a) => {
      setAcceso(a);
      if (!a?.ver) return;
      apiClient.get("/pagos/bancos/").then(setBancos).catch(() => setBancos([]));
      apiClient.get("/facturas/clientes/").then(setClientes).catch(() => setClientes([]));
      cargarPorAplicar();
    }).catch(() => setAcceso({ ver: false }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setConsulta(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const pago = porAplicar.find((p) => String(p.id) === String(pagoId)) ?? null;

  // Busca en TODAS las facturas; con un pago elegido, solo las de su RFC. Una
  // respuesta vieja no pisa a la nueva: mismo patrón que FolioSelector.
  const rfcFiltro = pago?.rfc ?? "";
  useEffect(() => {
    if (!abierto || factura || (!consulta && !rfcFiltro)) { setResultados([]); return; }
    let vigente = true;
    const p = new URLSearchParams();
    if (consulta) p.set("search", consulta);
    if (rfcFiltro) p.set("rfc", rfcFiltro);
    apiClient.get(`/facturas/buscar-compensacion/?${p}`)
      .then((d) => { if (vigente) setResultados(d || []); })
      .catch(() => { if (vigente) setResultados([]); });
    return () => { vigente = false; };
  }, [abierto, factura, consulta, rfcFiltro]);

  // ── Pagos: CSV, captura manual y guardado ────────────────────────────────
  const agregarAlBorrador = (nuevos) => setBorrador((prev) => [...prev, ...nuevos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha)));

  const leerCsv = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    const datos = new FormData();
    datos.append("archivo", archivo);
    setLeyendo(true);
    try {
      const r = await apiClient.upload("/pagos/leer-csv/", datos);
      // Repetidos: ya guardados o ya en la lista. No entran.
      const enLista = new Set(borrador.map((p) => p.clave_rastreo).filter(Boolean));
      const nuevos = r.pagos.filter((p) => !p.repetido && !enLista.has(p.clave_rastreo));
      agregarAlBorrador(nuevos.map((p) => ({ ...p, clave: `csv-${p.clave_rastreo}` })));
      const repetidos = r.pagos.length - nuevos.length;
      const partes = [`${nuevos.length} ${nuevos.length === 1 ? "pago nuevo" : "pagos nuevos"} en la lista`];
      if (repetidos) partes.push(`${repetidos} ya registrados (misma clave de rastreo)`);
      if (r.omitidos) partes.push(`${r.omitidos} movimientos que no son pagos`);
      alerta({ tipo: r.errores.length ? "aviso" : "exito",
        msg: `${partes.join(", ")}.${r.errores.length ? ` ${r.errores.join(" ")}` : ""}` });
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo leer el CSV." });
    } finally {
      setLeyendo(false);
    }
  };

  const agregarManual = () => {
    const falta = !manual.fecha ? "la fecha" : !(Number(manual.monto) > 0) ? "el monto"
      : !bancos.includes(manual.banco) ? "un banco de la lista" : null;
    if (falta) { alerta({ tipo: "aviso", msg: `Falta ${falta}.` }); return; }
    if (manual.clave_rastreo && borrador.some((p) => p.clave_rastreo === manual.clave_rastreo)) {
      alerta({ tipo: "aviso", msg: "Esa clave de rastreo ya está en la lista." });
      return;
    }
    const cliente = clientes.find((c) => c.rfc === manual.rfc);
    agregarAlBorrador([{
      clave: `manual-${Date.now()}`, fecha: aBackend(manual.fecha), monto: manual.monto,
      clave_rastreo: manual.clave_rastreo, banco: manual.banco,
      rfc: manual.rfc, nombre: cliente?.nombre ?? "", manual: true,
    }]);
    setManual(MANUAL_VACIO);
  };

  const guardarPagos = async () => {
    setGuardandoPagos(true);
    try {
      // postAnidado: post() aplana las listas de objetos a [] (sanitizarPayload).
      // Los campos van uno a uno y el backend los valida todos.
      const r = await apiClient.postAnidado("/pagos/guardar/", { pagos: borrador.map((p) => ({
        fecha: p.fecha, monto: p.monto, clave_rastreo: p.clave_rastreo, banco: p.banco,
        rfc: p.rfc, nombre: p.nombre })) });
      setBorrador([]);
      cargarPorAplicar();
      alerta({ tipo: r.repetidos.length ? "aviso" : "exito", msg: `${r.guardados} ${r.guardados === 1 ? "pago guardado" : "pagos guardados"}.`
        + (r.repetidos.length ? ` No se guardaron por clave repetida: ${r.repetidos.join(", ")}.` : "") });
    } catch (err) {
      alerta({ tipo: "error", msg: mensajeError(err, "No se pudieron guardar los pagos.") });
    } finally {
      setGuardandoPagos(false);
    }
  };

  const cancelarPago = async (p) => {
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
      if (String(p.id) === String(pagoId)) setPagoId("");
      cargarPorAplicar();
      if (factura) refrescarFactura(factura.id);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo cancelar el pago." });
    }
  };

  // ── Abonos ───────────────────────────────────────────────────────────────
  const cargarAbonos = (id) => apiClient.get(`/abonos/?factura=${id}`)
    .then((d) => setAbonos(d || [])).catch(() => setAbonos([]));

  const refrescarFactura = (id) => {
    cargarAbonos(id);
    apiClient.get(`/facturas/buscar-compensacion/?search=${encodeURIComponent(`${factura.serie} ${factura.folio}`)}`)
      .then((d) => { const f = (d || []).find((x) => x.id === id); if (f) setFactura(f); })
      .catch(() => {});
  };

  const elegir = (f) => {
    setFactura(f);
    setBusqueda(linea(f));
    setCantidad("");
    setParcialidad(String(f.siguiente_parcialidad));
    setAbierto(false);
    cargarAbonos(f.id);
    // Sin pago elegido (o de otro cliente): el más viejo del mismo RFC.
    if (!pago || pago.rfc !== f.rfc) {
      const suyo = porAplicar.find((p) => p.rfc && p.rfc === f.rfc);
      if (suyo) setPagoId(String(suyo.id));
    }
  };

  const restablecer = () => {
    setFactura(null);
    setBusqueda("");
    setCantidad("");
    setParcialidad("");
    setAbonos([]);
  };

  const agregar = async () => {
    const falta = !pago ? "elegir el pago" : !factura ? "elegir la factura"
      : !(Number(cantidad) > 0) ? "la cantidad a abonar" : !(Number(parcialidad) >= 1) ? "la parcialidad" : null;
    if (falta) { alerta({ tipo: "aviso", msg: `Falta ${falta}.` }); return; }
    const noAbonable = motivoNoAbonable(factura);
    if (noAbonable) { alerta({ tipo: "error", msg: `No se puede abonar: ${noAbonable.toLowerCase()}.` }); return; }

    // Pasarse se acepta (usuario, 2026-10-22), pero confirmándolo antes.
    const excesos = [
      centavos(factura.abonado) + centavos(cantidad) > centavos(factura.total)
        && `supera el saldo pendiente de la factura (${moneda(factura.saldo_pendiente)})`,
      centavos(pago.aplicado) + centavos(cantidad) > centavos(pago.monto)
        && `supera lo que queda por aplicar del pago (${moneda(porAplicarDe(pago))})`,
    ].filter(Boolean);
    if (excesos.length && !await preguntar({
      titulo: "El abono se pasa",
      mensaje: `Este abono ${excesos.join(" y ")}. ¿Registrarlo de todos modos?`,
      dato: `${factura.serie} ${factura.folio} · ${moneda(cantidad)}`,
      accion: "Registrar abono",
    })) return;

    setGuardando(true);
    try {
      const r = await apiClient.post("/abonos/", {
        pago: pago.id, factura: factura.id, monto: cantidad, parcialidad: Number(parcialidad),
      });
      setFactura(r.factura);
      setBusqueda(linea(r.factura));
      setCantidad("");
      setParcialidad(String(r.factura.siguiente_parcialidad));
      cargarAbonos(r.factura.id);
      // Un pago ya aplicado entero sale de la lista.
      const lista = await cargarPorAplicar();
      if (!lista.some((p) => p.id === r.pago.id)) setPagoId("");
      alerta({ tipo: "exito", msg: r.factura.fecha_cobro ? "Abono registrado. La factura quedó cobrada." : "Abono registrado." });
    } catch (err) {
      alerta({ tipo: "error", msg: mensajeError(err, "No se pudo registrar el abono.") });
    } finally {
      setGuardando(false);
    }
  };

  const cancelarAbono = async (a) => {
    if (!await preguntar({
      titulo: "Cancelar abono",
      mensaje: "Se resta de lo abonado a la factura y vuelve a quedar por aplicar en su pago. Si deja de cubrir el total, la factura vuelve a quedar sin cobrar. No se borra.",
      dato: `Parcialidad ${a.parcialidad} · ${moneda(a.monto)}`,
      accion: "Cancelar abono",
      peligro: true,
    })) return;
    try {
      const r = await apiClient.post(`/abonos/${a.id}/cancelar/`, {});
      setFactura(r.factura);
      setParcialidad(String(r.factura.siguiente_parcialidad));
      cargarAbonos(r.factura.id);
      cargarPorAplicar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo cancelar el abono." });
    }
  };

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

  const noAbonable = factura && motivoNoAbonable(factura);
  const numero = (p) => porAplicar.indexOf(p) + 1;

  return (
    <div className="nomina-container">
      <div className="cp-mitades">

        <section className="fz-bloque cp-mitad" aria-labelledby="cp-pago">
          <header>
            <h2 id="cp-pago">Pagos recibidos</h2>
            <input ref={archivoRef} type="file" hidden accept=".csv,text/csv" onChange={leerCsv} />
            <button type="button" className="cp-btn cp-btn--verde" disabled={leyendo}
              onClick={() => archivoRef.current?.click()} title="CSV de movimientos del banco">
              <Upload size={16} /> {leyendo ? "Leyendo…" : "Cargar CSV"}
            </button>
          </header>

          <details className="cp-manual">
            <summary>Capturar un pago a mano</summary>
            <div className="cp-campos">
              <label>Fecha del pago
                <CampoFecha selected={manual.fecha} placeholderText="dd/mm/aaaa"
                  onChange={(d) => setManual((m) => ({ ...m, fecha: d }))} />
              </label>
              <label>Monto del pago
                <input type="number" min="0.01" step="0.01" inputMode="decimal" value={manual.monto}
                  onChange={(e) => setManual((m) => ({ ...m, monto: e.target.value }))} />
              </label>
              <label>Clave de rastreo
                <input value={manual.clave_rastreo} maxLength={50}
                  onChange={(e) => setManual((m) => ({ ...m,
                    clave_rastreo: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() }))} />
              </label>
              {/* Lista con buscador: se escribe y filtra (usuario, 2026-10-22). */}
              <label>Banco
                <input list="cp-bancos" value={manual.banco} placeholder="Escribe para buscar…"
                  onChange={(e) => setManual((m) => ({ ...m, banco: e.target.value }))} />
                <datalist id="cp-bancos">
                  {bancos.map((b) => <option key={b} value={b} />)}
                </datalist>
              </label>
              <label className="cp-ancho">Cliente
                <select value={manual.rfc} onChange={(e) => setManual((m) => ({ ...m, rfc: e.target.value }))}>
                  <option value="">Sin cliente</option>
                  {clientes.map((c) => <option key={c.rfc} value={c.rfc}>{c.nombre} · {c.rfc}</option>)}
                </select>
              </label>
            </div>
            <div className="cp-acciones">
              <button type="button" className="cp-btn" onClick={agregarManual}>
                <Plus size={16} /> Agregar a la lista
              </button>
            </div>
          </details>

          {borrador.length > 0 && (
            <div className="cp-lista">
              <h3>Por guardar ({borrador.length})</h3>
              <div className="table-responsive cp-scroll5">
                <table className="nomina-table">
                  <thead>
                    <tr><th>Fecha</th><th>Monto</th><th>Cliente</th><th>Banco</th><th>Clave de rastreo</th><th /></tr>
                  </thead>
                  <tbody>
                    {borrador.map((p) => (
                      <tr key={p.clave}>
                        <td>{fechaLegible(p.fecha)}</td>
                        <td className="fc-total">{moneda(p.monto)}</td>
                        <td>
                          {p.nombre || "—"}
                          {p.rfc && <span className="cp-sub">{p.rfc}</span>}
                          {!p.manual && !p.cliente_principal && <span className="cp-etiqueta">No coincide con clientes</span>}
                          {!p.manual && p.cliente_principal && p.cliente_principal !== p.nombre &&
                            <span className="cp-sub">≈ {p.cliente_principal}</span>}
                          {!p.manual && !p.rfc_con_facturas && <span className="cp-etiqueta">RFC sin facturas</span>}
                        </td>
                        <td>{p.banco}</td>
                        <td>{p.clave_rastreo}</td>
                        <td>
                          <button type="button" className="fc-accion" aria-label="Quitar de la lista"
                            onClick={() => setBorrador((prev) => prev.filter((x) => x !== p))}>
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="cp-acciones">
                <button type="button" className="cp-btn btn-cancelar-app" onClick={() => setBorrador([])}
                  disabled={guardandoPagos}>
                  <RotateCcw size={16} /> Vaciar lista
                </button>
                <button type="button" className="cp-btn primario" onClick={guardarPagos} disabled={guardandoPagos}>
                  <Save size={16} /> {guardandoPagos ? "Guardando…" : "Guardar pagos"}
                </button>
              </div>
            </div>
          )}

          <div className="cp-lista">
            <h3>Pagos por aplicar</h3>
            {porAplicar.length === 0 ? (
              <p className="fz-ayuda">No hay pagos guardados con saldo por aplicar.</p>
            ) : (
              <div className="table-responsive cp-scroll5">
                <table className="nomina-table">
                  <thead>
                    <tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Por aplicar</th><th>Clave de rastreo</th>
                      {acceso.cancelar && <th />}</tr>
                  </thead>
                  <tbody>
                    {porAplicar.map((p, i) => (
                      <tr key={p.id} className={String(p.id) === String(pagoId) ? "cp-elegido" : undefined}>
                        <td>{i + 1}</td>
                        <td>{fechaLegible(p.fecha)}</td>
                        <td>{p.nombre || "—"}</td>
                        <td className="fc-total">{moneda(p.monto)}</td>
                        <td className="fc-total">{moneda(porAplicarDe(p))}</td>
                        <td>{p.clave_rastreo}</td>
                        {acceso.cancelar && (
                          <td><button className="fc-accion btn-cancelar-app" onClick={() => cancelarPago(p)}>Cancelar</button></td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="fz-bloque cp-mitad" aria-labelledby="cp-factura">
          <header><h2 id="cp-factura">Abonar a factura</h2></header>

          <div className="cp-campos">
            <label className="cp-ancho">Pago
              <select value={pagoId} disabled={guardando} onChange={(e) => setPagoId(e.target.value)}>
                <option value="">Elige el pago…</option>
                {porAplicar.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`#${numero(p)} · ${fechaLegible(p.fecha)} · ${p.nombre || "Sin cliente"} · por aplicar ${moneda(porAplicarDe(p))}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="cp-buscador">
            <input type="search" role="combobox" aria-expanded={abierto && resultados.length > 0}
              aria-controls="cp-resultados" aria-label="Buscar factura"
              placeholder={rfcFiltro ? `Facturas de ${rfcFiltro}: folio o cliente…` : "Buscar por folio, RFC o cliente…"}
              value={busqueda} disabled={guardando}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 150)}
              onKeyDown={(e) => e.key === "Escape" && setAbierto(false)}
              onChange={(e) => { setBusqueda(e.target.value); setFactura(null); setAbonos([]); setAbierto(true); }} />
            {abierto && resultados.length > 0 && (
              <ul id="cp-resultados" role="listbox" className="cp-resultados">
                {resultados.map((f) => (
                  <li key={f.id} role="option" aria-selected={false}>
                    {/* onMouseDown: el blur del input cerraría la lista antes del click. */}
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(f)}>
                      {linea(f)}
                      {motivoNoAbonable(f) && <span className="cp-etiqueta">{motivoNoAbonable(f)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cp-campos">
            <label>Cantidad a abonar
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={cantidad}
                disabled={guardando || !factura} onChange={(e) => setCantidad(e.target.value)} />
            </label>
            <label>Parcialidad
              <input type="number" min="1" max="999" step="1" value={parcialidad} disabled={guardando || !factura}
                onChange={(e) => setParcialidad(e.target.value)} />
            </label>
          </div>

          <dl className="cp-mini">
            <div><dt>A abonar</dt><dd>{moneda(cantidad || 0)}</dd></div>
            <div><dt>Ya abonado</dt><dd>{factura ? moneda(factura.abonado) : "—"}</dd></div>
            {pago && <div><dt>Por aplicar del pago #{numero(pago)}</dt><dd>{moneda(porAplicarDe(pago))}</dd></div>}
          </dl>

          <div className="cp-acciones">
            <button type="button" className="cp-btn btn-cancelar-app" onClick={restablecer} disabled={guardando}>
              <RotateCcw size={16} /> Restablecer
            </button>
            <button type="button" className="cp-btn primario" onClick={agregar}
              disabled={guardando || !factura || !pago || Boolean(noAbonable)}>
              <Plus size={16} /> {guardando ? "Guardando…" : "Agregar pago"}
            </button>
          </div>

          {factura && (
            <div className="cp-resumen" aria-live="polite">
              <h3>Resumen de la factura</h3>
              <dl>
                <div><dt>Folio</dt><dd>{`${factura.serie} ${factura.folio}`}</dd></div>
                <div><dt>Emisión</dt><dd>{fechaLegible(factura.fecha_emision) || "—"}</dd></div>
                <div><dt>RFC</dt><dd>{factura.rfc || "—"}</dd></div>
                <div><dt>Cliente</dt><dd>{factura.nombre || "—"}</dd></div>
                <div><dt>Total</dt><dd>{moneda(factura.total)}</dd></div>
                <div><dt>Abonado</dt><dd>{moneda(factura.abonado)}</dd></div>
                <div><dt>Saldo pendiente</dt><dd>{moneda(factura.saldo_pendiente)}</dd></div>
                <div><dt>Estado</dt><dd>{noAbonable
                  || (factura.fecha_cobro ? `Cobrada el ${fechaLegible(factura.fecha_cobro)}` : "Por cobrar")}</dd></div>
              </dl>
              {abonos.length > 0 && (
                <div className="table-responsive">
                  <table className="nomina-table">
                    <thead>
                      <tr><th>Parcialidad</th><th>Fecha del pago</th><th>Abonado</th><th>Banco</th><th>Clave de rastreo</th>
                        {acceso.cancelar && <th />}</tr>
                    </thead>
                    <tbody>
                      {abonos.map((a) => (
                        <tr key={a.id} className={a.estado === "cancelada" ? "cp-cancelado" : undefined}>
                          <td>{a.parcialidad}</td>
                          <td>{fechaLegible(a.fecha)}</td>
                          <td className="fc-total">{moneda(a.monto)}</td>
                          <td>{a.banco_nombre}</td>
                          <td>{a.clave_rastreo}</td>
                          {acceso.cancelar && (
                            <td>{a.estado === "activa"
                              ? <button className="fc-accion btn-cancelar-app" onClick={() => cancelarAbono(a)}>Cancelar</button>
                              : "Cancelado"}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
