import { useState, useCallback } from "react";
import { apiClient } from "../api/apiClient";

export function useVacioStatusUpdate(setVacios) {
  const [updatingId, setUpdatingId] = useState(null);

  const updateStatus = useCallback(async (vacio, nuevoStatus) => {
    if (vacio.status === nuevoStatus) return;
    if (typeof vacio.id === "undefined") return;

    const previousStatus = vacio.status;

    setVacios((prev) =>
      prev.map((v) => (v.id === vacio.id ? { ...v, status: nuevoStatus } : v))
    );
    setUpdatingId(vacio.id);

    try {
      const updated = await apiClient.patch(
        `/vacios/${encodeURIComponent(vacio.id)}/`,
        { status: nuevoStatus }
      );
      if (updated) {
        setVacios((prev) =>
          prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v))
        );
      }
    } catch (err) {
      setVacios((prev) =>
        prev.map((v) => (v.id === vacio.id ? { ...v, status: previousStatus } : v))
      );
      throw err;
    } finally {
      setUpdatingId(null);
    }
  }, [setVacios]);

  return { updatingId, updateStatus };
}
