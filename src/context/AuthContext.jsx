// src/context/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
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

// ── Token store en sessionStorage: los tokens desaparecen al cerrar el
// navegador/pestaña, pero sobreviven un refresh (F5) de la misma pestaña. ──
const tokenStore = {
  getAccess:   () => sessionStorage.getItem("accessToken"),
  getRefresh:  () => sessionStorage.getItem("refreshToken"),
  setTokens:   (access, refresh) => {
    sessionStorage.setItem("accessToken", access);
    sessionStorage.setItem("refreshToken", refresh);
  },
  clearTokens: () => {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
  },
};

// ── Provider ──
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => decodeJwtPayload(tokenStore.getAccess()));

  // ¿Hay que esperar antes de poder afirmar que NO hay sesión? Solo en un caso:
  // el access token ya no sirve, pero queda un refresh con el que recuperarla
  // (el flujo asíncrono de abajo). Sin este estado, el guardián de rutas vería
  // user=null durante ese instante y echaría al login a alguien que sí tiene
  // sesión válida, con solo pulsar F5.
  const [rehidratando, setRehidratando] = useState(
    () => !decodeJwtPayload(tokenStore.getAccess()) && Boolean(tokenStore.getRefresh())
  );

  const login = useCallback(async (username, password, otpToken) => {
    const safeUsername = String(username ?? "").trim().slice(0, 150);
    const safePassword = String(password ?? "").slice(0, 128);
    // 6 dígitos el TOTP, 8 caracteres los códigos de respaldo de django-otp.
    const safeOtp = String(otpToken ?? "").trim().slice(0, 8) || undefined;
    if (!safeUsername || !safePassword) throw new Error("Credenciales inválidas");

    let data;
    try {
      data = await apiClient.post("/login/", { username: safeUsername, password: safePassword, otp_token: safeOtp });
    } catch (e) {
      // Se conserva `codigo`: sin él, "falta el segundo factor" se pintaría como
      // "usuario o contraseña incorrectos" y no habría manera de entrar.
      const error = new Error("Usuario o contraseña incorrectos");
      error.codigo = e?.codigo;
      throw error;
    }

    if (!data?.access || !data?.refresh) throw new Error("Respuesta inválida del servidor");

    tokenStore.setTokens(data.access, data.refresh);
    const decoded = decodeJwtPayload(data.access);
    if (!decoded) throw new Error("Token inválido");

    setUser(decoded);
    return decoded;
  }, []);

  const logout = useCallback(async () => {
    const refresh = tokenStore.getRefresh();
    if (refresh) {
      // Best-effort: invalida el refresh en el servidor (blacklist). Un fallo aquí
      // (p.ej. refresh ya expirado) no debe impedir cerrar sesión localmente.
      try { await apiClient.post("/logout/", { refresh }); } catch { /* no-op */ }
    }
    tokenStore.clearTokens();
    setUser(null);
  }, []);

  // Refresca el access token al montar si está expirado pero el refresh sigue vigente
  useEffect(() => {
    const refreshOnMount = async () => {
      // finally: pase lo que pase, se deja de rehidratar. Si esto no se
      // cumpliera en algún camino, el guardián se quedaría esperando para
      // siempre y la app no pintaría nada.
      try {
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

          tokenStore.setTokens(data.access, data.refresh ?? refresh);
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
      } finally {
        setRehidratando(false);
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

  // Memoizado: evita que el objeto cambie de identidad en cada render del
  // Provider (login/logout ya son estables vía useCallback), lo que forzaría
  // re-render de todos los consumidores de useAuthContext() sin necesidad.
  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === "admin",
    rehidratando,
    login,
    logout,
  }), [user, rehidratando, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook de consumo ──
export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext debe usarse dentro de <AuthProvider>");
  return ctx;
}