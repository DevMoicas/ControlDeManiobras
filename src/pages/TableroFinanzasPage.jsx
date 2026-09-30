import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { GRUPOS } from "../components/Dashboards/Dashboards";
import "../components/Dashboards/Dashboards.css";

// Una página por grupo de dashboards, con el selector de vista centrado arriba
// (P40), y "todos" = DASHBOARDS: los mismos componentes juntos, para comparar
// (P41). Quién entra lo decide el backend; aquí solo se evita pintar un 403.
export default function TableroFinanzasPage() {
  const { grupo } = useParams();
  const [acceso, setAcceso] = useState(null);
  const [vista, setVista] = useState(0);

  useEffect(() => {
    apiClient.get("/facturas/acceso/").then(setAcceso).catch(() => setAcceso({ ver: false }));
  }, []);
  useEffect(() => { setVista(0); }, [grupo]);

  if (!acceso) return <div className="db-pagina" />;
  if (!acceso.ver) {
    return (
      <div className="db-pagina">
        <section className="db-panel"><h2>Sin acceso</h2>
          <p>Finanzas es solo para dirección, comercial y administradores.</p></section>
      </div>
    );
  }

  if (grupo === "todos") {
    return (
      <div className="db-pagina">
        <h1 className="db-titulo-pagina">Dashboards</h1>
        {Object.values(GRUPOS).flatMap((g) => g.vistas).map(([nombre, Componente]) => (
          <Componente key={nombre} />
        ))}
      </div>
    );
  }

  const g = GRUPOS[grupo];
  if (!g) return <div className="db-pagina"><section className="db-panel"><h2>No existe esa página</h2></section></div>;
  const Componente = g.vistas[vista][1];
  return (
    <div className="db-pagina">
      <h1 className="db-titulo-pagina">{g.titulo}</h1>
      <div className="db-selector" role="tablist" aria-label="Vista">
        {g.vistas.map(([nombre], i) => (
          <button key={nombre} role="tab" aria-selected={vista === i}
            className={vista === i ? "activo" : ""} onClick={() => setVista(i)}>{nombre}</button>
        ))}
      </div>
      <Componente />
    </div>
  );
}
