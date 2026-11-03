import { useEffect, useRef } from "react";

/**
 * useDropdownNav
 * Navegación con teclado para los selectores dropdown de la app.
 *  - Cerrado y con el foco dentro del wrapper (trigger): ArrowDown/ArrowUp abre.
 *  - Abierto: ArrowDown/ArrowUp mueve el foco entre las opciones (con wrap),
 *    Enter activa la opción enfocada. Escape ya lo maneja cada selector.
 *
 * dropdownRef va separado del wrapper porque varios selectores renderizan el
 * dropdown en un portal (position: fixed) fuera del árbol DOM del wrapper.
 *
 * Props:
 *   abierto      boolean          — estado open del dropdown
 *   setAbierto   function         — setter del estado open
 *   wrapperRef   ref              — contenedor del botón trigger
 *   dropdownRef  ref              — contenedor de las opciones
 */
export default function useDropdownNav({ abierto, setAbierto, wrapperRef, dropdownRef }) {
  // Fix navegación con Tab: al cerrarse el dropdown por selección/Enter/Escape, la
  // opción enfocada se desmonta y el foco cae a document.body → el siguiente Tab
  // reinicia desde el primer elemento de la página. Devolvemos el foco al trigger
  // para que la secuencia de Tab continúe donde estaba. Si el usuario movió el foco
  // a otro elemento (click/tab afuera), activeElement ya es ese elemento → no se toca.
  const prevAbierto = useRef(abierto);
  useEffect(() => {
    const seCerro = prevAbierto.current && !abierto;
    prevAbierto.current = abierto;
    if (!seCerro) return;
    const active = document.activeElement;
    const focoPerdido = !active || active === document.body;
    if (focoPerdido && wrapperRef.current) {
      const trigger = wrapperRef.current.querySelector(
        'button, [tabindex], input, select, textarea, a[href]'
      );
      if (trigger) trigger.focus();
    }
  }, [abierto, wrapperRef]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;

      if (!abierto) {
        if (
          (e.key === "ArrowDown" || e.key === "ArrowUp") &&
          wrapperRef.current &&
          wrapperRef.current.contains(document.activeElement)
        ) {
          e.preventDefault();
          setAbierto(true);
        }
        return;
      }

      const drop = dropdownRef.current;
      if (!drop) return;

      // No secuestrar las flechas si el usuario está escribiendo en un input ajeno
      const active = document.activeElement;
      const tag = active?.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && !drop.contains(active)) return;

      const items = Array.from(drop.querySelectorAll('button, [role="option"]')).filter(
        (el) => !el.disabled && el.getAttribute("aria-disabled") !== "true"
      );
      if (items.length === 0) return;

      const idx = items.indexOf(active);

      if (e.key === "Enter") {
        if (idx >= 0) {
          e.preventDefault();
          items[idx].click();
        }
        return;
      }

      e.preventDefault();
      let next;
      if (idx === -1) {
        next = e.key === "ArrowDown" ? 0 : items.length - 1;
      } else {
        next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      }
      items[next].tabIndex = -1; // los <li role="option"> no son enfocables por defecto
      items[next].focus();
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [abierto, setAbierto, wrapperRef, dropdownRef]);
}
