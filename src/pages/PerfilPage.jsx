// src/pages/PerfilPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { apiClient } from "../api/apiClient";
import { User } from "lucide-react";
import "./PerfilPage.css";

const fmtFecha = (iso) => {
  // toLocaleDateString: stdlib, sin date-fns para una fecha corta.
  try { return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return ""; }
};

export default function PerfilPage() {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();

  const [equipos, setEquipos]   = useState([]);
  const [revocando, setRevocando] = useState(null);   // id en curso

  useEffect(() => {
    let vivo = true;
    // Si falla (o no hay ninguno) la sección simplemente no aparece: es
    // informativa, nunca debe romper la pantalla de perfil.
    apiClient.get("/dispositivos-confianza/")
      .then((data) => { if (vivo) setEquipos(Array.isArray(data) ? data : []); })
      .catch(() => { if (vivo) setEquipos([]); });
    return () => { vivo = false; };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const revocar = async (id) => {
    // Revocar cierra TODAS las sesiones del usuario, esta incluida (decisión 13).
    if (!window.confirm(
      "Esto cerrará tu sesión en todos los equipos, incluido este. ¿Continuar?"
    )) return;

    setRevocando(id);
    try {
      await apiClient.post(`/dispositivos-confianza/${id}/revocar/`, {});
      // El servidor ya invalidó los refresh: lo honesto es salir al login en vez
      // de seguir con un token que morirá en un rato (decisión 17). El diálogo de
      // confirmación ya avisó qué pasaría, así que no hace falta más aviso.
      logout();
      navigate("/");
    } catch {
      setRevocando(null);
      window.alert("No se pudo revocar el equipo. Intenta de nuevo.");
    }
  };

  return (
    <div className="perfil-page">
      <div className="perfil-card">

        {/* Avatar placeholder */}
        <div className="perfil-avatar">
          <User size={56} strokeWidth={1.5} className="perfil-avatar-icon" />
        </div>

        {/* Nombre de usuario */}
        <h2 className="perfil-username">{user?.username ?? "Usuario"}</h2>
        {user?.role === "admin" && (
          <p className="perfil-role">Administrador</p>
        )}

        {/* Equipos de confianza — solo si hay alguno */}
        {equipos.length > 0 && (
          <>
            <hr className="perfil-divider" />
            <div className="perfil-equipos">
              <p className="perfil-equipos-titulo">Equipos de confianza</p>
              <ul className="perfil-equipos-lista">
                {equipos.map((e) => (
                  <li key={e.id} className="perfil-equipo">
                    <div className="perfil-equipo-info">
                      <span className="perfil-equipo-nombre">{e.etiqueta || "Equipo"}</span>
                      <span className="perfil-equipo-fecha">Caduca {fmtFecha(e.expira_en)}</span>
                    </div>
                    <button
                      type="button"
                      className="perfil-equipo-revocar"
                      disabled={revocando === e.id}
                      onClick={() => revocar(e.id)}
                    >
                      {revocando === e.id ? "Revocando…" : "Revocar"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <hr className="perfil-divider" />

        {/* Botón cerrar sesión */}
        <button
          type="button"
          className="perfil-logout-btn"
          onClick={handleLogout}
        >
          Cerrar sesión
        </button>

      </div>
    </div>
  );
}
