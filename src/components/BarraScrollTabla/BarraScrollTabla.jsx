import { useEffect, useRef } from "react";
import "./BarraScrollTabla.css";

/**
 * BarraScrollTabla
 * Barra de scroll horizontal encima de la cabecera de la tabla, espejo del
 * contenedor que se le pasa.
 *
 * Por qué existe: la barra nativa vive al FINAL del contenedor. Con una tabla
 * más alta que la pantalla hay que bajar hasta el fondo de la página para
 * alcanzarla, y hasta entonces solo queda la rueda del ratón. Esta se ve desde
 * el primer momento, encima de los encabezados, y se queda pegada al borde
 * superior mientras se recorre la tabla.
 *
 * Se oculta sola cuando la tabla no desborda, así que ponerla en una tabla
 * estrecha no cuesta nada. Es puramente aditiva: el scroll nativo del
 * contenedor sigue funcionando igual.
 *
 * Va DENTRO de un .bst-zona que envuelve también al contenedor: eso acota el
 * `sticky` a la altura de su tabla, así que desaparece al pasarla de largo y
 * dos tablas de la misma página nunca se pisan la barra.
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

    // El hueco mide lo que el contenido, para que el pulgar de esta barra sea
    // del mismo tamaño que el de la nativa. El +1 absorbe los subpíxeles del
    // zoom: sin él, una tabla que cabe justo saca una barra que no mueve nada.
    const medir = () => {
      const desborda = caja.scrollWidth > caja.clientWidth + 1;
      barra.classList.toggle("bst--visible", desborda);
      if (desborda) espacio.style.width = `${caja.scrollWidth}px`;
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
    return () => {
      ro.disconnect();
      caja.removeEventListener("scroll", deCaja);
      barra.removeEventListener("scroll", deBarra);
      window.removeEventListener("resize", medir);
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
