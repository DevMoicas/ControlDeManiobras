// Centraliza todas las llamadas al backend.
// Cambia VITE_API_BASE_URL en tu .env para apuntar a staging/producción.

import { getFresh, setFresh, getInflightOrNull, setInflight, invalidateByEndpoint } from "./catalogCache";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

const METODOS_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Renueva el access token con el refresh. Single-flight: si varias peticiones
// fallan con 401 a la vez, todas esperan al MISMO refresh en vez de disparar N.
let refreshEnVuelo = null;
async function refrescarAccessToken() {
  const refresh = sessionStorage.getItem("refreshToken");
  if (!refresh) return null;
  if (!refreshEnVuelo) {
    refreshEnVuelo = fetch(`${BASE_URL}/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.access) return null;
        sessionStorage.setItem("accessToken", data.access);
        // Si algún día se activa la rotación de refresh, guardar el nuevo.
        if (data.refresh) sessionStorage.setItem("refreshToken", data.refresh);
        return data.access;
      })
      .catch(() => null);
    refreshEnVuelo.finally(() => { refreshEnVuelo = null; });
  }
  return refreshEnVuelo;
}

async function request(endpoint, options = {}, _reintento = false) {
  // Leer el access token en cada petición (puede actualizarse entre llamadas)
  const token = sessionStorage.getItem("accessToken");

  // isUpload: FormData — el navegador pone el Content-Type con boundary solo.
  const { isUpload, ...fetchOptions } = options;

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers: {
      ...(!isUpload && fetchOptions.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  });

  // 401: el access expiró → refrescar UNA vez y reintentar la misma petición.
  // /login/ queda fuera: ahí un 401 no es un token caducado sino credenciales
  // rechazadas, y entrar aquí se tragaría el cuerpo de la respuesta (que ahora
  // trae `codigo` para distinguir el segundo factor).
  if (response.status === 401 && !_reintento && endpoint !== "/login/") {
    const nuevoToken = await refrescarAccessToken();
    if (nuevoToken) return request(endpoint, options, true);
    window.dispatchEvent(new Event("auth:expired"));
    throw new Error("Sesión expirada.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") ?? "unos segundos";
    throw new Error(`Demasiadas peticiones. Intenta de nuevo en ${retryAfter}.`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody?.detail ?? `HTTP ${response.status}`);
    error.codigo = errorBody?.codigo;   // p.ej. mfa_requerida / mfa_invalida
    throw error;
  }

  // Escritura exitosa: invalida el caché de catálogos de ese mismo recurso para
  // que el próximo getCatalogo() traiga el dato fresco en vez de uno obsoleto.
  // Defensivo: un fallo aquí nunca debe poder tumbar un guardado ya exitoso.
  if (METODOS_ESCRITURA.has(fetchOptions.method)) {
    try { invalidateByEndpoint(endpoint); } catch { /* no-op */ }
  }

  // DELETE devuelve 204 sin body
  if (response.status === 204) return null;
  return response.json();
}

// Un mapa PLANO de texto→texto, y nada más: `Gasto.formulas`
// ({"casetas_ida": "=150+230"}) es el único objeto que manda el sistema dentro
// de un cuerpo. Se comprueba el prototipo, no `typeof`: así un Date o un File
// no cuelan como "objeto plano" y acaban convertidos en {}.
const esMapaDeTexto = (v) =>
  v !== null &&
  typeof v === "object" &&
  Object.getPrototypeOf(v) === Object.prototype &&
  Object.values(v).every((x) => typeof x === "string");

function sanitizarPayload(body) {
  return Object.fromEntries(
    Object.entries(body)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [
        // Solo permite keys alfanuméricas con guión bajo (evita keys maliciosas)
        k.replace(/[^a-zA-Z0-9_]/g, ""),
        // "" o null → null explícito: permite LIMPIAR campos (deseleccionar) y
        // evita errores de formato en campos date/number que rechazan "".
        // Las listas se dejan pasar como lista de ENTEROS (costos_extra_ids):
        // sin esto, String([3,7]) las aplastaría a "3,7". Solo enteros a
        // propósito — es el único tipo de array que manda el sistema y así no
        // se abre un hueco para colar objetos en el cuerpo de la petición.
        // Los mapas planos de texto (Gasto.formulas) pasan con las MISMAS
        // reglas que el resto: clave alfanumérica y valor en texto, sin anidar
        // más. Sin esto, String({...}) los aplastaba a "[object Object]".
        v === null || v === "" ? null
          : Array.isArray(v) ? v.map(Number).filter(Number.isInteger)
          : esMapaDeTexto(v)
            ? Object.fromEntries(Object.entries(v).map(
                ([clave, texto]) => [clave.replace(/[^a-zA-Z0-9_]/g, ""), texto.trim()]))
          : String(v).trim(),
      ])
  );
}

export const apiClient = {
  get:    (endpoint)        => request(endpoint),
  // GET cacheado (TTL 45s) + deduplicado para catálogos de baja mutación
  // (choferes, tractos, remolques, patios, clientes, origenes/destinos,
  // transportistas, cargos, unidades/operadores-terceros, folios-recientes).
  // Se invalida automáticamente al escribir en request() (ver arriba).
  getCatalogo: (endpoint) => {
    const cached = getFresh(endpoint);
    if (cached !== undefined) return Promise.resolve(cached);

    const enVuelo = getInflightOrNull(endpoint);
    if (enVuelo) return enVuelo;

    const promesa = request(endpoint).then((data) => {
      setFresh(endpoint, data);
      return data;
    });
    setInflight(endpoint, promesa);
    return promesa;
  },
  post:  (endpoint, body) => request(endpoint, { method: "POST",  body: JSON.stringify(sanitizarPayload(body)) }),
put:   (endpoint, body) => request(endpoint, { method: "PUT",   body: JSON.stringify(sanitizarPayload(body)) }),
patch: (endpoint, body) => request(endpoint, { method: "PATCH", body: JSON.stringify(sanitizarPayload(body)) }),
  delete: (endpoint)        => request(endpoint, { method: "DELETE" }),
  // POST/PATCH SIN sanitizar, para cuerpos con estructura anidada.
  // sanitizarPayload() está pensado para payloads planos: convierte toda lista
  // en lista de enteros (aplastaría `cargas`, que son objetos, a []) y todo
  // valor en cadena. Quien use estos dos construye el cuerpo él mismo y se hace
  // cargo de normalizarlo — ver paraGuardar() en utils/reporteViaje.mjs.
  postAnidado:  (endpoint, body) => request(endpoint, { method: "POST",  body: JSON.stringify(body) }),
  patchAnidado: (endpoint, body) => request(endpoint, { method: "PATCH", body: JSON.stringify(body) }),
  // Subir archivos: FormData directo, sin sanitizar ni forzar Content-Type
  upload: (endpoint, formData) => request(endpoint, { method: "POST", body: formData, isUpload: true }),
  // Descarga de archivos binarios (PDFs, Excel). POST por defecto, que es como
  // los piden los documentos de viaje: mandan el formulario en el cuerpo. El
  // reporte de viaje ya está guardado y solo hace falta su id en la URL, así que
  // ese va por GET — y un GET no lleva cuerpo ni Content-Type.
  download: async (endpoint, body, metodo = "POST") => {
    const hacerFetch = (tok) => fetch(`${BASE_URL}${endpoint}`, {
      method: metodo,
      headers: {
        ...(metodo === "GET" ? {} : { "Content-Type": "application/json" }),
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      ...(metodo === "GET" ? {} : { body: JSON.stringify(body) }),
    });

    let response = await hacerFetch(sessionStorage.getItem("accessToken"));

    // 401: refrescar el access una vez y reintentar la descarga.
    if (response.status === 401) {
      const nuevoToken = await refrescarAccessToken();
      if (nuevoToken) response = await hacerFetch(nuevoToken);
    }
    if (response.status === 401) {
      window.dispatchEvent(new Event("auth:expired"));
      throw new Error("Sesión expirada.");
    }
    if (!response.ok) {
      let mensaje = `Error ${response.status}`;
      try {
        const err = await response.json();
        mensaje = err.detail || mensaje;
      } catch (_) { /* ignorar */ }
      throw new Error(mensaje);
    }

    return response.blob();
  },
};