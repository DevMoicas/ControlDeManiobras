import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
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
  useEffect(() => {
    apiClient.get(`${endpoint}opciones/`).then(setOpciones).catch(() => {});
  }, [endpoint]);

  const poner = (campo, valor) => onChange({ ...filtros, [campo]: valor });
  const entrada = (campo, etiqueta, type) => (
    <label>{etiqueta}
      <input type={type} value={filtros[campo] || ""} onChange={(e) => poner(campo, e.target.value)} />
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

  return (
    <div className="db-filtros">
      {entrada("fecha", "Fecha", "date")}
      {entrada("desde", "Desde", "date")}
      {entrada("hasta", "Hasta", "date")}
      {/* ponytail: type="month" es texto libre en Firefox; ahí se escribe AAAA-MM. */}
      {entrada("mes", "Mes", "month")}
      {conCoordinador && select("coordinador", "Coordinador", opciones.coordinadores)}
      {select("operador", "Operador", opciones.operadores)}
      {select("ruta", "Ruta", opciones.rutas)}
      {Object.values(filtros).some(Boolean) && (
        <button type="button" className="db-limpiar" onClick={() => onChange({})}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
