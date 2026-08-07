import { useState, useCallback, useRef, useEffect } from "react";
import { apiClient } from "../api/apiClient";

// Dos arrays de estado independientes (uno por tabla) para que editar una no
// re-renderice la otra. Sin paginación: /folios/ devuelve la lista completa.
export function useFolios() {
  const [foliosManzanillo, setFoliosManzanillo] = useState([]);
  const [foliosLazaro,     setFoliosLazaro]     = useState([]);
  const [cargando, setCargando] = useState(false);
  const [notif,    setNotif]    = useState(null);
  const notifTimer = useRef(null);

  const mostrarNotif = useCallback((msg, tipo = "exito") => {
    clearTimeout(notifTimer.current);
    setNotif({ msg, tipo });
    notifTimer.current = setTimeout(() => setNotif(null), 3000);
  }, []);

  const setterDe = (tabla) => (tabla === "manzanillo" ? setFoliosManzanillo : setFoliosLazaro);
  const normalizar = (data) => (Array.isArray(data) ? data : (data?.results ?? []));

  const cargarFolios = useCallback(async () => {
    setCargando(true);
    try {
      const [mzo, lzc] = await Promise.all([
        apiClient.get("/folios/?tabla=manzanillo"),
        apiClient.get("/folios/?tabla=lazaro"),
      ]);
      setFoliosManzanillo(normalizar(mzo));
      setFoliosLazaro(normalizar(lzc));
    } catch {
      mostrarNotif("Error al cargar folios.", "error");
    } finally {
      setCargando(false);
    }
  }, [mostrarNotif]);

  const anadirFolios = useCallback(async (tabla) => {
    try {
      const nuevos = await apiClient.post("/folios/generar/", { tabla });
      setterDe(tabla)((prev) => [...prev, ...nuevos]);
      mostrarNotif("Folios añadidos.");
    } catch (err) {
      mostrarNotif(err.message || "Error al añadir folios.", "error");
    }
  }, [mostrarNotif]);

  // campo: "codigo" | "asignacion" — las dos columnas se editan igual.
  const actualizarCampo = useCallback(async (tabla, id, campo, valor) => {
    try {
      const actualizado = await apiClient.patch(`/folios/${id}/`, { [campo]: valor });
      setterDe(tabla)((prev) => prev.map((f) => (f.id === id ? { ...f, ...actualizado } : f)));
      return true;
    } catch (err) {
      mostrarNotif(err.message || "Error al actualizar el folio.", "error");
      return false;
    }
  }, [mostrarNotif]);

  useEffect(() => () => clearTimeout(notifTimer.current), []);

  return { foliosManzanillo, foliosLazaro, cargando, notif, cargarFolios, anadirFolios, actualizarCampo };
}
