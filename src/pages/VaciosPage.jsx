import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import { useAuthContext } from "../context/AuthContext";
import SearchBar from "../components/SearchBar/SearchBar";
import "./VaciosPage.css";

export default function VaciosPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const { isAdmin } = useAuthContext();

  return (
    <div className="vacios-container">
      {isAdmin && (
        <button 
          className="vacios-admin-btn" 
          onClick={() => navigate('../admin-vacios')}
        >
          ⚙ Admin Vacíos
        </button>
      )}

      <h1 className="vacios-title">
        <Package size={36} className="title-icon" /> Vacíos
      </h1>
      
      {/* BARRA DE BÚSQUEDA */}
      <SearchBar value={searchTerm} onChange={setSearchTerm} />

      {/* Aquí iría el resto del contenido de Vacíos (Tabla, etc) */}
    </div>
  );
}