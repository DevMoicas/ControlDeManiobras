import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/apiClient";

// Las respuestas de los catálogos llegan paginadas o en crudo según el viewset.
const lista = (res) => (Array.isArray(res) ? res : (res?.results ?? []));

/**
 * Datos de la torre de control: las unidades y cuáles están ocupadas.
 *
 * Una bolita en `bolitas` ES una unidad ocupada. Las libres no se piden ni se
 * guardan: son las unidades que no aparecen ahí. Así no hay dos listas que
 * puedan contradecirse.
 */
export function useTorreControl() {
  const [unidades, setUnidades] = useState([]);
  const [bolitas,  setBolitas]  = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      apiClient.getCatalogo("/tractos/"),
      apiClient.get("/torre-control/"),
    ])
      .then(([tractos, ocupadas]) => {
        if (cancelado) return;
        setUnidades(lista(tractos));
        setBolitas(lista(ocupadas));
      })
      .catch((err) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setCargando(false); });

    return () => { cancelado = true; };
  }, []);

  const buscar = useCallback(
    (tractoId, indice) =>
      bolitas.find((b) => b.tracto === tractoId && b.indice === indice),
    [bolitas],
  );

  /** Coloca o mueve la bolita de una unidad al día indicado. */
  const mover = useCallback(async (tractoId, indice, fecha) => {
    const existente = buscar(tractoId, indice);
    if (existente?.fecha === fecha) return;   // soltada donde ya estaba

    if (!existente) {
      // Alta sin optimismo: el id lo pone el servidor y pintar una bolita con
      // un id inventado obliga a reconciliarlo después. Es una petición corta.
      const creada = await apiClient.post("/torre-control/", {
        tracto: tractoId, indice, fecha,
      });
      setBolitas((prev) => [...prev, creada]);
      return;
    }

    // Mover sí es optimista: es el gesto que se repite y ya tiene id, así que
    // la vuelta atrás es reponer la lista anterior.
    const previo = bolitas;
    setBolitas((prev) => prev.map((b) => (b.id === existente.id ? { ...b, fecha } : b)));
    try {
      await apiClient.patch(`/torre-control/${existente.id}/`, { fecha });
    } catch (err) {
      setBolitas(previo);
      throw err;
    }
  }, [bolitas, buscar]);

  /** Devuelve una unidad a UNIDADES LIBRES: la bolita deja de existir. */
  const liberar = useCallback(async (tractoId, indice) => {
    const existente = buscar(tractoId, indice);
    if (!existente) return;                    // ya estaba libre

    const previo = bolitas;
    setBolitas((prev) => prev.filter((b) => b.id !== existente.id));
    try {
      await apiClient.delete(`/torre-control/${existente.id}/`);
    } catch (err) {
      setBolitas(previo);
      throw err;
    }
  }, [bolitas, buscar]);

  return { unidades, bolitas, cargando, error, mover, liberar };
}
