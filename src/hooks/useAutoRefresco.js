import { useEffect, useRef } from "react";
import { apiClient } from "../api/apiClient";

/**
 * Avisa cuando otra persona cambia algo en una tabla, sin recargar la página.
 *
 * Pregunta al servidor cada pocos segundos "¿ha cambiado algo?" (dos números:
 * la última modificación y cuántas filas hay) y solo llama a `onCambio` cuando
 * esos números se mueven. La respuesta pesa ~40 bytes, así que preguntar es
 * gratis; los datos se piden únicamente cuando de verdad hay algo nuevo.
 *
 * ── Si algún día hace falta tiempo real de verdad ────────────────────────────
 * Este hook es la ÚNICA pieza que habría que cambiar. Sustituir el temporizador
 * de aquí abajo por un WebSocket que llame a `onCambio(reloj)` al recibir un
 * aviso del servidor deja intacto todo lo demás: las páginas, los hooks de datos
 * y la fusión por id siguen igual, porque solo consumen `onCambio`.
 *
 * Lo que costaría (medido el 2026-08-26): Django Channels sobre ASGI y un Redis
 * de ~$16.50/mes, más que el sistema entero — la factura real de Azure fue de
 * $16.55 ese mes. A cambio se ganan los 3 segundos de retraso de este sondeo.
 * Por eso hoy es un temporizador y no un socket.
 *
 * @param {string}   recurso   "maniobras" | "vacios" (el prefijo de la API)
 * @param {function} onCambio  recibe { desde, hayBorrados } cuando algo cambió.
 *                             `desde` es la marca anterior, para pedir solo lo
 *                             tocado después; `hayBorrados` avisa de que el
 *                             número de filas bajó y no basta con fusionar.
 * @param {object}  [opciones]
 * @param {number}  [opciones.intervaloMs=3000]
 * @param {boolean} [opciones.activo=true]  en false, no sondea (pantalla oculta,
 *                                          sesión cerrada, modal a pantalla completa…)
 * @param {string}  [opciones.query=""]     filtros de la vista ("status=pendiente"),
 *                                          para que el reloj mire lo mismo que la tabla
 */
export function useAutoRefresco(recurso, onCambio, opciones = {}) {
  const { intervaloMs = 3000, activo = true, query = "" } = opciones;

  // El reloj visto por última vez. En una ref y no en estado: cambia en cada
  // tick y no debe repintar nada por sí mismo.
  const relojRef = useRef(null);
  // onCambio se redefine en cada render de quien nos usa; guardarla en una ref
  // evita reiniciar el temporizador (y perder el tick en curso) cada vez.
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  useEffect(() => {
    if (!activo) return;

    // Al cambiar de filtro, el reloj anterior ya no describe lo que se está
    // mirando: se descarta para que el primer tick solo tome referencia.
    relojRef.current = null;

    let cancelado = false;

    const tick = async () => {
      // 1. La pestaña en segundo plano no necesita estar al día: nadie la mira,
      //    y el navegador ya frena los temporizadores de las pestañas ocultas.
      //    Al volver, el primer tick trae todo lo que se perdió de una vez.
      if (document.hidden) return;

      // 2. No pisar a quien está escribiendo. El estado de edición vive DENTRO
      //    de CeldaEditable (a propósito: si viviera en la página, cada tecla
      //    repintaría todas las filas), así que no se puede consultar desde
      //    aquí. El foco del navegador sí, y cubre más casos: la celda abierta,
      //    la fila nueva a medio llenar, los modales y los selectores.
      //    Se salta el tick entero; el siguiente llega en 3 segundos.
      const foco = document.activeElement;
      if (foco && ["INPUT", "TEXTAREA", "SELECT"].includes(foco.tagName)) return;

      try {
        const reloj = await apiClient.get(`/${recurso}/cambios/${query ? `?${query}` : ""}`);
        if (cancelado) return;

        const previo = relojRef.current;
        relojRef.current = reloj;

        // Primer tick: solo tomar referencia. Sin esto, al abrir la pantalla se
        // dispararía un refresco de algo que se acaba de cargar.
        if (previo === null) return;

        if (reloj.t === previo.t && reloj.n === previo.n) return;

        onCambioRef.current({
          desde: previo.t,
          // Menos filas que antes = alguien borró. La fila que se va no baja la
          // fecha máxima de las que quedan, así que sin este contador el borrado
          // sería invisible y la fila fantasma se quedaría en pantalla.
          hayBorrados: reloj.n < previo.n,
        });
      } catch {
        // Un fallo de red no debe romper la pantalla ni llenar la consola: se
        // reintenta en el siguiente tick. El reloj se queda como estaba, así que
        // cuando la red vuelva se detectará todo lo ocurrido mientras tanto.
      }
    };

    const id = setInterval(tick, intervaloMs);
    // Al volver a la pestaña, no esperar al siguiente tick.
    document.addEventListener("visibilitychange", tick);
    tick();

    return () => {
      cancelado = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [recurso, intervaloMs, activo, query]);
}

export default useAutoRefresco;
