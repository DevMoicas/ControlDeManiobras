// src/pages/PerfilPage.jsx
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { User } from "lucide-react";
import "./PerfilPage.css";

export default function PerfilPage() {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
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