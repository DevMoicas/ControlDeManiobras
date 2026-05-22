import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";

const PAGE_SIZE = 60;

// status === "todos" o "vacio" se resuelven en cliente porque "vacio"
// no es un valor real de BD — solo significa status NULL o inválido.
const STATUS_BACKEND = ["activo", "pendiente", "quemada", "por_salir"];

export function useManiobras(filtroStatus = "todos", ordenFecha = "desc") {
  const [maniobras,   setManiobras]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(null);
  const [hasMore,     setHasMore]     = useState(true);

  const pageRef     = useRef(1);
  const fetchingRef = useRef(false);

  // Construye la query string según el filtro activo
  const buildUrl = useCallback((page) => {
  const ordenCampo = ordenFecha === "asc" ? "fecha_pis" : "-fecha_pis";
  const params = new URLSearchParams({
    page,
    page_size: PAGE_SIZE,
    ordering: ordenCampo,
  });

    // Solo los status reales van al backend; "todos" y "vacio" no
    if (STATUS_BACKEND.includes(filtroStatus)) {
      params.set("status", filtroStatus);
    }

    return `/maniobras/?${params.toString()}`;
  }, [filtroStatus, ordenFecha]);

  const fetchPage = useCallback(async (page, isFirstPage = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    isFirstPage ? setLoading(true) : setLoadingMore(true);
    setError(null);

    try {
      const data    = await apiClient.get(buildUrl(page));
      const results = data.results ?? data;

      setManiobras((prev) => isFirstPage ? results : [...prev, ...results]);
      setHasMore(results.length === PAGE_SIZE && Boolean(data.next));
    } catch (err) {
      setError(err.message);
    } finally {
      isFirstPage ? setLoading(false) : setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [buildUrl]);

  // Resetea y recarga desde página 1 cada vez que cambia el filtro
  useEffect(() => {
    pageRef.current = 1;
    setManiobras([]);
    setHasMore(true);
    fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || fetchingRef.current) return;
    pageRef.current += 1;
    fetchPage(pageRef.current, false);
  }, [hasMore, fetchPage]);

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const eliminar = useCallback(async (id) => {
    await apiClient.delete(`/maniobras/${id}/`);
    setManiobras((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const actualizar = useCallback(async (id, datos) => {
    const { id: _omit, ...datosSinId } = datos;
    const resultado = await apiClient.patch(`/maniobras/${id}/`, datosSinId);
    setManiobras((prev) => prev.map((m) => (m.id === id ? resultado : m)));
  }, []);

  const agregar = useCallback(async (datos) => {
    const resultado = await apiClient.post("/maniobras/", datos);
    setManiobras((prev) => [resultado, ...prev]);
  }, []);

  return {
    maniobras,
    setManiobras,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    eliminar,
    actualizar,
    agregar,
  };
}