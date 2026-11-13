import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";
import { prepararPayload } from "../utils/formulaSuma.mjs";
import { useAutoRefresco } from "./useAutoRefresco";

const PAGE_SIZE = 60;

export const useGastos = () => {
    const [gastos, setGastos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(true);

    const pageRef = useRef(1);
    const fetchingRef = useRef(false);

    const fetchPage = useCallback(async (page, isFirstPage = false) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        isFirstPage ? setLoading(true) : setLoadingMore(true);
        setError(null);

        try {
            // Sin `ordering`: el orden lo pone GastoViewSet.get_queryset() —fecha
            // de entrega de la mas nueva a la mas vieja, con el id de desempate—
            // y este endpoint no tiene OrderingFilter, asi que el parametro que
            // habia aqui no hacia nada y solo sugeria que se podia cambiar.
            const data = await apiClient.get(
                `/gastos/?page=${page}&page_size=${PAGE_SIZE}`
            );
            const results = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);

            setGastos((prev) => isFirstPage ? results : [...prev, ...results]);
            setHasMore(results.length === PAGE_SIZE && Boolean(data.next));
        } catch (err) {
            setError(err.message);
        } finally {
            isFirstPage ? setLoading(false) : setLoadingMore(false);
            fetchingRef.current = false;
        }
    }, []);

    // Carga inicial
    useEffect(() => {
        pageRef.current = 1;
        fetchPage(1, true);
    }, [fetchPage]);

    const loadMore = useCallback(() => {
        if (!hasMore || fetchingRef.current) return;
        pageRef.current += 1;
        fetchPage(pageRef.current, false);
    }, [hasMore, fetchPage]);

    const agregar = useCallback(async (nuevo) => {
        const { folio, ...datosLimpios } = nuevo;
        // Las celdas de dinero admiten el desglose de Excel ("=150+230"): la
        // columna se lleva el total y el texto de la fórmula viaja en
        // `formulas`, para poder volver a enseñarlo al editar. Se hace aquí,
        // que es por donde pasan la fila nueva, el modal y la celda editable.
        // Ver utils/formulaSuma.mjs.
        const resultado = await apiClient.post("/gastos/", prepararPayload(datosLimpios));
        setGastos((prev) => [resultado, ...prev]);
    }, []);

    const actualizar = useCallback(async (id, datos) => {
        const { folio, maniobra, ...datosLimpios } = datos;
        const resultado = await apiClient.put(`/gastos/${id}/`, prepararPayload(datosLimpios));
        setGastos((prev) => prev.map((g) => (g.id === id ? resultado : g)));
    }, []);

    const eliminar = useCallback(async (id) => {
        await apiClient.delete(`/gastos/${id}/`);
        setGastos((prev) => prev.filter((g) => g.id !== id));
    }, []);

    // Refresco automático, como en Vacíos: el gasto nace (o se borra) al poner
    // o quitar el folio en Maniobras, y tiene que verse aquí sin recargar.
    const aplicarCambios = useCallback(async ({ desde, hayBorrados }) => {
        // ponytail: un borrado recarga la primera página y pierde el scroll; mismo
        // compromiso que useVacios.
        if (hayBorrados) {
            pageRef.current = 1;
            fetchPage(1, true);
            return;
        }
        const params = new URLSearchParams({ page_size: PAGE_SIZE });
        if (desde) params.set("modificado_desde", desde);
        try {
            const data = await apiClient.get(`/gastos/?${params.toString()}`);
            const cambiados = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
            if (!cambiados.length) return;
            setGastos((prev) => {
                const pendientes = new Map(cambiados.map((g) => [g.id, g]));
                const mezclado = prev.map((g) => {
                    const nuevo = pendientes.get(g.id);
                    if (!nuevo) return g;
                    pendientes.delete(g.id);
                    return nuevo;
                });
                // Las altas, arriba: es donde se buscan, aunque aún no tengan fecha.
                return [...pendientes.values(), ...mezclado];
            });
        } catch {
            // Se reintenta en el siguiente cambio.
        }
    }, [fetchPage]);

    useAutoRefresco("gastos", aplicarCambios);

    return {
        gastos, loading, loadingMore, hasMore, error,
        loadMore, agregar, actualizar, eliminar,
    };
};
