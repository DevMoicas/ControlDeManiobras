import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { Package } from "lucide-react";
import "./VaciosPage.css";

export default function AdminVaciosPage() {
  const { isAdmin } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      // Redirigimos a la página principal si no es administrador
      navigate('/', { replace: true });
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) {
    return (
      <div className="vacios-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <h2>Acceso Denegado</h2>
      </div>
    );
  }

  return (
    <div className="vacios-container">
      <h1 className="vacios-title">
        <Package size={36} className="title-icon" /> Panel de Administración: Vacíos
      </h1>
      
      {/* Restricciones: NO incluyas tablas de datos ni lógica de hooks por ahora. */}
    </div>
  );
}
