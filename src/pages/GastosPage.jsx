import { useAuthContext } from "../context/AuthContext";
import { useNavigate } from 'react-router-dom';
import { Receipt } from "lucide-react";
import "./GastosPage.css";

export default function GastosPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuthContext();

  return (
    <div className="gastos-page">
      {isAdmin && (
        <div className="gastos-topbar">
          <button
            type="button"
            className="gastos-admin-btn"
            aria-label="Opciones de administrador"
            onClick={() => navigate('../admin-gastos')}
          >
            ⚙ Admin Gastos
          </button>
        </div>
      )}

      <div className="gastos-title-wrapper">
        <Receipt size={35} strokeWidth={2.5} className="gastos-title-icon" aria-hidden="true" />
        <h1 className="gastos-title">Gastos</h1>
      </div>

      {/* Contenido futuro de la página */}
    </div>
  );
}