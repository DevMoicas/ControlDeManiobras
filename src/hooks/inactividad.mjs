// Núcleo del timer de inactividad: puro y sin React, para poder probarlo con
// `node --test` (stdlib) sin arrastrar un framework de testing al proyecto.
//
//   node --test src/hooks/inactividad.test.mjs

export const WARN_MS   = 10 * 60 * 1000;  // 10 minutos
export const EXPIRE_MS = 20 * 60 * 1000;  // 20 minutos

export const estadoInicial = (ahora) => ({
  ultimaActividad: ahora,
  avisoVisible:    false,  // aviso en pantalla → la actividad no cuenta
  yaAvisado:       false,  // ya se avisó en este ciclo → no repetir
  expirado:        false,
});

// Actividad del usuario (ratón, teclado, scroll, táctil).
// Con el aviso en pantalla NO cuenta: era el agujero de la versión anterior,
// donde acercar el ratón al botón Aceptar ya reiniciaba el contador antes
// siquiera de pulsarlo, así que "Aceptar" nunca llegaba a significar nada.
export function conActividad(estado, ahora) {
  if (estado.avisoVisible || estado.expirado) return estado;
  return { ...estado, ultimaActividad: ahora, yaAvisado: false };
}

// El usuario pulsó Aceptar en el aviso. Solo levanta el bloqueo: deja
// ultimaActividad intacto a propósito, así que si acepta y se marcha el
// contador sigue corriendo y llega igualmente a los 20 min.
export function conAceptar(estado) {
  return estado.avisoVisible ? { ...estado, avisoVisible: false } : estado;
}

// Un tick del reloj. Devuelve el estado nuevo y qué debe hacer quien llama.
export function conTick(estado, ahora) {
  if (estado.expirado) return { estado, accion: null };

  const inactivo = ahora - estado.ultimaActividad;

  if (inactivo >= EXPIRE_MS) {
    return { estado: { ...estado, expirado: true }, accion: "expirar" };
  }
  if (inactivo >= WARN_MS && !estado.yaAvisado) {
    return { estado: { ...estado, yaAvisado: true, avisoVisible: true }, accion: "avisar" };
  }
  return { estado, accion: null };
}
