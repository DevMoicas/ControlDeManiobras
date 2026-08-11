import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { overlayMotion } from "../../animations/modalMotion";
import { Camera, X, Upload, Trash2, Eye } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { useConfirmacion } from "../Confirmacion/Confirmacion";
import "./FotoModal.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES     = 2 * 1024 * 1024; // 2MB

export default function FotoModal({ tipo, registroId, onCerrar, isAdmin }) {
  const preguntar = useConfirmacion();
  const [fotos,         setFotos]         = useState({ foto_1: null, foto_2: null });
  const [loading,       setLoading]       = useState(true);
  const [uploading,     setUploading]     = useState(null);   // 1 | 2 | null
  const [deleting,      setDeleting]      = useState(null);   // 1 | 2 | null
  const [error,         setError]         = useState(null);
  const [vistaCompleta, setVistaCompleta] = useState(null);   // base64 string | null

  const inputRef1 = useRef(null);
  const inputRef2 = useRef(null);

  // GET reutilizado por carga inicial, subir y eliminar
  const recargar = () =>
    apiClient.get(`/fotos/?tipo=${tipo}&registro_id=${registroId}`).then(setFotos);

  // ── Cerrar con Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (vistaCompleta) {
          e.stopPropagation();
          setVistaCompleta(null);
        } else {
          onCerrar();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCerrar, vistaCompleta]);

  // ── Cargar fotos al montar ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    recargar()
      .catch(() => setError("Error al cargar las fotos. Intenta de nuevo."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, registroId]);

  // ── Subir foto ────────────────────────────────────────────────────────────
  const handleSubir = async (slot, file) => {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no permitido. Use JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("La imagen no puede superar 2 MB.");
      return;
    }

    setError(null);
    setUploading(slot);

    const formData = new FormData();
    formData.append("tipo",        tipo);
    formData.append("registro_id", String(registroId));
    formData.append("slot",        String(slot));
    formData.append("foto",        file);

    try {
      await apiClient.upload("/fotos/subir/", formData);
      await recargar();
    } catch (err) {
      setError(err.message || "Error al subir la foto.");
    } finally {
      setUploading(null);
    }
  };

  // ── Eliminar foto (solo admin) ────────────────────────────────────────────
  const handleEliminar = async (slot) => {
    if (!await preguntar({
      titulo: "Eliminar foto",
      mensaje: "La foto se borra del registro y no se puede recuperar.",
      dato: `Foto ${slot}`,
      accion: "Eliminar",
      peligro: true,
    })) return;

    setError(null);
    setDeleting(slot);

    try {
      await apiClient.delete(
        `/fotos/eliminar/?tipo=${tipo}&registro_id=${registroId}&slot=${slot}`
      );
      await recargar();
    } catch (err) {
      setError(err.message || "Error al eliminar la foto.");
    } finally {
      setDeleting(null);
    }
  };

  // ── Render de cada slot ───────────────────────────────────────────────────
  const renderSlot = (slot) => {
    const foto     = fotos[`foto_${slot}`];
    const inputRef = slot === 1 ? inputRef1 : inputRef2;
    const isBusy   = uploading === slot || deleting === slot;

    return (
      <div className="fm-slot" key={slot}>
        <p className="fm-slot-label">Foto {slot}</p>

        {foto ? (
          <div className="fm-foto-wrapper">
            <img src={foto} alt={`Foto ${slot}`} className="fm-thumbnail" />
            <div className="fm-foto-acciones">
              <button
                type="button"
                className="fm-btn fm-btn-ver"
                onClick={() => setVistaCompleta(foto)}
                disabled={isBusy}
              >
                <Eye size={15} /> Ver
              </button>

              <button
                type="button"
                className="fm-btn fm-btn-cambiar"
                onClick={() => inputRef.current?.click()}
                disabled={isBusy}
              >
                <Upload size={15} />
                {uploading === slot ? "Subiendo..." : "Cambiar"}
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className="fm-btn fm-btn-eliminar"
                  onClick={() => handleEliminar(slot)}
                  disabled={isBusy}
                >
                  <Trash2 size={15} />
                  {deleting === slot ? "..." : "Eliminar"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="fm-slot-vacio">
            <Camera size={36} className="fm-camera-icon" />
            <p className="fm-slot-vacio-texto">Sin foto</p>
            <button
              type="button"
              className="fm-btn fm-btn-subir"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
            >
              <Upload size={15} />
              {uploading === slot ? "Subiendo..." : "Subir foto"}
            </button>
          </div>
        )}

        {/* Input oculto — se resetea en cada click para permitir re-selección */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onClick={(e) => { e.target.value = ""; }}
          onChange={(e) => handleSubir(slot, e.target.files?.[0])}
        />
      </div>
    );
  };

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    <>
      {/* Modal principal */}
      <motion.div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fm-titulo"
        onClick={onCerrar}
        {...overlayMotion}
      >
        <div className="fm-content" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="fm-header">
            <h2 id="fm-titulo" className="fm-titulo">
              <Camera size={22} /> Fotos del Registro
            </h2>
            <button
              type="button"
              className="fm-btn-cerrar"
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              <X size={22} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="fm-error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          {/* Contenido */}
          {loading ? (
            <div className="fm-loading">Cargando fotos…</div>
          ) : (
            <div className="fm-slots">
              {renderSlot(1)}
              {renderSlot(2)}
            </div>
          )}

          {/* Nota de formatos */}
          <p className="fm-nota">
            Formatos: JPG, PNG, WEBP · Máximo 2 MB por foto
          </p>
        </div>
      </motion.div>

      {/* Lightbox — vista completa */}
      {vistaCompleta && (
        <div
          className="fm-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Vista completa de la foto"
          onClick={() => setVistaCompleta(null)}
        >
          <div className="fm-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="fm-lightbox-cerrar"
              onClick={() => setVistaCompleta(null)}
              aria-label="Cerrar vista completa"
            >
              <X size={28} />
            </button>
            <img
              src={vistaCompleta}
              alt="Vista completa"
              className="fm-imagen-completa"
            />
          </div>
        </div>
      )}
    </>
  );
}
