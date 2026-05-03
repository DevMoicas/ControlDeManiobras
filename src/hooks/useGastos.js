import { useState, useEffect } from "react";

export const useGastos = () => {
    const [gastos, setGastos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchGastos = async () => {
        try {
            setLoading(true);
            const response = await fetch("http://127.0.0.1:8000/api/gastos/");
            const data = await response.json();
            setGastos(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchGastos(); }, []);

    const agregar = async (nuevo) => {
        const response = await fetch("http://127.0.0.1:8000/api/gastos/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nuevo),
        });
        if (response.ok) fetchGastos();
    };

    const actualizar = async (id, datos) => {
        const response = await fetch(`http://127.0.0.1:8000/api/gastos/${id}/`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos),
        });
        if (response.ok) fetchGastos();
    };

    const eliminar = async (id) => {
        const response = await fetch(`http://127.0.0.1:8000/api/gastos/${id}/`, {
            method: "DELETE",
        });
        if (response.ok) fetchGastos();
    };

    return { gastos, loading, error, agregar, actualizar, eliminar };
};