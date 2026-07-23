import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import InactivityModal from '../components/InactivityModal/InactivityModal';
import { pasoSiguiente, ERROR_CODIGO_VACIO } from './mfa.mjs';

const ERROR_USUARIO  = 'El campo de usuario está vacío, ingresa tu nombre de usuario';
const ERROR_PASSWORD = 'El campo de contraseña está vacío, ingresa tu contraseña';

// Panel de patio — rejilla de carriles sobre degradado azul
const laneGrid = {
  backgroundColor: '#1d4ed8',
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 64px),' +
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 64px),' +
    'linear-gradient(135deg, #2563eb 0%, #1565C0 100%)',
};

const fieldError = 'mt-1.5 text-[11px] font-semibold tracking-wide text-[#dc2626]';

const LoginPage = () => {
  const navigate    = useNavigate();
  const location    = useLocation();
  const { login }   = useAuthContext();

  // El timer de inactividad cierra la sesión y redirige aquí con este flag.
  // ponytail: se lee una sola vez al montar; un F5 sobre el login volvería a
  // mostrarlo porque el state sigue en el historial. Es cosmético — si molesta,
  // limpiarlo con navigate(location.pathname, { replace: true, state: null }).
  const [sesionCaducada, setSesionCaducada] = useState(
    () => Boolean(location.state?.sesionCaducada)
  );

  const [username, setUsuario]       = useState('');
  const [password, setPassword]      = useState('');
  // Segundo factor: solo aparece cuando el backend lo pide (9.1 fase 1), es decir
  // únicamente a quien ya tiene un dispositivo TOTP dado de alta.
  const [otp, setOtp]                 = useState('');
  const [pedirCodigo, setPedirCodigo] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '', otp: '' });
  const [apiError, setApiError]       = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const errors = { username: '', password: '', otp: '' };
    let valid = true;

    if (!username.trim()) {
      errors.username = ERROR_USUARIO;
      valid = false;
    }
    if (!password) {
      errors.password = ERROR_PASSWORD;
      valid = false;
    }
    if (pedirCodigo && !otp.trim()) {
      errors.otp = ERROR_CODIGO_VACIO;
      valid = false;
    }

    setFieldErrors(errors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (remainingTime > 0) return;

    // Limpia errores previos
    setFieldErrors({ username: '', password: '', otp: '' });
    setApiError('');

    if (!validateFields()) return;

    setIsSubmitting(true);

    try {
      await login(username, password, otp);
      setFailedAttempts(0);
      navigate('/home');
    } catch (err) {
      const paso = pasoSiguiente(err?.codigo);
      setPedirCodigo(paso.pedirCodigo);
      setApiError(paso.error);
      // Pedir el código no es un fallo: contarlo bloquearía al usuario legítimo
      // antes de darle ocasión de teclearlo.
      if (!paso.cuentaIntento) return;

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
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const locked = remainingTime > 0 || isSubmitting;

  return (
    <div className="min-h-screen w-full bg-[#f4f7fb] lg:grid lg:grid-cols-[1.05fr_1fr]">

      {/* Sesión cerrada por inactividad — llega desde el timer de /home */}
      {sesionCaducada && (
        <InactivityModal tipo="expired" onAceptar={() => setSesionCaducada(false)} />
      )}

      {/* Alert Modal — bloqueo por intentos */}
      {alertConfig?.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 bg-amber-50 p-5">
              <span aria-hidden className="text-xl leading-none text-amber-500">⚠</span>
              <p className="text-sm font-medium text-amber-900">{alertConfig.message}</p>
            </div>
            <div className="flex justify-end px-5 py-4">
              <button
                onClick={() => setAlertConfig(null)}
                className="rounded-lg bg-[#2563eb] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── YARD BOARD (panel izquierdo) — la firma ── */}
      <aside
        style={laneGrid}
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:p-12 xl:p-16"
      >
        {/* franja de patio animada */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 overflow-hidden">
          <div className="lane-stripe h-px w-1/3 bg-gradient-to-r from-transparent via-white to-transparent" />
        </div>

        <p
          style={{ fontFamily: '"IBM Plex Mono", monospace' }}
          className="mb-8 text-[11px] uppercase tracking-[0.32em] text-white/70"
        >
          Sistema de Control
        </p>

        {/* bloque de identidad estarcido (stencil) */}
        <div className="relative">
          <div className="mb-6 h-2 w-16 bg-white" aria-hidden />
          <h1
            style={{ fontFamily: 'Oswald, sans-serif' }}
            className="text-6xl font-bold uppercase leading-[0.92] tracking-[0.04em] text-white xl:text-7xl"
          >
            Control<br />de<br /><span className="text-blue-200">Maniobras</span>
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-white/75">
            Coordinación de tractos, remolques y maniobras. Acceso restringido a personal autorizado.
          </p>
        </div>
      </aside>

      {/* ── PANEL DE ACCESO (formulario) ── */}
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-6 py-12 sm:px-10 lg:min-h-0">
        <div className="w-full max-w-sm">

          {/* encabezado compacto — visible en móvil donde no hay yard board */}
          <div className="mb-10">
            <div className="mb-4 h-1.5 w-12 bg-[#2563eb] lg:hidden" aria-hidden />
            <h2
              style={{ fontFamily: 'Oswald, sans-serif' }}
              className="text-2xl font-semibold uppercase tracking-[0.06em] text-[#1d4ed8] lg:hidden"
            >
              Control de Maniobras
            </h2>
            <p
              style={{ fontFamily: '"IBM Plex Mono", monospace' }}
              className="mt-2 text-[15px] font-semibold uppercase tracking-[0.12em] text-slate-700"
            >
              Acceso al sistema
            </p>
          </div>

          {remainingTime > 0 && (
            <div
              style={{ fontFamily: '"IBM Plex Mono", monospace' }}
              className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
              role="alert"
            >
              <span className="uppercase tracking-wide">Sistema bloqueado</span>
              <span className="tabular-nums font-semibold">{formatTime(remainingTime)}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* ── Usuario ── */}
            <div>
              <label
                htmlFor="login-usuario"
                style={{ fontFamily: '"IBM Plex Mono", monospace' }}
                className="mb-2 block text-[15px] font-semibold uppercase tracking-[0.08em] text-slate-800"
              >
                Usuario
              </label>
              <input
                id="login-usuario"
                type="text"
                required
                disabled={locked}
                value={username}
                placeholder="Introduce tu usuario"
                className="block w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 transition-colors placeholder:text-slate-400 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                onChange={(e) => {
                  setUsuario(e.target.value);
                  setApiError('');
                  if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: '' }));
                }}
              />
              {fieldErrors.username && (
                <p className={fieldError} role="alert">{fieldErrors.username}</p>
              )}
            </div>

            {/* ── Contraseña ── */}
            <div>
              <label
                htmlFor="login-password"
                style={{ fontFamily: '"IBM Plex Mono", monospace' }}
                className="mb-2 block text-[15px] font-semibold uppercase tracking-[0.08em] text-slate-800"
              >
                Contraseña
              </label>
              <input
                id="login-password"
                type="password"
                required
                disabled={locked}
                value={password}
                placeholder="••••••••"
                className="block w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 transition-colors placeholder:text-slate-400 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                onChange={(e) => {
                  setPassword(e.target.value);
                  setApiError('');
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
                }}
              />
              {fieldErrors.password && (
                <p className={fieldError} role="alert">{fieldErrors.password}</p>
              )}
            </div>

            {/* ── Código de verificación (solo si el backend lo exige) ── */}
            {pedirCodigo && (
              <div>
                <label
                  htmlFor="login-otp"
                  style={{ fontFamily: '"IBM Plex Mono", monospace' }}
                  className="mb-2 block text-[15px] font-semibold uppercase tracking-[0.08em] text-slate-800"
                >
                  Código de verificación
                </label>
                <input
                  id="login-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  autoFocus
                  required
                  disabled={locked}
                  value={otp}
                  placeholder="000000"
                  className="block w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-800 transition-colors placeholder:tracking-[0.35em] placeholder:text-slate-300 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                  onChange={(e) => {
                    // ponytail: solo se quitan espacios, NO se filtra a dígitos: los
                    // códigos de respaldo de django-otp son alfanuméricos y filtrarlos
                    // dejaría fuera a quien perdió el móvil.
                    setOtp(e.target.value.replace(/\s/g, ''));
                    setApiError('');
                    if (fieldErrors.otp) setFieldErrors((prev) => ({ ...prev, otp: '' }));
                  }}
                />
                {fieldErrors.otp ? (
                  <p className={fieldError} role="alert">{fieldErrors.otp}</p>
                ) : (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Introduce el código de 6 dígitos de tu app de autenticación.
                  </p>
                )}
              </div>
            )}

            {/* ── Error de API (credenciales rechazadas por el servidor) ── */}
            {apiError && (
              <p className={`${fieldError} text-center`} role="alert">{apiError}</p>
            )}

            <button
              type="submit"
              disabled={locked}
              style={{ fontFamily: 'Oswald, sans-serif' }}
              className={`w-full rounded-lg px-4 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-md transition-all ${
                locked
                  ? 'cursor-not-allowed bg-slate-300 shadow-none'
                  : 'bg-[#2563eb] shadow-[#2563eb]/25 hover:bg-[#1d4ed8] hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]'
              }`}
            >
              {isSubmitting
                ? (pedirCodigo ? 'Verificando…' : 'Iniciando sesión…')
                : (pedirCodigo ? 'Verificar código' : 'Iniciar sesión')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
