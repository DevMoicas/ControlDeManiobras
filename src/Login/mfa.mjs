// Traducción del error del backend al siguiente estado del formulario de login.
// ponytail: pura y sin React para poder probarla con `node --test`, igual que
// hooks/inactividad.mjs. Es la lógica que faltaba el 2026-07-22 y dejó a la
// cuenta de administrador fuera del SPA: sin ella, "falta el código" se pintaba
// como "usuario o contraseña incorrectos" y no había forma de entrar.

export const ERROR_CREDS        = 'Usuario o contraseña incorrectos';
export const ERROR_CODIGO       = 'El código de verificación no es válido';
export const ERROR_CODIGO_VACIO = 'Introduce el código de verificación';

/**
 * @param {string|undefined} codigo  `codigo` del cuerpo 401 del backend.
 * @returns {{pedirCodigo: boolean, error: string, cuentaIntento: boolean}}
 */
export function pasoSiguiente(codigo) {
  // Credenciales correctas, falta el segundo factor. NO es un intento fallido:
  // contarlo bloquearía al usuario legítimo antes de poder teclear el código.
  if (codigo === 'mfa_requerida') return { pedirCodigo: true, error: '', cuentaIntento: false };
  if (codigo === 'mfa_invalida')  return { pedirCodigo: true, error: ERROR_CODIGO, cuentaIntento: true };
  // Cualquier otro fallo es de contraseña: se vuelve al primer paso.
  return { pedirCodigo: false, error: ERROR_CREDS, cuentaIntento: true };
}
