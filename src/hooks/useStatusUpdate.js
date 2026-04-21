/**
 * useStatusUpdate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook para actualizar el status de una Maniobra via PATCH.
 *
 * Características:
 *  - Usa apiClient.patch (baseURL + auth headers centralizados).
 *  - Optimistic update: el UI refleja el cambio inmediatamente.
 *  - Rollback automático si el servidor devuelve error.
 *  - Valida el statusId contra statusConfig antes de tocar la red.
 *  - Loading por fila (maniobraId), no global.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from "react";
import { apiClient } from "../api/apiClient";
import { isValidStatus } from "../config/statusConfig";

/**
 * @param {Function} setManiobras  - setState del array de maniobras del componente padre
 * @returns {{ updatingId: string|null, updateStatus: Function }}
 */
export function useStatusUpdate(setManiobras) {
  const [updatingId, setUpdatingId] = useState(null);

  const applyLocal = useCallback((id, newStatus) => {
    setManiobras((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
    );
  }, [setManiobras]);

  const updateStatus = useCallback(async (maniobra, newStatus) => {
    // ── Validaciones ──────────────────────────────────────────────────────────
    if (!isValidStatus(newStatus)) {
      console.error(`[useStatusUpdate] Status inválido: "${newStatus}"`);
      return;
    }
    if (maniobra.status === newStatus) return; // noop
    if (typeof maniobra.id === "undefined") {
      console.error("[useStatusUpdate] Maniobra sin id");
      return;
    }

    const previousStatus = maniobra.status;

    // ── Optimistic update ─────────────────────────────────────────────────────
    applyLocal(maniobra.id, newStatus);
    setUpdatingId(maniobra.id);

    try {
      // apiClient.patch ya maneja: baseURL, headers Content-Type, sanitización y errores HTTP
      const updated = await apiClient.patch(
        `/maniobras/${encodeURIComponent(maniobra.id)}/`,
        { status: newStatus }
      );

      // Sincroniza con la respuesta canónica del servidor
      if (updated) {
        setManiobras((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
        );
      }
    } catch (err) {
      // Rollback garantizado ante cualquier error
      applyLocal(maniobra.id, previousStatus);
      throw err; // propaga para que ManiobrasPage muestre la notificación
    } finally {
      setUpdatingId(null);
    }
  }, [applyLocal, setManiobras]);

  return { updatingId, updateStatus };
}