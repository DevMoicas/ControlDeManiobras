import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/apiClient";

const VACIO_VACIO = {
  contenedor: "",
  patio: "",
  fecha_maniobra: "",
  fecha_entrega: "",
  fecha_notificacion_cliente: "",
  status: "",
  operador: "",
  cita: "",
  cd: "",
};

export function useVacios() {
  const [vacios, setVacios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargarDatos = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const data = await apiClient.get("/vacios/");
    const lista = Array.isArray(data.results) ? data.results : [];
    setVacios(lista.sort((a, b) => Number(a.id) - Number(b.id)));
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const eliminar = useCallback(async (id) => {
    await apiClient.delete(`/vacios/${id}/`);
    setVacios((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const actualizar = useCallback(async (id, datos) => {
    const { id: _omit, ...datosSinId } = datos;
    const resultado = await apiClient.patch(`/vacios/${id}/`, datosSinId);
    setVacios((prev) =>
      prev.map((v) => (v.id === id ? resultado : v))
    );
  }, []);

  const agregar = useCallback(async (datos) => {
    const resultado = await apiClient.post("/vacios/", datos);
    setVacios((prev) =>
      [...prev, resultado].sort((a, b) => Number(a.id) - Number(b.id))
    );
  }, []);

  return { vacios, setVacios, loading, error, eliminar, actualizar, agregar, VACIO_VACIO };
}
