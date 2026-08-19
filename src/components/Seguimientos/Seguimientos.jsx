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

// Cada cuánto se vuelven a pedir los conteos. Los status se cambian desde
// Maniobras, y volver al inicio desmonta y remonta esta pantalla, así que ese
// camino ya se refresca solo; el intervalo cubre dejar el inicio abierto
// mientras otra persona los mueve. Un minuto: son dos COUNT(*) y el dato es un
// resumen, no un marcador en vivo.
const REFRESCO_MS = 60_000;

/**
 * Seguimientos
 * Resumen corto de cuántas maniobras hay activas y pendientes. Se pide una vez
 * al montar la pantalla de inicio.
 */
export default function Seguimientos() {
  const [conteos, setConteos] = useState(null);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    // El intervalo puede resolver una petición después de desmontar; la bandera
    // evita tocar el estado de un componente que ya no está.
    let cancelado = false;

    const pedir = () => {
      apiClient
        .get("/maniobras/resumen-status/")
        .then((datos) => {
          if (cancelado) return;
          setConteos(datos);
          // Se limpia al acertar: con refresco automático, un fallo pasajero de
          // red dejaría el aviso puesto para siempre aunque ya vuelva a haber datos.
          setError(false);
        })
        // Un fallo NO puede parecerse a "no hay ninguna": un cero es un dato y una
        // consulta caída no lo es. Misma lección que las alertas de vencimiento.
        .catch(() => { if (!cancelado) setError(true); });
    };

    pedir();
    // Con la pestaña en segundo plano no hay nadie mirando: no tiene sentido
    // gastar una consulta por minuto en una pantalla que nadie ve.
    const id = setInterval(() => { if (!document.hidden) pedir(); }, REFRESCO_MS);

    return () => { cancelado = true; clearInterval(id); };
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
