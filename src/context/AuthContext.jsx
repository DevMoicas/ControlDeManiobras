// src/context/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiClient } from "../api/apiClient";

const AuthContext = createContext(null);

// ── Decodificador seguro del payload JWT ──
const ALLOWED_CLAIMS = ["user_id", "username", "role", "exp", "iat"];

function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(raw)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    const payload = JSON.parse(json);

    // Solo extraemos campos conocidos (whitelist)
    const safe = {};
    for (const key of ALLOWED_CLAIMS) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        safe[key] = payload[key];
      }
    }

    // Validar expiración
    if (safe.exp && Date.now() / 1000 > safe.exp) return null;

    // Validar que role sea un valor esperado
    if (safe.role && !["admin", "standard"].includes(safe.role)) {
      safe.role = "standard";
    }

    return safe;
  } catch {
    return null;
  }
}

// ── Token store en localStorage para persistencia al refrescar ──
const tokenStore = {
  getAccess:   () => localStorage.getItem("accessToken"),
  getRefresh:  () => localStorage.getItem("refreshToken"),
  setTokens:   (access, refresh) => { 
    localStorage.setItem("accessToken", access); 
    localStorage.setItem("refreshToken", refresh); 
  },
  clearTokens: () => { 
    localStorage.removeItem("accessToken"); 
    localStorage.removeItem("refreshToken"); 
  },
};

// ── Provider ──
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => decodeJwtPayload(tokenStore.getAccess()));

  const login = useCallback(async (username, password) => {
    const safeUsername = String(username ?? "").trim().slice(0, 150);
    const safePassword = String(password ?? "").slice(0, 128);
    if (!safeUsername || !safePassword) throw new Error("Credenciales inválidas");

    let data;
    try {
      data = await apiClient.post("/login/", { username: safeUsername, password: safePassword });
    } catch {
      throw new Error("Usuario o contraseña incorrectos");
    }

    if (!data?.access || !data?.refresh) throw new Error("Respuesta inválida del servidor");

    tokenStore.setTokens(data.access, data.refresh);
    const decoded = decodeJwtPayload(data.access);
    if (!decoded) throw new Error("Token inválido");

    setUser(decoded);
    return decoded;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clearTokens();
    setUser(null);
  }, []);

  // Refresca el access token al montar si está expirado pero el refresh sigue vigente
  useEffect(() => {
    const refreshOnMount = async () => {
      const access = tokenStore.getAccess();
      const refresh = tokenStore.getRefresh();

      // Si el access token es válido, no hay nada que hacer
      if (decodeJwtPayload(access)) return;

      // Si no hay refresh token, el usuario no está autenticado
      if (!refresh) return;

      try {
        const data = await apiClient.post("/token/refresh/", { refresh });

        if (!data?.access) {
          tokenStore.clearTokens();
          setUser(null);
          return;
        }

        tokenStore.setTokens(data.access, refresh);
        const decoded = decodeJwtPayload(data.access);
        if (decoded) {
          setUser(decoded);
        } else {
          tokenStore.clearTokens();
          setUser(null);
        }
      } catch {
        // El refresh token también expiró — limpiar sesión completamente
        tokenStore.clearTokens();
        setUser(null);
      }
    };

    refreshOnMount();
  }, []); // Ejecutar solo al montar el provider

  // Escucha el evento de sesión expirada que dispara apiClient
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("auth:expired", handler);
    return () => window.removeEventListener("auth:expired", handler);
  }, [logout]);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === "admin",
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook de consumo ──
export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext debe usarse dentro de <AuthProvider>");
  return ctx;
}