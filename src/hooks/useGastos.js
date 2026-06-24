import { useState, useEffect } from "react";
import { apiClient } from "../api/apiClient";

export const useGastos = () => {
    const [gastos, setGastos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchGastos = async () => {
        try {
            setLoading(true);
            const data = await apiClient.get("/gastos/");
            setGastos(Array.isArray(data) ? data : data.results || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchGastos(); }, []);

    const agregar = async (nuevo) => {
    const { folio, ...datosLimpios } = nuevo;
    await apiClient.post("/gastos/", datosLimpios);
    fetchGastos();
};

const actualizar = async (id, datos) => {
    const { folio, maniobra, ...datosLimpios } = datos;
    await apiClient.put(`/gastos/${id}/`, datosLimpios);
    fetchGastos();
};

    const eliminar = async (id) => {
        await apiClient.delete(`/gastos/${id}/`);
        fetchGastos();
    };

    return { gastos, loading, error, agregar, actualizar, eliminar };
};