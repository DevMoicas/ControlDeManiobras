import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { overlayMotion, contentMotion } from "../../animations/modalMotion";
import { Paperclip, X, Upload, Eye, Trash2, ExternalLink } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { useConfirmacion } from "../Confirmacion/Confirmacion";
import "./DocumentoCelda.css";

// Lo que acepta el servidor para estos documentos. Aquí se repite a propósito:
// rebotar 10 MB después de subirlos por el dato del celular es lo que se evita.
const TIPOS_OK = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

// Los documentos NO se recomprimen —a diferencia de las fotos de maniobras—:
// una tarjeta de circulación reducida a JPEG deja de servir de comprobante.

/**
 * El data URI que devuelve la API, como URL de blob.
 *
 * Para las imágenes bastaría el data URI, pero el PDF se ve en un <iframe> y ahí
 * Chrome no carga un `data:` — ni al abrirlo en otra pestaña, que también bloquea
 * la navegación de nivel superior a un `data:`. Con un blob se comporta como un
 * archivo del disco en los dos sitios, así que se usa el mismo camino para todo.
 */
function aBlobUrl(dataUri) {
  const [cabecera, base64] = dataUri.split(",");
  const mime = cabecera.slice(cabecera.indexOf(":") + 1, cabecera.indexOf(";"));
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { url: URL.createObjectURL(new Blob([bytes], { type: mime })), mime };
}

/**
 * El clip de una columna con documento (Tarjeta de Circulación, Permisos Full…).
 *
 * Props:
 *   tipo       tipo de FotoRegistro ('tracto_tarjeta', 'remolque_full'…)
 *   registroId id del tracto o del remolque
 *   etiqueta   lo que se lee en el título del modal
 *   huecos     1, o 2 en Permisos Full (el permiso suele venir en dos hojas)
 *   tiene      si ya hay algo subido, para pintar el clip lleno sin abrirlo
 *   isAdmin    solo el admin borra, como en el resto del proyecto
 *   onCambio   avisa a la tabla de que este registro ya tiene (o dejó de tener)
 */
export default function DocumentoCelda({
  tipo, registroId, etiqueta, huecos = 1, tiene = false, isAdmin = false, onCambio,
}) {
  const [abierto, setAbierto] = useState(false);
  const [archivos, setArchivos] = useState({ foto_1: null, foto_2: null });
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(null);   // slot en curso
  const [error, setError] = useState(null);
  const [viendo, setViendo] = useState(null);     // { slot, url, mime } | null
  const preguntar = useConfirmacion();
  const inputs = useRef({});
  // Las URLs de blob se revocan al cerrar: el navegador las mantiene vivas
  // mientras exista la pestaña, y aquí puede haber 10 MB detrás de cada una.
  const urls = useRef([]);

  const recargar = async () => {
    const data = await apiClient.get(`/fotos/?tipo=${tipo}&registro_id=${registroId}`);
    setArchivos(data);
    onCambio?.(tipo, registroId, Boolean(data.foto_1 || data.foto_2));
    return data;
  };

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setError(null);
    recargar()
      // Con un solo hueco no hay nada que elegir: si ya hay documento se abre
      // directo, que es a lo que se venía.
      .then((data) => { if (huecos === 1 && data.foto_1) ver(1, data); })
      .catch(() => setError("No se pudo cargar el documento."))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, tipo, registroId]);

  const soltarUrls = () => {
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
  };

  useEffect(() => soltarUrls, []);

  const cerrar = () => {
    soltarUrls();
    setViendo(null);
    setAbierto(false);
  };

  const ver = (slot, datos = archivos) => {
    const dataUri = datos[`foto_${slot}`];
    if (!dataUri) return;
    const { url, mime } = aBlobUrl(dataUri);
    urls.current.push(url);
    setViendo({ slot, url, mime });
  };

  const subir = async (slot, archivo) => {
    if (!archivo) return;
    if (!TIPOS_OK.includes(archivo.type)) {
      setError("Formato no permitido. Use PDF, JPG, PNG o WEBP.");
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError("El archivo no puede superar 10 MB.");
      return;
    }

    setError(null);
    setOcupado(slot);
    const formData = new FormData();
    formData.append("tipo", tipo);
    formData.append("registro_id", String(registroId));
    formData.append("slot", String(slot));
    formData.append("foto", archivo);
    try {
      await apiClient.upload("/fotos/subir/", formData);
      // Lo que se esté viendo es el archivo VIEJO: se cierra para no enseñar
      // una cosa mientras la fila ya dice otra.
      setViendo(null);
      await recargar();
    } catch (err) {
      setError(err.message || "No se pudo subir el archivo.");
    } finally {
      setOcupado(null);
    }
  };

  const eliminar = async (slot) => {
    if (!await preguntar({
      titulo: "Eliminar documento",
      mensaje: "Se borra del registro y no se puede recuperar.",
      dato: etiqueta,
      accion: "Eliminar",
      peligro: true,
    })) return;

    setError(null);
    setOcupado(slot);
    try {
      await apiClient.delete(`/fotos/eliminar/?tipo=${tipo}&registro_id=${registroId}&slot=${slot}`);
      if (viendo?.slot === slot) setViendo(null);
      await recargar();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el documento.");
    } finally {
      setOcupado(null);
    }
  };

  const slots = huecos === 2 ? [1, 2] : [1];

  return (
    <>
      <button
        type="button"
        className={`doc-clip ${tiene ? "doc-clip--lleno" : ""}`}
        title={tiene ? `Ver ${etiqueta}` : `Subir ${etiqueta}`}
        aria-label={tiene ? `Ver ${etiqueta}` : `Subir ${etiqueta}`}
        onClick={() => setAbierto(true)}
      >
        <Paperclip size={15} />
      </button>

      {/* En un portal a <body> y con estilos propios: el modal nace dentro de una
          celda de la tabla, y el `position: fixed` de un overlay deja de ser
          respecto a la ventana en cuanto un ancestro tenga transform. Además así
          no depende del CSS de la página que lo use. */}
      {abierto && createPortal(
        <motion.div className="doc-overlay" {...overlayMotion} onClick={cerrar}>
          <motion.div
            className={`doc-caja ${viendo ? "doc-caja--ancha" : ""}`}
            {...contentMotion}
            role="dialog"
            aria-modal="true"
            aria-label={etiqueta}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="doc-cabecera">
              <h2 className="doc-titulo">{etiqueta}</h2>
              <button type="button" className="doc-cerrar" onClick={cerrar} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {error && <p className="doc-error" role="alert">{error}</p>}
            {cargando && <p className="doc-nota">Cargando…</p>}

            {!cargando && slots.map((slot) => {
              const hay = Boolean(archivos[`foto_${slot}`]);
              const mirando = viendo?.slot === slot;
              return (
                <div key={slot} className="doc-fila">
                  <span className="doc-nombre">
                    {huecos === 2 ? `Archivo ${slot}` : "Archivo"}
                    {!hay && <em className="doc-vacio"> — sin subir</em>}
                  </span>

                  <div className="doc-acciones">
                    {hay && (
                      <button
                        type="button"
                        className={`doc-btn ${mirando ? "doc-btn--activo" : ""}`}
                        onClick={() => (mirando ? setViendo(null) : ver(slot))}
                        title={mirando ? "Ocultar" : "Ver"}
                      >
                        <Eye size={18} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="doc-btn"
                      title={hay ? "Reemplazar" : "Subir"}
                      disabled={ocupado === slot}
                      onClick={() => inputs.current[slot]?.click()}
                    >
                      <Upload size={18} />
                    </button>
                    {hay && isAdmin && (
                      <button type="button" className="doc-btn doc-btn--rojo" title="Eliminar"
                              disabled={ocupado === slot} onClick={() => eliminar(slot)}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>

                  <input
                    ref={(el) => { inputs.current[slot] = el; }}
                    type="file"
                    hidden
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      subir(slot, e.target.files?.[0]);
                      e.target.value = "";   // el mismo archivo se puede reintentar
                    }}
                  />
                </div>
              );
            })}

            {/* El documento se ve DENTRO de la app, sin salir de Catálogos. La
                imagen va en un <img> y el PDF en un <iframe>, que es el visor
                del propio navegador. */}
            {viendo && (
              <div className="doc-visor">
                {viendo.mime === "application/pdf" ? (
                  <iframe className="doc-visor-marco" src={viendo.url} title={etiqueta} />
                ) : (
                  <img className="doc-visor-imagen" src={viendo.url} alt={etiqueta} />
                )}
                {/* El visor de PDF empotrado no existe en casi ningún navegador
                    de móvil: ahí el marco sale en blanco y esta es la salida. */}
                <a className="doc-aparte" href={viendo.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Abrir en otra pestaña
                </a>
              </div>
            )}

            <p className="doc-nota">PDF, JPG o PNG. Hasta 10 MB, sin recomprimir.</p>
          </motion.div>
        </motion.div>,
        document.body,
      )}
    </>
  );
}
