import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import './Index.css';
import App from './App';
import LoginPage from './Login/Login';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { AlertasProvider } from './components/Alertas/Alertas';
import { ConfirmacionProvider } from './components/Confirmacion/Confirmacion';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* reducedMotion="user": todas las animaciones de motion/react respetan
        prefers-reduced-motion del sistema, sin repetir el chequeo por modal. */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
       <AuthProvider>
        {/* Una sola pila de avisos y un solo diálogo de confirmación para toda
            la app, login incluido. */}
        <AlertasProvider>
        <ConfirmacionProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          {/* Toda la app cuelga de /home/*, así que este guardián es la única
              puerta: sin sesión, escribir la URL a mano devuelve al login. */}
          <Route
            path="/home/*"
            element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            }
          />
          {/* Cualquier otra URL inventada tampoco es una vía de entrada. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ConfirmacionProvider>
        </AlertasProvider>
       </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>
);