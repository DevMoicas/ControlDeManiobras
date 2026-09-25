import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import "./Confirmacion.css";

// Sustituye a window.confirm en toda la app. Hermano de la pila de avisos: los
// mismos tokens, el mismo lomo de color y las mismas tres funciones de tipo.
//
// Es un <dialog> nativo y no un div a propósito. FotoModal pide confirmación
// DESDE DENTRO de otro modal, y toda la app comparte un techo plano de
// z-index: 9999. showModal() pinta en el top layer, que gana siempre sin entrar
// en guerra de z-index, y encima trae gratis la trampa de foco, la devolución
// del foco al cerrar y el Escape.

const ConfirmacionContext = createContext(null);

/** Devuelve `preguntar(opciones) => Promise<boolean>`, para que el sitio que
 *  llama conserve el mismo control de flujo que tenía con window.confirm:
 *
 *    if (!await preguntar({ titulo, mensaje, accion, peligro })) return;
 *
 *  - titulo   una acción, no una pregunta ("Eliminar maniobra")
 *  - mensaje  qué pasa exactamente y si tiene vuelta atrás
 *  - dato     opcional: sobre qué registro, en la cara monoespaciada
 *  - accion   el texto del botón; se llama IGUAL que la acción que dispara
 *  - peligro  true si destruye datos: pinta el botón en rojo y deja el foco
 *             puesto en Cancelar */
export function useConfirmacion() {
  const preguntar = useContext(ConfirmacionContext);
  if (!preguntar) throw new Error("useConfirmacion() necesita que <ConfirmacionProvider> esté por encima.");
  return preguntar;
}

export function ConfirmacionProvider({ children }) {
  const [pregunta, setPregunta] = useState(null);
  const resolver = useRef(null);
  const dialogoRef = useRef(null);

  const preguntar = useCallback((opciones) => {
    setPregunta({ accion: "Aceptar", ...opciones });
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  // showModal() no puede llamarse durante el render: el <dialog> tiene que estar
  // ya en el DOM. Por eso se abre aquí, cuando `pregunta` ya se pintó.
  useEffect(() => {
    const d = dialogoRef.current;
    if (d && pregunta && !d.open) d.showModal();
  }, [pregunta]);

  const responder = useCallback((valor) => {
    dialogoRef.current?.close();
    resolver.current?.(valor);
    resolver.current = null;
    setPregunta(null);
  }, []);

  return (
    <ConfirmacionContext.Provider value={preguntar}>
      {children}
      <dialog
        ref={dialogoRef}
        className="cf-dialogo"
        aria-labelledby="cf-titulo"
        // Escape dispara `cancel`: es un Cancelar más, no un caso aparte.
        onCancel={(e) => { e.preventDefault(); responder(false); }}
        // Clic en el fondo = cancelar. El <dialog> no lo trae; el target solo es
        // el propio dialogo cuando el clic cae fuera de su contenido.
        onClick={(e) => { if (e.target === dialogoRef.current) responder(false); }}
      >
        {pregunta && (
          <div className={`cf-cuerpo${pregunta.peligro ? " cf-cuerpo--peligro" : ""}`}>
            <p className="cf-titulo" id="cf-titulo">{pregunta.titulo}</p>
            <p className="cf-mensaje">{pregunta.mensaje}</p>
            {pregunta.dato && <p className="cf-dato">{pregunta.dato}</p>}
            <div className="cf-acciones">
              <button
                type="button"
                className="cf-btn cf-btn--cancelar"
                onClick={() => responder(false)}
                autoFocus={!!pregunta.peligro}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cf-btn cf-btn--confirmar"
                onClick={() => responder(true)}
                autoFocus={!pregunta.peligro}
              >
                {pregunta.accion}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmacionContext.Provider>
  );
}
