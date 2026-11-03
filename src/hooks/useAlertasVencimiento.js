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
  const [error, setError] = useState(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    apiClient
      .get("/alertas-vencimiento/")
      .then((data) => setAlertas(Array.isArray(data) ? data : []))
      .catch((err) => {
        // Antes esto era `.catch(() => setAlertas([]))`: un fallo de red o un token
        // caducado dejaban la pantalla exactamente igual que "no hay nada por vencer".
        // Una póliza a punto de vencer que no llega no puede ser indistinguible de
        // que no exista — el fallo tiene que verse.
        setAlertas([]);
        setError(err?.message || "No se pudieron cargar las alertas");
      })
      .finally(() => setCargando(false));
  }, []);

  return { alertas, cargando, error };
}
