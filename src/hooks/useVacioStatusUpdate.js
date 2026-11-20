import { useState, useCallback } from "react";
import { apiClient } from "../api/apiClient";

/**
 * Actualiza por PATCH el status de vacío de un registro, con update optimista y
 * rollback si el servidor falla. El loading es por fila (id), no global.
 *
 * Sirve para dos casos porque solo cambian el recurso y el campo:
 *   - Vacíos:    useVacioStatusUpdate(setVacios)                       → PATCH /vacios/{id}/    { status }
 *   - Maniobras: useVacioStatusUpdate(setManiobras, { recurso: "maniobras", campo: "status_vacio" })
 *                                                                      → PATCH /maniobras/{id}/ { status_vacio }
 *
 * @param {Function} setItems - setState del array del componente padre
 * @param {{recurso?: string, campo?: string}} [opciones]
 */
export function useVacioStatusUpdate(setItems, { recurso = "vacios", campo = "status" } = {}) {
  const [updatingId, setUpdatingId] = useState(null);

  const updateStatus = useCallback(async (item, nuevoStatus) => {
    if (item[campo] === nuevoStatus) return;          // noop
    if (typeof item.id === "undefined") return;

    const statusPrevio = item[campo];

    // Optimista: la fila refleja el cambio antes de que responda el servidor.
    setItems((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, [campo]: nuevoStatus } : x))
    );
    setUpdatingId(item.id);

    try {
      const updated = await apiClient.patch(
        `/${recurso}/${encodeURIComponent(item.id)}/`,
        { [campo]: nuevoStatus }
      );
      // Sincroniza con la respuesta canónica del servidor
      if (updated) {
        setItems((prev) =>
          prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
        );
      }
    } catch (err) {
      // Rollback garantizado ante cualquier error
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, [campo]: statusPrevio } : x))
      );
      throw err; // propaga para que la página muestre la notificación
    } finally {
      setUpdatingId(null);
    }
  }, [setItems, recurso, campo]);

  return { updatingId, updateStatus };
}
