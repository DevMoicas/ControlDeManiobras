import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";

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
            const data = await apiClient.get(
                `/gastos/?page=${page}&page_size=${PAGE_SIZE}&ordering=-id`
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
        const resultado = await apiClient.post("/gastos/", datosLimpios);
        setGastos((prev) => [resultado, ...prev]);
    }, []);

    const actualizar = useCallback(async (id, datos) => {
        const { folio, maniobra, ...datosLimpios } = datos;
        const resultado = await apiClient.put(`/gastos/${id}/`, datosLimpios);
        setGastos((prev) => prev.map((g) => (g.id === id ? resultado : g)));
    }, []);

    const eliminar = useCallback(async (id) => {
        await apiClient.delete(`/gastos/${id}/`);
        setGastos((prev) => prev.filter((g) => g.id !== id));
    }, []);

    return {
        gastos, loading, loadingMore, hasMore, error,
        loadMore, agregar, actualizar, eliminar,
    };
};
