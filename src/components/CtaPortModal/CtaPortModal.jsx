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
import { getTipoServicioLabel, esServicioFull } from "../TipoServicioSelector/TipoServicioSelector";
import { cargaDeParte, tieneDosContenedores } from "../../utils/dobleValor.mjs";
import "react-datepicker/dist/react-datepicker.css";
import "./CtaPortModal.css";

registerLocale("es", es);

const ESTADO_INICIAL = {
  // Remisión
  folio:       "",
  ccp:         "",   // editable, auto desde folio
  fecha_expedicion: null,  // Date object — selección manual (H5)

  // Origen / Destino — editables, auto desde folio
  origen:      "",
  destino:     "",

  // Datos del cliente. cliente_id no va al documento: solo le dice al
  // ClienteSelector cuál homónimo está puesto (dos "YAZAKI" con distinta
  // dirección son indistinguibles por nombre).
  cliente_id:        null,
  cliente_nombre:    "",
  cliente_domicilio: "",
  cliente_colonia:   "",
  cliente_ciudad:    "",

  // Carga — auto desde folio y editable: el documento puede acotarse a lo que
  // realmente viaja. Nada de esto se guarda en la maniobra (ver handleGenerar:
  // la única llamada de red del modal es la descarga del documento).
  tipo_servicio: "",
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
 * CtaPortModal
 * Formulario para llenar la hoja "CTA PORT FRABA CONTAINER" y descargar su PDF.
 *
 * Props:
 *   onCerrar  function
 */
export default function CtaPortModal({ onCerrar }) {
  const [datos,     setDatos]     = useState(ESTADO_INICIAL);
  const [generando, setGenerando] = useState(false);
  const [error,     setError]     = useState(null);
  const [exito,     setExito]     = useState(false);
  // Folio elegido en crudo: hace falta para poder rehacer el reparto de la carga
  // sin volver a pedirlo. Y la parte elegida: "ambos" por defecto, que es lo que
  // hacía el sistema antes de que este desplegable existiera.
  const [folioElegido, setFolioElegido] = useState(null);
  const [parteCarga,   setParteCarga]   = useState("ambos");

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

  // ── Lógica full/sencillo/carga suelta ──────────────────────────────────────
  // Lo dictamina el campo tipo_servicio de la maniobra. Los registros anteriores
  // a ese campo no lo traen: ahí se conserva la heurística vieja (>12 caracteres).
  // Solo etiqueta el servicio en el resumen de la carga: el Remolque 2 ya NO
  // depende de esto — un sencillo también puede llevar dos.
  const esFullViaje = esServicioFull(datos);

  // El backend parte el tipo por la diagonal (_parsear_tipo) y sin ella devuelve
  // las cuatro piezas vacías: el PDF sale con esa línea en blanco y sin error.
  // Avisa, no bloquea: el formato podría cambiar y nadie se queda sin documento.
  const tipoSinDiagonal = datos.tipo.trim() !== "" && !datos.tipo.includes("/");

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFolio = (maniobra) => {
    // `parte` la manda el backend: '1'/'2' cuando la maniobra tiene dos
    // operadores (cada folio se lleva su contenedor y no hay nada que elegir),
    // 'ambos' cuando tiene uno solo. El reparto lo hace cargaDeParte, que
    // entiende tanto las columnas nuevas como el formato viejo de una sola.
    const parte = maniobra.parte || "ambos";
    setFolioElegido(maniobra);
    setParteCarga(parte);
    setDatos((p) => ({
      ...p,
      folio:      maniobra.folio      || "",
      ccp:        maniobra.ccp        || "",   // auto, editable
      origen:     maniobra.origen     || "",   // auto, editable
      destino:    maniobra.destino    || "",   // auto, editable
      tipo_servicio: maniobra.tipo_servicio || "",
      ...cargaDeParte(maniobra, parte),
      pedimento:  maniobra.pedimento  || "",
      referencia: maniobra.referencia || "",
      // Operador, unidad y remolques recuperados del folio elegido
      operador:   maniobra.operador   || "",
      placas:     maniobra.placas     || "",
      remolque_1: maniobra.remolque_1 || "",
      remolque_2: maniobra.remolque_2 || "",
      // Cliente del folio, editable después con el ClienteSelector. Se pisa
      // siempre —igual que origen/destino— para no mezclar el cliente de un
      // folio con la carga de otro; si la maniobra no lo trae, queda vacío.
      cliente_id:        maniobra.cliente_id       ?? null,
      cliente_nombre:    maniobra.cliente_nombre    || "",
      cliente_domicilio: maniobra.cliente_domicilio || "",
      cliente_colonia:   maniobra.cliente_colonia   || "",
      cliente_ciudad:    maniobra.cliente_ciudad    || "",
    }));
  };

  const handleCliente = (cliente) => {
    setDatos((p) => ({
      ...p,
      cliente_id:        cliente.id             ?? null,
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

  // Elegir contenedor reescribe los tres campos de la carga a la vez: dejarlos
  // sueltos permitiría un documento con el tipo de uno y el peso del otro.
  // Pisa lo tecleado a mano, y es lo que se espera al cambiar de contenedor.
  const elegirParte = (parte) => {
    setParteCarga(parte);
    setDatos((p) => ({ ...p, ...cargaDeParte(folioElegido, parte) }));
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
        tipo_servicio:     datos.tipo_servicio,
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

      const blobCtaPort = await apiClient.download("/documentos/cta-port/", payload);
      triggerDownload(blobCtaPort, `CTA PTE ${datos.folio}.${ext}`);

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
          <h2 className="cpm-titulo">CTA Port Fraba Container</h2>
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
                <label className="cpm-label">CCP</label>
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
                <label className="cpm-label">Origen</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.origen}
                  onChange={(e) => cambiarCampo("origen", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Destino</label>
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
                currentId={datos.cliente_id}
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

          {/* Carga — auto desde folio y editable */}
          <div className="cpm-seccion">
            <h3 className="cpm-seccion-titulo">Carga</h3>
            {/* Solo cuando la maniobra tiene UN operador y dos contenedores: es
                el único caso ambiguo (¿los lleva los dos o solo uno?). Con dos
                operadores manda el folio y no hay nada que elegir. */}
            {tieneDosContenedores(folioElegido) && (
              <div className="cpm-campo" style={{ marginBottom: 10 }}>
                <label className="cpm-label" htmlFor="cpm-parte-carga">
                  Contenedores en este documento
                </label>
                <select
                  id="cpm-parte-carga"
                  className="cpm-input"
                  value={parteCarga}
                  onChange={(e) => elegirParte(e.target.value)}
                >
                  <option value="ambos">Los dos</option>
                  <option value="1">Solo el 1º</option>
                  <option value="2">Solo el 2º</option>
                </select>
              </div>
            )}
            <div className="cpm-grid-cuatro">
              <div className="cpm-campo">
                <label className="cpm-label">Tipo</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.tipo}
                  onChange={(e) => cambiarCampo("tipo", e.target.value)}
                  placeholder="Ej. 40 / HC"
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Peso</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.peso}
                  onChange={(e) => cambiarCampo("peso", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Contenedor</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.contenedor}
                  onChange={(e) => cambiarCampo("contenedor", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
              <div className="cpm-campo">
                <label className="cpm-label">Referencia</label>
                <input
                  type="text"
                  className="cpm-input"
                  value={datos.referencia}
                  onChange={(e) => cambiarCampo("referencia", e.target.value)}
                  placeholder="Auto desde folio"
                />
              </div>
            </div>
            {tipoSinDiagonal && (
              <p className="cpm-error" style={{ marginTop: 8 }}>
                El Tipo debe llevar diagonal (ej. <code>40 / HC</code>). Sin ella esa
                línea sale en blanco en el documento.
              </p>
            )}
            <div className="cpm-campo" style={{ marginTop: 8 }}>
              <label className="cpm-label">Pedimento</label>
              <input
                type="text"
                className="cpm-input"
                value={datos.pedimento}
                onChange={(e) => cambiarCampo("pedimento", e.target.value)}
                placeholder="Auto desde folio"
              />
            </div>
            {datos.contenedor && (
              <p className="cpm-hint">
                Tipo de servicio:{" "}
                <strong>
                  {datos.tipo_servicio
                    ? getTipoServicioLabel(datos.tipo_servicio)
                    : (esFullViaje ? "Full" : "Sencillo")}
                </strong>
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
                  disabled={false}
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
              : <><Download size={16} /> Generar Carta Porte</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
