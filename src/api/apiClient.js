// Centraliza todas las llamadas al backend.
// Cambia VITE_API_BASE_URL en tu .env para apuntar a staging/producción.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";


async function request(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
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

  // DELETE devuelve 204 sin body
  if (response.status === 204) return null;
  return response.json();
}

function sanitizarPayload(body) {
  return Object.fromEntries(
    Object.entries(body)
      .filter(([_, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => [
        // Solo permite keys alfanuméricas con guión bajo (evita keys maliciosas)
        k.replace(/[^a-zA-Z0-9_]/g, ""),
        // Convierte a string y recorta espacios
        String(v).trim()
      ])
  );
}

export const apiClient = {
  get:    (endpoint)        => request(endpoint),
  post:  (endpoint, body) => request(endpoint, { method: "POST",  body: JSON.stringify(sanitizarPayload(body)) }),
put:   (endpoint, body) => request(endpoint, { method: "PUT",   body: JSON.stringify(sanitizarPayload(body)) }),
patch: (endpoint, body) => request(endpoint, { method: "PATCH", body: JSON.stringify(sanitizarPayload(body)) }),
  delete: (endpoint)        => request(endpoint, { method: "DELETE" }),
};