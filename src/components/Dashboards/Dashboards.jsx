import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, TriangleAlert, CircleCheck, CircleX } from "lucide-react";
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, LineChart, Line, ScatterChart, Scatter, ReferenceLine, ZAxis, Treemap, Sankey, LabelList,
  PieChart, Pie, Cell,
} from "recharts";
import { apiClient } from "../../api/apiClient";
import { useAutoRefresco } from "../../hooks/useAutoRefresco";
import "./Dashboards.css";

// Los dashboards de Finanzas (Fase 6 de PLAN_MODULO_FINANZAS.md). Cada uno es
// autónomo —sus filtros, su comparación, su pieza y su tabla— para que la
// página de su grupo y la de DASHBOARDS pinten EXACTAMENTE lo mismo (P41). Las
// cifras las calcula el backend (/api/dashboards/<nombre>/); aquí solo se pintan.
//
// Rediseño (usuario, 2026-11-23): una propuesta distinta por dashboard para
// compararlas, en el Diseño opcional 1 y sin barras como foco. Cada uno usa la
// forma que pide su dato: libro mensual, tendencia, estado de resultados,
// antigüedad, medidores, ranking, matriz, puntos y dispersión.

// Paleta validada con dataviz/validate_palette.js sobre blanco (todas PASS):
// teal, ámbar y violeta del tema, en orden fijo, nunca rotado. "No asignado" es
// gris porque no es una categoría más.
const COLOR = {
  sencillo: "#0b8f9c", full: "#c98512", carga_suelta: "#6a5fd0", no_asignado: "#a7b4bb",
  serie1: "#0b8f9c",
};
// Antigüedad: "por vencer" en teal (no es deuda vencida) y los cuatro tramos
// vencidos en una rampa coral ordinal (validada con --ordinal).
const COLOR_TRAMO = { por_vencer: "#0b8f9c", "0_30": "#df9184", "31_60": "#cf6d5f",
                      "61_90": "#b9513f", mas_90: "#6e2820" };
const SERVICIOS = [["sencillo", "Sencillo"], ["full", "Full"], ["carga_suelta", "Carga suelta"]];
const NOMBRE_SERVICIO = Object.fromEntries([...SERVICIOS, ["no_asignado", "No asignado"]]);
const TRAMOS = [["por_vencer", "Por vencer"], ["0_30", "0–30 días"], ["31_60", "31–60 días"],
                ["61_90", "61–90 días"], ["mas_90", "+90 días"]];

const dinero = (v) => (v == null ? "—" :
  Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }));
// Corto pero exacto: $2.25M y $16.5k, no $2.3M ni $17k (el tick no miente).
const dineroCorto = (v) => {
  const n = Number(v) || 0;
  const corto = (x) => String(Number(x.toFixed(2)));
  if (Math.abs(n) >= 1e6) return `$${corto(n / 1e6)}M`;
  if (Math.abs(n) >= 1e3) return `$${corto(n / 1e3)}k`;
  return `$${n}`;
};
const porciento = (v) => (v == null ? "—" :
  `${Number(v).toLocaleString("es-MX", { maximumFractionDigits: 1 })} %`);
const etiquetaMes = (k) => {
  const [a, m] = k.split("-").map(Number);
  return `${new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "short" }).replace(".", "")} ${String(a).slice(2)}`;
};
const fechaLegible = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const sumar = (filas, clave) => filas.reduce((s, f) => s + Number(f[clave] || 0), 0);
// El backend manda el dinero como texto exacto ("4000.00"); recharts necesita
// números para escalar. Solo para lo que va a una gráfica.
const graf = (filas) => filas.map((f) => Object.fromEntries(Object.entries(f).map(
  ([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const periodoInicial = () => ({ desde: `${new Date().getFullYear()}-01-01`, hasta: hoyISO() });

// ── Datos ────────────────────────────────────────────────────────────────────
// Lo que pintan los dashboards. Sin nómina (es solo de staff): sus sueldos
// entran al recargar o al cambiar de dashboard.
const TABLAS_DASHBOARDS = "de=factura,pago,abono,cuentaporpagar,gastofijo,gastofijopago,"
  + "capturamensual,maniobra,gasto,reporteviaje";

function useDashboard(nombre, filtros, activo = true) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });
  const [version, setVersion] = useState(0);
  useAutoRefresco("finanzas", () => setVersion((v) => v + 1), { query: TABLAS_DASHBOARDS, activo });
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
  }, [nombre, clave, activo, version]);
  return estado;
}

// Filtros + periodo de comparación (P42, P43). `campos` dice cuáles pinta.
// `compararDeEntrada`: el Resumen general nace comparando con el año anterior.
// inicial: filtros fijos de entrada (p. ej. el servicio de Costos por unidad).
function useFiltros(compararDeEntrada = false, inicial = null) {
  const [filtros, setFiltros] = useState(() => ({ ...periodoInicial(), ...inicial }));
  const [comparar, setComparar] = useState(() => (compararDeEntrada ? restarUnAnio(periodoInicial()) : null)); // {desde, hasta} o null
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
      <div className="db-periodo" role="group" aria-label="Periodo">
        <span className="db-periodo-titulo" aria-hidden="true">Periodo</span>
        <input type="date" aria-label="Desde" value={filtros.desde} onChange={(e) => poner("desde", e.target.value)} />
        <span aria-hidden="true">–</span>
        <input type="date" aria-label="Hasta" value={filtros.hasta} onChange={(e) => poner("hasta", e.target.value)} />
      </div>
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
      <div className="db-periodo db-comparacion" role="group" aria-label="Periodo de comparación">
        <label className="db-comparar db-periodo-titulo">
          <input type="checkbox" checked={!!comparar}
            onChange={(e) => setComparar(e.target.checked ? restarUnAnio(filtros) : null)} />
          Comparar con
        </label>
        {comparar && (
          <>
            <input type="date" aria-label="Comparar desde" value={comparar.desde}
              onChange={(e) => setComparar({ ...comparar, desde: e.target.value })} />
            <span aria-hidden="true">–</span>
            <input type="date" aria-label="Comparar hasta" value={comparar.hasta}
              onChange={(e) => setComparar({ ...comparar, hasta: e.target.value })} />
          </>
        )}
      </div>
    </div>
  );
}

// Por defecto se compara con el mismo rango del año anterior: es la comparación
// que no se engaña con la estacionalidad.
const restarUnAnio = ({ desde, hasta }) => ({
  desde: `${Number(desde.slice(0, 4)) - 1}${desde.slice(4)}`,
  hasta: `${Number(hasta.slice(0, 4)) - 1}${hasta.slice(4)}`,
});

// ── Piezas comunes ───────────────────────────────────────────────────────────
// Una cifra del resumen: franja de cifras separadas por hairlines, no tarjetas.
// `puntos`: la variación de un % se da en puntos (18 % → 20 % es +2 pts, no +11 %).
function Kpi({ titulo, valor, anterior, formato = dinero, sufijo = "", puntos = false }) {
  const n = Number(valor), a = Number(anterior);
  const variacion = anterior == null ? null : puntos ? n - a : a ? ((n - a) / Math.abs(a)) * 100 : null;
  return (
    <div className="db-kpi">
      <dt>{titulo}</dt>
      <dd className="db-kpi-valor">{valor == null ? "—" : `${formato(valor)}${sufijo}`}</dd>
      {anterior != null && (
        <dd className="db-kpi-comparado">
          {variacion != null && (variacion >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />)}
          {variacion != null
            ? <>{`${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}${puntos ? " pts" : " %"}`} vs {formato(anterior)}{sufijo}</>
            : "sin datos para comparar"}
        </dd>
      )}
    </div>
  );
}
const Resumen = ({ children }) => <dl className="db-kpis">{children}</dl>;

function Aviso({ children }) {
  return <p className="db-aviso"><TriangleAlert size={15} aria-hidden="true" /> {children}</p>;
}

// columnas: [clave, título, formato?, numérica?]. Las de dinero se alinean a la
// derecha solas; `pie` es la fila de totales.
function Tabla({ titulo, columnas, filas, pie, claseFila }) {
  const esNum = (c) => c[3] ?? (c[2] === dinero || c[2] === porciento);
  return (
    <div className="db-tabla" role="region" aria-label={titulo} tabIndex={0}>
      <table>
        <thead><tr>{columnas.map((c) => <th key={c[1]} className={esNum(c) ? "num" : ""} scope="col">{c[1]}</th>)}</tr></thead>
        <tbody>
          {filas.length === 0
            ? <tr><td colSpan={columnas.length} className="db-vacio">Sin datos en el periodo.</td></tr>
            : filas.map((f, i) => (
              <tr key={i} className={claseFila?.(f, i) || ""}>
                {columnas.map(([k, t, fmt], j) => {
                  const Celda = j === 0 ? "th" : "td";
                  return <Celda key={t} scope={j === 0 ? "row" : undefined}
                    className={esNum(columnas[j]) ? "num" : ""}>{fmt ? fmt(f[k], f) : f[k]}</Celda>;
                })}
              </tr>
            ))}
        </tbody>
        {pie && filas.length > 0 && (
          <tfoot><tr>{columnas.map((c, j) => {
            const v = pie[c[0]];
            const Celda = j === 0 ? "th" : "td";
            return <Celda key={c[1]} scope={j === 0 ? "row" : undefined} className={esNum(c) ? "num" : ""}>
              {v == null ? "" : (j > 0 && c[2] ? c[2](v, pie) : v)}</Celda>;
          })}</tr></tfoot>
        )}
      </table>
    </div>
  );
}

function Leyenda({ items }) {
  return (
    <ul className="db-leyenda">
      {items.map(([color, texto]) => (
        <li key={texto}><span className="db-muestra" style={{ background: color }} aria-hidden="true" />{texto}</li>
      ))}
    </ul>
  );
}

// Ejes y tooltip de recharts en la tinta del tema: rejilla y ejes en hairline.
const TINTA = { grid: "#edf0f2", eje: "#dce4e8", texto: "#687782" };
// En X, todas las etiquetas (`intervalo` 0) o una sí y una no (1). En X, todas las
// etiquetas (`intervalo` 0) o una sí y una no a espacio regular (1): nunca que
// recharts quite una suelta, como pasaba con "oct 26".
const ejes = (claveX = "etiqueta", formatoY = dineroCorto, dominioY = undefined, intervalo = 0, ticksY = undefined) => (
  <>
    <CartesianGrid vertical={false} stroke={TINTA.grid} />
    <XAxis dataKey={claveX} interval={intervalo} padding={{ left: 6, right: 18 }} tickLine={false} axisLine={{ stroke: TINTA.eje }} tick={{ fill: TINTA.texto, fontSize: 11 }} />
    <YAxis tickFormatter={formatoY} domain={dominioY} ticks={ticksY} niceTicks="none" tickLine={false} axisLine={false} tick={{ fill: TINTA.texto, fontSize: 12 }} width={56} />
  </>
);
const pctCorto = (v) => `${Math.round(v)} %`;

// Escala Y redonda y ajustada: paso de {1, 2, 2.5, 5}·10ⁿ, el más fino que deje
// como máximo 6 tramos, y tope en el primer múltiplo del paso por encima del
// dato. Los algoritmos de recharts dejaban media gráfica vacía o pasos de 65k.
function escalaY(valores) {
  const xs = valores.map(Number).filter(Number.isFinite);
  const max = Math.max(0, ...xs), min = Math.min(0, ...xs);
  if (max === min) return { domain: [0, 1], ticks: [0, 1] };
  const potencia = 10 ** Math.floor(Math.log10((max - min) / 5));
  const paso = [1, 2, 2.5, 5, 10, 20].map((f) => f * potencia)
    .find((p) => Math.ceil(max / p) - Math.floor(min / p) <= 6);
  const lo = Math.floor(min / paso) * paso, hi = Math.ceil(max / paso) * paso;
  const ticks = Array.from({ length: Math.round((hi - lo) / paso) + 1 }, (_, i) => +(lo + i * paso).toFixed(6));
  return { domain: [lo, hi], ticks };
}
const ejesDe = (valores, formato = dineroCorto, intervalo = 0) => {
  const e = escalaY(valores);
  return ejes("etiqueta", formato, e.domain, intervalo, e.ticks);
};
const cursorLinea = { stroke: "#9fb3bd", strokeWidth: 1 };
const punto = { r: 4, fill: "#fff", strokeWidth: 2 };
// Las series por servicio en orden fijo: color sigue a la entidad, nunca al rango.
const SERIES_SERVICIO = SERVICIOS.map(([k, t]) => [COLOR[k], t]);

// Un rectángulo del treemap: su color, 2px de separación del fondo, y nombre +
// monto solo si caben (si no, quedan en el tooltip nativo y en la tabla).
// Rampa teal de oscuro a claro (orden de tamaño) para treemaps de un solo tono.
const RAMPA_TEAL = ["#0a5f69", "#087e8b", "#0b8f9c", "#2fa3ab", "#6cbfc2", "#9ed4d5"];
function BloqueTreemap({ x, y, width, height, name, value, color, texto = "#fff", depth }) {
  if (depth !== 1 || width <= 0 || height <= 0) return null;
  const cabe = width > 70 && height > 38;
  return (
    <g>
      <title>{`${name}: ${dinero(value)}`}</title>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={color || COLOR.serie1}
        stroke="#fff" strokeWidth={2} />
      {cabe && (
        <>
          <text x={x + 10} y={y + 20} fill={texto} fontSize={12} fontWeight={700}>
            {String(name).length * 7 > width - 16 ? `${String(name).slice(0, Math.max(3, Math.floor((width - 16) / 7) - 1))}…` : name}
          </text>
          <text x={x + 10} y={y + 36} fill={texto} fontSize={12} opacity={0.9}>{dineroCorto(value)}</text>
        </>
      )}
    </g>
  );
}

// Una gráfica con su título y, si tiene más de una serie, su leyenda.
// `vacia`: sin datos que pintar, el mismo aviso que las tablas (no ejes en blanco).
// `clave`: lista bajo la gráfica con nombre y cifra de cada parte (treemaps).
function Grafica({ titulo, leyenda, alto = 240, vacia = false, clave, children }) {
  return (
    <figure className="db-figura">
      <div className="db-seccion-cabeza">
        <figcaption>{titulo}</figcaption>
        {leyenda && !vacia && <Leyenda items={leyenda} />}
      </div>
      {vacia
        ? <p className="db-grafica-vacia" style={{ minHeight: alto }}>Sin datos en el periodo.</p>
        : <ResponsiveContainer width="100%" height={alto}>{children}</ResponsiveContainer>}
      {clave && !vacia && <Leyenda items={clave} />}
    </figure>
  );
}
const sinValores = (filas, claves) => !filas.some((f) => claves.some((k) => Number(f[k]) !== 0 && f[k] != null));
const estiloTooltip = {
  contentStyle: { border: "1px solid #dce4e8", borderRadius: 10, boxShadow: "0 6px 20px rgba(16,42,67,.08)", fontSize: 13 },
  labelStyle: { color: "#102a43", fontWeight: 700 },
};

function Panel({ titulo, filtros, children, cargando, error }) {
  return (
    <section className="db-panel" aria-busy={cargando}>
      <header className="db-cabecera">
        <h2>{titulo}</h2>
        {filtros}
      </header>
      <div className="db-cuerpo">
        {error ? <Aviso>No se pudo cargar: {error}</Aviso> : children}
      </div>
    </section>
  );
}

// El dashboard y su periodo de comparación: la misma consulta, dos rangos.
function useConComparacion(nombre, campos, compararDeEntrada = false, inicial = null) {
  const estado = useFiltros(compararDeEntrada, inicial);
  const actual = useDashboard(nombre, estado.filtros);
  const previo = useDashboard(nombre, { ...estado.filtros, ...(estado.comparar || {}) }, !!estado.comparar);
  return { estado, actual, previo: estado.comparar ? previo.datos : null, campos };
}

// Franja segmentada fina (sin texto): la mezcla de un total en partes. Las
// cifras viven en la tabla de al lado; el title deja leer cada parte al pasar.
function Mezcla({ partes }) {
  const total = partes.reduce((s, [, , v]) => s + Math.max(0, Number(v) || 0), 0);
  if (!total) return <span className="db-mezcla db-mezcla-vacia" aria-hidden="true" />;
  return (
    <span className="db-mezcla" role="img"
      aria-label={partes.map(([, t, v]) => `${t} ${dinero(v)}`).join(", ")}>
      {partes.filter(([, , v]) => Number(v) > 0).map(([color, t, v]) => (
        <span key={t} style={{ flexGrow: Number(v), background: color }} title={`${t}: ${dinero(v)}`} />
      ))}
    </span>
  );
}

// ── 1. Ventas mensuales — libro mensual con franja de mezcla ────────────────
// Propuesta: un libro, un renglón por mes. La mezcla por servicio va como una
// franja fina dentro del renglón, en vez de dos gráficas de barras apiladas.
export function Ventas() {
  const campos = ["cliente", "servicio", "unidad", "operador", "ruta"];
  const { estado, actual, previo } = useConComparacion("ventas", campos);
  const d = actual.datos;
  const meses = (d?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), ...m }));
  const sinFactura = sumar(meses, "sin_factura");
  const series = [...SERVICIOS, ["no_asignado", "No asignado"]];
  const porTipo = (m) => SERVICIOS.map(([k, t]) => `${t} ${m.servicios_por_servicio?.[k] ?? 0}`).join(" · ");
  return (
    <Panel titulo="Ventas mensuales" {...actual}
      filtros={<BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} />}>
      <Resumen>
        <Kpi titulo="Ventas del periodo (con IVA)" valor={sumar(meses, "ventas")}
          anterior={previo ? sumar(previo.meses, "ventas") : undefined} />
        <Kpi titulo="Servicios vendidos" valor={sumar(meses, "servicios")} formato={(v) => String(v)}
          anterior={previo ? sumar(previo.meses, "servicios") : undefined} />
      </Resumen>
      {Number(d?.no_asignado) > 0 && <Aviso>{dinero(d.no_asignado)} en facturas sin maniobra ligada quedan fuera de los filtros (no asignado).</Aviso>}
      {sinFactura > 0 && <Aviso>{sinFactura} servicio(s) sin número de factura: cuentan en el mes de su fecha PIS.</Aviso>}
      <div className="db-graficas">
        <Grafica titulo="Ventas por servicio, mes a mes" leyenda={SERIES_SERVICIO} vacia={sinValores(meses, ["ventas"])}>
          <AreaChart data={meses.map((m) => ({ etiqueta: m.etiqueta,
            ...Object.fromEntries(SERVICIOS.map(([k]) => [k, Number(m.ventas_por_servicio?.[k] || 0)])) }))}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {ejesDe(meses.map((m) => m.ventas))}
            <Tooltip {...estiloTooltip} formatter={(v, n) => [dinero(v), n]} cursor={cursorLinea} />
            {SERVICIOS.map(([k, t]) => (
              <Area key={k} dataKey={k} name={t} stackId="v" stroke={COLOR[k]} strokeWidth={2}
                fill={COLOR[k]} fillOpacity={0.18} animationDuration={400} />
            ))}
          </AreaChart>
        </Grafica>
        <Grafica titulo="Servicios vendidos por mes" vacia={sinValores(meses, ["servicios"])}>
          <LineChart data={meses} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {ejesDe(meses.map((m) => m.servicios), (v) => v)}
            <Tooltip {...estiloTooltip} formatter={(v) => [v, "Servicios"]} cursor={cursorLinea} />
            <Line dataKey="servicios" name="Servicios" stroke={COLOR.serie1} strokeWidth={2}
              dot={punto} activeDot={{ r: 5 }} animationDuration={400} />
          </LineChart>
        </Grafica>
      </div>
      <div className="db-seccion-cabeza">
        <h3>Libro mensual</h3>
        <Leyenda items={series.map(([k, t]) => [COLOR[k], t])} />
      </div>
      <Tabla titulo="Ventas por mes" filas={meses}
        columnas={[
          ["etiqueta", "Mes"], ["ventas", "Ventas", dinero],
          ["ventas_por_servicio", "Mezcla por servicio", (v) => (
            <Mezcla partes={series.map(([k, t]) => [COLOR[k], t, v?.[k]])} />), false],
          ["servicios", "Servicios", (v, f) => <span title={porTipo(f)}>{v}</span>, true],
          ["sin_factura", "Sin factura", null, true],
        ]}
        pie={{ etiqueta: "Total", ventas: sumar(meses, "ventas"), servicios: sumar(meses, "servicios"),
               sin_factura: sinFactura }} />
    </Panel>
  );
}

// ── 2. Gastos mensuales — tendencia + mes contra mes ────────────────────────
// Propuesta: la pregunta es "¿sube o baja?", así que una sola área de tendencia
// y una tabla que dice cuánto cambió cada mes contra el anterior.
export function Gastos() {
  const campos = ["cliente", "servicio", "unidad", "operador", "ruta"];
  const { estado, actual, previo } = useConComparacion("gastos", campos);
  const d = actual.datos;
  const meses = (d?.meses || []).map((m, i, xs) => {
    const antes = i > 0 ? Number(xs[i - 1].costo) : null;
    const cambio = antes ? ((Number(m.costo) - antes) / Math.abs(antes)) * 100 : null;
    return { etiqueta: etiquetaMes(m.mes), ...m, ...m.por_servicio, cambio };
  });
  const Cambio = (v) => (v == null ? <span className="db-tenue">—</span> : (
    <span className="db-cambio">
      {v >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
      {`${v >= 0 ? "+" : ""}${v.toFixed(1)} %`}
    </span>));
  return (
    <Panel titulo="Gastos mensuales" {...actual}
      filtros={<BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} />}>
      <Resumen>
        <Kpi titulo="Costo de ventas del periodo" valor={sumar(meses, "costo")}
          anterior={previo ? sumar(previo.meses, "costo") : undefined} />
      </Resumen>
      <p className="db-nota">Gastos de cada maniobra más la urea de sus reportes de viaje, por mes de entrega de mercancía.</p>
      <figure className="db-figura">
          <figcaption>Tendencia del costo de ventas</figcaption>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={graf(meses)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="db-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR.serie1} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={COLOR.serie1} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {ejesDe(meses.map((m) => m.costo))}
              <Tooltip {...estiloTooltip} formatter={(v) => [dinero(v), "Costo"]}
                cursor={{ stroke: "#9fb3bd", strokeWidth: 1 }} />
              <Area dataKey="costo" name="Costo" stroke={COLOR.serie1} strokeWidth={2} fill="url(#db-area)" animationDuration={400}
                dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </figure>
        <div className="db-graficas">
          <Grafica titulo="Costo por servicio" leyenda={SERIES_SERVICIO} vacia={sinValores(meses, ["costo"])}>
            <LineChart data={graf(meses)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              {ejesDe(meses.flatMap((m) => SERVICIOS.map(([k]) => m[k])))}
              <Tooltip {...estiloTooltip} formatter={(v, n) => [dinero(v), n]} cursor={cursorLinea} />
              {SERVICIOS.map(([k, t]) => (
                <Line key={k} dataKey={k} name={t} stroke={COLOR[k]} strokeWidth={2}
                  dot={{ ...punto, stroke: COLOR[k] }} activeDot={{ r: 5 }} animationDuration={400} />
              ))}
            </LineChart>
          </Grafica>
          <Grafica titulo="Costo acumulado del periodo" vacia={sinValores(meses, ["costo"])}>
            <AreaChart data={meses.reduce((xs, m) => [...xs, { etiqueta: m.etiqueta,
              acumulado: (xs.at(-1)?.acumulado || 0) + Number(m.costo || 0) }], [])}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              {ejesDe([sumar(meses, "costo")])}
              <Tooltip {...estiloTooltip} formatter={(v) => [dinero(v), "Acumulado"]} cursor={cursorLinea} />
              <Area dataKey="acumulado" name="Acumulado" stroke={COLOR.serie1} strokeWidth={2}
                fill={COLOR.serie1} fillOpacity={0.12} animationDuration={400} />
            </AreaChart>
          </Grafica>
        </div>
        <h3>Mes contra mes</h3>
        <Tabla titulo="Gastos por mes" filas={meses}
          columnas={[["etiqueta", "Mes"], ["costo", "Costo", dinero], ["cambio", "Vs mes anterior", Cambio, true],
                     ...SERVICIOS.map(([k, t]) => [k, t, dinero])]}
          pie={{ etiqueta: "Total", costo: sumar(meses, "costo"),
                 ...Object.fromEntries(SERVICIOS.map(([k]) => [k, sumar(meses, k)])) }} />
    </Panel>
  );
}

// ── 3. Utilidad mensual — estado de resultados ──────────────────────────────
// Propuesta: el formato que dirección ya conoce. Conceptos en renglones, meses
// en columnas, subtotales marcados y el margen sobre ventas al final.
// Utilidades en una rampa ordinal (de la más amplia a la neta), no con los
// colores de servicio, que en estos paneles ya significan otra cosa.
const NAVY = "#102a43";
const UTILIDADES = [["utilidad_bruta", "Bruta", "#2fa3ab"], ["utilidad_operacional", "Operacional", "#0a5f69"],
                    ["utilidad_neta", "Neta", NAVY]];
const CONCEPTOS = [
  ["ventas", "Ventas", ""], ["costo_ventas", "Costo de ventas", "−"],
  ["utilidad_bruta", "Utilidad bruta", "="], ["gastos_fijos", "Gastos fijos", "−"],
  ["comisiones", "Comisiones", "−"], ["nomina_administrativa", "Nómina administrativa", "−"],
  ["utilidad_operacional", "Utilidad operacional", "="], ["financieros", "Financieros", "−"],
  ["utilidad_antes_impuestos", "Antes de impuestos", "="], ["impuestos", "Impuestos", "−"],
  ["utilidad_neta", "Utilidad neta", "="],
];
export function Utilidad() {
  const { estado, actual, previo } = useConComparacion("utilidad", []);
  const meses = (actual.datos?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), ...m }));
  const faltan = meses.filter((m) => m.faltan_pagos).map((m) => m.etiqueta);
  const ventas = sumar(meses, "ventas");
  return (
    <Panel titulo="Utilidad mensual" {...actual} filtros={<BarraFiltros estado={estado} />}>
      <Resumen>
        <Kpi titulo="Utilidad bruta" valor={sumar(meses, "utilidad_bruta")}
          anterior={previo ? sumar(previo.meses, "utilidad_bruta") : undefined} />
        <Kpi titulo="Utilidad operacional" valor={sumar(meses, "utilidad_operacional")}
          anterior={previo ? sumar(previo.meses, "utilidad_operacional") : undefined} />
        <Kpi titulo="Utilidad neta" valor={sumar(meses, "utilidad_neta")}
          anterior={previo ? sumar(previo.meses, "utilidad_neta") : undefined} />
      </Resumen>
      {faltan.length > 0 && <Aviso>Faltan pagos de gastos fijos por capturar en: {faltan.join(", ")}.</Aviso>}
      <div className="db-graficas">
        <Grafica titulo="Bruta, operacional y neta" vacia={sinValores(meses, ["ventas", "utilidad_bruta"])}
          leyenda={UTILIDADES.map(([, t, c]) => [c, t])}>
          <LineChart data={graf(meses)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {ejesDe(meses.flatMap((m) => UTILIDADES.map(([k]) => m[k])))}
            <ReferenceLine y={0} stroke="#9fb3bd" />
            <Tooltip {...estiloTooltip} formatter={(v, n) => [dinero(v), n]} cursor={cursorLinea} />
            {UTILIDADES.map(([k, t, c]) => (
              <Line key={k} dataKey={k} name={t} stroke={c} strokeWidth={2}
                dot={{ ...punto, stroke: c }} activeDot={{ r: 5 }} animationDuration={400} />
            ))}
          </LineChart>
        </Grafica>
        {/* Margen neto: cuánto de cada peso vendido se queda. Un eje propio: es %, no dinero. */}
        <Grafica titulo="Margen neto sobre ventas" vacia={sinValores(meses, ["ventas"])}>
          <AreaChart data={meses.map((m) => ({ etiqueta: m.etiqueta,
            margen: Number(m.ventas) ? (Number(m.utilidad_neta) / Number(m.ventas)) * 100 : null }))}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {ejesDe(meses.map((m) => (Number(m.ventas) ? (Number(m.utilidad_neta) / Number(m.ventas)) * 100 : 0)), pctCorto)}
            <ReferenceLine y={0} stroke="#9fb3bd" />
            <Tooltip {...estiloTooltip} formatter={(v) => [porciento(v), "Margen neto"]} cursor={cursorLinea} />
            <Area dataKey="margen" name="Margen neto" stroke={NAVY} strokeWidth={2}
              fill={NAVY} fillOpacity={0.1} dot={{ ...punto, stroke: NAVY }} activeDot={{ r: 5 }} animationDuration={400} />
          </AreaChart>
        </Grafica>
      </div>
      <h3>Estado de resultados</h3>
      <div className="db-tabla db-estado" role="region" aria-label="Estado de resultados" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col" className="num db-col-total">Total del periodo</th>
              <th scope="col" className="num db-col-pct">% ventas</th>
              {meses.map((m) => (
                <th key={m.mes} scope="col" className="num">
                  {m.etiqueta}{m.faltan_pagos && <TriangleAlert size={12} className="db-falta" aria-label="faltan pagos" />}
                </th>))}
            </tr>
          </thead>
          <tbody>
            {meses.length === 0
              ? <tr><td colSpan={3} className="db-vacio">Sin datos en el periodo.</td></tr>
              : CONCEPTOS.map(([k, t, signo]) => {
                const total = sumar(meses, k);
                return (
                  <tr key={k} className={signo === "=" ? "db-subtotal" : ""}>
                    <th scope="row"><span className="db-signo" aria-hidden="true">{signo}</span>{t}</th>
                    <td className={`num db-col-total${total < 0 ? " db-negativo" : ""}`}>{dinero(total)}</td>
                    <td className="num db-tenue db-col-pct">{ventas ? porciento((total / ventas) * 100) : "—"}</td>
                    {meses.map((m) => (
                      <td key={m.mes} className={`num${Number(m[k]) < 0 ? " db-negativo" : ""}`}>{dinero(m[k])}</td>))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── 4. Cuentas por cobrar — tira de antigüedad + cobranza ───────────────────
// Propuesta: la antigüedad es un todo partido en tramos ordenados, así que una
// sola tira que se oscurece con la edad; la cobranza semanal, como tendencia.
export function CuentasPorCobrar() {
  const campos = ["cliente"];
  const { estado, actual, previo } = useConComparacion("cuentas-por-cobrar", campos);
  const d = actual.datos;
  const tramos = TRAMOS.map(([k, t]) => ({ clave: k, etiqueta: t, total: Number(d?.antiguedad?.[k] ?? 0) }));
  const semanas = (d?.semanas || []).map((s) => ({ etiqueta: fechaLegible(s.semana).slice(0, 5), ...s }));
  const total = sumar(tramos, "total");
  const vencido = total - Number(d?.antiguedad?.por_vencer || 0);
  const totalPrevio = previo ? Object.values(previo.antiguedad).reduce((s, v) => s + Number(v), 0) : undefined;
  const parte = (v) => (total ? (v / total) * 100 : 0);
  return (
    <Panel titulo="Cuentas por cobrar y cobranza semanal" {...actual}
      filtros={<BarraFiltros campos={campos} estado={estado} />}>
      <Resumen>
        <Kpi titulo="Por cobrar (con días de crédito)" valor={total} anterior={totalPrevio} />
        <Kpi titulo="Vencido" valor={vencido} />
        <Kpi titulo="Cobranza del periodo" valor={sumar(semanas, "total")}
          anterior={previo ? sumar(previo.semanas, "total") : undefined} />
      </Resumen>
      {Number(d?.fuera_de_antiguedad) > 0 &&
        <Aviso>{dinero(d.fuera_de_antiguedad)} sin cliente principal o pendientes de ligar: fuera de la antigüedad.</Aviso>}
      <h3>Antigüedad de saldos</h3>
      {total > 0 ? (
        <div className="db-tira" role="img" aria-label={tramos.map((t) => `${t.etiqueta} ${dinero(t.total)}`).join(", ")}>
          {tramos.filter((t) => t.total > 0).map((t) => (
            <span key={t.clave} style={{ flexGrow: t.total, background: COLOR_TRAMO[t.clave] }}
              className={t.clave === "por_vencer" || t.clave === "61_90" || t.clave === "mas_90" ? "db-tira-oscuro" : ""}
              title={`${t.etiqueta}: ${dinero(t.total)}`}>
              {parte(t.total) >= 9 && <>{porciento(parte(t.total))}</>}
            </span>
          ))}
        </div>
      ) : <p className="db-nota">Sin saldo por cobrar en el periodo.</p>}
      <Tabla titulo="Antigüedad por tramo" filas={tramos}
        columnas={[
          ["etiqueta", "Tramo", (v, f) => <><span className="db-muestra" style={{ background: COLOR_TRAMO[f.clave] }} aria-hidden="true" />{v}</>],
          ["total", "Por cobrar", dinero], ["clave", "% del saldo", (_, f) => porciento(parte(f.total)), true],
        ]}
        pie={{ etiqueta: "Total", total, clave: "" }} />
      <div className="db-graficas">
        <Grafica titulo="Cobranza semanal (por semana de emisión)" vacia={sinValores(semanas, ["total"])}>
          <LineChart data={graf(semanas)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {ejesDe(semanas.map((x) => x.total), dineroCorto, semanas.length > 8 ? 1 : 0)}
            <Tooltip {...estiloTooltip} formatter={(v) => [dinero(v), "Facturado"]} cursor={cursorLinea} />
            <Line dataKey="total" name="Facturado" stroke={COLOR.serie1} strokeWidth={2} animationDuration={400}
              dot={punto} activeDot={{ r: 5 }} />
          </LineChart>
        </Grafica>
        <Grafica titulo="Cobranza acumulada del periodo" vacia={sinValores(semanas, ["total"])}>
          <AreaChart data={semanas.reduce((xs, s) => [...xs, { etiqueta: s.etiqueta,
            acumulado: (xs.at(-1)?.acumulado || 0) + Number(s.total || 0) }], [])}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {ejesDe([sumar(semanas, "total")], dineroCorto, semanas.length > 8 ? 1 : 0)}
            <Tooltip {...estiloTooltip} formatter={(v) => [dinero(v), "Acumulado"]} cursor={cursorLinea} />
            <Area dataKey="acumulado" name="Acumulado" stroke={COLOR.serie1} strokeWidth={2}
              fill={COLOR.serie1} fillOpacity={0.12} animationDuration={400} />
          </AreaChart>
        </Grafica>
      </div>
    </Panel>
  );
}

// ── 5. Cuentas por pagar — lista de medidores por origen ────────────────────
// Propuesta: por cada origen, un medidor de cuánto de lo facturado ya se pagó,
// con lo vencido marcado dentro de lo pendiente, y sus tres cifras al lado.
export function CuentasPorPagar() {
  const campos = ["empresa"];
  const { estado, actual, previo } = useConComparacion("cuentas-por-pagar", campos);
  const d = actual.datos;
  const origenes = [["flete", "Fletes"], ["local", "Locales"], ["mantenimiento", "Mantenimiento"]]
    .map(([k, t]) => ({ etiqueta: t, ...(d?.por_origen?.[k] || {}) }));
  const porPagarPrevio = previo ? Object.values(previo.por_origen).reduce((s, o) => s + Number(o.por_pagar), 0) : undefined;
  const PAGADO = "#0b8f9c", PENDIENTE = "#c7d3d8", VENCIDO = "#b9513f";
  const pesoOrigenes = origenes.map((o, i) => ({
    name: o.etiqueta, size: Number(o.pagado || 0) + Number(o.por_pagar || 0),
    color: ["#102a43", "#3d5a73", "#6b8399"][i] })).filter((o) => o.size > 0);
  return (
    <Panel titulo="Cuentas por pagar" {...actual} filtros={<BarraFiltros campos={campos} estado={estado} />}>
      <Resumen>
        <Kpi titulo="Por pagar" valor={sumar(origenes, "por_pagar")} anterior={porPagarPrevio} />
        <Kpi titulo="Vencido" valor={sumar(origenes, "vencido")} />
        <Kpi titulo="Pagado" valor={sumar(origenes, "pagado")} />
      </Resumen>
      <div className="db-seccion-cabeza">
        <h3>Avance de pago por origen</h3>
        <Leyenda items={[[PAGADO, "Pagado"], [PENDIENTE, "Por pagar, al corriente"], [VENCIDO, "Vencido"]]} />
      </div>
      <ul className="db-medidores">
        {origenes.map((o) => {
          const pagado = Number(o.pagado || 0), venc = Number(o.vencido || 0);
          const pend = Math.max(0, Number(o.por_pagar || 0) - venc);
          const total = pagado + pend + venc;
          return (
            <li key={o.etiqueta}>
              <span className="db-medidor-nombre">{o.etiqueta}</span>
              <span className="db-medidor" role="img"
                aria-label={`${o.etiqueta}: pagado ${dinero(pagado)}, por pagar ${dinero(o.por_pagar)}, vencido ${dinero(venc)}`}>
                {total > 0 ? [[pagado, PAGADO, "Pagado"], [pend, PENDIENTE, "Por pagar"], [venc, VENCIDO, "Vencido"]]
                  .filter(([v]) => v > 0)
                  .map(([v, c, t]) => <span key={t} style={{ flexGrow: v, background: c }} title={`${t}: ${dinero(v)}`} />)
                  : null}
              </span>
              <span className="db-medidor-pct">{total ? porciento((pagado / total) * 100) : "—"} pagado</span>
            </li>
          );
        })}
      </ul>
      <Tabla titulo="Cuentas por pagar por origen" filas={origenes}
        columnas={[["etiqueta", "Origen"], ["por_pagar", "Por pagar", dinero],
                   ["vencido", "Vencido", dinero], ["pagado", "Pagado", dinero]]}
        pie={{ etiqueta: "Total", por_pagar: sumar(origenes, "por_pagar"), vencido: sumar(origenes, "vencido"),
               pagado: sumar(origenes, "pagado") }} />
      <div className="db-graficas">
        <Grafica titulo="Facturas de proveedor recibidas por mes" vacia={sinValores(d?.meses || [], ["total"])}>
          <AreaChart data={(d?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), total: Number(m.total) }))}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {ejesDe((d?.meses || []).map((m) => m.total))}
            <Tooltip {...estiloTooltip} formatter={(v) => [dinero(v), "Facturado"]} cursor={cursorLinea} />
            <Area dataKey="total" name="Facturado" stroke={COLOR.serie1} strokeWidth={2} fill={COLOR.serie1}
              fillOpacity={0.14} dot={punto} activeDot={{ r: 5 }} animationDuration={400} />
          </AreaChart>
        </Grafica>
        {/* Proporción de cada origen sobre todo lo facturado: rectángulos, no barras. */}
        {/* Pizarra (no teal): en este panel el teal ya significa "Pagado". */}
        <Grafica titulo="Peso de cada origen en lo facturado" vacia={!pesoOrigenes.length}
          clave={pesoOrigenes.map((o) => [o.color, `${o.name} · ${dinero(o.size)}`])}>
          <Treemap data={pesoOrigenes}
            dataKey="size" isAnimationActive={false} content={<BloqueTreemap />} />
        </Grafica>
      </div>
    </Panel>
  );
}

// ── 6. Ventas por cliente — ranking con acumulado (Pareto) ──────────────────
// Propuesta: en vez del pastel, el ranking completo con el acumulado: deja ver
// cuántos clientes hacen el 80 % de la venta (la concentración).
export function VentasPorCliente() {
  const campos = ["cliente"];
  const { estado, actual } = useConComparacion("ventas-por-cliente", campos);
  const d = actual.datos;
  let acumulado = 0;
  const filas = (d?.clientes || []).map((f, i) => {
    const antes = acumulado;
    acumulado += Number(f.porcentaje || 0);
    return { ...f, lugar: i + 1, acumulado, nucleo: antes < 80 };
  });
  const nucleo = filas.filter((f) => f.nucleo).length;
  const bloquesClientes = [...filas.slice(0, 6), ...(filas.length > 6 ? [{ cliente: "Otros",
    total: filas.slice(6).reduce((s, f) => s + Number(f.total), 0) }] : [])]
    .map((f, i) => ({ name: f.cliente, size: Number(f.total),
      color: f.cliente === "Otros" ? COLOR.no_asignado : RAMPA_TEAL[i],
      texto: i >= 4 && f.cliente !== "Otros" ? "#102a43" : "#fff" }));
  const maximo = Math.max(0, ...filas.map((f) => Number(f.porcentaje || 0)));
  return (
    <Panel titulo="Ventas por cliente" {...actual} filtros={<BarraFiltros campos={campos} estado={estado} />}>
      <Resumen>
        <Kpi titulo="Ventas del periodo" valor={d?.total} />
        {filas.length > 1 && <Kpi titulo="Clientes que hacen el 80 %" valor={nucleo}
          formato={(v) => `${v} de ${filas.length}`} />}
      </Resumen>
      <Tabla titulo="Ranking de clientes" filas={filas}
        claseFila={(f) => (f.nucleo && filas.length > 1 ? "db-nucleo" : "")}
        columnas={[
          ["lugar", "#", null, true], ["cliente", "Cliente"], ["total", "Ventas", dinero],
          ["porcentaje", "Participación", (v) => (
            <span className="db-participacion">
              <span className="db-pista" aria-hidden="true">
                <span style={{ width: `${maximo ? (Number(v) / maximo) * 100 : 0}%` }} />
              </span>
              {porciento(v)}
            </span>), true],
          ["acumulado", "Acumulado", porciento],
        ]} />
      {filas.length > 1 && <p className="db-nota">Sombreados: los clientes que juntos llegan al 80 % de la venta.</p>}
      {filas.length > 1 && (
        <div className="db-graficas">
          <Grafica titulo="Curva de concentración (Pareto)">
            <AreaChart data={filas.map((f) => ({ etiqueta: `#${f.lugar}`, cliente: f.cliente, acumulado: f.acumulado }))}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              {ejes("etiqueta", pctCorto, [0, 100], 0, [0, 25, 50, 75, 100])}
              <ReferenceLine y={80} stroke="#9fb3bd"
                label={{ value: "80 %", position: "insideTopLeft", fill: TINTA.texto, fontSize: 12 }} />
              <Tooltip {...estiloTooltip} cursor={cursorLinea}
                labelFormatter={(_, p) => p?.[0]?.payload?.cliente ?? ""}
                formatter={(v) => [porciento(v), "Acumulado"]} />
              <Area dataKey="acumulado" name="Acumulado" type="monotone" stroke={COLOR.serie1} strokeWidth={2}
                fill={COLOR.serie1} fillOpacity={0.14} dot={punto} activeDot={{ r: 5 }} animationDuration={400} />
            </AreaChart>
          </Grafica>
          {/* Un solo tono, más oscuro cuanto más vende: el tamaño es el dato, el color
              solo refuerza el orden. Más de 6 clientes se juntan en "Otros". */}
          <Grafica titulo="Tamaño de cada cliente"
            clave={bloquesClientes.map((b) => [b.color, `${b.name} · ${dinero(b.size)}`])}>
            <Treemap dataKey="size" isAnimationActive={false} content={<BloqueTreemap />} data={bloquesClientes} />
          </Grafica>
        </div>
      )}
    </Panel>
  );
}

// ── 7. Ventas por servicio — matriz servicio × alcance ──────────────────────
// Propuesta: es una tabla de doble entrada, así que se pinta como matriz: cada
// celda se tiñe de teal según su peso sobre el total, con totales en los bordes.
// Nodos: los servicios a la izquierda y Local/Foráneo a la derecha; enlaces con
// su venta. Sankey no admite enlaces en cero: se omiten.
const ALCANCES = [["local", "Local"], ["foraneo", "Foráneo"]];
function flujoServicios(filas) {
  const nodes = [...filas.map((f) => ({ name: f.etiqueta, color: COLOR[f.servicio] })),
                 ...ALCANCES.map(([, t]) => ({ name: t, color: "#102a43" }))];
  const links = filas.flatMap((f, i) => ALCANCES.map(([k], j) => ({
    source: i, target: filas.length + j, value: Number(f[k] || 0) }))).filter((l) => l.value > 0);
  return { nodes, links };
}
function NodoSankey({ x, y, width, height, payload }) {
  const derecha = payload.depth > 0;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={3} fill={payload.color} />
      <text x={derecha ? x + width + 8 : x - 8} y={y + height / 2} textAnchor={derecha ? "start" : "end"}
        dominantBaseline="middle" fontSize={12} fill="#17212b">
        <tspan fontWeight={700}>{payload.name}</tspan>
        <tspan x={derecha ? x + width + 8 : x - 8} dy={15} fill={TINTA.texto}>{dineroCorto(payload.value)}</tspan>
      </text>
    </g>
  );
}

export function VentasPorServicio() {
  const campos = ["servicio", "alcance"];
  const { estado, actual } = useConComparacion("ventas-por-servicio", campos);
  const d = actual.datos;
  const filas = (d?.servicios || []).map((s) => ({ ...s, etiqueta: NOMBRE_SERVICIO[s.servicio] }));
  const total = sumar(filas, "total");
  const peso = (v) => (total ? (Number(v) / total) * 100 : 0);
  const combinaciones = filas.flatMap((f) => ALCANCES.map(([k, t]) => ({
    name: `${f.etiqueta} ${t.toLowerCase()}`, size: Number(f[k] || 0), color: COLOR[f.servicio] })))
    .filter((x) => x.size > 0);
  const Celda = ({ v }) => {
    const p = peso(v);
    return (
      <td className={`num db-celda${p > 45 ? " db-celda-oscura" : ""}`}
        style={{ background: `color-mix(in oklab, #087e8b ${Math.round(p * 0.9)}%, #ffffff)` }}>
        <strong>{dinero(v)}</strong><small>{porciento(p)}</small>
      </td>
    );
  };
  return (
    <Panel titulo="Ventas por servicio" {...actual} filtros={<BarraFiltros campos={campos} estado={estado} />}>
      <Resumen><Kpi titulo="Ventas ligadas a servicio" valor={total} /></Resumen>
      {Number(d?.no_asignado) > 0 && <Aviso>{dinero(d.no_asignado)} en facturas sin maniobra ligada: sin servicio (no asignado).</Aviso>}
      <div className="db-seccion-cabeza">
        <h3>Matriz servicio × alcance</h3>
        <span className="db-escala" aria-hidden="true"><span>Menos</span><i /><span>Más</span></span>
      </div>
      <div className="db-tabla db-matriz" role="region" aria-label="Ventas por servicio y alcance" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Servicio</th><th scope="col" className="num">Local</th>
            <th scope="col" className="num">Foráneo</th><th scope="col" className="num">Total</th></tr></thead>
          <tbody>
            {filas.length === 0
              ? <tr><td colSpan={4} className="db-vacio">Sin datos en el periodo.</td></tr>
              : filas.map((f) => (
                <tr key={f.servicio}>
                  <th scope="row"><span className="db-muestra" style={{ background: COLOR[f.servicio] }} aria-hidden="true" />{f.etiqueta}</th>
                  <Celda v={f.local} /><Celda v={f.foraneo} />
                  <td className="num db-col-total"><strong>{dinero(f.total)}</strong><small>{porciento(peso(f.total))}</small></td>
                </tr>))}
          </tbody>
          {filas.length > 0 && (
            <tfoot><tr><th scope="row">Total</th>
              <td className="num">{dinero(sumar(filas, "local"))}</td>
              <td className="num">{dinero(sumar(filas, "foraneo"))}</td>
              <td className="num db-col-total">{dinero(total)}</td></tr></tfoot>
          )}
        </table>
      </div>
      {total > 0 && (
        <div className="db-graficas">
          {/* Flujo: de cada servicio salen dos corrientes, local y foráneo, del
              grueso de su venta. Lo que la matriz dice en cifras, aquí se ve. */}
          <Grafica titulo="Flujo de la venta: servicio → alcance" alto={280}>
            <Sankey data={flujoServicios(filas)} nodePadding={18} nodeWidth={12} iterations={0}
              margin={{ top: 12, right: 90, bottom: 28, left: 90 }}
              node={<NodoSankey />} link={{ stroke: "#0b8f9c", strokeOpacity: 0.22 }}>
              <Tooltip {...estiloTooltip} formatter={(v) => dinero(v)} />
            </Sankey>
          </Grafica>
          <Grafica titulo="Peso de cada combinación"
            clave={combinaciones.map((b) => [b.color, `${b.name} · ${dinero(b.size)}`])}>
            <Treemap dataKey="size" isAnimationActive={false} content={<BloqueTreemap />} data={combinaciones} />
          </Grafica>
        </div>
      )}
    </Panel>
  );
}

// ── 8. Costos por unidad — gráfica de puntos contra la mediana ──────────────
// Propuesta: lo que importa es qué tracto cuesta más por viaje que el resto.
// Un punto por unidad sobre una escala común, con la mediana de la flota.
export function CostosPorUnidad() {
  // Sin filtro de viaje suelto (usuario, 2026-11-25): el panel compara unidades.
  const campos = ["unidad", "operador", "destino"];
  // Siempre UN servicio (usuario, 2026-11-25): un sencillo solo se compara con
  // sencillos, un full con fulls y una carga suelta con cargas sueltas. Va como
  // el filtro `servicio` del backend, así que todo el panel —costos, mediana,
  // burbujas y diésel— queda dentro del mismo servicio. Sin opción "Todos".
  const { estado, actual, previo } = useConComparacion("costos-por-unidad", campos, false, { servicio: "sencillo" });
  const d = actual.datos;
  // Solo la flota de FRABA en todo el dashboard —resumen, tabla, gráficas y el
  // filtro de viaje, ya quitado— (usuario, 2026-11-23): fuera las unidades de terceros y
  // "Sin unidad". Propias = placas del catálogo de Tractos, que el backend ya
  // manda en opciones.unidades. Las propias sin gastos siguen en la tabla, pero
  // no en la mediana ni en las gráficas: $0 no es "barato", es "sin dato".
  const soloPropias = (datos) => {
    const propias = new Set((datos?.opciones?.unidades || []).map((u) => u.trim().toUpperCase()));
    const es = (unidad) => propias.has(String(unidad ?? "").trim().toUpperCase());
    return { unidades: (datos?.unidades || []).filter((u) => es(u.unidad)),
             viajes: (datos?.viajes || []).filter((v) => es(v.unidad)) };
  };
  const { unidades: propiasDelPeriodo } = soloPropias(d);
  const unidades = propiasDelPeriodo.map((u) => ({ ...u, etiqueta: u.unidad }));
  const conCosto = unidades.filter((u) => Number(u.costo) > 0);
  const sinCosto = unidades.length - conCosto.length;
  const promedios = conCosto.map((u) => Number(u.costo_promedio)).sort((a, b) => a - b);
  // Burbujas cercanas (≤8 % del rango en x y en y) alternan su etiqueta arriba /
  // abajo para no encimarse.
  const rangoX = Math.max(1, ...conCosto.map((u) => u.viajes));
  const rangoY = Math.max(1, ...promedios);
  const ladoEtiqueta = {};
  [...conCosto].sort((a, b) => a.viajes - b.viajes).forEach((u, i, xs) => {
    const previa = xs[i - 1];
    const cerca = previa && Math.abs(u.viajes - previa.viajes) / rangoX < 0.08
      && Math.abs(u.costo_promedio - previa.costo_promedio) / rangoY < 0.08;
    ladoEtiqueta[u.unidad] = cerca && ladoEtiqueta[previa.unidad] === "arriba" ? "abajo" : "arriba";
  });
  const EtiquetaBurbuja = ({ x, y, width, height, value }) => {
    const abajo = ladoEtiqueta[value] === "abajo";
    return (
      <text x={x + width / 2} y={abajo ? y + height + 14 : y - 6} textAnchor="middle"
        fill={TINTA.texto} fontSize={11}>{value}</text>
    );
  };
  const mediana = promedios.length
    ? (promedios.length % 2 ? promedios[(promedios.length - 1) / 2]
      : (promedios[promedios.length / 2 - 1] + promedios[promedios.length / 2]) / 2) : null;
  const tope = Math.max(1, ...promedios) * 1.05;
  const x = (v) => `${(Number(v) / tope) * 100}%`;
  return (
    <Panel titulo="Costos por unidad" {...actual}
      filtros={<BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} />}>
      <div className="db-selector db-selector-servicio" role="tablist" aria-label="Servicio que se compara">
        {SERVICIOS.map(([v, t]) => (
          <button key={v} role="tab" aria-selected={estado.filtros.servicio === v}
            className={estado.filtros.servicio === v ? "activo" : ""} onClick={() => estado.poner("servicio", v)}>{t}</button>
        ))}
      </div>
      <Resumen>
        <Kpi titulo="Costo total" valor={sumar(unidades, "costo")}
          anterior={previo ? sumar(soloPropias(previo).unidades, "costo") : undefined} />
        <Kpi titulo="Viajes" valor={sumar(unidades, "viajes")} formato={(v) => String(v)} />
        {mediana != null && <Kpi titulo="Mediana por viaje (unidades propias)" valor={mediana} />}
      </Resumen>
      <p className="db-nota">Solo unidades propias (catálogo de Tractos); las de terceros no se cuentan.
        {sinCosto > 0 && ` ${sinCosto} sin gastos en el periodo salen en la tabla, pero no en la mediana ni en las gráficas.`}</p>
      <div className="db-seccion-cabeza">
        <h3>Costo promedio por viaje</h3>
        <Leyenda items={[[COLOR.serie1, "Al nivel de la mediana o abajo"], ["#b9513f", "Arriba de la mediana"]]} />
      </div>
      <div className="db-tabla db-puntos" role="region" aria-label="Costo por unidad" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Unidad (tracto)</th><th scope="col" className="num">Viajes</th>
            <th scope="col" className="num">Costo</th>
            <th scope="col" className="db-col-puntos">Promedio por viaje <span className="db-tenue">(línea: mediana {dinero(mediana)})</span></th>
            <th scope="col" className="num">Promedio</th></tr></thead>
          <tbody>
            {unidades.length === 0
              ? <tr><td colSpan={5} className="db-vacio">Sin datos en el periodo.</td></tr>
              : unidades.map((u) => {
                const arriba = mediana != null && Number(u.costo_promedio) > mediana;
                const sinDato = !(Number(u.costo) > 0);
                return (
                  <tr key={u.unidad}>
                    <th scope="row">{u.unidad}</th>
                    <td className="num">{u.viajes}</td>
                    <td className="num">{dinero(u.costo)}</td>
                    <td className="db-col-puntos">
                      {sinDato ? <span className="db-tenue">Sin costo registrado</span> : (
                        <span className="db-riel" aria-hidden="true">
                          {mediana != null && <i className="db-mediana" style={{ left: x(mediana) }} />}
                          <b className={arriba ? "db-punto db-punto-alto" : "db-punto"} style={{ left: x(u.costo_promedio) }} />
                        </span>)}
                    </td>
                    <td className={`num${arriba && !sinDato ? " db-alto" : ""}${sinDato ? " db-tenue" : ""}`}>{sinDato ? "—" : dinero(u.costo_promedio)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {conCosto.length > 0 && (
        // Burbujas: cuántos viajes hizo (x), cuánto cuesta cada uno (y) y cuánto
        // suma en total (tamaño). Un tracto caro y muy usado salta a la vista.
        <Grafica titulo="Viajes contra costo por viaje (tamaño: costo total)" alto={340}
          leyenda={[[COLOR.serie1, "Al nivel de la mediana o abajo"], ["#b9513f", "Arriba de la mediana"]]}>
          <ScatterChart margin={{ top: 28, right: 48, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={TINTA.grid} />
            <XAxis type="number" dataKey="viajes" name="Viajes" allowDecimals={false} tickLine={false}
              axisLine={{ stroke: TINTA.eje }} tick={{ fill: TINTA.texto, fontSize: 12 }}
              label={{ value: "Viajes", position: "insideBottomRight", offset: -4, fill: TINTA.texto, fontSize: 12 }} />
            <YAxis type="number" dataKey="costo_promedio" name="Costo por viaje" tickFormatter={dineroCorto}
              {...escalaY(conCosto.map((u) => Number(u.costo_promedio) * 1.12))} tickLine={false} axisLine={false} tick={{ fill: TINTA.texto, fontSize: 12 }} width={56} />
            <ZAxis type="number" dataKey="costo" range={[80, 900]} />
            {mediana != null && <ReferenceLine y={mediana} stroke="#9fb3bd"
              label={{ value: `mediana ${dineroCorto(mediana)}`, position: "insideTopLeft", fill: TINTA.texto, fontSize: 12 }} />}
            <Tooltip cursor={false} content={({ active, payload }) => (active && payload?.length ? (
              <div className="db-tooltip">
                <strong>{payload[0].payload.unidad}</strong>
                <span>{payload[0].payload.viajes} viajes · {dinero(payload[0].payload.costo_promedio)} por viaje</span>
                <span>Costo total {dinero(payload[0].payload.costo)}</span>
              </div>) : null)} />
            {[[false, COLOR.serie1], [true, "#b9513f"]].map(([alto, c]) => (
              <Scatter key={String(alto)} animationDuration={400} fill={c} fillOpacity={0.75} stroke="#fff" strokeWidth={2}
                data={graf(conCosto).filter((u) => (mediana != null && u.costo_promedio > mediana) === alto)}>
                {/* Cada burbuja con su tracto: sin rótulo solo se identificaba al pasar el ratón. */}
                <LabelList dataKey="unidad" content={<EtiquetaBurbuja />} />
              </Scatter>
            ))}
          </ScatterChart>
        </Grafica>
      )}
      <div className="db-seccion-cabeza">
        <h3>Diésel de {NOMBRE_SERVICIO[estado.filtros.servicio]?.toLowerCase()}: tractos y operadores</h3>
        <Leyenda items={[[COLOR.serie1, "Al nivel de la mediana o abajo"], ["#b9513f", "Arriba de la mediana"]]} />
      </div>
      <p className="db-nota">De los reportes de viaje: cada folio con su tracto y su operador (en un Full de dos
        operadores, cada uno con lo suyo). Solo de Fraba.
        {d?.diesel?.sin_dato > 0 && ` ${d.diesel.sin_dato} viaje(s) sin litros en su reporte no cuentan.`}</p>
      <TablaDiesel titulo="Por tracto" columna="Tracto" filas={d?.diesel?.tractos || []} />
      <TablaDiesel titulo="Por operador" columna="Operador" filas={d?.diesel?.operadores || []} />
    </Panel>
  );
}

const medianaDe = (xs) => {
  const v = xs.map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const litros = (v) => (v == null ? "—" : `${Number(v).toLocaleString("es-MX", { maximumFractionDigits: 0 })} L`);

// Diésel por tracto o por operador: litros e importe, total y por viaje. El
// punto va en litros por viaje, que es el consumo; el importe por viaje se marca
// igual cuando pasa de su mediana (puede subir solo por el precio del litro).
function TablaDiesel({ titulo, columna, filas }) {
  const medL = medianaDe(filas.map((f) => f.litros_promedio));
  const medI = medianaDe(filas.map((f) => f.importe_promedio));
  const tope = Math.max(1, ...filas.map((f) => Number(f.litros_promedio))) * 1.05;
  const x = (v) => `${(Number(v) / tope) * 100}%`;
  return (
    <div className="db-tabla db-puntos db-tabla-diesel" role="region" aria-label={`Diésel ${titulo.toLowerCase()}`} tabIndex={0}>
      <table>
        <caption className="db-tabla-titulo">{titulo}</caption>
        <thead><tr><th scope="col">{columna}</th><th scope="col" className="num">Viajes</th>
          <th scope="col" className="num">Litros</th>
          <th scope="col" className="db-col-puntos">Litros por viaje <span className="db-tenue">(línea: mediana {litros(medL)})</span></th>
          <th scope="col" className="num">L / viaje</th>
          <th scope="col" className="num">Importe</th>
          <th scope="col" className="num">Importe / viaje</th></tr></thead>
        <tbody>
          {filas.length === 0
            ? <tr><td colSpan={7} className="db-vacio">Sin reportes con diésel en el periodo.</td></tr>
            : filas.map((f) => {
              const altoL = medL != null && Number(f.litros_promedio) > medL;
              const altoI = medI != null && Number(f.importe_promedio) > medI;
              return (
                <tr key={f.nombre}>
                  <th scope="row">{f.nombre}</th>
                  <td className="num">{f.viajes}</td>
                  <td className="num">{litros(f.litros)}</td>
                  <td className="db-col-puntos">
                    <span className="db-riel" aria-hidden="true">
                      {medL != null && <i className="db-mediana" style={{ left: x(medL) }} />}
                      <b className={altoL ? "db-punto db-punto-alto" : "db-punto"} style={{ left: x(f.litros_promedio) }} />
                    </span>
                  </td>
                  <td className={`num${altoL ? " db-alto" : ""}`}>{litros(f.litros_promedio)}</td>
                  <td className="num">{dinero(f.importe)}</td>
                  <td className={`num${altoI ? " db-alto" : ""}`}>{dinero(f.importe_promedio)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// ── 9. Rentabilidad — dispersión ingreso contra costo ───────────────────────
// Propuesta: cada viaje es un punto (costo, ingreso); la diagonal es el 100 %
// (ingresar lo mismo que se gastó). Arriba gana, abajo pierde: se ve de un golpe.
export function Rentabilidad() {
  const campos = ["cliente", "servicio", "unidad", "operador", "ruta"];
  const { estado, actual, previo } = useConComparacion("rentabilidad", campos);
  const d = actual.datos;
  const ops = d?.operaciones || [];
  const puntos = graf(ops.filter((o) => o.rentabilidad != null));
  const gana = puntos.filter((p) => p.rentabilidad >= 100);
  const pierde = puntos.filter((p) => p.rentabilidad < 100);
  // Misma escala redonda en los dos ejes: si no, la diagonal del 100 % mentiría.
  const maximo = Math.max(1, ...puntos.flatMap((p) => [p.costo, p.ingreso]));
  const paso = 10 ** Math.floor(Math.log10(maximo)) / 2;
  const tope = Math.ceil(maximo / paso) * paso;
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso)
    .filter((_, i, xs) => xs.length <= 7 || i % 2 === 0);
  const GANA = "#0b8f9c", PIERDE = "#b9513f";
  // Curva ordenada: pasos de 50 % para que el 100 % caiga en una línea de la rejilla.
  const topeRent = Math.max(150, Math.ceil(Math.max(0, ...puntos.map((p) => p.rentabilidad)) / 50) * 50);
  const marcasRent = Array.from({ length: topeRent / 50 + 1 }, (_, i) => i * 50);
  // El degradado se mide sobre la caja de la curva (del máximo al mínimo), no
  // sobre el eje: el corte va donde el 100 % cae dentro de esa caja.
  const rents = puntos.map((p) => p.rentabilidad);
  const maxR = Math.max(100, ...rents), minR = Math.min(100, ...rents);
  const corte = `${maxR > minR ? ((maxR - 100) / (maxR - minR)) * 100 : 100}%`;
  const Estado = (v) => (v == null ? <span className="db-tenue">Sin costo</span> : (
    <span className={`db-estado-op ${Number(v) >= 100 ? "gana" : "pierde"}`}>
      {Number(v) >= 100 ? <CircleCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />}
      {porciento(v)}
    </span>));
  const PuntoTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="db-tooltip">
        <strong>{p.folio || `Maniobra ${p.maniobra}`}</strong>
        <span>{p.cliente}</span>
        <span>Ingreso {dinero(p.ingreso)} · Costo {dinero(p.costo)}</span>
        <span>Rentabilidad {porciento(p.rentabilidad)}</span>
      </div>
    );
  };
  return (
    <Panel titulo="Rentabilidad por operación" {...actual}
      filtros={<BarraFiltros campos={campos} estado={estado} opciones={d?.opciones} />}>
      <Resumen>
        <Kpi titulo="Rentabilidad (ingreso ÷ costo)" valor={d?.rentabilidad} formato={(v) => v} sufijo=" %"
          anterior={previo ? previo.rentabilidad : undefined} />
        <Kpi titulo="Ingreso" valor={d?.total_ingreso} anterior={previo?.total_ingreso} />
        <Kpi titulo="Costo" valor={d?.total_costo} anterior={previo?.total_costo} />
        {puntos.length > 0 && <Kpi titulo="Viajes bajo el 100 %" valor={pierde.length}
          formato={(v) => `${v} de ${puntos.length}`} />}
      </Resumen>
      <p className="db-nota">200 % es ingresar el doble de lo gastado. Sin costo registrado no hay división.</p>
      <div className="db-dos db-dos-ancho">
        <figure className="db-figura">
          <div className="db-seccion-cabeza">
            <figcaption>Ingreso contra costo por viaje</figcaption>
            <Leyenda items={[[GANA, "100 % o más"], [PIERDE, "Menos de 100 %"]]} />
          </div>
          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={TINTA.grid} />
              <XAxis type="number" dataKey="costo" name="Costo" domain={[0, tope]} ticks={marcas} tickFormatter={dineroCorto}
                tickLine={false} axisLine={{ stroke: TINTA.eje }} tick={{ fill: TINTA.texto, fontSize: 12 }}
                label={{ value: "Costo", position: "insideBottomRight", offset: -4, fill: TINTA.texto, fontSize: 12 }} />
              <YAxis type="number" dataKey="ingreso" name="Ingreso" domain={[0, tope]} ticks={marcas} tickFormatter={dineroCorto}
                tickLine={false} axisLine={false} tick={{ fill: TINTA.texto, fontSize: 12 }} width={56} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: tope, y: tope }]} stroke="#9fb3bd" strokeWidth={1}
                label={{ value: "100 %", position: "insideTopRight", fill: TINTA.texto, fontSize: 12 }} ifOverflow="hidden" />
              <Tooltip content={<PuntoTooltip />} cursor={false} />
              <Scatter data={gana} animationDuration={400} fill={GANA} stroke="#fff" strokeWidth={2} />
              <Scatter data={pierde} animationDuration={400} fill={PIERDE} stroke="#fff" strokeWidth={2} />
            </ScatterChart>
          </ResponsiveContainer>
        </figure>
        <Tabla titulo="Rentabilidad por viaje" filas={ops} columnas={[["folio", "Folio"], ["cliente", "Cliente"],
          ["ingreso", "Ingreso", dinero], ["costo", "Costo", dinero], ["rentabilidad", "Rentabilidad", Estado, true]]} />
      </div>
      {puntos.length > 1 && (
        // Curva de rentabilidad: los viajes del más al menos rentable. Dónde cruza
        // el 100 % dice cuántos viajes pierden y cuánto se aleja el peor.
        <Grafica titulo="Viajes ordenados por rentabilidad"
          leyenda={[[GANA, "100 % o más"], [PIERDE, "Menos de 100 %"]]}>
          <AreaChart data={[...puntos].sort((a, b) => b.rentabilidad - a.rentabilidad)
            .map((p, i) => ({ ...p, etiqueta: i + 1 }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              {/* Corte exacto en el 100 %: arriba teal, abajo coral, como en la dispersión. */}
              <linearGradient id="db-rentab" x1="0" y1="0" x2="0" y2="1">
                <stop offset={corte} stopColor={GANA} /><stop offset={corte} stopColor={PIERDE} />
              </linearGradient>
            </defs>
            {ejes("etiqueta", pctCorto, [0, topeRent], puntos.length > 20 ? 1 : 0, marcasRent)}
            <ReferenceLine y={100} stroke={PIERDE} strokeOpacity={0.6}
              label={{ value: "100 %", position: "insideTopRight", fill: TINTA.texto, fontSize: 12 }} />
            <Tooltip content={<PuntoTooltip />} cursor={cursorLinea} />
            <Area dataKey="rentabilidad" name="Rentabilidad" type="monotone" stroke="url(#db-rentab)" strokeWidth={2}
              fill="url(#db-rentab)" fillOpacity={0.14} baseValue={100} animationDuration={400} />
          </AreaChart>
        </Grafica>
      )}
    </Panel>
  );
}

// Los nueve, en el orden de la agrupación de la P44. Viven todos en una sola
// página, DASHBOARDS, con un botón cada uno: las páginas por grupo se quitaron
// porque repetían lo mismo sin capturar nada (usuario, 2026-09-30).
// ── 0. Resumen general — ingresos, egresos, utilidad y margen ──────────────
// El panorama de un vistazo (usuario, 2026-11-23, sobre una maqueta "Finance"):
// cuatro cifras con su variación contra el mismo periodo del año anterior, la
// tendencia y en qué se va el dinero. Las cifras salen del mismo cálculo que
// Utilidad mensual; nada se recalcula aquí más que sumas y el margen.
// Sin flujo de efectivo (usuario, 2026-11-23): todo se cobra por factura, no
// hay ingresos en efectivo y saldría siempre negativo. El endpoint "flujo" del
// backend se queda; solo deja de mostrarse aquí.
// Composición de gastos (usuario, 2026-11-23): suma lo mismo que "Egresos". Los
// conceptos de viaje vienen de costo_por_concepto (backend); el resto, de la
// cascada de utilidad. Colores validados con dataviz (orden fijo, no por tamaño).
// "Gastos de viaje" son los gastos adicionales capturados en cada viaje.
const COMPOSICION = [
  ["Combustible", "#0b8f9c", (m) => [m.costo_por_concepto?.combustible]],
  ["Casetas", "#c98512", (m) => [m.costo_por_concepto?.casetas]],
  ["Mantenimiento", "#6a5fd0", (m) => [m.costo_por_concepto?.mantenimiento]],
  ["Operadores y nómina", "#c2577a", (m) => [m.costo_por_concepto?.operadores, m.nomina_administrativa]],
  ["Gastos fijos", "#5c8a2a", (m) => [m.gastos_fijos]],
  ["Gastos de viaje", "#2f6db5", (m) => [m.costo_por_concepto?.adicionales]],
  ["Otros", "#a7b4bb", (m) => [m.comisiones, m.financieros, m.impuestos]],
];
const DETALLE_OTROS = "comisiones de venta, gastos financieros e impuestos";
const totalesResumen = (meses = []) => {
  const ingresos = sumar(meses, "ventas"), neta = sumar(meses, "utilidad_neta");
  return { ingresos, neta, egresos: ingresos - neta, margen: ingresos ? (neta / ingresos) * 100 : null };
};
export function ResumenGeneral() {
  const { estado, actual, previo } = useConComparacion("utilidad", [], true);
  const meses = (actual.datos?.meses || []).map((m) => ({ etiqueta: etiquetaMes(m.mes), ...m,
    egresos: Number(m.ventas) - Number(m.utilidad_neta) }));
  const t = totalesResumen(meses);
  const p = previo ? totalesResumen(previo.meses) : null;
  const faltan = meses.filter((m) => m.faltan_pagos).map((m) => m.etiqueta);
  const composicion = COMPOSICION.map(([name, color, de]) => ({
    name, color, valor: meses.reduce((s, m) => s + de(m).reduce((x, v) => x + Number(v || 0), 0), 0) }))
    .filter((x) => x.valor > 0);
  const totalComp = composicion.reduce((s, x) => s + x.valor, 0);
  return (
    <Panel titulo="Resumen general" {...actual} filtros={<BarraFiltros estado={estado} />}>
      <CifrasResumen t={t} p={p} />
      {faltan.length > 0 && <Aviso>Faltan pagos de gastos fijos por capturar en: {faltan.join(", ")}.</Aviso>}
      <Grafica titulo="Ingresos y egresos por mes" alto={260} vacia={sinValores(meses, ["ventas", "egresos"])}
        leyenda={[[COLOR.serie1, "Ingresos (ventas con IVA)"], [NAVY, "Egresos"]]}>
        <AreaChart data={meses} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          {ejesDe(meses.flatMap((m) => [m.ventas, m.egresos]))}
          <Tooltip {...estiloTooltip} formatter={(v, n) => [dinero(v), n]} cursor={cursorLinea} />
          <Area dataKey={(m) => Number(m.ventas)} name="Ingresos" stroke={COLOR.serie1} strokeWidth={2}
            fill={COLOR.serie1} fillOpacity={0.14} dot={punto} activeDot={{ r: 5 }} animationDuration={400} />
          <Area dataKey="egresos" name="Egresos" stroke={NAVY} strokeWidth={2} fill="none"
            dot={{ ...punto, stroke: NAVY }} activeDot={{ r: 5 }} animationDuration={400} />
        </AreaChart>
      </Grafica>
      <Grafica titulo="Composición de gastos" alto={260} vacia={!composicion.length}
        clave={composicion.map((x) => [x.color, `${x.name} · ${dinero(x.valor)} (${porciento((x.valor / totalComp) * 100)})`])}>
        <PieChart>
          <Pie data={composicion} dataKey="valor" nameKey="name" innerRadius="58%" outerRadius="88%"
            startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} animationDuration={400}>
            {composicion.map((x) => <Cell key={x.name} fill={x.color} />)}
          </Pie>
          {/* El total en el hueco: la dona suma lo mismo que "Egresos". */}
          <text x="50%" y="47%" textAnchor="middle" fill={TINTA.texto} fontSize={12}>Egresos</text>
          <text x="50%" y="57%" textAnchor="middle" fill={NAVY} fontSize={16} fontWeight={700}>{dineroCorto(totalComp)}</text>
          <Tooltip {...estiloTooltip} formatter={(v, n) => [`${dinero(v)} (${porciento((v / totalComp) * 100)})`,
            n === "Otros" ? `Otros: ${DETALLE_OTROS}` : n]} />
        </PieChart>
      </Grafica>
    </Panel>
  );
}
// Las cuatro cifras del resumen, cada una contra el mismo periodo del año anterior.
function CifrasResumen({ t, p }) {
  return (
    <Resumen>
      <Kpi titulo="Ingresos (ventas con IVA)" valor={t.ingresos} anterior={p?.ingresos} />
      <Kpi titulo="Egresos" valor={t.egresos} anterior={p?.egresos} />
      <Kpi titulo="Utilidad neta" valor={t.neta} anterior={p?.neta} />
      <Kpi titulo="Margen neto" valor={t.margen} formato={(v) => Number(v).toFixed(1)} sufijo=" %"
        anterior={p?.margen ?? undefined} puntos />
    </Resumen>
  );
}

export const DASHBOARDS = [
  ["Resumen general", ResumenGeneral],
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
