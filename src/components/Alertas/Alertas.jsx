import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { alertaMotion } from "../../animations/modalMotion";
import "./Alertas.css";

// Pila única de avisos para toda la app. Antes cada página pintaba su propio
// <div> en el flujo del documento: al editar una celda con 2000 px de scroll, la
// confirmación se pintaba arriba del todo, fuera de la pantalla. Aquí la pila va
// fija al viewport, así que el aviso sale donde el ojo ya está.

// El código llama "ok" y "exito" a lo mismo. Se normaliza AQUÍ, en un sitio, y no
// en los ~59 puntos que disparan avisos.
const FAMILIA = {
  ok: "exito", exito: "exito", success: "exito",
  error: "error", fallo: "error",
  aviso: "aviso", warn: "aviso",
};

// Una palabra, no una frase: es el canal que dice el desenlace SIN depender del
// color. El mensaje lleva el detalle y no lo repite.
const DESENLACE = { exito: "Listo", error: "Error", aviso: "Aviso" };

// El acierto se va solo; el error NO. Un mensaje que explica qué detuvo una
// escritura tiene que poder releerse — si se desvanece en 3 s no ha informado.
const VIDA_MS = { exito: 3500, aviso: 6000, error: null };

const MAX_EN_PILA = 4;

const AlertaContext = createContext(null);

/** Devuelve `mostrar(aviso)`. Acepta el mismo objeto `{ tipo, msg }` que ya usaban
 *  las páginas, para no tocar ninguno de los sitios que disparan avisos.
 *  `dato` es opcional: el valor escrito (un folio, un contenedor), que se pinta
 *  en la cara monoespaciada porque es un código que alguien va a leer en voz alta. */
export function useAlerta() {
  const mostrar = useContext(AlertaContext);
  if (!mostrar) throw new Error("useAlerta() necesita que <AlertasProvider> esté por encima.");
  return mostrar;
}

export function AlertasProvider({ children }) {
  const [alertas, setAlertas] = useState([]);
  const temporizadores = useRef(new Map());
  const ultimoId = useRef(0);

  const cerrar = useCallback((id) => {
    clearTimeout(temporizadores.current.get(id));
    temporizadores.current.delete(id);
    setAlertas((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const mostrar = useCallback((aviso) => {
    // Las páginas también llamaban setNotif(null) para limpiar: aquí no hay nada
    // que limpiar, cada aviso se cierra solo o con su botón.
    if (!aviso) return;
    const { tipo, msg, mensaje, dato } = aviso;
    const familia = FAMILIA[tipo] ?? "aviso";
    const id = ++ultimoId.current;
    setAlertas((prev) => [
      ...prev.slice(-(MAX_EN_PILA - 1)),
      { id, familia, mensaje: msg ?? mensaje ?? "", dato },
    ]);
    const vida = VIDA_MS[familia];
    if (vida) temporizadores.current.set(id, setTimeout(() => cerrar(id), vida));
  }, [cerrar]);

  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  return (
    <AlertaContext.Provider value={mostrar}>
      {children}
      {createPortal(
        <div className="al-pila" role="region" aria-label="Avisos del sistema">
          <AnimatePresence initial={false}>
            {alertas.map((a) => (
              <motion.div
                key={a.id}
                layout
                {...alertaMotion}
                className={`al-tarjeta al-tarjeta--${a.familia}`}
                role={a.familia === "error" ? "alert" : "status"}
                aria-live={a.familia === "error" ? "assertive" : "polite"}
              >
                <p className="al-desenlace">{DESENLACE[a.familia]}</p>
                <p className="al-mensaje">{a.mensaje}</p>
                {a.dato && <p className="al-dato">{a.dato}</p>}
                <button
                  type="button"
                  className="al-cerrar"
                  onClick={() => cerrar(a.id)}
                  aria-label="Cerrar aviso"
                >
                  <X size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </AlertaContext.Provider>
  );
}
