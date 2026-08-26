import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";

const PAGE_SIZE = 60;

export const VACIO_VACIO = {
  contenedor: "",
  tipo_contenedor: "",
  patio: "",
  fecha_maniobra: "",
  fecha_entrega: "",
  fecha_notificacion_cliente: "",
  // Los vacios nacen pendientes, se agreguen a mano o los cree el automatismo
  // del folio (api/views.py, _crear_vacios_del_folio).
  status: "pendiente",
  status_eir: "",
  operador: "",
  operador_entrega: "",
  cita: "",
  cd: "",
  coordinador: "",
  reprogramado: false,
  fecha_reprogramacion: "",
};

// filtroStatus: "pendiente" (default) | "entregado" | "reprogramado" | "todos".
// El filtro se resuelve en el backend: la página tiene scroll infinito paginado,
// así que filtrar en cliente solo cubriría lo ya cargado. "todos" no filtra.
//
// "reprogramado" NO es un valor de `status`: es una columna propia, porque un
// vacío entregado también puede estar reprogramado. Por eso va por ?reprogramado
// y no por ?status — mismo caso que "tercero" en useManiobras.
const STATUS_BACKEND = ["pendiente", "entregado"];
export function useVacios(filtroStatus = "pendiente") {
  const [vacios,      setVacios]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(null);
  const [hasMore,     setHasMore]     = useState(true);

  const pageRef     = useRef(1);
  const fetchingRef = useRef(false);

  const buildUrl = useCallback((page) => {
    const params = new URLSearchParams({
      page,
      page_size: PAGE_SIZE,
      ordering: "-id",
    });
    if (STATUS_BACKEND.includes(filtroStatus)) {
      params.set("status", filtroStatus);
    } else if (filtroStatus === "reprogramado") {
      params.set("reprogramado", "true");
    }
    return `/vacios/?${params.toString()}`;
  }, [filtroStatus]);

  const fetchPage = useCallback(async (page, isFirstPage = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    isFirstPage ? setLoading(true) : setLoadingMore(true);
    setError(null);

    try {
      const data    = await apiClient.get(buildUrl(page));
      const results = Array.isArray(data.results) ? data.results : data;

      setVacios((prev) => isFirstPage ? results : [...prev, ...results]);
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
    setVacios([]);
    setHasMore(true);
    fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || fetchingRef.current) return;
    pageRef.current += 1;
    fetchPage(pageRef.current, false);
  }, [hasMore, fetchPage]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const eliminar = useCallback(async (id) => {
    await apiClient.delete(`/vacios/${id}/`);
    setVacios((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const actualizar = useCallback(async (id, datos) => {
    const { id: _omit, ...datosSinId } = datos;
    const resultado = await apiClient.patch(`/vacios/${id}/`, datosSinId);
    setVacios((prev) => prev.map((v) => (v.id === id ? resultado : v)));
  }, []);

  const agregar = useCallback(async (datos) => {
    const resultado = await apiClient.post("/vacios/", datos);
    setVacios((prev) => [resultado, ...prev]);
  }, []);

  return {
    vacios,
    setVacios,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    eliminar,
    actualizar,
    agregar,
    VACIO_VACIO,
  };
}
