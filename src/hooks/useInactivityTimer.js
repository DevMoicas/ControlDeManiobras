import { useEffect, useRef, useCallback } from "react";
import { estadoInicial, conActividad, conAceptar, conTick } from "./inactividad.mjs";

const TICK_MS = 10_000;  // verificar cada 10 segundos

// Eventos que cuentan como actividad del usuario.
const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "touchstart"];

/**
 * useInactivityTimer
 *
 * Avisa a los 10 min de inactividad y expira a los 20. La lógica vive en
 * ./inactividad.mjs (pura y con pruebas); aquí solo están los listeners,
 * el intervalo y el puente con React.
 *
 * Mientras el aviso está en pantalla la actividad NO cuenta: el contador sigue
 * corriendo hacia los 20 min hasta que el usuario pulsa Aceptar. Aceptar
 * tampoco reinicia por sí solo — hace falta interactuar después.
 *
 * Props:
 *   enabled   boolean         — activa el timer (solo cuando hay sesión)
 *   onWarn    function(true)  — al llegar a 10 min. Ocultar el aviso es de
 *                               quien llama, vía confirmarAviso()
 *   onExpire  function()      — al llegar a 20 min
 *
 * Devuelve:
 *   confirmarAviso  function() — el usuario aceptó: la actividad vuelve a contar
 */
export function useInactivityTimer({ enabled, onWarn, onExpire }) {
  const estadoRef = useRef(estadoInicial(Date.now()));

  const resetActivity = useCallback(() => {
    estadoRef.current = conActividad(estadoRef.current, Date.now());
  }, []);

  const confirmarAviso = useCallback(() => {
    estadoRef.current = conAceptar(estadoRef.current);
  }, []);

  useEffect(() => {
    if (!enabled) {
      estadoRef.current = estadoInicial(Date.now());  // limpiar tras el logout
      return;
    }

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, resetActivity, { passive: true })
    );

    const tick = setInterval(() => {
      const { estado, accion } = conTick(estadoRef.current, Date.now());
      estadoRef.current = estado;

      if (accion === "expirar") onExpire();
      else if (accion === "avisar") onWarn(true);
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, resetActivity)
      );
      clearInterval(tick);
    };
  }, [enabled, resetActivity, onWarn, onExpire]);

  return { confirmarAviso };
}
