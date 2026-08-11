// Presets de animación (Motion) compartidos por todos los modales de la app.
// Overlay: fade simple (un spring en opacity se ve raro). Contenido: spring —
// da la sensación "fluida" que una curva de duración fija no logra, porque
// interpola por velocidad real en vez de un tiempo fijo.
// El respeto a prefers-reduced-motion se maneja una sola vez en App.js via
// <MotionConfig reducedMotion="user">, no hace falta repetirlo por modal.

export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: "easeOut" },
};

export const contentMotion = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.15, ease: "easeIn" } },
  transition: { type: "spring", stiffness: 420, damping: 34, mass: 0.8 },
};

// Alertas: mismo muelle que el contenido de los modales, para que la app tenga
// un solo lenguaje de movimiento. Entra bajando desde el borde superior (que es
// donde vive la pila) y sale deslizándose hacia el borde izquierdo — se lee como
// "archivado", no como "desaparecido". La salida es corta a propósito: nunca
// estorba a la siguiente.
export const alertaMotion = {
  initial: { opacity: 0, y: -16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: -24, transition: { duration: 0.16, ease: "easeIn" } },
  transition: { type: "spring", stiffness: 420, damping: 34, mass: 0.8 },
};
