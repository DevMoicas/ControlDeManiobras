import { useEffect, useRef } from "react";
import { haceFaltaBarra } from "./visibilidad.mjs";
import "./BarraScrollTabla.css";

/**
 * BarraScrollTabla
 * Barra de scroll horizontal fija al pie de la ventana, espejo del contenedor
 * que se le pasa.
 *
 * Por qué existe: la barra nativa vive al FINAL del contenedor. Con una tabla
 * más alta que la pantalla hay que bajar hasta el fondo de la página para
 * alcanzarla, y mientras tanto solo queda la rueda del ratón. Esta está siempre
 * a la vista, se arrastra, y mueve la tabla.
 *
 * Se oculta sola cuando la tabla no desborda, así que ponerla en una tabla
 * estrecha no cuesta nada. Es puramente aditiva: el scroll nativo del
 * contenedor sigue funcionando igual.
 *
 * Props:
 *   contenedorRef  ref — el div con overflow-x cuyo scroll se va a espejar
 */
export default function BarraScrollTabla({ contenedorRef }) {
  const barraRef = useRef(null);
  const espacioRef = useRef(null);

  useEffect(() => {
    const caja = contenedorRef.current;
    const barra = barraRef.current;
    const espacio = espacioRef.current;
    if (!caja || !barra || !espacio) return;

    // Cuándo hace falta lo decide visibilidad.mjs, que está probado aparte.
    // Aquí solo se miden las cajas y se aplica.
    //
    // Ancho del hueco = ancho real del contenido, para que el pulgar mida lo
    // mismo que el de la nativa; y se alinea con el contenedor en vez de cruzar
    // toda la ventana, que parecería un fallo.
    const medir = () => {
      const r = caja.getBoundingClientRect();
      const mostrar = haceFaltaBarra({
        scrollWidth: caja.scrollWidth,
        clientWidth: caja.clientWidth,
        top: r.top,
        bottom: r.bottom,
        alto: window.innerHeight,
      });
      barra.classList.toggle("bst--visible", mostrar);
      if (!mostrar) return;
      barra.style.left = `${r.left}px`;
      barra.style.width = `${r.width}px`;
      espacio.style.width = `${caja.scrollWidth}px`;
      // OJO: aquí NO se toca scrollLeft. `medir` está enganchado en fase de
      // captura, así que al arrastrar la barra correría ANTES que la
      // sincronización y la devolvería a su sitio: el pulgar no se movería.
      // De mantener los dos scrolls a la vez ya se encargan deCaja/deBarra.
    };

    // Escribir scrollLeft dispara otro evento scroll: sin la guarda, barra y
    // tabla se reescriben la una a la otra y el arrastre tirita. Se libera en
    // el frame siguiente, cuando el evento rebotado ya pasó.
    let sincronizando = false;
    const espejar = (desde, hacia) => () => {
      if (sincronizando) return;
      sincronizando = true;
      hacia.scrollLeft = desde.scrollLeft;
      requestAnimationFrame(() => { sincronizando = false; });
    };
    const deCaja = espejar(caja, barra);
    const deBarra = espejar(barra, caja);

    medir();
    barra.scrollLeft = caja.scrollLeft; // arranque: si la tabla ya venía movida
    // El contenido cambia de ancho al cargar más filas (scroll infinito) y al
    // cambiar de pestaña o filtro, no solo al redimensionar la ventana.
    const ro = new ResizeObserver(medir);
    ro.observe(caja);
    if (caja.firstElementChild) ro.observe(caja.firstElementChild);

    caja.addEventListener("scroll", deCaja, { passive: true });
    barra.addEventListener("scroll", deBarra, { passive: true });
    window.addEventListener("resize", medir);
    // Al scrollear la página la tabla entra y sale del pliegue, que es lo que
    // decide si esta barra hace falta. Va en captura porque el scroll puede
    // venir de un contenedor interno, no solo de la ventana.
    window.addEventListener("scroll", medir, { passive: true, capture: true });
    return () => {
      ro.disconnect();
      caja.removeEventListener("scroll", deCaja);
      barra.removeEventListener("scroll", deBarra);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, { capture: true });
    };
  }, [contenedorRef]);

  // aria-hidden: duplica un control que ya existe (el scroll del contenedor,
  // que sigue siendo accesible por teclado). Anunciarla dos veces solo estorba.
  return (
    <div className="bst" ref={barraRef} aria-hidden="true">
      <div className="bst-espacio" ref={espacioRef} />
    </div>
  );
}
