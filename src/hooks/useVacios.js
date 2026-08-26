import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";
import { useAutoRefresco } from "./useAutoRefresco";

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

  // ── Refresco automático ───────────────────────────────────────────────────
  // Lo que cambió desde la última vez, fusionado por id sobre lo que ya hay en
  // pantalla. NO se reemplaza la lista entera: eso repintaría las 60 filas y
  // devolvería el scroll infinito al principio.
  const [recienCambiados, setRecienCambiados] = useState([]);

  const aplicarCambios = useCallback(async ({ desde, hayBorrados }) => {
    // Alguien borró una fila. No hay forma de saber CUÁL sin volver a preguntar
    // —una fila borrada no aparece en ninguna lista—, así que toca recargar.
    // ponytail: se recarga solo la primera página y se pierde el scroll de las
    // siguientes. Los borrados exigen admin y son excepcionales; si algún día
    // dejan de serlo, el arreglo es pedir los ids vivos y filtrar en cliente.
    if (hayBorrados) {
      pageRef.current = 1;
      fetchPage(1, true);
      return;
    }

    const params = new URLSearchParams({ page_size: PAGE_SIZE, ordering: "-id" });
    if (desde) params.set("modificado_desde", desde);
    if (STATUS_BACKEND.includes(filtroStatus)) params.set("status", filtroStatus);
    else if (filtroStatus === "reprogramado") params.set("reprogramado", "true");

    try {
      const data     = await apiClient.get(`/vacios/?${params.toString()}`);
      const cambiados = Array.isArray(data.results) ? data.results : data;
      if (!cambiados.length) return;

      setVacios((prev) => {
        const pendientes = new Map(cambiados.map((v) => [v.id, v]));
        // Las que ya estaban se sustituyen en su sitio; conservar el objeto
        // original cuando no cambió deja que React se salte esa fila entera.
        const mezclado = prev.map((v) => {
          const nuevo = pendientes.get(v.id);
          if (!nuevo) return v;
          pendientes.delete(v.id);
          return nuevo;
        });
        // Lo que sobra son altas: arriba, que es donde las pone ordering=-id.
        return [...pendientes.values(), ...mezclado];
      });

      // Para que el cambio se NOTE en vez de colarse: la fila parpadea un
      // segundo. Sin esto el riesgo no es el parpadeo, es lo contrario.
      setRecienCambiados(cambiados.map((v) => v.id));
    } catch {
      // Igual que en el sondeo: se reintentará solo en el siguiente cambio.
    }
  }, [fetchPage, filtroStatus]);

  // El resaltado se retira solo. Si la clase se quedara puesta, la MISMA fila
  // cambiando dos veces seguidas no volveria a parpadear: la animacion solo se
  // dispara al ENTRAR la clase, no al repetirse el valor.
  useEffect(() => {
    if (!recienCambiados.length) return;
    const id = setTimeout(() => setRecienCambiados([]), 1500);
    return () => clearTimeout(id);
  }, [recienCambiados]);

  useAutoRefresco("vacios", aplicarCambios, {
    // El reloj mira lo mismo que la tabla: con el filtro puesto, un vacío que
    // pasa a entregado sale de la vista y se nota como una baja del contador.
    query: STATUS_BACKEND.includes(filtroStatus)
      ? `status=${filtroStatus}`
      : filtroStatus === "reprogramado" ? "reprogramado=true" : "",
  });

  return {
    recienCambiados,
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
