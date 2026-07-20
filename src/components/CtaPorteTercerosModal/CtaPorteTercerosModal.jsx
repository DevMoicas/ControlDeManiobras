import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { overlayMotion, contentMotion } from "../../animations/modalMotion";
import DatePicker, { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import { format } from "date-fns";
import { X, Download, Loader } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import OperadorSelector from "../OperadorSelector/OperadorSelector";
import PlacasSelector from "../PlacasSelector/PlacasSelector";
import RemolqueSelector from "../RemolqueSelector/RemolqueSelector";
import FolioSelector from "../FolioSelector/FolioSelector";
import ClienteSelector from "../ClienteSelector/ClienteSelector";
import "react-datepicker/dist/react-datepicker.css";
import "./CtaPorteTercerosModal.css";

registerLocale("es", es);

const ESTADO_INICIAL = {
  // Remisión
  folio:       "",
  ccp:         "",   // editable, auto desde folio
  fecha_expedicion: null,  // Date object — selección manual

  // Origen / Destino — editables, auto desde folio
  origen:      "",
  destino:     "",

  // Datos del cliente
  cliente_nombre:    "",
  cliente_domicilio: "",
  cliente_colonia:   "",
  cliente_ciudad:    "",

  // Carga — solo lectura, auto desde folio
  tipo:        "",
  peso:        "",
  contenedor:  "",
  pedimento:   "",
  referencia:  "",

  // Texto libre
  descripcion: "",
  clave_sat:   "",

  // Conductor y placas — independientes
  operador:    "",
  placas:      "",
  remolque_1:  "",
  remolque_2:  "",
};

/**
 * CtaPorteTercerosModal
 * Formulario para llenar la hoja "CTA PORT FRABA CONTAINER" del template de
 * Terceros y descargar su PDF. No genera Bitácora de Gastos.
 *
 * Props:
 *   onCerrar  function
 */
export default function CtaPorteTercerosModal({ onCerrar }) {
  const [datos,     setDatos]     = useState(ESTADO_INICIAL);
  const [generando, setGenerando] = useState(false);
  const [error,     setError]     = useState(null);
  const [exito,     setExito]     = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCerrar]);

  // Auto-dismiss éxito
  useEffect(() => {
    if (!exito) return;
    const t = setTimeout(() => setExito(false), 3000);
    return () => clearTimeout(t);
  }, [exito]);

  // ── Lógica full/sencillo ───────────────────────────────────────────────────
  const esFullViaje         = (datos.contenedor || "").length > 12;
  const remolque2Habilitado = esFullViaje;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFolio = (maniobra) => {
    const esFull = (maniobra.contenedor || "").length > 12;
    setDatos((p) => ({
      ...p,
      folio:      maniobra.folio      || "",
      ccp:        maniobra.ccp        || "",   // auto, editable
      origen:     maniobra.origen     || "",   // auto, editable
      destino:    maniobra.destino    || "",   // auto, editable
      tipo:       maniobra.tipo       || "",
      peso:       maniobra.peso       || "",
      contenedor: maniobra.contenedor || "",
      pedimento:  maniobra.pedimento  || "",
      referencia: maniobra.referencia || "",
      // Operador, unidad y remolques recuperados del folio elegido
      operador:   maniobra.operador   || "",
      placas:     maniobra.placas     || "",
      remolque_1: maniobra.remolque_1 || "",
      // Remolque 2 solo aplica en viajes full; si no, queda vacío
      remolque_2: esFull ? (maniobra.remolque_2 || "") : "",
    }));
  };

  const handleCliente = (cliente) => {
    setDatos((p) => ({
      ...p,
      cliente_nombre:    cliente.nombre_cliente || "",
      cliente_domicilio: cliente.domicilio      || "",
      cliente_colonia:   cliente.colonia        || "",
      cliente_ciudad:    cliente.ciudad         || "",
    }));
  };

  const handleOperador = (nombre) => {
    setDatos((p) => ({ ...p, operador: nombre }));
  };

  // PlacasSelector / RemolqueSelector emiten (placas, objeto) — aquí basta el string
  const handlePlacas = (placas) => {
    setDatos((p) => ({ ...p, placas: placas || "" }));
  };

  const handleRemolque1 = (placas) => {
    setDatos((p) => ({ ...p, remolque_1: placas || "" }));
  };

  const handleRemolque2 = (placas) => {
    setDatos((p) => ({ ...p, remolque_2: placas || "" }));
  };

  const cambiarCampo = (campo, valor) => {
    setDatos((p) => ({ ...p, [campo]: valor }));
  };

  // ── Generar PDF ────────────────────────────────────────────────────────────

  /**
   * Utilidad interna: crea un enlace temporal, activa la descarga y lo elimina.
   */
  const triggerDownload = (blob, filename) => {
    const url  = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleGenerar = async (formato = "pdf") => {
    setError(null);
    setGenerando(true);

    const ext = formato === "excel" ? "xlsx" : "pdf";

    try {
      const payload = {
        formato,
        folio:             datos.folio,
        ccp:               datos.ccp,
        fecha_expedicion:  datos.fecha_expedicion
          ? format(datos.fecha_expedicion, "dd/MM/yyyy")
          : "",
        origen:            datos.origen,
        destino:           datos.destino,
        cliente_nombre:    datos.cliente_nombre,
        cliente_domicilio: datos.cliente_domicilio,
        cliente_colonia:   datos.cliente_colonia,
        cliente_ciudad:    datos.cliente_ciudad,
        tipo:              datos.tipo,
        peso:              datos.peso,
        contenedor:        datos.contenedor,
        pedimento:         datos.pedimento,
        referencia:        datos.referencia,
        descripcion:       datos.descripcion,
        clave_sat:         datos.clave_sat,
        operador:          datos.operador,
        placas:            datos.placas,
        remolque_1:        datos.remolque_1,
        remolque_2:        datos.remolque_2,
      };

      const blob = await apiClient.download("/documentos/cta-port-terceros/", payload);
      triggerDownload(blob, `CTA PTE ${datos.folio}.${ext}`);

      setExito(true);
    } catch (err) {
      setError(err.message || "Error al generar el documento.");
    } finally {
      setGenerando(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div className="cpm-overlay" {...overlayMotion}>
      <motion.div className="cpm-modal" {...contentMotion}>
        {/* Header */}
        <div className="cpm-header">
          <h2 className="cpm-titulo">CTA Porte Terceros</h2>
          <button type="button" className="cpm-cerrar" onClick={onCerrar}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="cpm-body">

          {/* Remisión: Folio + CCP */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Remisión</h3>
            <div className="cpm-fila-dos">
              <div className="cpm-campo">
                <label className="cpm-label">Folio <span className="cpm-req">*</span></label>
                <FolioSelector
                  currentValue={datos.folio}
                  onSelect={handleFolio}
                  disabled={false}
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">CCP (editable)</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.ccp}
                  onChange={(e) => cambiarCampo("ccp", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
            </div>
            <div className="cpm-campo" style={{ marginTop: 8 }}>
              <label className="cpm-label">Fecha de expedición</label>
              <DatePicker
                selected={datos.fecha_expedicion}
                onChange={(date) => setDatos((p) => ({ ...p, fecha_expedicion: date }))}
                locale="es"
                dateFormat="dd/MM/yyyy"
                placeholderText="dd/MM/yyyy"
                className="cpm-input"
                isClearable
              />
            </div>
          </div>

          {/* Origen / Destino */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Origen y Destino</h3>
            <div className="cpm-fila-dos">
              <div className="cpm-campo">
                <label className="cpm-label">Origen (editable)</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.origen}
                  onChange={(e) => cambiarCampo("origen", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Destino (editable)</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.destino}
                  onChange={(e) => cambiarCampo("destino", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
            </div>
          </div>

          {/* Cliente */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Cliente</h3>
            <div className="cpm-campo">
              <label className="cpm-label">Seleccionar cliente</label>
              <ClienteSelector
                currentValue={datos.cliente_nombre}
                onSelect={handleCliente}
                disabled={false}
              />
            </div>
            {datos.cliente_nombre && (
              <div className="cpm-cliente-info">
                <p className="cpm-cliente-dato"><strong>Nombre:</strong> {datos.cliente_nombre}</p>
                {datos.cliente_domicilio && <p className="cpm-cliente-dato"><strong>Domicilio:</strong> {datos.cliente_domicilio}</p>}
                {datos.cliente_colonia  && <p className="cpm-cliente-dato"><strong>Colonia:</strong>  {datos.cliente_colonia}</p>}
                {datos.cliente_ciudad   && <p className="cpm-cliente-dato"><strong>Ciudad:</strong>   {datos.cliente_ciudad}</p>}
              </div>
            )}
          </div>

          {/* Carga (solo lectura) */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Carga (auto desde folio)</h3>
            <div className="cpm-grid-cuatro">
              <div className="cpm-campo">
                <label className="cpm-label">Tipo</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.tipo}       readOnly placeholder="—" />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Peso</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.peso}       readOnly placeholder="—" />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Contenedor</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.contenedor} readOnly placeholder="—" />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Referencia</label>
                <input type="text" className="cpm-input cpm-input--readonly" value={datos.referencia} readOnly placeholder="—" />
              </div>
            </div>
            <div className="cpm-campo" style={{ marginTop: 8 }}>
              <label className="cpm-label">Pedimento</label>
              <input type="text" className="cpm-input cpm-input--readonly" value={datos.pedimento} readOnly placeholder="—" />
            </div>
            {datos.contenedor && (
              <p className="cpm-hint">
                Viaje: <strong>{esFullViaje ? "Full (2 contenedores)" : "Sencillo (1 contenedor)"}</strong>
              </p>
            )}
          </div>

          {/* Descripción y Clave SAT */}
          <div className="cpm-seccion">
            <div className="cpm-campo">
              <label className="cpm-label">Descripción</label>
              <textarea
                className="cpm-textarea"
                value={datos.descripcion}
                onChange={(e) => cambiarCampo("descripcion", e.target.value)}
                rows={3}
                placeholder="Descripción de la mercancía..."
              />
            </div>
            <div className="cpm-campo">
              <label className="cpm-label">Clave SAT</label>
              <input
                type="text"
                className="cpm-input"
                value={datos.clave_sat}
                onChange={(e) => cambiarCampo("clave_sat", e.target.value)}
                placeholder="Ej. 78101802"
              />
              {datos.clave_sat && (
                <p className="cpm-hint">En PDF: <code>CLAVE SAT:{datos.clave_sat}</code></p>
              )}
            </div>
          </div>

          {/* Conductor y Placas */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Conductor y Placas</h3>
            <div className="cpm-campo">
              <label className="cpm-label">Conductor</label>
              <OperadorSelector
                currentValue={datos.operador}
                onSelect={handleOperador}
                disabled={false}
              />
            </div>
            <div className="cpm-fila-tres">
              <div className="cpm-campo">
                <label className="cpm-label">Placas</label>
                <PlacasSelector
                  currentValue={datos.placas}
                  onSelect={handlePlacas}
                  disabled={false}
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Remolque 1</label>
                <RemolqueSelector
                  currentValue={datos.remolque_1}
                  onSelect={handleRemolque1}
                  disabled={false}
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Remolque 2</label>
                <RemolqueSelector
                  currentValue={datos.remolque_2}
                  onSelect={handleRemolque2}
                  disabled={!remolque2Habilitado}
                />
              </div>
            </div>
          </div>

          {/* Mensajes */}
          {error && <p className="cpm-error">{error}</p>}
          {exito && <p className="cpm-exito">Documento generado y descargado correctamente.</p>}
        </div>

        {/* Footer */}
        <div className="cpm-footer">
          <button type="button" className="cpm-btn-cancelar" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="cpm-btn-excel"
            onClick={() => handleGenerar("excel")}
            disabled={generando || !datos.folio}
          >
            <Download size={16} /> Descargar Excel
          </button>
          <button
            type="button"
            className="cpm-btn-generar"
            onClick={() => handleGenerar("pdf")}
            disabled={generando || !datos.folio}
          >
            {generando
              ? <><Loader size={16} className="cpm-spin" /> Generando documento...</>
              : <><Download size={16} /> Generar CTA Porte Terceros</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
