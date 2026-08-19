import { useState, useEffect } from "react";
import { apiClient } from "../../api/apiClient";
import { STATUS_MAP } from "../../config/statusConfig";
import "./Seguimientos.css";

// Qué estados se resumen y con qué nombre. Los colores NO se escriben aquí: salen
// de STATUS_MAP, que es la fuente única de los status (ver config/statusConfig.js),
// así que la bolita siempre es el mismo color que la fila de la tabla.
const FILAS = [
  { id: "activo",    etiqueta: "ACTIVOS" },
  { id: "pendiente", etiqueta: "PENDIENTES" },
];

/**
 * Seguimientos
 * Resumen corto de cuántas maniobras hay activas y pendientes. Se pide una vez
 * al montar la pantalla de inicio.
 */
export default function Seguimientos() {
  const [conteos, setConteos] = useState(null);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    apiClient
      .get("/maniobras/resumen-status/")
      .then(setConteos)
      // Un fallo NO puede parecerse a "no hay ninguna": un cero es un dato y una
      // consulta caída no lo es. Misma lección que las alertas de vencimiento.
      .catch(() => setError(true));
  }, []);

  return (
    <aside className="seg-panel" aria-label="Seguimientos">
      <h2 className="seg-header">SEGUIMIENTOS</h2>
      <div className="seg-cuerpo">
        {error ? (
          <p className="seg-fallo">No se pudo cargar el resumen.</p>
        ) : (
          FILAS.map(({ id, etiqueta }) => (
            <div key={id} className="seg-fila">
              <span className="seg-bolita" style={{ background: STATUS_MAP[id].color }} />
              <span className="seg-etiqueta">{etiqueta}</span>
              <span className="seg-numero">{conteos ? conteos[id] : "—"}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
