import { AlertTriangle } from "lucide-react";
import "./AlertaVencimiento.css";

/**
 * AlertaVencimiento
 * Tarjeta de alerta de vencimiento próximo.
 * Sin botón de cierre — persiste hasta que el dato se actualice en BD.
 *
 * Props:
 *   alerta { tipo: 'licencia'|'poliza', nombre: string, fecha: string }
 */
export default function AlertaVencimiento({ alerta }) {
  const mensaje =
    alerta.tipo === "licencia" ? (
      <>
        La <strong>licencia</strong> del chofer <strong>{alerta.nombre}</strong> vence el día{" "}
        <strong>{alerta.fecha}</strong>, actualice la licencia a la brevedad
      </>
    ) : (
      <>
        La <strong>Póliza</strong> del carro <strong>{alerta.nombre}</strong> vence el día{" "}
        <strong>{alerta.fecha}</strong>, actualice la póliza a la brevedad
      </>
    );

  return (
    <div className="av-card" role="alert">
      <p className="av-urgente">
        <AlertTriangle size={16} aria-hidden="true" /> ¡URGENTE!
      </p>
      <p className="av-mensaje">{mensaje}</p>
    </div>
  );
}
