import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { overlayMotion, contentMotion } from "../../animations/modalMotion";
import { X, Download, Loader } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import OperadorSelector from "../OperadorSelector/OperadorSelector";
import PlacasSelector from "../PlacasSelector/PlacasSelector";
import RemolqueSelector from "../RemolqueSelector/RemolqueSelector";
import FolioSelector from "../FolioSelector/FolioSelector";
import { esServicioFull } from "../TipoServicioSelector/TipoServicioSelector";
import { sumarPeso } from "../../utils/sumarPeso.mjs";
import "./BitacoraGastosModal.css";

// Solo estos campos viajan al backend: DocumentoBitacoraGastosView lee 7 y
// descarta el resto en silencio (api/views.py:1252-1261). El folio ni siquiera
// lo mira, así que aquí sirve solo para llenar el formulario y nombrar el fichero.
const ESTADO_INICIAL = {
  destino:      "",
  operador:     "",
  placas:       "",
  remolque_1:   "",
  remolque_2:   "",
  total_gastos: "",
};

// Los campos que ACABAN IMPRESOS en la hoja: destino en B4, operador en B3, y
// placas + remolques concatenados en I2. Son los únicos que tiene sentido
// comparar entre los dos folios de un empate — si difieren, el documento sale
// con los del primero y conviene que se vea.
const CAMPOS_IMPRESOS = [
  { clave: "destino",    etiqueta: "Destino" },
  { clave: "operador",   etiqueta: "Operador" },
  { clave: "placas",     etiqueta: "Placas" },
  { clave: "remolque_1", etiqueta: "Remolque 1" },
  { clave: "remolque_2", etiqueta: "Remolque 2" },
];

/**
 * BitacoraGastosModal
 * Formulario de la hoja "BITACORA GASTOS". Antes vivía dentro de CtaPortModal,
 * que generaba los dos documentos de golpe; ahora es un documento propio.
 *
 * Empate: permite elegir un segundo folio y SUMAR los pesos de ambos. El resto
 * de datos salen siempre del primero.
 *
 * Props:
 *   onCerrar  function
 */
export default function BitacoraGastosModal({ onCerrar }) {
  const [datos,     setDatos]     = useState(ESTADO_INICIAL);
  const [maniobra1, setManiobra1] = useState(null);
  const [maniobra2, setManiobra2] = useState(null);
  const [empate,    setEmpate]    = useState(false);
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

  // Remolque 2 solo aplica en viajes full, igual que en los otros tres modales.
  const remolque2Habilitado = esServicioFull(maniobra1);

  // El peso se CALCULA, nunca se teclea: lo que se pinta es lo que se manda.
  const pesoTotal = sumarPeso(
    maniobra1?.peso ?? "",
    empate ? (maniobra2?.peso ?? "") : ""
  );

  const discrepancias = (empate && maniobra1 && maniobra2)
    ? CAMPOS_IMPRESOS.filter(
        ({ clave }) => (maniobra1[clave] || "") !== (maniobra2[clave] || "")
      )
    : [];

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFolio1 = (maniobra) => {
    setManiobra1(maniobra);
    setDatos((p) => ({
      ...p,
      destino:    maniobra.destino    || "",
      operador:   maniobra.operador   || "",
      placas:     maniobra.placas     || "",
      remolque_1: maniobra.remolque_1 || "",
      remolque_2: esServicioFull(maniobra) ? (maniobra.remolque_2 || "") : "",
    }));
  };

  // El segundo folio SOLO aporta su peso. Se guarda entero para poder comparar.
  const handleFolio2 = (maniobra) => setManiobra2(maniobra);

  const alternarEmpate = () => {
    const siguiente = !empate;
    setEmpate(siguiente);
    if (!siguiente) setManiobra2(null);   // apagarlo descarta el segundo folio
  };

  const cambiarCampo = (campo, valor) => {
    setDatos((p) => ({ ...p, [campo]: valor }));
  };

  const handleOperador  = (nombre) => cambiarCampo("operador", nombre || "");
  const handlePlacas    = (placas) => cambiarCampo("placas", placas || "");
  const handleRemolque1 = (placas) => cambiarCampo("remolque_1", placas || "");
  const handleRemolque2 = (placas) => cambiarCampo("remolque_2", placas || "");

  // ── Generar ────────────────────────────────────────────────────────────────

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
      const blob = await apiClient.download("/documentos/bitacora-gastos/", {
        formato,
        operador:     datos.operador,
        placas:       datos.placas,
        remolque_1:   datos.remolque_1,
        remolque_2:   datos.remolque_2,
        destino:      datos.destino,
        // Ya sumado. El backend lo vuelve a pasar por _sumar_peso, que acepta
        // un número suelto sin tocarlo.
        peso:         String(pesoTotal),
        total_gastos: datos.total_gastos,
      });
      triggerDownload(blob, `BITACORA GASTOS ${maniobra1?.folio || ""}.${ext}`);
      setExito(true);
    } catch (err) {
      setError(err.message || "Error al generar la Bitácora de Gastos.");
    } finally {
      setGenerando(false);
    }
  };

  const puedeGenerar =
    !generando &&
    Boolean(maniobra1) &&
    Boolean(datos.total_gastos) &&
    (!empate || Boolean(maniobra2));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div className="bgm-overlay" {...overlayMotion}>
      <motion.div className="bgm-modal" {...contentMotion}>
        {/* Header */}
        <div className="bgm-header">
          <h2 className="bgm-titulo">Bitácora de Gastos</h2>
          <button type="button" className="bgm-cerrar" onClick={onCerrar}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="bgm-body">

          {/* Folios */}
          <div className="bgm-seccion">
            <h3 className="bgm-seccion-titulo">Viaje</h3>

            <div className="bgm-campo">
              <label className="bgm-label">Folio <span className="bgm-req">*</span></label>
              <div className="bgm-folio-fila">
                <div className="bgm-folio-selector">
                  <FolioSelector
                    currentValue={maniobra1?.folio || ""}
                    onSelect={handleFolio1}
                    disabled={false}
                  />
                </div>
                <button
                  type="button"
                  className={`bgm-btn-empate${empate ? " bgm-btn-empate--activo" : ""}`}
                  onClick={alternarEmpate}
                  aria-pressed={empate}
                >
                  Empate
                </button>
              </div>
            </div>

            {empate && (
              <div className="bgm-campo bgm-campo--empate">
                <label className="bgm-label">
                  Folio del empate <span className="bgm-req">*</span>
                </label>
                <FolioSelector
                  currentValue={maniobra2?.folio || ""}
                  onSelect={handleFolio2}
                  disabled={false}
                />
                <p className="bgm-hint">
                  Solo aporta su peso. El resto de datos salen del primer folio.
                </p>
              </div>
            )}
          </div>

          {/* Peso */}
          <div className="bgm-seccion">
            <h3 className="bgm-seccion-titulo">Peso</h3>
            <div className="bgm-campo">
              <label className="bgm-label">
                {empate ? "Peso sumado (auto)" : "Peso (auto desde folio)"}
              </label>
              <input
                type="text"
                className="bgm-input bgm-input--peso"
                value={pesoTotal === "" ? "" : `${pesoTotal.toLocaleString("es-MX")} KG`}
                readOnly
                placeholder="—"
              />
              {empate && maniobra1 && maniobra2 && (
                <p className="bgm-hint">
                  {maniobra1.folio}: {maniobra1.peso || "—"} &nbsp;+&nbsp;{" "}
                  {maniobra2.folio}: {maniobra2.peso || "—"}
                </p>
              )}
            </div>
          </div>

          {/* Aviso de discrepancias — informa, no bloquea */}
          {discrepancias.length > 0 && (
            <div className="bgm-aviso">
              <p className="bgm-aviso-titulo">
                Los dos folios no coinciden en {discrepancias.length === 1 ? "un campo" : `${discrepancias.length} campos`} que se imprimen.
                Se usarán los del primer folio.
              </p>
              <ul className="bgm-aviso-lista">
                {discrepancias.map(({ clave, etiqueta }) => (
                  <li key={clave}>
                    <strong>{etiqueta}:</strong> {maniobra1[clave] || "—"}
                    {" ≠ "}
                    {maniobra2[clave] || "—"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Destino */}
          <div className="bgm-seccion">
            <h3 className="bgm-seccion-titulo">Destino</h3>
            <div className="bgm-campo">
              <label className="bgm-label">Destino (editable)</label>
              <input
                type="text"
                className="bgm-input"
                value={datos.destino}
                onChange={(e) => cambiarCampo("destino", e.target.value)}
                placeholder="Auto desde folio"
              />
            </div>
          </div>

          {/* Conductor y placas */}
          <div className="bgm-seccion">
            <h3 className="bgm-seccion-titulo">Conductor y Placas</h3>
            <div className="bgm-campo">
              <label className="bgm-label">Conductor</label>
              <OperadorSelector
                currentValue={datos.operador}
                onSelect={handleOperador}
                disabled={false}
              />
            </div>
            <div className="bgm-fila-tres">
              <div className="bgm-campo">
                <label className="bgm-label">Placas</label>
                <PlacasSelector
                  currentValue={datos.placas}
                  onSelect={handlePlacas}
                  disabled={false}
                />
              </div>
              <div className="bgm-campo">
                <label className="bgm-label">Remolque 1</label>
                <RemolqueSelector
                  currentValue={datos.remolque_1}
                  onSelect={handleRemolque1}
                  disabled={false}
                />
              </div>
              <div className="bgm-campo">
                <label className="bgm-label">Remolque 2</label>
                <RemolqueSelector
                  currentValue={datos.remolque_2}
                  onSelect={handleRemolque2}
                  disabled={!remolque2Habilitado}
                />
              </div>
            </div>
          </div>

          {/* Total de gastos */}
          <div className="bgm-seccion">
            <div className="bgm-campo">
              <label className="bgm-label">
                Total de Gastos <span className="bgm-req">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="bgm-input bgm-input--money"
                value={datos.total_gastos}
                onChange={(e) => cambiarCampo("total_gastos", e.target.value)}
                placeholder="Ej. 5000"
              />
            </div>
          </div>

          {/* Mensajes */}
          {error && <p className="bgm-error">{error}</p>}
          {exito && <p className="bgm-exito">Documento generado y descargado correctamente.</p>}
        </div>

        {/* Footer */}
        <div className="bgm-footer">
          <button type="button" className="bgm-btn-cancelar" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="bgm-btn-excel"
            onClick={() => handleGenerar("excel")}
            disabled={!puedeGenerar}
          >
            <Download size={16} /> Descargar Excel
          </button>
          <button
            type="button"
            className="bgm-btn-generar"
            onClick={() => handleGenerar("pdf")}
            disabled={!puedeGenerar}
          >
            {generando
              ? <><Loader size={16} className="bgm-spin" /> Generando documento...</>
              : <><Download size={16} /> Generar Bitácora de Gastos</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
