import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/apiClient";

export function useNoEco(vista) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Fetch al cambiar de pestaña
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get(`/${vista}`)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Cleanup: si el usuario cambia de pestaña antes de que termine, ignora la respuesta
    return () => { cancelled = true; };
  }, [vista]);

  const eliminar = useCallback(
    async (id) => {
      await apiClient.delete(`/${vista}/${id}/`);
      setData((prev) => prev.filter((item) => item.id !== id));
    },
    [vista]
  );

  const guardar = useCallback(
    async (formData, registroEditando) => {
      const editando = Boolean(registroEditando);
      const resultado = editando
        ? await apiClient.put(`/${vista}/${registroEditando.id}/`, formData)
        : await apiClient.post(`/${vista}/`, formData);

      setData((prev) =>
        editando
          ? prev.map((item) => (item.id === registroEditando.id ? resultado : item))
          : [...prev, resultado]
      );

      return editando;
    },
    [vista]
  );

  return { data, loading, error, eliminar, guardar };
}