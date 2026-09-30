import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, TriangleAlert } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { apiClient } from "../../api/apiClient";
import "./Dashboards.css";

// Los dashboards de Finanzas (Fase 6 de PLAN_MODULO_FINANZAS.md). Cada uno es
// autónomo —sus filtros, su comparación, su gráfica y su tabla— para que la
// página de su grupo y la de DASHBOARDS pinten EXACTAMENTE lo mismo (P41). Las
// cifras las calcula el backend (/api/dashboards/<nombre>/); aquí solo se pintan.

// Paleta validada (skill dataviz, fondo blanco): tres servicios en orden fijo,
// nunca rotado. "No asignado" es gris porque no es una categoría más. El aqua
// queda bajo 3:1 de contraste: por eso cada gráfica lleva leyenda y su tabla.
const COLOR = {
  sencillo: "#2a78d6", full: "#eb6834", carga_suelta: "#1baf7a", no_asignado: "#9ca3af",
  serie1: "#2a78d6", serie2: "#eb6834", serie3: "#1baf7a",
};
const SERVICIOS = [["sencillo", "Sencillo"], ["full", "Full"], ["carga_suelta", "Carga suelta"]];
const NOMBRE_SERVICIO = Object.fromEntries([...SERVICIOS, ["no_asignado", "No asignado"]]);
const TRAMOS = [["por_vencer", "Por vencer"], ["0_30", "0–30 días"], ["31_60", "31–60 días"],
                ["61_90", "61–90 días"], ["mas_90", "+90 días"]];

const dinero = (v) => (v == null ? "—" :
  Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }));
const dineroCorto = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${n}`;
};
const etiquetaMes = (k) => {
  const [a, m] = k.split("-").map(Number);
  return `${new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "short" }).replace(".", "")} ${String(a).slice(2)}`;
};
const fechaLegible = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const sumar = (filas, clave) => filas.reduce((s, f) => s + Number(f[clave] || 0), 0);
// El backend manda el dinero como texto exacto ("4000.00"); recharts necesita
// números para apilar y escalar. Solo para lo que va a una gráfica.
const graf = (filas) => filas.map((f) => Object.fromEntries(Object.entries(f).map(
  ([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const periodoInicial = () => ({ desde: `${new Date().getFullYear()}-01-01`, hasta: hoyISO() });

// ── Datos ────────────────────────────────────────────────────────────────────
function useDashboard(nombre, filtros, activo = true) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });
  const clave = JSON.stringify(filtros);
  useEffect(() => {
    if (!activo) { setEstado({ datos: null, cargando: false, error: null }); return; }
    let vigente = true;
    const params = new URLSearchParams(Object.entries(JSON.parse(clave)).filter(([, v]) => v));
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    apiClient.get(`/dashboards/${nombre}/?${params}`)
      .then((datos) => vigente && setEstado({ datos, cargando: false, error: null }))
      .catch((err) => vigente && setEstado({ datos: null, cargando: false, error: err.message }));
    return () => { vigente = false; };
  }, [nombre, clave, activo]);
  return estado;
}

// Filtros + periodo de comparación (P42, P43). `campos` dice cuáles pinta.
function useFiltros() {
  const [filtros, setFiltros] = useState(periodoInicial);
  const [comparar, setComparar] = useState(null); // {desde, hasta} o null
  const poner = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  return { filtros, poner, comparar, setComparar };
}

function BarraFiltros({ campos = [], estado, opciones = {}, viajes = [] }) {
  const { filtros, poner, comparar, setComparar } = estado;
  const [clientes, setClientes] = useState([]);
  // Booleano y no el array: `campos` es un literal nuevo en cada render y como
  // dependencia relanzaría la petición sin fin.
  const conCliente = campos.includes("cliente");
  useEffect(() => {
    if (conCliente) {
      apiClient.getCatalogo("/clientes-principales/").then((l) => setClientes(l.map((c) => c.nombre))).catch(() => {});
    }
  }, [conCliente]);

  const select = (campo, etiqueta, valores) => (
    <label key={campo}>{etiqueta}
      <select value={filtros[campo] || ""} onChange={(e) => poner(campo, e.target.value)}>
        <option value="">Todos</option>
        {valores.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
  const lista = (xs) => (xs || []).map((x) => [x, x]);

  return (
    <div className="db-filtros">
      <label>Desde<input type="date" value={filtros.desde} onChange={(e) => poner("desde", e.target.value)} /></label>
      <label>Hasta<input type="date" value={filtros.hasta} onChange={(e) => poner("hasta", e.target.value)} /></label>
      {campos.includes("cliente") && select("cliente", "Cliente",
        [...lista(clientes), ["Sin cliente asignado", "Sin cliente asignado"]])}
      {campos.includes("servicio") && select("servicio", "Servicio", SERVICIOS)}
      {campos.includes("alcance") && select("alcance", "Local / foráneo", [["local", "Local"], ["foraneo", "Foráneo"]])}
      {campos.includes("unidad") && select("unidad", "Unidad", lista(opciones.unidades))}
      {campos.includes("operador") && select("operador", "Operador", lista(opciones.operadores))}
      {campos.includes("ruta") && select("ruta", "Ruta", lista(opciones.rutas))}
      {campos.includes("destino") && select("destino", "Destino", lista(opciones.destinos))}
      {campos.includes("maniobra") && select("maniobra", "Viaje",
        viajes.map((v) => [String(v.maniobra), v.folio || `Maniobra ${v.maniobra}`]))}
      {campos.includes("empresa") && select("empresa", "Empresa", [["fraba", "Fraba"], ["soluciones", "Soluciones"]])}
      <label className="db-comparar">
        <input type="checkbox" checked={!!comparar}
          onChange={(e) => setComparar(e.target.checked ? restarUnAnio(filtros) : null)} />
        Comparar con
      </label>
      {comparar && (
        <>
          <label>Desde<input type="date" value={comparar.desde}
            onChange={(e) => setComparar({ ...comparar, desde: e.target.value })} /></label>
          <label>Hasta<input type="date" value={comparar.hasta}
            onChange={(e) => setComparar({ ...comparar, hasta: e.target.value })} /></label>
        </>
      )}
    </div>
  );
}

// Por defecto se compara con el mismo rango del año anterior: es la comparación
// que no se engaña con la estacionalidad.
const restarUnAnio = ({ desde, hasta }) => ({
  desde: `${Number(desde.slice(0, 4)) - 1}${desde.slice(4)}`,
  hasta: `${Number(hasta.slice(0, 4)) - 1}${hasta.slice(4)}`,
});

// ── Piezas ───────────────────────────────────────────────────────────────────
function Kpi({ titulo, valor, anterior, formato = dinero, sufijo = "" }) {
  const n = Number(valor), a = Number(anterior);
  const variacion = anterior != null && a ? ((n - a) / Math.abs(a)) * 100 : null;
  return (
    <div className="db-kpi">
      <span className="db-kpi-titulo">{titulo}</span>
      <strong>{valor == null ? "—" : `${formato(valor)}${sufijo}`}</strong>
      {anterior != null && (
        <span className="db-kpi-comparado">
          {variacion != null && (variacion >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />)}
          {variacion != null ? `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)} %` : "sin base"}
          {" "}vs {formato(anterior)}{sufijo}
        </span>
      )}
    </div>
  );
}

function Aviso({ children }) {
  return <p className="db-aviso"><TriangleAlert size={15} /> {children}</p>;
}

function Tabla({ columnas, filas }) {
  return (
    <div className="db-tabla">
      <table>
        <thead><tr>{columnas.map(([, t]) => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>
          {filas.length === 0
            ? <tr><td colSpan={columnas.length} className="db-vacio">Sin datos en el periodo.</td></tr>
            : filas.map((f, i) => (
              <tr key={i}>{columnas.map(([k, t, fmt]) => <td key={t}>{fmt ? fmt(f[k], f) : f[k]}</td>)}</tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

const ejes = (
  <>
    <CartesianGrid vertical={false} stroke="#eef0f3" />
    <XAxis dataKey="etiqueta" tickLine={false} axisLine={{ stroke: "#d1d5db" }} tick={{ fill: "#6b7280", fontSize: 12 }} />
    <YAxis tickFormatter={dineroCorto} tickLine={false} axisLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} width={56} />
  </>
);
const tooltipDinero = <Tooltip formatter={(v, n) => [dinero(v), n]} cursor={{ fill: "rgba(37,99,235,0.06)" }} />;

// Barras apiladas por servicio: 2px de separación (stroke del color del fondo)
// y esquina redondeada solo en el extremo de la pila.
function BarrasPorServicio({ datos, incluirNoAsignado, formato = "dinero" }) {
  const series = incluirNoAsignado ? [...SERVICIOS, ["no_asignado", "No asignado"]] : SERVICIOS;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={graf(datos)} barCategoryGap="28%">
        {ejes}
        {formato === "dinero" ? tooltipDinero : <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} />}
        <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
        {series.map(([k, t], i) => (
          <Bar key={k} dataKey={k} name={t} stackId="s" fill={COLOR[k]} stroke="#fff" strokeWidth={2}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Panel({ titulo, children, cargando, error }) {
  return (
    <section className="db-panel" aria-busy={cargando}>
      <h2>{titulo}</h2>
      {error ? <Aviso>No se pudo cargar: {error}</Aviso> : children}
    </section>
  );
}

// El dashboard y su periodo de comparación: la misma consulta, dos rangos.
function useConComparacion(nombre, campos) {
  const estado = useFiltros();
  const actual = useDashboard(nombre, estado.filtros);
  const previo = useDashboard(nombre, { ...estado.filtros, ...(estado.comparar || {}) }, !!estado.comparar);
  return { estado, actual, previo: estado.comparar ? previo.datos : null, campos };
}

// ── 1. Ventas mensuales (D1: dinero y servicios vendidos) ───────────────────
export function Ventas() {
  const campos = ["cliente", "servicio", "unidad", "operador", "ruta"];
  const { estado, actual, previo } = useConComparacion("ventas", campos);
  const d = actual.datos;
  const meses = (d?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), ...m, ...m.ventas_por_servicio }));
  const servicios = (d?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), ...m.servicios_por_servicio }));
  const sinFactura = sumar(d?.meses || [], "sin_factura");
  return (
    <Panel titulo="Ventas mensuales" {...actual}>
      <BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} />
      <div className="db-kpis">
        <Kpi titulo="Ventas del periodo (con IVA)" valor={sumar(d?.meses || [], "ventas")}
          anterior={previo ? sumar(previo.meses, "ventas") : undefined} />
        <Kpi titulo="Servicios vendidos" valor={sumar(d?.meses || [], "servicios")} formato={(v) => String(v)}
          anterior={previo ? sumar(previo.meses, "servicios") : undefined} />
      </div>
      {Number(d?.no_asignado) > 0 && <Aviso>{dinero(d.no_asignado)} en facturas sin maniobra ligada quedan fuera de los filtros (no asignado).</Aviso>}
      {sinFactura > 0 && <Aviso>{sinFactura} servicio(s) sin número de factura: cuentan en el mes de su fecha PIS.</Aviso>}
      <h3>Dinero facturado por servicio</h3>
      <BarrasPorServicio datos={meses} incluirNoAsignado />
      <h3>Servicios vendidos por tipo</h3>
      <BarrasPorServicio datos={servicios} formato="numero" />
      <Tabla columnas={[["etiqueta", "Mes"], ["ventas", "Ventas", dinero], ["servicios", "Servicios"],
                        ["sin_factura", "Sin factura"]]} filas={meses} />
    </Panel>
  );
}

// ── 2. Gastos mensuales (costo de ventas, P18) ──────────────────────────────
export function Gastos() {
  const campos = ["cliente", "servicio", "unidad", "operador", "ruta"];
  const { estado, actual, previo } = useConComparacion("gastos", campos);
  const d = actual.datos;
  const meses = (d?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), ...m, ...m.por_servicio }));
  return (
    <Panel titulo="Gastos mensuales" {...actual}>
      <BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} />
      <div className="db-kpis">
        <Kpi titulo="Costo de ventas del periodo" valor={sumar(d?.meses || [], "costo")}
          anterior={previo ? sumar(previo.meses, "costo") : undefined} />
      </div>
      <p className="db-nota">Gastos de cada maniobra más la urea de sus reportes de viaje, por mes de entrega de mercancía.</p>
      <BarrasPorServicio datos={meses} />
      <Tabla columnas={[["etiqueta", "Mes"], ["costo", "Costo de ventas", dinero]]} filas={meses} />
    </Panel>
  );
}

// ── 3. Utilidad mensual (solo periodo, P42) ─────────────────────────────────
export function Utilidad() {
  const { estado, actual, previo } = useConComparacion("utilidad", []);
  const meses = (actual.datos?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), ...m }));
  const faltan = meses.filter((m) => m.faltan_pagos).map((m) => m.etiqueta);
  return (
    <Panel titulo="Utilidad mensual" {...actual}>
      <BarraFiltros estado={estado} />
      <div className="db-kpis">
        <Kpi titulo="Utilidad bruta" valor={sumar(meses, "utilidad_bruta")}
          anterior={previo ? sumar(previo.meses, "utilidad_bruta") : undefined} />
        <Kpi titulo="Utilidad operacional" valor={sumar(meses, "utilidad_operacional")}
          anterior={previo ? sumar(previo.meses, "utilidad_operacional") : undefined} />
        <Kpi titulo="Utilidad neta" valor={sumar(meses, "utilidad_neta")}
          anterior={previo ? sumar(previo.meses, "utilidad_neta") : undefined} />
      </div>
      <Aviso>La nómina administrativa está pendiente de definir (a qué mes va cada semana): la utilidad operacional aún no la resta.</Aviso>
      {faltan.length > 0 && <Aviso>Faltan pagos de gastos fijos por capturar en: {faltan.join(", ")}.</Aviso>}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={graf(meses)}>
          {ejes}
          <Tooltip formatter={(v, n) => [dinero(v), n]} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          <Line dataKey="utilidad_bruta" name="Bruta" stroke={COLOR.serie1} strokeWidth={2} dot={{ r: 4 }} />
          <Line dataKey="utilidad_neta" name="Neta" stroke={COLOR.serie2} strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
      <Tabla filas={meses} columnas={[
        ["etiqueta", "Mes"], ["ventas", "Ventas", dinero], ["costo_ventas", "Costo de ventas", dinero],
        ["utilidad_bruta", "Bruta", dinero], ["gastos_fijos", "Gastos fijos", dinero],
        ["comisiones", "Comisiones", dinero], ["utilidad_operacional", "Operacional", dinero],
        ["financieros", "Financieros", dinero], ["utilidad_antes_impuestos", "Antes de impuestos", dinero],
        ["impuestos", "Impuestos", dinero], ["utilidad_neta", "Neta", dinero],
      ]} />
    </Panel>
  );
}

// ── 4. Cuentas por cobrar + cobranza semanal (periodo, cliente) ─────────────
export function CuentasPorCobrar() {
  const campos = ["cliente"];
  const { estado, actual, previo } = useConComparacion("cuentas-por-cobrar", campos);
  const d = actual.datos;
  const tramos = TRAMOS.map(([k, t]) => ({ etiqueta: t, total: d?.antiguedad?.[k] ?? 0 }));
  const semanas = (d?.semanas || []).map((s) => ({ etiqueta: fechaLegible(s.semana).slice(0, 5), ...s }));
  const total = sumar(tramos, "total");
  const vencido = total - Number(d?.antiguedad?.por_vencer || 0);
  const totalPrevio = previo ? Object.values(previo.antiguedad).reduce((s, v) => s + Number(v), 0) : undefined;
  return (
    <Panel titulo="Cuentas por cobrar y cobranza semanal" {...actual}>
      <BarraFiltros campos={campos} estado={estado} />
      <div className="db-kpis">
        <Kpi titulo="Por cobrar (con días de crédito)" valor={total} anterior={totalPrevio} />
        <Kpi titulo="Vencido" valor={vencido} />
        <Kpi titulo="Cobranza del periodo" valor={sumar(semanas, "total")}
          anterior={previo ? sumar(previo.semanas, "total") : undefined} />
      </div>
      {Number(d?.fuera_de_antiguedad) > 0 &&
        <Aviso>{dinero(d.fuera_de_antiguedad)} sin cliente principal o pendientes de ligar: fuera de la antigüedad.</Aviso>}
      <div className="db-dos">
        <div>
          <h3>Antigüedad de saldos</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={graf(tramos)}>{ejes}{tooltipDinero}
              <Bar dataKey="total" name="Por cobrar" fill={COLOR.serie1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3>Cobranza semanal (por semana de emisión)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={graf(semanas)}>{ejes}{tooltipDinero}
              <Bar dataKey="total" name="Facturado" fill={COLOR.serie1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Tabla columnas={[["etiqueta", "Tramo"], ["total", "Por cobrar", dinero]]} filas={tramos} />
    </Panel>
  );
}

// ── 5. Cuentas por pagar (periodo, empresa) ─────────────────────────────────
export function CuentasPorPagar() {
  const campos = ["empresa"];
  const { estado, actual, previo } = useConComparacion("cuentas-por-pagar", campos);
  const d = actual.datos;
  const origenes = [["flete", "Fletes"], ["local", "Locales"], ["mantenimiento", "Mantenimiento"]]
    .map(([k, t]) => ({ etiqueta: t, ...(d?.por_origen?.[k] || {}) }));
  const porPagarPrevio = previo ? Object.values(previo.por_origen).reduce((s, o) => s + Number(o.por_pagar), 0) : undefined;
  return (
    <Panel titulo="Cuentas por pagar" {...actual}>
      <BarraFiltros campos={campos} estado={estado} />
      <div className="db-kpis">
        <Kpi titulo="Por pagar" valor={sumar(origenes, "por_pagar")} anterior={porPagarPrevio} />
        <Kpi titulo="Vencido" valor={sumar(origenes, "vencido")} />
        <Kpi titulo="Pagado" valor={sumar(origenes, "pagado")} />
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={graf(origenes)} barCategoryGap="30%">{ejes}{tooltipDinero}
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="por_pagar" name="Por pagar" fill={COLOR.serie1} radius={[4, 4, 0, 0]} />
          <Bar dataKey="pagado" name="Pagado" fill={COLOR.serie2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Tabla filas={origenes} columnas={[["etiqueta", "Origen"], ["por_pagar", "Por pagar", dinero],
                                         ["vencido", "Vencido", dinero], ["pagado", "Pagado", dinero]]} />
    </Panel>
  );
}

// ── 6. Ventas por cliente (periodo, cliente) ────────────────────────────────
export function VentasPorCliente() {
  const campos = ["cliente"];
  const { estado, actual } = useConComparacion("ventas-por-cliente", campos);
  const d = actual.datos;
  const filas = d?.clientes || [];
  // Pastel solo con las 3 primeras y "Otros": más porciones no se leen (y la
  // paleta solo valida 3 colores juntos). El detalle completo va en la tabla.
  const top = filas.slice(0, 3).map((f, i) => ({ ...f, color: [COLOR.serie1, COLOR.serie2, COLOR.serie3][i] }));
  const resto = filas.slice(3).reduce((s, f) => s + Number(f.total), 0);
  const pastel = resto > 0 ? [...top, { cliente: "Otros", total: resto, color: COLOR.no_asignado }] : top;
  return (
    <Panel titulo="Ventas por cliente" {...actual}>
      <BarraFiltros campos={campos} estado={estado} />
      <div className="db-kpis"><Kpi titulo="Ventas del periodo" valor={d?.total} /></div>
      <div className="db-dos">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pastel.map((p) => ({ ...p, total: Number(p.total) }))} dataKey="total" nameKey="cliente"
              innerRadius={60} outerRadius={100} stroke="#fff" strokeWidth={2}>
              {pastel.map((p) => <Cell key={p.cliente} fill={p.color} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [dinero(v), n]} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          </PieChart>
        </ResponsiveContainer>
        <Tabla filas={filas} columnas={[["cliente", "Cliente"], ["total", "Ventas", dinero],
                                        ["porcentaje", "%", (v) => (v == null ? "—" : `${v} %`)]]} />
      </div>
    </Panel>
  );
}

// ── 7. Ventas por servicio (periodo, servicio, local/foráneo) ───────────────
export function VentasPorServicio() {
  const campos = ["servicio", "alcance"];
  const { estado, actual } = useConComparacion("ventas-por-servicio", campos);
  const d = actual.datos;
  const filas = (d?.servicios || []).map((s) => ({ ...s, etiqueta: NOMBRE_SERVICIO[s.servicio] }));
  return (
    <Panel titulo="Ventas por servicio" {...actual}>
      <BarraFiltros campos={campos} estado={estado} />
      <div className="db-kpis"><Kpi titulo="Ventas ligadas a servicio" valor={sumar(filas, "total")} /></div>
      {Number(d?.no_asignado) > 0 && <Aviso>{dinero(d.no_asignado)} en facturas sin maniobra ligada: sin servicio (no asignado).</Aviso>}
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={graf(filas)} barCategoryGap="30%">{ejes}{tooltipDinero}
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="local" name="Local" fill={COLOR.serie1} radius={[4, 4, 0, 0]} />
          <Bar dataKey="foraneo" name="Foráneo" fill={COLOR.serie2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Tabla filas={filas} columnas={[["etiqueta", "Servicio"], ["local", "Local", dinero],
                                      ["foraneo", "Foráneo", dinero], ["total", "Total", dinero]]} />
    </Panel>
  );
}

// ── 8. Costos por unidad (periodo, unidad, viaje, operador, destino) ────────
export function CostosPorUnidad() {
  const campos = ["unidad", "maniobra", "operador", "destino"];
  const { estado, actual, previo } = useConComparacion("costos-por-unidad", campos);
  const d = actual.datos;
  const unidades = (d?.unidades || []).map((u) => ({ ...u, etiqueta: u.unidad }));
  return (
    <Panel titulo="Costos por unidad" {...actual}>
      <BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} viajes={d?.viajes} />
      <div className="db-kpis">
        <Kpi titulo="Costo total" valor={sumar(unidades, "costo")}
          anterior={previo ? sumar(previo.unidades, "costo") : undefined} />
        <Kpi titulo="Viajes" valor={sumar(unidades, "viajes")} formato={(v) => String(v)} />
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={graf(unidades.slice(0, 15))}>{ejes}{tooltipDinero}
          <Bar dataKey="costo" name="Costo" fill={COLOR.serie1} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Tabla filas={unidades} columnas={[["unidad", "Unidad (tracto)"], ["viajes", "Viajes"],
                                         ["costo", "Costo", dinero], ["costo_promedio", "Promedio por viaje", dinero]]} />
    </Panel>
  );
}

// ── 9. Rentabilidad por operación (los seis filtros) ────────────────────────
export function Rentabilidad() {
  const campos = ["cliente", "servicio", "unidad", "operador", "ruta"];
  const { estado, actual, previo } = useConComparacion("rentabilidad", campos);
  const d = actual.datos;
  const pct = (v) => (v == null ? "—" : `${v} %`);
  return (
    <Panel titulo="Rentabilidad por operación" {...actual}>
      <BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} />
      <div className="db-kpis">
        <Kpi titulo="Rentabilidad (ingreso ÷ costo)" valor={d?.rentabilidad} formato={(v) => v} sufijo=" %"
          anterior={previo ? previo.rentabilidad : undefined} />
        <Kpi titulo="Ingreso" valor={d?.total_ingreso} anterior={previo?.total_ingreso} />
        <Kpi titulo="Costo" valor={d?.total_costo} anterior={previo?.total_costo} />
      </div>
      <p className="db-nota">200 % es ingresar el doble de lo gastado. Sin costo registrado no hay división.</p>
      <Tabla filas={d?.operaciones || []} columnas={[["folio", "Folio"], ["cliente", "Cliente"],
        ["ingreso", "Ingreso", dinero], ["costo", "Costo", dinero], ["rentabilidad", "Rentabilidad", pct]]} />
    </Panel>
  );
}

// Los nueve, en el orden de la agrupación de la P44. Viven todos en una sola
// página, DASHBOARDS, con un botón cada uno: las páginas por grupo se quitaron
// porque repetían lo mismo sin capturar nada (usuario, 2026-09-30).
export const DASHBOARDS = [
  ["Ventas mensuales", Ventas],
  ["Gastos mensuales", Gastos],
  ["Utilidad mensual", Utilidad],
  ["Cuentas por cobrar / Cobranza semanal", CuentasPorCobrar],
  ["Cuentas por pagar", CuentasPorPagar],
  ["Ventas por cliente", VentasPorCliente],
  ["Ventas por servicio", VentasPorServicio],
  ["Costos por unidad", CostosPorUnidad],
  ["Rentabilidad por operación", Rentabilidad],
];
