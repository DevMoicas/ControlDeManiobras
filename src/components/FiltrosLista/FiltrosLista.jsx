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

export default function FiltrosLista({ endpoint, filtros, onChange, conCoordinador = false }) {
  const [opciones, setOpciones] = useState({});
  // Plegados por defecto, se abren con el botón (usuario, 2026-10-13). El
  // número del botón avisa de los que siguen aplicados con el panel cerrado.
  // Abierto si ya hay filtros: Maniobras desmonta la lista (y esto) mientras
  // recarga al cambiar un filtro, y sin esto el panel se cerraba a cada elección.
  const activos = Object.values(filtros).filter(Boolean).length;
  const [abierto, setAbierto] = useState(activos > 0);
  useEffect(() => {
    apiClient.get(`${endpoint}opciones/`).then(setOpciones).catch(() => {});
  }, [endpoint]);

  const poner = (campo, valor) => onChange({ ...filtros, [campo]: valor });
  // CampoFecha y no <input type="date">: el del navegador movía la fecha al
  // cambiar de mes con las flechas, y cada movimiento recargaba la lista.
  const entrada = (campo, etiqueta, modo) => (
    <label>{etiqueta}
      <CampoFecha
        modo={modo}
        selected={modo === "mes" ? aDate(filtros[campo] && `${filtros[campo]}-01`) : aDate(filtros[campo])}
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
            onClick={() => setAbierto((a) => !a)}>
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
      {conCoordinador && select("coordinador", "Coordinador", opciones.coordinadores)}
      {select("operador", "Operador", opciones.operadores)}
      {select("ruta", "Ruta", opciones.rutas)}
      {Object.values(filtros).some(Boolean) && (
        <button type="button" className="db-limpiar" onClick={() => onChange({})}>
          Limpiar filtros
        </button>
      )}
    </div>
    </>
  );
}
