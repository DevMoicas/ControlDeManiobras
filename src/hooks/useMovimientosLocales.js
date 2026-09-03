import { useState, useCallback } from "react";
import { apiClient } from "../api/apiClient";
import { useAlerta } from "../components/Alertas/Alertas";

const PAGE_SIZE = 60;

export function useMovimientosLocales() {
  const [movimientos,   setMovimientos]   = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [hayMas,        setHayMas]        = useState(true);
  const [pagina,        setPagina]        = useState(1);
  // Los avisos van a la pila global de la app. Aquí solo se conserva la firma
  // mostrarNotif(msg, tipo) para no tocar ninguno de los sitios que la llaman.
  const alerta = useAlerta();
  const mostrarNotif = useCallback((msg, tipo = "exito") => alerta({ tipo, msg }), [alerta]);

  // ── Fetch con filtro de status y búsqueda ─────────────────────────────────
  const fetchMovimientos = useCallback(
    async ({ reset = false, status = "todos", search = "" } = {}) => {
      if (cargando) return;
      const paginaActual = reset ? 1 : pagina;
      setCargando(true);
      try {
        const params = new URLSearchParams();
        params.set("page",      paginaActual);
        params.set("page_size", PAGE_SIZE);
        if (status && status !== "todos") params.set("status", status);
        if (search.trim()) params.set("search", search.trim());

        const data = await apiClient.get(`/movimientos-locales/?${params.toString()}`);

        const resultados = Array.isArray(data) ? data : (data?.results ?? []);
        const total      = data?.count ?? resultados.length;

        if (reset) {
          setMovimientos(resultados);
          setPagina(2);
        } else {
          setMovimientos((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            return [...prev, ...resultados.filter((m) => !ids.has(m.id))];
          });
          setPagina((p) => p + 1);
        }
        setHayMas(resultados.length === PAGE_SIZE && movimientos.length + resultados.length < total);
      } catch {
        mostrarNotif("Error al cargar movimientos.", "error");
      } finally {
        setCargando(false);
      }
    },
    [cargando, pagina, movimientos.length, mostrarNotif]
  );

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const agregar = useCallback(
    async (datos) => {
      try {
        const nuevo = await apiClient.post("/movimientos-locales/", datos);
        setMovimientos((prev) => [nuevo, ...prev]);
        mostrarNotif("Movimiento agregado.");
        return nuevo;
      } catch (err) {
        mostrarNotif(err.message || "Error al agregar movimiento.", "error");
        return null;
      }
    },
    [mostrarNotif]
  );

  const actualizar = useCallback(
    async (id, cambios) => {
      try {
        const actualizado = await apiClient.patch(`/movimientos-locales/${id}/`, cambios);
        setMovimientos((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...actualizado } : m))
        );
        mostrarNotif("Movimiento actualizado.");
        return actualizado;
      } catch (err) {
        mostrarNotif(err.message || "Error al actualizar movimiento.", "error");
        return null;
      }
    },
    [mostrarNotif]
  );

  const eliminar = useCallback(
    async (id) => {
      try {
        await apiClient.delete(`/movimientos-locales/${id}/`);
        setMovimientos((prev) => prev.filter((m) => m.id !== id));
        mostrarNotif("Movimiento eliminado.");
      } catch {
        mostrarNotif("Error al eliminar movimiento.", "error");
      }
    },
    [mostrarNotif]
  );

  return {
    movimientos,
    cargando,
    hayMas,
    fetchMovimientos,
    agregar,
    actualizar,
    eliminar,
  };
}
