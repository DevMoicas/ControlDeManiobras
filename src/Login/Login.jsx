import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

const ERROR_USUARIO  = 'El campo de usuario está vacío, ingresa tu nombre de usuario';
const ERROR_PASSWORD = 'El campo de contraseña está vacío, ingresa tu contraseña';
const ERROR_CREDS    = 'Usuario o contraseña incorrectos';

const errorStyle = {
  fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  fontSize: '10px',
  fontWeight: '700',
  color: '#dc2626',
  marginTop: '4px',
};

const LoginPage = () => {
  const navigate    = useNavigate();
  const { login }   = useAuthContext();

  const [username, setUsuario]       = useState('');
  const [password, setPassword]      = useState('');
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '' });
  const [apiError, setApiError]       = useState('');

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutEndTime, setLockoutEndTime] = useState(null);
  const [alertConfig, setAlertConfig]       = useState(null);
  const [remainingTime, setRemainingTime]   = useState(0);

  useEffect(() => {
    let interval;
    if (lockoutEndTime) {
      interval = setInterval(() => {
        const now      = new Date().getTime();
        const distance = lockoutEndTime - now;

        if (distance <= 0) {
          clearInterval(interval);
          setLockoutEndTime(null);
          setRemainingTime(0);
        } else {
          setRemainingTime(Math.ceil(distance / 1000));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutEndTime]);

  // Valida campos vacíos — devuelve true si todo está OK
  const validateFields = () => {
    const errors = { username: '', password: '' };
    let valid = true;

    if (!username.trim()) {
      errors.username = ERROR_USUARIO;
      valid = false;
    }
    if (!password) {
      errors.password = ERROR_PASSWORD;
      valid = false;
    }

    setFieldErrors(errors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (remainingTime > 0) return;

    // Limpia errores previos
    setFieldErrors({ username: '', password: '' });
    setApiError('');

    if (!validateFields()) return;

    try {
      await login(username, password);
      setFailedAttempts(0);
      navigate('/home');
    } catch {
      // Muestra error genérico bajo los campos inmediatamente
      setApiError(ERROR_CREDS);

      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts === 4) {
        setAlertConfig({ message: 'Tienes 1 intento más', visible: true });
      } else if (newAttempts >= 5) {
        const minutes        = Math.pow(2, newAttempts - 5);
        const lockDurationMs = minutes * 60 * 1000;
        setLockoutEndTime(new Date().getTime() + lockDurationMs);
        setAlertConfig({
          message: `El sistema ha sido bloqueado por varios intentos fallidos, intenta de nuevo en ${minutes} minuto${minutes > 1 ? 's' : ''}`,
          visible: true,
        });
      }
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] relative">

      {/* Alert Modal — bloqueo por intentos */}
      {alertConfig?.visible && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-2xl relative">
            <div className="bg-yellow-500 text-white p-4 rounded-md mb-6 font-medium text-center">
              {alertConfig.message}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertConfig(null)}
                className="bg-[#2563eb] text-white py-2 px-6 rounded-md font-bold hover:bg-blue-700 transition-colors"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-[#2563eb]">Control de Maniobras</h2>
          <p className="text-gray-500 mt-2">Inicio de sesión</p>
        </div>

        {remainingTime > 0 && (
          <div className="text-center text-red-500 font-bold mb-4 bg-red-100 p-3 rounded-xl">
            Tiempo de bloqueo restante: {formatTime(remainingTime)}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">

          {/* ── Usuario ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input
              type="text"
              required
              disabled={remainingTime > 0}
              value={username}
              placeholder="Introduce tu usuario"
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-[#2563eb] transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
              onChange={(e) => {
                setUsuario(e.target.value);
                setApiError('');
                if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: '' }));
              }}
            />
            {fieldErrors.username && (
              <p style={errorStyle} role="alert">{fieldErrors.username}</p>
            )}
          </div>

          {/* ── Contraseña ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              required
              disabled={remainingTime > 0}
              value={password}
              placeholder="••••••••"
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-[#2563eb] transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
              onChange={(e) => {
                setPassword(e.target.value);
                setApiError('');
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
              }}
            />
            {fieldErrors.password && (
              <p style={errorStyle} role="alert">{fieldErrors.password}</p>
            )}
          </div>

          {/* ── Error de API (credenciales rechazadas por el servidor) ── */}
          {apiError && (
            <p style={{ ...errorStyle, fontSize: '11px', textAlign: 'center' }} role="alert">
              {apiError}
            </p>
          )}

          <button
            type="submit"
            disabled={remainingTime > 0}
            className={`w-full text-white py-3 px-4 rounded-xl font-bold transition-all duration-300 shadow-md ${
              remainingTime > 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-[#2563eb] hover:bg-blue-700 hover:-translate-y-[2px] active:scale-95 hover:shadow-lg'
            }`}
          >
            Iniciar sesión
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;