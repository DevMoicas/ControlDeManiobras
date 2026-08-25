import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";

const PAGE_SIZE = 60;

// "todos" no filtra. "tercero" no es un status: filtra por la columna `tercero`
// vía ?tercero=1 (ver buildUrl), no por ?status. Solo estos cuatro van como ?status.
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
  // Orden por FECHA PIS, que es la columna de la que cuelga la flecha. El id
  // desempata dentro del mismo día: sin él el orden es arbitrario y la
  // paginación de 60 en 60 puede repetir o saltarse filas. Las maniobras sin
  // fecha van al final (lo pone el backend, ver OrdenNullsLast).
  // desc = de la fecha más próxima hacia atrás. El status no influye.
  //
  // sin_entrega va SIEMPRE primero y no se invierte con la flecha: las que aún
  // no tienen FECHA DE ENTREGA están pendientes de que se la pongan y en medio
  // de la lista se pierden. Es un campo de orden virtual del backend (0 sin
  // fecha, 1 con ella), no una columna de la tabla.
  const ordenCampo = ordenFecha === "asc"
    ? "sin_entrega,fecha_pis,id"
    : "sin_entrega,-fecha_pis,-id";
  const params = new URLSearchParams({
    page,
    page_size: PAGE_SIZE,
    ordering: ordenCampo,
  });

    // Solo los status reales van como ?status; "todos" no filtra.
    // "tercero" filtra por la bandera de tercero (?tercero=1), no por status.
    if (STATUS_BACKEND.includes(filtroStatus)) {
      params.set("status", filtroStatus);
    } else if (filtroStatus === "tercero") {
      params.set("tercero", "1");
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