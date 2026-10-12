import { useState, useCallback, useRef } from "react";
import { apiClient } from "../api/apiClient";
import { paraGuardar } from "../utils/reporteViaje.mjs";
import { conValor } from "../components/FiltrosLista/FiltrosLista";

/**
 * useReportesViaje
 * Los reportes de viaje del coordinador. Uno por folio.
 *
 * Paginado en el servidor (PAGE_SIZE=60): a diferencia de Folios o Pendientes,
 * esta tabla crece sin techo. La pantalla la recorre con buscador, no de una vez.
 */
export function useReportesViaje() {
  const [reportes, setReportes] = useState([]);
  // El contador de la pantalla: `count` del servidor, o sea TODOS los que
  // cumplen los filtros, no solo la página de 60 que se pinta.
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  // Al teclear la búsqueda salen varias peticiones: solo vale la última.
  const ultima = useRef(0);

  const normalizar = (data) => (Array.isArray(data) ? data : (data?.results ?? []));

  /** `filtros`: {search, fecha, desde, hasta, mes, coordinador, operador, ruta}. */
  const cargar = useCallback(async (filtros = {}) => {
    const yo = ++ultima.current;
    setCargando(true);
    try {
      const data = await apiClient.get(`/reportes-viaje/?${new URLSearchParams(conValor(filtros))}`);
      if (yo !== ultima.current) return;
      setReportes(normalizar(data));
      setTotal(data?.count ?? normalizar(data).length);
    } finally {
      if (yo === ultima.current) setCargando(false);
    }
  }, []);

  const crear = useCallback(async (datos) => {
    // postAnidado y no post: sanitizarPayload aplastaría `cargas` (lista de
    // objetos) a una lista vacía, y los campos de texto vacíos a null, que el
    // backend rechaza. paraGuardar() ya deja el cuerpo listo.
    const creado = await apiClient.postAnidado("/reportes-viaje/", paraGuardar(datos));
    setReportes((prev) => [creado, ...prev]);
    setTotal((t) => t + 1);
    return creado;
  }, []);

  const actualizar = useCallback(async (id, datos) => {
    const guardado = await apiClient.patchAnidado(`/reportes-viaje/${id}/`, paraGuardar(datos));
    setReportes((prev) => prev.map((r) => (r.id === id ? guardado : r)));
    return guardado;
  }, []);

  const eliminar = useCallback(async (id) => {
    await apiClient.delete(`/reportes-viaje/${id}/`);
    setReportes((prev) => prev.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  /** ¿Ese folio ya tiene reporte? Se pregunta antes de abrir uno nuevo, en vez
   *  de descubrirlo con un 400 al guardar. */
  const buscarPorFolio = useCallback(async (folio) => {
    const encontrados = normalizar(
      await apiClient.get(`/reportes-viaje/?folio=${encodeURIComponent(folio)}`)
    );
    return encontrados[0] ?? null;
  }, []);

  /** Descarga el documento. `formato` es "excel" o "pdf". */
  const descargar = useCallback(async (reporte, formato) => {
    const blob = await apiClient.download(
      `/reportes-viaje/${reporte.id}/documento/?formato=${formato}`, null, "GET",
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_viaje_${reporte.folio}.${formato === "excel" ? "xlsx" : "pdf"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // El objeto vive hasta que se revoca: sin esto, cada descarga se queda en
    // memoria hasta recargar la página.
    window.URL.revokeObjectURL(url);
  }, []);

  return { reportes, total, cargando, cargar, crear, actualizar, eliminar, buscarPorFolio, descargar };
}
