// Centraliza todas las llamadas al backend.
// Cambia VITE_API_BASE_URL en tu .env para apuntar a staging/producción.

import { getFresh, setFresh, getInflightOrNull, setInflight, invalidateByEndpoint } from "./catalogCache";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

const METODOS_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function request(endpoint, options = {}) {
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

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") ?? "unos segundos";
    throw new Error(`Demasiadas peticiones. Intenta de nuevo en ${retryAfter}.`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody?.detail ?? `HTTP ${response.status}`);
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

function sanitizarPayload(body) {
  return Object.fromEntries(
    Object.entries(body)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [
        // Solo permite keys alfanuméricas con guión bajo (evita keys maliciosas)
        k.replace(/[^a-zA-Z0-9_]/g, ""),
        // "" o null → null explícito: permite LIMPIAR campos (deseleccionar) y
        // evita errores de formato en campos date/number que rechazan "".
        v === null || v === "" ? null : String(v).trim(),
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
  // Subir archivos: FormData directo, sin sanitizar ni forzar Content-Type
  upload: (endpoint, formData) => request(endpoint, { method: "POST", body: formData, isUpload: true }),
  // POST que devuelve un Blob (descarga de archivos binarios como PDFs)
  download: async (endpoint, body) => {
    const token = sessionStorage.getItem("accessToken");
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

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