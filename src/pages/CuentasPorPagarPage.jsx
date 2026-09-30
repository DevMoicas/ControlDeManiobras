import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { apiClient } from "../api/apiClient";
import CeldaEditable from "../components/CeldaEditable/CeldaEditable";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";

// Cuentas por pagar (Fase 4 de PLAN_MODULO_FINANZAS.md): gastos fijos, fletes y
// locales de terceros, y facturas de mantenimiento. Quién entra lo decide el
// backend; esta pantalla solo pregunta para no pintar lo que daría 403.

const PESTANAS = [
  ["gastos-fijos", "Gastos fijos"],
  ["flete", "Fletes"],
  ["local", "Locales"],
  ["mantenimiento", "Mantenimiento"],
];
const EMPRESAS = [["fraba", "Fraba"], ["soluciones", "Soluciones"]];
const NOMBRE_EMPRESA = Object.fromEntries(EMPRESAS);
const PERIODICIDADES = [[1, "Mensual"], [2, "Bimestral"], [3, "Trimestral"], [6, "Semestral"], [12, "Anual"]];

const moneda = (v) => (v == null || v === "" ? "" :
  Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const fechaLegible = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const etiquetaMes = (clave) => {
  const [a, m] = clave.split("-").map(Number);
  return `${new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "short" }).replace(".", "")}-${String(a).slice(2)}`;
};

// Los 400 de DRF llegan como {campo: [mensaje]}; el apiClient solo conserva
// `detail`. Para un formulario vale con decir qué revisar.
const mensajeError = (err) => err.message?.startsWith("HTTP 400")
  ? "Revisa los datos: falta algo o hay un valor no válido." : err.message;

export default function CuentasPorPagarPage() {
  const [acceso, setAcceso] = useState(null);
  const [pestana, setPestana] = useState("gastos-fijos");

  useEffect(() => {
    apiClient.get("/facturas/acceso/").then(setAcceso).catch(() => setAcceso({ ver: false }));
  }, []);

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

  return (
    <div className="nomina-container">
      <div className="fz-pestanas" role="tablist" aria-label="Cuentas por pagar">
        {PESTANAS.map(([clave, texto]) => (
          <button key={clave} role="tab" aria-selected={pestana === clave}
            className={pestana === clave ? "activo" : ""} onClick={() => setPestana(clave)}>
            {texto}
          </button>
        ))}
      </div>
      {pestana === "gastos-fijos"
        ? <GastosFijos esStaff={acceso.cancelar} />
        : <Cuentas key={pestana} origen={pestana} esStaff={acceso.cancelar} />}
    </div>
  );
}

// ── Gastos fijos: parte fija a la izquierda, seis meses a la derecha (P30) ──
function GastosFijos({ esStaff }) {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const hoy = new Date();
  const [empresa, setEmpresa] = useState("");
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mitad, setMitad] = useState(hoy.getMonth() < 6 ? 0 : 1);
  const [datos, setDatos] = useState({ meses: [], gastos: [] });
  const [cargando, setCargando] = useState(true);
  const dialogo = useRef(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const desde = `${anio}-${mitad ? "07" : "01"}`;
      setDatos(await apiClient.get(`/gastos-fijos/rejilla/?desde=${desde}${empresa ? `&empresa=${empresa}` : ""}`));
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    } finally {
      setCargando(false);
    }
  }, [anio, mitad, empresa, alerta]);

  useEffect(() => { cargar(); }, [cargar]);

  const moverMitad = (paso) => {
    const total = anio * 2 + mitad + paso;
    setAnio(Math.floor(total / 2));
    setMitad(total % 2);
  };

  const guardarCampo = async (g, campo, valor) => {
    try {
      await apiClient.patch(`/gastos-fijos/${g.id}/`, { [campo]: valor });
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: mensajeError(err) });
    }
  };

  const guardarPago = async (g, mes, monto) => {
    try {
      await apiClient.post(`/gastos-fijos/${g.id}/pago/`, { mes, monto });
      cargar(); // "faltan" depende de todos los meses: se recalcula en el servidor
    } catch (err) {
      alerta({ tipo: "error", msg: mensajeError(err) });
    }
  };

  const borrar = async (g) => {
    if (!await preguntar({
      titulo: "Borrar gasto fijo",
      mensaje: "Se borra con todos sus pagos capturados, también los de meses pasados.",
      dato: g.concepto, accion: "Borrar", peligro: true,
    })) return;
    try {
      await apiClient.delete(`/gastos-fijos/${g.id}/`);
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    }
  };

  const crear = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await apiClient.post("/gastos-fijos/", f);
      e.target.reset();
      dialogo.current?.close();
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: mensajeError(err) });
    }
  };

  return (
    <>
      <div className="toolbar">
        <FiltroEmpresa valor={empresa} onCambio={setEmpresa} />
        <div className="fz-periodo">
          <button onClick={() => moverMitad(-1)} aria-label="Seis meses antes"><ChevronLeft size={18} /></button>
          <span>{mitad ? "Julio – diciembre" : "Enero – junio"} {anio}</span>
          <button onClick={() => moverMitad(1)} aria-label="Seis meses después"><ChevronRight size={18} /></button>
        </div>
        <div className="toolbar-acciones">
          <button className="np-btn-calendario" onClick={() => dialogo.current?.showModal()}>
            <Plus size={18} /> Nuevo gasto fijo
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="nomina-table fz-rejilla">
          <thead>
            <tr>
              {!empresa && <th>Empresa</th>}
              <th>Concepto</th><th>Día de pago</th><th>Monto</th><th>Periodicidad</th>
              {datos.meses.map((m) => <th key={m} className="fz-mes">{etiquetaMes(m)}</th>)}
              {esStaff && <th />}
            </tr>
          </thead>
          <tbody>
            {cargando && datos.gastos.length === 0 ? (
              <tr><td colSpan={12} className="np-vacio">Cargando…</td></tr>
            ) : datos.gastos.length === 0 ? (
              <tr><td colSpan={12} className="np-vacio">No hay gastos fijos. Da de alta el primero.</td></tr>
            ) : datos.gastos.map((g) => (
              <tr key={g.id}>
                {!empresa && <td>{NOMBRE_EMPRESA[g.empresa]}</td>}
                <td><CeldaEditable valor={g.concepto} etiqueta="Concepto"
                  onGuardar={(v) => guardarCampo(g, "concepto", v)} /></td>
                <td><CeldaEditable valor={g.dia_pago ?? ""} etiqueta={`Día de pago de ${g.concepto}`}
                  onGuardar={(v) => guardarCampo(g, "dia_pago", v)} /></td>
                <td><CeldaEditable valor={g.monto ?? ""} texto={moneda(g.monto)} etiqueta={`Monto de ${g.concepto}`}
                  onGuardar={(v) => guardarCampo(g, "monto", v)} /></td>
                <td>
                  <select className="fz-select" value={g.periodicidad} aria-label={`Periodicidad de ${g.concepto}`}
                    onChange={(e) => guardarCampo(g, "periodicidad", e.target.value)}>
                    {PERIODICIDADES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </td>
                {datos.meses.map((m) => (
                  <td key={m} className={g.faltan.includes(m) ? "fz-falta" : undefined}
                    title={g.faltan.includes(m) ? "Toca pagar este mes y no está capturado" : undefined}>
                    <CeldaEditable valor={g.pagos[m] ?? ""} texto={moneda(g.pagos[m])}
                      etiqueta={`${g.concepto}, ${etiquetaMes(m)}`}
                      onGuardar={(v) => guardarPago(g, m, v)} />
                  </td>
                ))}
                {esStaff && (
                  <td><button className="fc-accion" onClick={() => borrar(g)}>Borrar</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog ref={dialogo} className="fz-dialogo">
        <form onSubmit={crear}>
          <h2>Nuevo gasto fijo</h2>
          <label>Empresa
            <select name="empresa" required defaultValue={empresa || ""}>
              <option value="" disabled>Elige…</option>
              {EMPRESAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label>Concepto<input name="concepto" required maxLength={255} /></label>
          <label>Día de pago<input name="dia_pago" type="number" min={1} max={31} /></label>
          <label>Monto de referencia<input name="monto" type="number" min={0} step="0.01" /></label>
          <label>Periodicidad
            <select name="periodicidad" defaultValue={1}>
              {PERIODICIDADES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <div className="fz-dialogo-acciones">
            <button type="button" className="btn-cancelar-app" onClick={() => dialogo.current?.close()}>Cancelar</button>
            <button type="submit" className="primario">Guardar</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function FiltroEmpresa({ valor, onCambio }) {
  return (
    <div className="fc-filtro" role="group" aria-label="Empresa">
      {[["", "Todas"], ...EMPRESAS].map(([v, t]) => (
        <button key={v} aria-pressed={valor === v} className={valor === v ? "activo" : ""}
          onClick={() => onCambio(v)}>{t}</button>
      ))}
    </div>
  );
}

// ── Fletes, locales y mantenimiento ─────────────────────────────────────────
// Lo que se lee de la maniobra, por origen (P33 para locales).
const COLUMNAS_MANIOBRA = {
  flete: [["folio", "Folio"], ["fecha_pis", "Fecha PIS", fechaLegible], ["transportista", "Transportista"],
          ["ruta", "Ruta"], ["contenedor", "Contenedor"]],
  local: [["terminal", "Terminal"], ["fecha_pis", "Fecha PIS", fechaLegible], ["placas_pis", "Placas PIS"],
          ["tipo_servicio", "Servicio"], ["tipo", "Tipo de carga"], ["peso", "Peso"],
          ["contenedor", "Contenedor"], ["referencia", "Referencia"]],
  mantenimiento: [],
};

function Cuentas({ origen, esStaff }) {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState(null); // la fila para la que se captura
  const dialogo = useRef(null);
  const conManiobra = origen !== "mantenimiento";

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      if (conManiobra) {
        const data = await apiClient.get(`/cuentas-por-pagar/maniobras/?origen=${origen}`);
        setFilas(data.map((m) => ({ ...m, ruta: [m.origen_ruta, m.destino].filter(Boolean).join(" → ") })));
      } else {
        const data = await apiClient.get(`/cuentas-por-pagar/?origen=mantenimiento&estado=activa`);
        setFilas(data.map((c) => ({ cuenta: c })));
      }
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    } finally {
      setCargando(false);
    }
  }, [origen, conManiobra, alerta]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirCaptura = (fila) => {
    setNueva(fila);
    dialogo.current?.showModal();
  };

  const crear = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await apiClient.post("/cuentas-por-pagar/", { ...f, origen, maniobra: nueva?.maniobra });
      e.target.reset();
      dialogo.current?.close();
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: mensajeError(err) });
    }
  };

  const guardarCampo = async (c, campo, valor) => {
    try {
      await apiClient.patch(`/cuentas-por-pagar/${c.id}/`, { [campo]: valor });
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: mensajeError(err) });
    }
  };

  const alternarPagada = async (c) => {
    try {
      await apiClient.post(`/cuentas-por-pagar/${c.id}/pagada/`, { pagada: !c.pagada });
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    }
  };

  const cancelar = async (c) => {
    if (!await preguntar({
      titulo: "Cancelar cuenta por pagar",
      mensaje: "Deja de contar como costo y como pendiente. No se borra, para que los meses ya revisados no se muevan.",
      dato: `${c.no_factura || "Sin número"} · ${moneda(c.total)}`,
      accion: "Cancelar cuenta", peligro: true,
    })) return;
    try {
      await apiClient.post(`/cuentas-por-pagar/${c.id}/cancelar/`, {});
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    }
  };

  const columnas = COLUMNAS_MANIOBRA[origen];
  const manuales = ["Empresa", "N° Factura", "Total", "Concepto", "Fecha", "Días de crédito", "Vence", "Pagada"];
  const total = filas.reduce((s, f) => s + (f.cuenta && !f.cuenta.pagada ? Number(f.cuenta.total) : 0), 0);

  return (
    <>
      <div className="toolbar">
        <div className="np-resumen">
          Por pagar: <strong>{moneda(total)}</strong>
          {conManiobra && ` · ${filas.filter((f) => !f.cuenta).length} sin factura capturada`}
        </div>
        {!conManiobra && (
          <div className="toolbar-acciones">
            <button className="np-btn-calendario" onClick={() => abrirCaptura(null)}>
              <Plus size={18} /> Nueva factura de mantenimiento
            </button>
          </div>
        )}
      </div>

      <div className="table-responsive">
        <table className="nomina-table">
          <thead>
            <tr>
              {columnas.map(([k, t]) => <th key={k}>{t}</th>)}
              {manuales.map((t) => <th key={t}>{t}</th>)}
              {esStaff && <th />}
            </tr>
          </thead>
          <tbody>
            {cargando && filas.length === 0 ? (
              <tr><td colSpan={20} className="np-vacio">Cargando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={20} className="np-vacio">
                {conManiobra ? "No hay maniobras de terceros desde agosto de 2026." : "No hay facturas de mantenimiento."}
              </td></tr>
            ) : filas.map((f, i) => {
              const c = f.cuenta;
              return (
                <tr key={f.maniobra ?? c?.id ?? i}>
                  {columnas.map(([k, , formato]) => <td key={k}>{formato ? formato(f[k]) : f[k]}</td>)}
                  {!c ? (
                    <td colSpan={manuales.length + (esStaff ? 1 : 0)}>
                      <button className="fc-accion" onClick={() => abrirCaptura(f)}>Capturar factura</button>
                    </td>
                  ) : (
                    <>
                      <td>
                        <select className="fz-select" value={c.empresa} aria-label="Empresa"
                          onChange={(e) => guardarCampo(c, "empresa", e.target.value)}>
                          {EMPRESAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                      </td>
                      <td><CeldaEditable valor={c.no_factura} etiqueta="N° Factura" max={100}
                        onGuardar={(v) => guardarCampo(c, "no_factura", v)} /></td>
                      <td className="fc-total"><CeldaEditable valor={c.total} texto={moneda(c.total)} etiqueta="Total"
                        onGuardar={(v) => guardarCampo(c, "total", v)} /></td>
                      <td><CeldaEditable valor={c.concepto} etiqueta="Concepto" max={255}
                        onGuardar={(v) => guardarCampo(c, "concepto", v)} /></td>
                      <td><CeldaEditable fecha valor={c.fecha} texto={fechaLegible(c.fecha)} etiqueta="Fecha"
                        onGuardar={(v) => guardarCampo(c, "fecha", v)} /></td>
                      <td><CeldaEditable valor={c.dias_credito} etiqueta="Días de crédito"
                        onGuardar={(v) => guardarCampo(c, "dias_credito", v)} /></td>
                      <td>{fechaLegible(c.vencimiento)}</td>
                      <td className="fc-centro">
                        <input type="checkbox" className="fc-check" checked={c.pagada}
                          onChange={() => alternarPagada(c)}
                          aria-label={`${c.no_factura || "Factura"}: ${c.pagada ? "desmarcar" : "marcar"} como pagada`} />
                      </td>
                      {esStaff && (
                        <td><button className="fc-accion btn-cancelar-app" onClick={() => cancelar(c)}>Cancelar</button></td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dialog ref={dialogo} className="fz-dialogo">
        {/* key: al cambiar de fila el formulario se monta de nuevo y toma la
            empresa sugerida de ESA maniobra como valor inicial. */}
        <form key={nueva?.maniobra ?? "nueva"} onSubmit={crear}>
          <h2>{conManiobra ? `Factura del proveedor${nueva?.folio ? ` · ${nueva.folio}` : ""}` : "Nueva factura de mantenimiento"}</h2>
          <label>Empresa
            {/* Sin factura de venta ligada no hay de dónde sacarla: se elige (P61). */}
            <select name="empresa" required defaultValue={nueva?.empresa_sugerida ?? ""}>
              <option value="" disabled>Elige…</option>
              {EMPRESAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label>N° Factura<input name="no_factura" maxLength={100} /></label>
          <label>Total<input name="total" type="number" min={0} step="0.01" required /></label>
          <label>Concepto<input name="concepto" maxLength={255} /></label>
          <label>Fecha de la factura<input name="fecha" type="date" required /></label>
          <label>Días de crédito<input name="dias_credito" type="number" min={0} placeholder="Sin crédito" /></label>
          <div className="fz-dialogo-acciones">
            <button type="button" className="btn-cancelar-app" onClick={() => dialogo.current?.close()}>Cancelar</button>
            <button type="submit" className="primario">Guardar</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
