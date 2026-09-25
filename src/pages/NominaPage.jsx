import { useState, useMemo, useRef, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { CalendarDays } from "lucide-react";
import { useNomina } from "../hooks/useNomina";
import { filtrarBusqueda } from "../utils/buscar.mjs";
import SearchBar from "../components/SearchBar/SearchBar";
import CeldaEditable from "../components/CeldaEditable/CeldaEditable";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import CalendarioVacaciones from "../components/CalendarioVacaciones/CalendarioVacaciones";
import { useAlerta } from "../components/Alertas/Alertas";
import "./NominaPage.css";

// Las columnas, EN EL ORDEN que pidió el usuario. `editable: false` no es
// decorativo: nombre y puesto son del catálogo de empleados —se cambian allí, no
// aquí— y prima y días de vacaciones los CALCULA el servidor a partir de la
// fecha de ingreso, así que escribirlos a mano sería inventar un número que el
// siguiente refresco borraría.
const COLUMNAS = [
  { key: "nombre",           label: "Nombre" },
  { key: "puesto",           label: "Puesto" },
  { key: "sueldo",           label: "Sueldo",             editable: true, moneda: true },
  { key: "prima_vacacional", label: "Prima Vacacional",   moneda: true },
  { key: "dias_vacaciones",  label: "Días de Vacaciones" },
  { key: "dias_tomados",     label: "Días Tomados",       editable: true },
  { key: "finiquito",        label: "Finiquito",          editable: true, moneda: true },
];

const formatMoneda = (valor) => {
  if (valor == null || valor === "") return "";
  const num = Number(valor);
  return Number.isNaN(num) ? valor : `$${num.toFixed(2)}`;
};

// Los días llegan como decimal ("8.00") porque la celda acepta sumas. En la
// tabla se leen como días: 8, no 8.00 — y 7.5 sigue enseñándose entero.
const formatDias = (valor) => {
  if (valor == null || valor === "") return "";
  const num = Number(valor);
  if (Number.isNaN(num)) return valor;
  return String(Number(num.toFixed(2)));
};

const fechaLegible = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

export default function NominaPage() {
  const alerta = useAlerta();
  const { filas, loading, error, guardar } = useNomina();
  const [busqueda, setBusqueda] = useState("");
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const tablaRef = useRef(null);

  // filtrarBusqueda mira TODOS los valores de la fila, como en el resto de las
  // tablas: buscar "coordinador" encuentra por puesto sin declarar campos.
  const visibles = useMemo(() => filtrarBusqueda(filas, busqueda), [filas, busqueda]);

  const guardarCampo = useCallback(async (fila, campo, valor) => {
    try {
      await guardar(fila, campo, valor);
    } catch (err) {
      // El 400 del backend viaja en `detail` y el apiClient lo pone en message:
      // una fórmula mal escrita o un importe imposible se explican solos.
      alerta({ tipo: "error", msg: err.message || "No se pudo guardar." });
    }
  }, [guardar, alerta]);

  if (loading) {
    return (
      <div className="nomina-container">
        <div className="loading-box"><p className="loading-text">Cargando nómina…</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nomina-container">
        <div className="error-box">
          <h2 className="error-title">No se pudo cargar</h2>
          <p className="error-text">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nomina-container">

      <div className="np-search">
        <SearchBar
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por nombre o puesto…"
        />
      </div>

      <div className="toolbar">
        <div className="np-resumen">
          {visibles.length} {visibles.length === 1 ? "empleado" : "empleados"}
        </div>
        <div className="toolbar-acciones">
          <button
            className="np-btn-calendario"
            onClick={() => setCalendarioAbierto(true)}
            title="Registrar los días de vacaciones de cada empleado"
          >
            <CalendarDays size={18} /> Calendario
          </button>
        </div>
      </div>

      <div className="bst-zona">
      <BarraScrollTabla contenedorRef={tablaRef} />

      <div className="table-responsive tabla-cabecera-fija" ref={tablaRef}>
        <table className="nomina-table">
          <thead>
            <tr>
              {COLUMNAS.map((col) => <th key={col.key}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="np-vacio">
                  No hay empleados que mostrar. Se dan de alta en Catálogos.
                </td>
              </tr>
            ) : (
              visibles.map((fila) => (
                // De baja: la fila se atenúa pero SIGUE aquí, para poder
                // cerrarle el finiquito después de la salida (usuario, 2026-09-03).
                <tr
                  key={fila.empleado}
                  className={fila.fecha_salida ? "np-baja" : ""}
                  title={fila.fecha_salida
                    ? `Baja el ${fechaLegible(fila.fecha_salida)}`
                    : undefined}
                >
                  {COLUMNAS.map((col) => (
                    <td key={col.key}>
                      {col.key === "nombre" ? (
                        <span className="np-nombre">
                          {fila.nombre}
                          {fila.fecha_salida && (
                            <span className="np-etiqueta-baja">
                              Baja {fechaLegible(fila.fecha_salida)}
                            </span>
                          )}
                        </span>
                      ) : col.key === "dias_vacaciones" ? (
                        // Los días salen de la antigüedad, y la antigüedad de la
                        // fecha de ingreso: si no hay una legible en el catálogo,
                        // el cero no es un dato, es un aviso de que falta.
                        <span
                          className={fila.antiguedad_anios === 0 && !fila.fecha_ingreso
                            ? "np-sin-dato" : undefined}
                          title={fila.fecha_ingreso
                            ? `${fila.antiguedad_anios} año(s) desde ${fila.fecha_ingreso}`
                            : "Sin fecha de ingreso en Catálogos"}
                        >
                          {fila.dias_vacaciones}
                        </span>
                      ) : !col.editable ? (
                        <span className="np-calculado">
                          {col.moneda ? formatMoneda(fila[col.key]) : (fila[col.key] || "")}
                        </span>
                      ) : (
                        <CeldaEditable
                          /* Como en Excel: la tabla enseña el total y al abrir la
                             celda aparece el desglose que se escribió. Solo DÍAS
                             TOMADOS guarda fórmula; en las demás no hay ninguna
                             que leer y `valor` cae al número. */
                          valor={fila.formulas?.[col.key] ?? fila[col.key] ?? ""}
                          texto={col.moneda
                            ? formatMoneda(fila[col.key])
                            : formatDias(fila[col.key])}
                          etiqueta={`${col.label} de ${fila.nombre}`}
                          onGuardar={(val) => guardarCampo(fila, col.key, val)}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      <AnimatePresence>
        {calendarioAbierto && (
          <CalendarioVacaciones onCerrar={() => setCalendarioAbierto(false)} />
        )}
      </AnimatePresence>

      <BotonArriba />
    </div>
  );
}
