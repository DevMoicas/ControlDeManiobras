import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Arrastrar y soltar con pointer events, válido para ratón Y para dedo.
 *
 * No se usa el drag & drop de HTML5 (`draggable` + `onDragStart`/`onDrop`), que
 * sería más corto, porque **no responde al dedo**: en móvil y tableta el gesto
 * no llega a empezar. Pointer events son un solo camino para los tres.
 *
 * Requisito en el CSS del elemento que se arrastra: `touch-action: none`. Sin
 * eso el navegador se queda el gesto para hacer scroll y cancela el arrastre en
 * cuanto el dedo se mueve.
 *
 * El destino se resuelve con `elementFromPoint` sobre el punto donde se soltó,
 * buscando el `[data-destino]` más cercano. Así el destino lo declara el propio
 * HTML y este hook no sabe nada de calendarios ni de bolitas.
 */
export function useArrastre(alSoltar) {
  // { clave, x, y } mientras se arrastra; null en reposo.
  const [arrastrando, setArrastrando] = useState(null);
  const claveRef = useRef(null);

  const alPresionar = useCallback((clave) => (evento) => {
    // Solo el botón principal: el derecho abre el menú contextual, no arrastra.
    if (evento.button !== 0) return;
    // Evita que el ratón seleccione texto mientras se arrastra.
    evento.preventDefault();
    claveRef.current = clave;
    setArrastrando({ clave, x: evento.clientX, y: evento.clientY });
  }, []);

  useEffect(() => {
    if (!arrastrando) return;

    const seguir = (evento) =>
      setArrastrando((actual) =>
        actual && { ...actual, x: evento.clientX, y: evento.clientY });

    const terminar = (evento) => {
      const clave = claveRef.current;
      claveRef.current = null;
      setArrastrando(null);

      const debajo = document.elementFromPoint(evento.clientX, evento.clientY);
      const destino = debajo?.closest("[data-destino]");
      if (clave && destino) alSoltar(clave, destino.dataset.destino);
    };

    const cancelar = () => { claveRef.current = null; setArrastrando(null); };

    // En window y no en el elemento: con el ratón el puntero se sale de la
    // bolita en cuanto se mueve. Con el dedo, la captura implícita manda los
    // eventos al elemento original y desde ahí burbujean hasta aquí igual.
    window.addEventListener("pointermove", seguir);
    window.addEventListener("pointerup", terminar);
    window.addEventListener("pointercancel", cancelar);
    return () => {
      window.removeEventListener("pointermove", seguir);
      window.removeEventListener("pointerup", terminar);
      window.removeEventListener("pointercancel", cancelar);
    };
  }, [arrastrando, alSoltar]);

  return { arrastrando, alPresionar };
}
