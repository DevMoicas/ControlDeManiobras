import { useState, useEffect } from "react";
import { apiClient } from "../api/apiClient";
import { DASHBOARDS } from "../components/Dashboards/Dashboards";
import "../components/Dashboards/Dashboards.css";

// DASHBOARDS: los nueve dashboards de Finanzas en una sola página, con un botón
// cada uno centrado arriba (P40) para no tener que bajar por todos. Quién entra
// lo decide el backend; aquí solo se evita pintar un 403.
export default function TableroFinanzasPage() {
  const [acceso, setAcceso] = useState(null);
  const [vista, setVista] = useState(0);

  useEffect(() => {
    apiClient.get("/facturas/acceso/").then(setAcceso).catch(() => setAcceso({ ver: false }));
  }, []);

  if (!acceso) return <div className="db-pagina" />;
  if (!acceso.ver) {
    return (
      <div className="db-pagina">
        <section className="db-panel"><h2>Sin acceso</h2>
          <p>Finanzas es solo para dirección, comercial y administradores.</p></section>
      </div>
    );
  }

  const Componente = DASHBOARDS[vista][1];
  return (
    <div className="db-pagina">
      <h1 className="db-titulo-pagina">Dashboards</h1>
      <div className="db-selector" role="tablist" aria-label="Dashboard">
        {DASHBOARDS.map(([nombre], i) => (
          <button key={nombre} role="tab" aria-selected={vista === i}
            className={vista === i ? "activo" : ""} onClick={() => setVista(i)}>{nombre}</button>
        ))}
      </div>
      <Componente />
    </div>
  );
}
