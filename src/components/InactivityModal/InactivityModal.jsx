import "./InactivityModal.css";

/**
 * InactivityModal
 * Muestra dos variantes según el tipo:
 *   - 'warn':    aviso de inactividad próxima (10 min). Aceptar solo cierra.
 *   - 'expired': sesión expirada (20 min). Aceptar redirige al login.
 *
 * Props:
 *   tipo       'warn' | 'expired'
 *   onAceptar  function — callback al hacer click en Aceptar
 */
export default function InactivityModal({ tipo, onAceptar }) {
  const esAviso = tipo === "warn";

  return (
    <div className="im-overlay">
      <div className={`im-modal im-modal--${tipo}`}>
        <div className="im-icono">{esAviso ? "⚠️" : "🔒"}</div>
        <p className="im-mensaje">
          {esAviso
            ? "Tu sesión se cerrará si sigues inactivo"
            : "Tu sesión se cerrará por inactividad"}
        </p>
        <button
          type="button"
          className="im-btn-aceptar"
          onClick={onAceptar}
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
