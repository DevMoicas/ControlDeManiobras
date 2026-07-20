import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  // connect-src del CSP necesita SOLO el origen (sin la ruta /api): si la fuente
  // lleva ruta, el navegador exige match exacto y bloquea /api/login/, /api/... etc.
  const apiOrigin = (() => { try { return new URL(apiBase).origin } catch { return apiBase } })()

  return {
    plugins: [react()],
    server: {
      // El backend solo permite CORS desde :3000 (config heredada de CRA).
      // strictPort: si 3000 está ocupado, falla claro en vez de saltar a otro
      // puerto y romper CORS en silencio.
      port: 3000,
      strictPort: true,
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '0',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        // CSP para el frontend React en desarrollo
        // 'unsafe-inline' es necesario para Vite HMR y estilos de React en dev
        // En producción este CSP lo sirve el servidor web (Nginx) sin unsafe-inline
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: blob:",
          `connect-src 'self' ${apiOrigin} ws://localhost:* ws://127.0.0.1:*`,
          "font-src 'self' https://fonts.gstatic.com",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
    },
  }
})
