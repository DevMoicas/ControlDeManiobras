import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import "./BotonArriba.css";

// Vuelve al principio sin arrastrar la rueda. Con scroll infinito, bajar 40
// maniobras y volver a subir a mano es el desperdicio que esto corta.
//
// Dos formas de scroll conviven en la app: la mayoría de las páginas mueven la
// VENTANA, pero la tabla de Maniobras tiene su propio contenedor con
// `max-height` y `overflow: auto`, así que ahí lo que se mueve es el div. El
// botón sirve a las dos: la visibilidad la decide cualquiera de los dos, y al
// pulsar sube ambos (el que ya esté en 0 se queda como está).
//
//   contenedorRef  ref al contenedor con scroll propio, si la página lo tiene.
//                  Sin él, funciona solo contra la ventana.

const UMBRAL_PX = 300;

export default function BotonArriba({ contenedorRef }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // capture: true — el evento `scroll` NO burbujea, así que un listener normal
    // en window se pierde el del contenedor interno. En fase de captura sí llega.
    // Mismo truco que ya usan los selectores para reposicionar su desplegable.
    const revisar = () => {
      const dentro = contenedorRef?.current?.scrollTop ?? 0;
      setVisible(window.scrollY > UMBRAL_PX || dentro > UMBRAL_PX);
    };
    const opciones = { capture: true, passive: true };
    window.addEventListener("scroll", revisar, opciones);
    return () => window.removeEventListener("scroll", revisar, opciones);
    // El ref se lee dentro del handler, no al montar: cuando la página aún está
    // cargando el contenedor todavía no existe, y un ref no provoca re-render.
  }, [contenedorRef]);

  if (!visible) return null;

  const subir = () => {
    // scrollTo con `smooth` ignora prefers-reduced-motion en varios navegadores,
    // así que se comprueba a mano.
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    contenedorRef?.current?.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
  };

  return (
    <button
      type="button"
      className="ba-boton"
      onClick={subir}
      aria-label="Volver al principio"
      title="Volver al principio"
    >
      <ArrowUp size={22} />
    </button>
  );
}
