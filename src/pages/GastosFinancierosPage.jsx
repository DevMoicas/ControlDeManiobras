import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/apiClient";
import CeldaEditable from "../components/CeldaEditable/CeldaEditable";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import "./NominaPage.css";
import "./FacturacionPage.css";
import "./FinanzasCaptura.css";

// Gastos financieros (Fase 4, P23–P25, P53): lo que se captura a mano cada mes.
// Tres bloques porque cada uno se resta en un paso distinto de la utilidad; un
// mes sin capturas vale 0, y las comisiones empiezan vacías a propósito (P25).
const TIPOS = [
  ["financiero", "Gastos financieros", "Intereses de créditos, comisiones bancarias…"],
  ["impuesto", "Impuestos", "IVA, retenciones…"],
  ["comision", "Comisiones de ventas", "Mientras no se capture nada, valen 0."],
];

const moneda = (v) => Number(v || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
// Local y no toISOString(): en UTC, el último día del mes por la tarde ya sería
// el mes siguiente.
const mesDeHoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function GastosFinancierosPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const [acceso, setAcceso] = useState(null);
  const [mes, setMes] = useState(mesDeHoy);
  const [capturas, setCapturas] = useState([]);

  useEffect(() => {
    apiClient.get("/facturas/acceso/").then(setAcceso).catch(() => setAcceso({ ver: false }));
  }, []);

  const cargar = useCallback(async () => {
    try {
      setCapturas(await apiClient.get(`/capturas-mensuales/?mes=${mes}`));
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    }
  }, [mes, alerta]);

  useEffect(() => { if (acceso?.ver && mes) cargar(); }, [acceso, mes, cargar]);

  const agregar = async (e, tipo) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await apiClient.post("/capturas-mensuales/", { ...f, tipo, mes });
      e.target.reset();
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message?.startsWith("HTTP 400") ? "Falta el concepto o el monto no es válido." : err.message });
    }
  };

  const guardar = async (c, campo, valor) => {
    try {
      await apiClient.patch(`/capturas-mensuales/${c.id}/`, { [campo]: valor });
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    }
  };

  const borrar = async (c) => {
    if (!await preguntar({
      titulo: "Borrar captura", mensaje: "Deja de restarse en la utilidad de ese mes.",
      dato: `${c.concepto} · ${moneda(c.monto)}`, accion: "Borrar", peligro: true,
    })) return;
    try {
      await apiClient.delete(`/capturas-mensuales/${c.id}/`);
      cargar();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message });
    }
  };

  if (!acceso) return <div className="nomina-container" />;
  if (!acceso.ver) {
    return (
      <div className="nomina-container">
        <div className="error-box">
          <h2 className="error-title">Sin acceso</h2>
          <p className="error-text">Finanzas es solo para dirección, comercial y administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nomina-container">
      <div className="toolbar">
        <label className="fz-mes-selector">Mes
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
      </div>

      <div className="fz-bloques">
        {TIPOS.map(([tipo, titulo, ayuda]) => {
          const filas = capturas.filter((c) => c.tipo === tipo);
          return (
            <section key={tipo} className="fz-bloque">
              <header>
                <h2>{titulo}</h2>
                <strong>{moneda(filas.reduce((s, c) => s + Number(c.monto), 0))}</strong>
              </header>
              <p className="fz-ayuda">{ayuda}</p>
              <table className="nomina-table">
                <tbody>
                  {filas.map((c) => (
                    <tr key={c.id}>
                      <td><CeldaEditable valor={c.concepto} etiqueta="Concepto" max={255}
                        onGuardar={(v) => guardar(c, "concepto", v)} /></td>
                      <td className="fc-total"><CeldaEditable valor={c.monto} texto={moneda(c.monto)}
                        etiqueta={`Monto de ${c.concepto}`} onGuardar={(v) => guardar(c, "monto", v)} /></td>
                      {acceso.cancelar && (
                        <td><button className="fc-accion" onClick={() => borrar(c)}>Borrar</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <form className="fz-agregar" onSubmit={(e) => agregar(e, tipo)}>
                <input name="concepto" placeholder="Concepto" required maxLength={255} aria-label={`Concepto de ${titulo}`} />
                <input name="monto" type="number" step="0.01" placeholder="Monto" required aria-label={`Monto de ${titulo}`} />
                <button type="submit" className="fc-accion">Agregar</button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
