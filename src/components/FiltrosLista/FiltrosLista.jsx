import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import CampoFecha from "../CampoFecha/CampoFecha";
import { aDate, aBackend } from "../CeldaEditable/fechaCelda.mjs";
// Mismo aspecto que la BarraFiltros de los dashboards: se reutiliza su CSS.
import "../Dashboards/Dashboards.css";

// Los filtros de lista de Reportes de Viaje y Maniobras (usuario, 2026-10-12):
// fecha, rango, mes, operador, ruta y —solo en reportes— coordinador. Se
// resuelven en el SERVIDOR (cada página es de 60 y el contador es el `count`).
// Las opciones salen de `${endpoint}opciones/`: todo lo que hay, no la página.

/** Los filtros con valor, listos para un URLSearchParams. */
export const conValor = (filtros) => Object.fromEntries(
  Object.entries(filtros).filter(([, v]) => v));

// Si el panel está abierto, por lista. Fuera del componente porque Maniobras lo
// desmonta mientras recarga al cambiar un filtro: con un useState se cerraba a
// cada elección. Plegado la primera vez (usuario, 2026-10-13).
const abiertos = {};

// `soloFechas`: solo fecha, rango y mes, sin pedir opciones al servidor. Lo usan
// Facturación y Cuentas por pagar, que filtran en pantalla (utils/filtroFechas);
// ahí `endpoint` es solo la clave para recordar si el panel está abierto.
export default function FiltrosLista({ endpoint, filtros, onChange, conCoordinador = false, conAnio = false, soloFechas = false }) {
  const [opciones, setOpciones] = useState({});
  // Plegados por defecto, se abren con el botón (usuario, 2026-10-13). El
  // número del botón avisa de los que siguen aplicados con el panel cerrado.
  const activos = Object.values(filtros).filter(Boolean).length;
  const [abierto, setAbiertoLocal] = useState(abiertos[endpoint] ?? activos > 0);
  const setAbierto = (a) => setAbiertoLocal((abiertos[endpoint] = a));
  // Desde/Hasta: el rango se aplica solo con LAS DOS fechas, en cualquier
  // orden (usuario, 2026-10-13). Mientras falte una vive aquí y no recarga.
  const [rango, setRango] = useState({ desde: filtros.desde || "", hasta: filtros.hasta || "" });
  useEffect(() => {
    if (!soloFechas) apiClient.get(`${endpoint}opciones/`).then(setOpciones).catch(() => {});
  }, [endpoint, soloFechas]);

  const poner = (campo, valor) => {
    if (!(campo in rango)) return onChange({ ...filtros, [campo]: valor });
    const nuevo = { ...rango, [campo]: valor };
    setRango(nuevo);
    if (nuevo.desde && nuevo.hasta) onChange({ ...filtros, ...nuevo });
    // Se deshizo un rango ya aplicado: se quita entero.
    else if (filtros.desde || filtros.hasta) onChange({ ...filtros, desde: "", hasta: "" });
  };
  const valor = (campo) => (campo in rango ? rango[campo] : filtros[campo]);
  const limpiar = () => { setRango({ desde: "", hasta: "" }); onChange({}); };
  // CampoFecha y no <input type="date">: el del navegador movía la fecha al
  // cambiar de mes con las flechas, y cada movimiento recargaba la lista.
  const entrada = (campo, etiqueta, modo) => (
    <label>{etiqueta}
      <CampoFecha
        modo={modo}
        selected={modo === "mes" ? aDate(valor(campo) && `${valor(campo)}-01`) : aDate(valor(campo))}
        onChange={(d) => poner(campo, modo === "mes" ? (aBackend(d) || "").slice(0, 7) : aBackend(d) || "")}
        placeholderText={modo === "mes" ? "MM/AAAA" : "DD/MM/AAAA"}
        isClearable
      />
    </label>
  );
  const select = (campo, etiqueta, valores = []) => (
    <label>{etiqueta}
      <select value={filtros[campo] || ""} onChange={(e) => poner(campo, e.target.value)}>
        <option value="">Todos</option>
        {valores.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </label>
  );

  const boton = (
    <button type="button" className="db-filtros-boton" aria-expanded={abierto}
            title={abierto ? "Ocultar filtros" : "Mostrar filtros"}
            onClick={() => setAbierto(!abierto)}>
      <Filter size={16} /> Filtros{activos > 0 && <span className="db-filtros-n">{activos}</span>}
    </button>
  );
  if (!abierto) return boton;

  return (
    <>
    {boton}
    <div className="db-filtros">
      {entrada("fecha", "Fecha", "fecha")}
      {entrada("desde", "Desde", "fecha")}
      {entrada("hasta", "Hasta", "fecha")}
      {entrada("mes", "Mes", "mes")}
      {conAnio && select("anio", "Año", opciones.anios)}
      {conCoordinador && select("coordinador", "Coordinador", opciones.coordinadores)}
      {!soloFechas && select("operador", "Operador", opciones.operadores)}
      {!soloFechas && select("ruta", "Ruta", opciones.rutas)}
      {Object.values({ ...filtros, ...rango }).some(Boolean) && (
        <button type="button" className="db-limpiar" onClick={limpiar}>
          Limpiar filtros
        </button>
      )}
    </div>
    </>
  );
}
