// src/components/ProtectedRoute/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";

/**
 * Guardián de rutas único de la app. Dos usos:
 *
 *   <ProtectedRoute>              → exige sesión           (index.js, sobre /home/*)
 *   <ProtectedRoute requireAdmin> → exige sesión + rol admin (App.js, rutas /admin-*)
 *
 * Antes había DOS componentes con este mismo nombre: este y src/ProtectedRoute.js.
 * Convivían sin romperse solo porque las rutas de admin están anidadas dentro de
 * /home/*, así que el guardián de fuera bloqueaba primero. Una invariante frágil:
 * bastaba con usar este en una ruta de primer nivel para reintroducir el fallo de
 * `rehidratando` que se explica abajo.
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, rehidratando } = useAuthContext();
  const location = useLocation();

  // Sesión a medio restaurar (access caducado, refresh todavía vivo): esperar a
  // que termine. Redirigir aquí echaría al login a un usuario con sesión válida
  // cada vez que pulsara F5.
  if (rehidratando) return null;

  if (!isAuthenticated) {
    // state.from: para poder devolverlo a donde iba, si algún día se implementa.
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Autenticado pero sin rol admin → de vuelta al inicio.
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
