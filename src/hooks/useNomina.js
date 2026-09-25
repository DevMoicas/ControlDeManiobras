import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/apiClient";
import { prepararPayload, CAMPOS_CON_FORMULA_NOMINA } from "../utils/formulaSuma.mjs";

/**
 * La tabla de Nómina: el catálogo de empleados con lo que se les captura.
 *
 * Sin paginar y sin `loadMore`, al revés que useGastos: son los empleados de la
 * empresa, no una tabla que crezca sin techo, y el endpoint los devuelve todos.
 *
 * Se direcciona por el id del EMPLEADO y no por el de la fila de nómina: un
 * empleado al que nadie le ha puesto sueldo todavía no TIENE fila (la crea el
 * backend en la primera escritura), así que su id es el único que la pantalla
 * conoce siempre.
 */

// Los DecimalField del backend rechazan "" (no es un número). Se manda null, que
// es lo que significa "sin capturar" — y es lo que deja la celda vacía al
// borrarla, en vez de un cero que se lee como un sueldo de cero.
const NUMERICOS = ["sueldo", "dias_tomados", "finiquito"];

export function useNomina() {
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get("/nomina/");
      setFilas(Array.isArray(data) ? data : (data?.results ?? []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /**
   * Guarda UNA celda. Devuelve la fila que responde el backend.
   *
   * Se manda solo el campo tocado y no la fila entera: la prima, los días de
   * vacaciones y la antigüedad son calculados y read_only, así que reenviarlos
   * sería mandar de vuelta lo que el servidor acaba de decir.
   */
  const guardar = useCallback(async (fila, campo, valor) => {
    const limpio = NUMERICOS.includes(campo) && String(valor ?? "").trim() === ""
      ? null
      : valor;
    // DÍAS TOMADOS admite el desglose de Excel ("=5+3"): la columna se lleva el
    // total y el texto viaja en `formulas`, para volver a enseñarlo al editar.
    // `formulas` se manda entero porque prepararPayload también OLVIDA la vieja
    // cuando su celda deja de valer lo que suma. Ver utils/formulaSuma.mjs.
    const payload = prepararPayload(
      { [campo]: limpio, formulas: fila.formulas ?? {} },
      CAMPOS_CON_FORMULA_NOMINA,
    );
    const resultado = await apiClient.patch(`/nomina/${fila.empleado}/`, payload);
    setFilas((prev) => prev.map((f) => (f.empleado === fila.empleado ? resultado : f)));
    return resultado;
  }, []);

  return { filas, loading, error, guardar, recargar: cargar };
}
