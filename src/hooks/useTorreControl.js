import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/apiClient";

// Las respuestas de los catálogos llegan paginadas o en crudo según el viewset.
const lista = (res) => (Array.isArray(res) ? res : (res?.results ?? []));

/**
 * Datos de la torre de control: las unidades, sus bolitas y sus folios.
 *
 * Una bolita en `bolitas` ES una unidad ocupada. Las libres no se piden ni se
 * guardan: son las unidades que no aparecen ahí. Así no hay dos listas que
 * puedan contradecirse.
 *
 * `asignaciones` es lo que enlaza la torre con Maniobras: un folio por unidad.
 * De la maniobra no se copia nada —ruta, cliente y operador se leen del folio
 * cada vez—, así que editarla allí se refleja aquí sin sincronizar nada.
 */
export function useTorreControl() {
  const [unidades,     setUnidades]     = useState([]);
  const [bolitas,      setBolitas]      = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      apiClient.getCatalogo("/tractos/"),
      apiClient.get("/torre-control/"),
      apiClient.get("/torre-folios/"),
    ])
      .then(([tractos, ocupadas, asignadas]) => {
        if (cancelado) return;
        setUnidades(lista(tractos));
        setBolitas(lista(ocupadas));
        setAsignaciones(lista(asignadas));
      })
      .catch((err) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setCargando(false); });

    return () => { cancelado = true; };
  }, []);

  /** Pone un folio a una unidad. Si ya tenía otro, lo sustituye. */
  const asignarFolio = useCallback(async (tractoId, folio) => {
    const creada = await apiClient.post("/torre-folios/", { tracto: tractoId, folio });
    setAsignaciones((prev) => [...prev.filter((a) => a.tracto !== tractoId), creada]);
    return creada;
  }, []);

  /** Libera la unidad de ese viaje. Las bolitas se quedan donde están. */
  const quitarFolio = useCallback(async (asignacionId) => {
    const previo = asignaciones;
    setAsignaciones((prev) => prev.filter((a) => a.id !== asignacionId));
    try {
      await apiClient.delete(`/torre-folios/${asignacionId}/`);
    } catch (err) {
      setAsignaciones(previo);
      throw err;
    }
  }, [asignaciones]);

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

  /**
   * Devuelve TODAS las bolitas al cajón, del mes que sea.
   *
   * Una petición por bolita y no un endpoint de borrado masivo: son 22 como
   * mucho —el UNIQUE de la tabla lo garantiza— y se lanzan a la vez. Un
   * endpoint nuevo para esto sería una ruta más que mantener, y una ruta que
   * borra en lote es justo la que no quieres tener abierta si un día se cuela
   * un error de permisos.
   */
  const liberarTodas = useCallback(async () => {
    if (!bolitas.length) return;
    const previo = bolitas;
    setBolitas([]);
    try {
      await Promise.all(previo.map((b) => apiClient.delete(`/torre-control/${b.id}/`)));
    } catch (err) {
      // Si alguna falló, la lista local ya no vale: se repone entera y que el
      // usuario vuelva a intentarlo, en vez de dejar el tablero a medias.
      setBolitas(previo);
      throw err;
    }
  }, [bolitas]);

  return {
    unidades, bolitas, asignaciones,
    cargando, error, mover, liberar, liberarTodas, asignarFolio, quitarFolio,
  };
}
