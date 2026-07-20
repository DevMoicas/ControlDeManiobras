// Caché en memoria para peticiones GET de catálogos de baja mutación
// (choferes, tractos, remolques, patios, clientes, origenes, destinos,
// transportistas, cargos, unidades/operadores-terceros, folios-recientes).
//
// Vive y muere con la pestaña del navegador (no usa localStorage/sessionStorage),
// así que no hay riesgo de fuga de datos entre sesiones o usuarios distintos:
// cada quien tiene su propio proceso de navegador con este módulo cargado desde cero.
//
// Usado exclusivamente por apiClient.getCatalogo() — apiClient.get() no lo toca.

const TTL_MS = 45_000;

const store = new Map();     // endpoint -> { data, expiresAt }
const inflight = new Map();  // endpoint -> Promise en vuelo

// Quita query string y un id numérico final para agrupar variantes del mismo
// recurso bajo una sola "base": "/choferes/12/" y "/choferes/?x=1" -> "/choferes/"
function baseResource(endpoint) {
  const sinQuery = endpoint.split("?")[0];
  return sinQuery.replace(/\/\d+\/?$/, "/");
}

export function getFresh(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

export function setFresh(key, data) {
  store.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

export function getInflightOrNull(key) {
  return inflight.get(key) ?? null;
}

export function setInflight(key, promise) {
  inflight.set(key, promise);
  // Se autolimpia al resolver o rechazar, sin importar el resultado.
  promise.finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
}

export function invalidateByEndpoint(endpoint) {
  const base = baseResource(endpoint);
  for (const key of store.keys()) {
    if (baseResource(key) === base) store.delete(key);
  }
  for (const key of inflight.keys()) {
    if (baseResource(key) === base) inflight.delete(key);
  }
}
