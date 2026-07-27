import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { overlayMotion, contentMotion } from "../../animations/modalMotion";
import DatePicker from "react-datepicker";
import { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import { format } from "date-fns";
import { X, Download, Loader } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import OperadorSelector from "../OperadorSelector/OperadorSelector";
import PlacasSelector from "../PlacasSelector/PlacasSelector";
import RemolqueSelector from "../RemolqueSelector/RemolqueSelector";
import FolioSelector from "../FolioSelector/FolioSelector";
import { esServicioFull } from "../TipoServicioSelector/TipoServicioSelector";
import "react-datepicker/dist/react-datepicker.css";
import "./BitacoraSuenoModal.css";

registerLocale("es", es);

const ESTADO_INICIAL = {
  operador:     "",
  placas:       "",
  remolque_1:   "",
  remolque_2:   "",
  folio:        "",
  unidad:       "",   // auto desde tracto.unidad al elegir placas
  anio:         "",   // auto desde tracto.anio al elegir placas
  origen:       "",   // auto al elegir folio
  destino:      "",   // auto al elegir folio
  contenedor:   "",   // auto al elegir folio (fallback full/sencillo en registros viejos)
  tipo_servicio: "",  // auto al elegir folio — dictamina si el viaje es full
  fecha_salida: null, // Date object
  fecha_llegada: null,
};

/**
 * BitacoraSuenoModal
 * Formulario para llenar la hoja "BITÁCORA DE SUEÑO" y descargar su PDF.
 *
 * Props:
 *   onCerrar  function — cierra el modal
 */
export default function BitacoraSuenoModal({ onCerrar }) {
  const [datos,      setDatos]      = useState(ESTADO_INICIAL);
  const [empate,     setEmpate]     = useState(false);
  const [folio2,     setFolio2]     = useState("");
  const [generando,  setGenerando]  = useState(false);
  const [error,      setError]      = useState(null);
  const [exito,      setExito]      = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCerrar]);

  // Auto-dismiss del mensaje de éxito
  useEffect(() => {
    if (!exito) return;
    const t = setTimeout(() => setExito(false), 3000);
    return () => clearTimeout(t);
  }, [exito]);

  // ── Handlers de selección ──────────────────────────────────────────────────

  const handleOperador = (nombre) => {
    setDatos((p) => ({ ...p, operador: nombre }));
  };

  // PlacasSelector emite (placas, tractoCompleto) — usamos el objeto para unidad/anio
  const handlePlacas = (placas, tracto = {}) => {
    setDatos((p) => ({
      ...p,
      placas: placas || "",
      unidad: tracto.unidad || "",
      anio:   String(tracto.anio || ""),
    }));
  };

  const handleRemolque1 = (placas) => {
    setDatos((p) => ({ ...p, remolque_1: placas || "" }));
  };

  const handleRemolque2 = (placas) => {
    setDatos((p) => ({ ...p, remolque_2: placas || "" }));
  };

  const handleFolio = (maniobra) => {
    setDatos((p) => ({
      ...p,
      folio:      maniobra.folio      || "",
      origen:     maniobra.origen     || "",
      destino:    maniobra.destino    || "",
      contenedor: maniobra.contenedor || "",
      tipo_servicio: maniobra.tipo_servicio || "",
      // Operador, unidad y remolques recuperados del folio elegido
      operador:   maniobra.operador    || "",
      placas:     maniobra.placas      || "",
      unidad:     maniobra.tipo_unidad || "",
      anio:       maniobra.anio        || "",
      remolque_1: maniobra.remolque_1  || "",
      remolque_2: maniobra.remolque_2  || "",
    }));
  };

  // El empate solo aporta su folio: se une al primero en la misma casilla (U9).
  const handleFolio2 = (maniobra) => setFolio2(maniobra.folio || "");

  const alternarEmpate = () => {
    const siguiente = !empate;
    setEmpate(siguiente);
    if (!siguiente) setFolio2("");   // apagarlo descarta el segundo folio
  };

  const folioFinal = empate && folio2 ? `${datos.folio}, ${folio2}` : datos.folio;

  // ── Lógica remolque 2: habilitado solo en viajes full ──────────────────────
  // Lo dictamina el tipo_servicio de la maniobra; los registros anteriores a ese
  // campo caen a la heurística vieja (contenedor > 12 caracteres).
  const remolque2Habilitado = esServicioFull(datos);

  // ── Generar PDF ────────────────────────────────────────────────────────────

  const handleGenerar = async (formato = "pdf") => {
    setError(null);
    setGenerando(true);

    const ext = formato === "excel" ? "xlsx" : "pdf";

    try {
      const payload = {
        formato,
        operador:      datos.operador,
        placas:        datos.placas,
        remolque_1:    datos.remolque_1,
        remolque_2:    datos.remolque_2,
        folio:         folioFinal,
        unidad:        datos.unidad,
        anio:          datos.anio,
        origen:        datos.origen,
        destino:       datos.destino,
        fecha_salida:  datos.fecha_salida
          ? format(datos.fecha_salida, "dd/MM/yyyy")
          : "",
        fecha_llegada: datos.fecha_llegada
          ? format(datos.fecha_llegada, "dd/MM/yyyy")
          : "",
      };

      const blob = await apiClient.download("/documentos/bitacora-sueno/", payload);

      // Crear enlace de descarga temporal
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = `BITACORA SUEÑO ${folioFinal}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExito(true);
    } catch (err) {
      setError(err.message || "Error al generar el PDF.");
    } finally {
      setGenerando(false);
    }
  };

  // Con empate activo hace falta el segundo folio: si no, el documento saldría
  // con uno solo y nadie se enteraría.
  const puedeGenerar = !generando && Boolean(datos.placas) && (!empate || Boolean(folio2));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div className="bsm-overlay" {...overlayMotion}>
      <motion.div className="bsm-modal" {...contentMotion}>
        {/* Header */}
        <div className="bsm-header">
          <h2 className="bsm-titulo">Bitácora de Sueño</h2>
          <button type="button" className="bsm-cerrar" onClick={onCerrar}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="bsm-body">

          {/* CTA Porte (Folio) — primero: autollena unidad y remolques */}
          <div className="bsm-campo">
            <label className="bsm-label">CTA Porte (Folio)</label>
            <div className="bsm-folio-fila">
              <div className="bsm-folio-selector">
                <FolioSelector
                  currentValue={datos.folio}
                  onSelect={handleFolio}
                  disabled={false}
                />
              </div>
              <button
                type="button"
                className={`bsm-btn-empate${empate ? " bsm-btn-empate--activo" : ""}`}
                onClick={alternarEmpate}
                aria-pressed={empate}
              >
                Empate
              </button>
            </div>
          </div>

          {empate && (
            <div className="bsm-campo bsm-campo--empate">
              <label className="bsm-label">
                Folio del empate <span className="bsm-req">*</span>
              </label>
              <FolioSelector
                currentValue={folio2}
                onSelect={handleFolio2}
                disabled={false}
              />
              <p className="bsm-hint">
                Los dos folios salen juntos en la misma casilla: {folioFinal || "—"}
              </p>
            </div>
          )}

          {/* Operador */}
          <div className="bsm-campo">
            <label className="bsm-label">Nombre del Operador <span className="bsm-req">*</span></label>
            <OperadorSelector
              currentValue={datos.operador}
              onSelect={handleOperador}
              disabled={false}
            />
          </div>

          {/* Placas y Remolques */}
          <div className="bsm-campo">
            <label className="bsm-label">Placas y Remolques</label>
            <div className="bsm-fila-selectores">
              <div className="bsm-selector-item">
                <span className="bsm-sub-label">Placas</span>
                <PlacasSelector
                  currentValue={datos.placas}
                  onSelect={handlePlacas}
                  disabled={false}
                />
              </div>
              <div className="bsm-selector-item">
                <span className="bsm-sub-label">Remolque 1</span>
                <RemolqueSelector
                  currentValue={datos.remolque_1}
                  onSelect={handleRemolque1}
                  disabled={false}
                />
              </div>
              <div className="bsm-selector-item">
                <span className="bsm-sub-label">Remolque 2</span>
                <RemolqueSelector
                  currentValue={datos.remolque_2}
                  onSelect={handleRemolque2}
                  disabled={!remolque2Habilitado}
                />
              </div>
            </div>
            {datos.folio && !remolque2Habilitado && (
              <p className="bsm-hint">Remolque 2 disponible solo para viajes con tipo de servicio Full.</p>
            )}
          </div>

          {/* Tipo de Unidad y Modelo — solo lectura, auto-llenados */}
          <div className="bsm-fila-dos">
            <div className="bsm-campo">
              <label className="bsm-label">Tipo de Unidad</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.unidad}
                readOnly
                placeholder="Se llena al elegir placas"
              />
            </div>
            <div className="bsm-campo">
              <label className="bsm-label">Modelo</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.anio}
                readOnly
                placeholder="Se llena al elegir placas"
              />
            </div>
          </div>

          {/* Origen y Destino — solo lectura, auto-llenados desde folio */}
          <div className="bsm-fila-dos">
            <div className="bsm-campo">
              <label className="bsm-label">Origen del Viaje</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.origen}
                readOnly
                placeholder="Se llena al elegir folio"
              />
            </div>
            <div className="bsm-campo">
              <label className="bsm-label">Destino</label>
              <input
                type="text"
                className="bsm-input bsm-input--readonly"
                value={datos.destino}
                readOnly
                placeholder="Se llena al elegir folio"
              />
            </div>
          </div>

          {/* Fechas */}
          <div className="bsm-fila-dos">
            <div className="bsm-campo">
              <label className="bsm-label">Fecha de Salida</label>
              <DatePicker
                selected={datos.fecha_salida}
                onChange={(date) => setDatos((p) => ({ ...p, fecha_salida: date }))}
                locale="es"
                dateFormat="dd/MM/yyyy"
                placeholderText="dd/MM/yyyy"
                className="bsm-input bsm-datepicker"
                isClearable
              />
            </div>
            <div className="bsm-campo">
              <label className="bsm-label">Fecha de Llegada</label>
              <DatePicker
                selected={datos.fecha_llegada}
                onChange={(date) => setDatos((p) => ({ ...p, fecha_llegada: date }))}
                locale="es"
                dateFormat="dd/MM/yyyy"
                placeholderText="dd/MM/yyyy"
                className="bsm-input bsm-datepicker"
                isClearable
              />
            </div>
          </div>

          {/* Mensajes de error / éxito */}
          {error && <p className="bsm-error">{error}</p>}
          {exito && <p className="bsm-exito">Documento generado y descargado correctamente.</p>}
        </div>

        {/* Footer */}
        <div className="bsm-footer">
          <button type="button" className="bsm-btn-cancelar" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="bsm-btn-excel"
            onClick={() => handleGenerar("excel")}
            disabled={!puedeGenerar}
          >
            <Download size={16} /> Descargar Excel
          </button>
          <button
            type="button"
            className="bsm-btn-generar"
            onClick={() => handleGenerar("pdf")}
            disabled={!puedeGenerar}
          >
            {generando
              ? <><Loader size={16} className="bsm-spin" /> Generando...</>
              : <><Download size={16} /> Generar PDF</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
