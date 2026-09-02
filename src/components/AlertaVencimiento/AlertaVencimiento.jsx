import { AlertTriangle } from "lucide-react";
import "./AlertaVencimiento.css";

// Qué se lee en cada aviso, por tipo. Es una tabla y no un if encadenado porque
// son siete y todos dicen lo mismo con otras dos palabras. El backend manda solo
// el tipo (AlertasVencimientoView) y él decide con cuánta antelación avisa cada
// uno: aquí no hay ninguna fecha que calcular.
//
// El verbo va en la tabla porque "Permisos Full" es plural y "licencia" no.
const TEXTOS = {
  licencia: {
    sujeto: <>La <strong>licencia</strong> del chofer</>, verbo: "vence", accion: "la licencia",
  },
  poliza: {
    sujeto: <>La <strong>Póliza</strong> del carro</>, verbo: "vence", accion: "la póliza",
  },
  permisos_full_tracto: {
    sujeto: <>Los <strong>Permisos Full</strong> del tracto</>, verbo: "vencen", accion: "los permisos",
  },
  fisico_mecanica_tracto: {
    sujeto: <>La <strong>Físico Mecánica</strong> del tracto</>, verbo: "vence", accion: "la verificación",
  },
  humo: {
    sujeto: <>La verificación de <strong>Humo</strong> del tracto</>, verbo: "vence", accion: "la verificación",
  },
  permisos_full_remolque: {
    sujeto: <>Los <strong>Permisos Full</strong> del remolque</>, verbo: "vencen", accion: "los permisos",
  },
  fisico_mecanica_remolque: {
    sujeto: <>La <strong>Físico Mecánica</strong> del remolque</>, verbo: "vence", accion: "la verificación",
  },
};

/**
 * AlertaVencimiento
 * Tarjeta de alerta de vencimiento próximo.
 * Sin botón de cierre — persiste hasta que el dato se actualice en BD.
 *
 * Props:
 *   alerta { tipo: clave de TEXTOS, nombre: string, fecha: string }
 */
export default function AlertaVencimiento({ alerta }) {
  // Un tipo que no esté en la tabla igual tiene que verse: el aviso importa más
  // que su redacción, y callarlo sería esconder algo que está por vencer.
  const { sujeto, verbo, accion } = TEXTOS[alerta.tipo] ?? {
    sujeto: <>El documento <strong>{alerta.tipo}</strong> de</>, verbo: "vence", accion: "el dato",
  };

  return (
    <div className="av-card" role="alert">
      <p className="av-urgente">
        <AlertTriangle size={16} aria-hidden="true" /> ¡URGENTE!
      </p>
      <p className="av-mensaje">
        {sujeto} <strong>{alerta.nombre}</strong> {verbo} el día{" "}
        <strong>{alerta.fecha}</strong>, actualice {accion} a la brevedad
      </p>
    </div>
  );
}
