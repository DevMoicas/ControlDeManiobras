import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/apiClient";

const MANIOBRA_VACIA = {
  solicita:   "",
  agencia:    "",
  codigo_pis: "",
  terminal:   "",
  placas_pis: "",
  fecha_pis:  "",
  horario:    "",
};

export function useManiobras() {
  const [maniobras, setManiobras] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get("/maniobras/");
      // Ordenamos por id ascendente en el cliente
      setManiobras([...data].sort((a, b) => Number(a.id) - Number(b.id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const eliminar = useCallback(async (id) => {
    await apiClient.delete(`/maniobras/${id}/`);
    setManiobras((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const actualizar = useCallback(async (id, datos) => {
    const { id: _omit, ...datosSinId } = datos;
    const resultado = await apiClient.patch(`/maniobras/${id}/`, datosSinId);
    setManiobras((prev) =>
      prev.map((m) => (m.id === id ? resultado : m))
    );
  }, []);

  const agregar = useCallback(async (datos) => {
    const resultado = await apiClient.post("/maniobras/", datos);
    setManiobras((prev) =>
      [...prev, resultado].sort((a, b) => Number(a.id) - Number(b.id))
    );
  }, []);

  return { maniobras, loading, error, eliminar, actualizar, agregar, MANIOBRA_VACIA };
}