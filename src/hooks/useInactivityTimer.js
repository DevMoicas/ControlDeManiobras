import { useEffect, useRef, useCallback } from "react";

const WARN_MS    = 10 * 60 * 1000;  // 10 minutos
const EXPIRE_MS  = 20 * 60 * 1000;  // 20 minutos
const TICK_MS    = 10_000;          // verificar cada 10 segundos

// Eventos que cuentan como actividad del usuario.
// Deliberadamente NO incluye 'click' ni 'mousedown' para que
// hacer click en "Aceptar" del modal de aviso NO reinicie el timer (Option B).
const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "touchstart"];

/**
 * useInactivityTimer
 *
 * Detecta inactividad del usuario y llama callbacks al llegar a los umbrales.
 *
 * Props:
 *   enabled   boolean  — activa/desactiva el timer (solo cuando hay sesión)
 *   onWarn    function(boolean) — llamado con true al llegar a 10 min,
 *                                 con false cuando el usuario se vuelve activo
 *   onExpire  function() — llamado al llegar a 20 min de inactividad
 */
export function useInactivityTimer({ enabled, onWarn, onExpire }) {
  const lastActivityRef = useRef(Date.now());
  const warnedRef       = useRef(false);
  const expiredRef      = useRef(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warnedRef.current) {
      // Si había aviso visible, ocultarlo al detectar actividad real
      warnedRef.current = false;
      onWarn(false);
    }
  }, [onWarn]);

  useEffect(() => {
    if (!enabled) {
      // Resetear estado interno si el timer se desactiva (logout)
      lastActivityRef.current = Date.now();
      warnedRef.current       = false;
      expiredRef.current      = false;
      return;
    }

    // Registrar listeners de actividad
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, resetActivity, { passive: true })
    );

    // Tick periódico para verificar inactividad
    const tick = setInterval(() => {
      if (expiredRef.current) return; // ya expiró, no seguir verificando

      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= EXPIRE_MS) {
        expiredRef.current = true;
        onExpire();
      } else if (elapsed >= WARN_MS && !warnedRef.current) {
        warnedRef.current = true;
        onWarn(true);
      }
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, resetActivity)
      );
      clearInterval(tick);
    };
  }, [enabled, resetActivity, onWarn, onExpire]);
}
