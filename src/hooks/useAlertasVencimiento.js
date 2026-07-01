import { useState, useEffect } from "react";
import { apiClient } from "../api/apiClient";

/**
 * useAlertasVencimiento
 * Obtiene las alertas de vencimiento de licencias y pólizas
 * desde el backend (umbral: 30 días).
 * Se llama una vez al montar el componente Home.
 */
export function useAlertasVencimiento() {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    apiClient
      .get("/alertas-vencimiento/")
      .then((data) => setAlertas(Array.isArray(data) ? data : []))
      .catch(() => setAlertas([]))
      .finally(() => setCargando(false));
  }, []);

  return { alertas, cargando };
}
