import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { overlayMotion } from "../../animations/modalMotion";
import { Camera, X, Upload, Trash2, Eye } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { useConfirmacion } from "../Confirmacion/Confirmacion";
import { INICIAL, INTENTOS, siguienteIntento, medidas } from "./comprimirImagen.mjs";
import "./FotoModal.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES     = 2 * 1024 * 1024; // 2MB

// ── Recompresión de lo pegado ───────────────────────────────────────────────
// Un recorte de pantalla completa en PNG pasa de 2 MB con facilidad, que es
// justo el caso más común de Ctrl+V. En vez de rebotarlo, se redibuja a JPEG
// hasta que quepa. Efecto lateral bueno: al redibujar se pierden los metadatos
// EXIF (incluida la geolocalización de las fotos de móvil) antes de que salgan
// del navegador.

function aJpeg(bitmap, { escala, calidad }) {
  const { ancho, alto } = medidas(bitmap.width, bitmap.height, escala);
  const canvas  = document.createElement("canvas");
  canvas.width  = ancho;
  canvas.height = alto;

  const ctx = canvas.getContext("2d");
  // JPEG no tiene canal alfa: sin este fondo, la transparencia de un PNG —las
  // esquinas redondeadas de un pantallazo de ventana— saldría en negro.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(bitmap, 0, 0, ancho, alto);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", calidad));
}

// Devuelve un File subible, o null si no hay forma de bajarlo de MAX_BYTES.
// Si ya cabe y el formato es de los aceptados se devuelve intacto: no tiene
// sentido perder calidad porque sí.
async function prepararImagen(archivo) {
  if (archivo.size <= MAX_BYTES && ALLOWED_TYPES.includes(archivo.type)) return archivo;

  const bitmap = await createImageBitmap(archivo);
  try {
    let intento = INICIAL;
    for (let i = 0; i < INTENTOS; i++) {
      const jpeg = await aJpeg(bitmap, intento);
      if (jpeg && jpeg.size <= MAX_BYTES) {
        return new File([jpeg], "pegado.jpg", { type: "image/jpeg" });
      }
      intento = siguienteIntento(intento);
    }
    return null;
  } finally {
    bitmap.close();
  }
}

export default function FotoModal({ tipo, registroId, onCerrar, isAdmin }) {
  const preguntar = useConfirmacion();
  const [fotos,         setFotos]         = useState({ foto_1: null, foto_2: null });
  const [loading,       setLoading]       = useState(true);
  const [uploading,     setUploading]     = useState(null);   // 1 | 2 | null
  const [deleting,      setDeleting]      = useState(null);   // 1 | 2 | null
  const [error,         setError]         = useState(null);
  const [vistaCompleta, setVistaCompleta] = useState(null);   // base64 string | null
  // Hueco elegido a mano con un clic. Sin marcar, el pegado busca el primero
  // libre; marcado, pisa ese. Hace falta porque quien no es admin no puede
  // borrar: con las dos fotos puestas, si no, el pegado no tendría salida.
  const [slotMarcado,   setSlotMarcado]   = useState(null);   // 1 | 2 | null

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

  // ── Pegar del portapapeles (Ctrl+V) ───────────────────────────────────────
  // Se escucha el evento `paste` y NO navigator.clipboard.read(): el evento solo
  // entrega lo que el usuario pega a propósito, no pide permiso al navegador y
  // funciona en todos. El listener vive solo mientras el modal está montado.
  useEffect(() => {
    const handler = async (e) => {
      if (vistaCompleta) return;              // el lightbox manda, igual que con Escape

      const item = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (!item) return;                      // pegar texto no debe dar error
      e.preventDefault();

      if (uploading || deleting) return;

      const destino = slotMarcado ?? (!fotos.foto_1 ? 1 : !fotos.foto_2 ? 2 : null);
      if (!destino) {
        setError("Los dos huecos están ocupados. Haz clic en una foto para elegir cuál reemplazar.");
        return;
      }

      const archivo = item.getAsFile();
      if (!archivo) return;

      setError(null);
      setUploading(destino);                  // recomprimir tarda: que se vea
      try {
        const listo = await prepararImagen(archivo);
        if (!listo) {
          setError("No se pudo reducir la imagen por debajo de 2 MB. Recórtala e inténtalo de nuevo.");
          return;
        }
        await handleSubir(destino, listo);
        setSlotMarcado(null);
      } catch {
        setError("No se pudo leer la imagen del portapapeles.");
      } finally {
        setUploading(null);
      }
    };

    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaCompleta, slotMarcado, fotos, uploading, deleting]);

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
    const marcado  = slotMarcado === slot;
    const marcar   = () => setSlotMarcado(marcado ? null : slot);

    return (
      <div
        className={`fm-slot${marcado ? " fm-slot--marcado" : ""}`}
        key={slot}
        onClick={marcar}
      >
        {/* La etiqueta es un botón de verdad para que el marcado se alcance con
            Tab: el <div> del slot no puede serlo porque ya contiene botones. */}
        <button
          type="button"
          className="fm-slot-label"
          aria-pressed={marcado}
          title="Pegar aquí con Ctrl+V"
          onClick={(e) => { e.stopPropagation(); marcar(); }}
        >
          Foto {slot}{marcado ? " ●" : ""}
        </button>

        {foto ? (
          <div className="fm-foto-wrapper">
            <img src={foto} alt={`Foto ${slot}`} className="fm-thumbnail" />
            {/* Los botones no deben marcar el slot de rebote. */}
            <div className="fm-foto-acciones" onClick={(e) => e.stopPropagation()}>
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
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
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
            Formatos: JPG, PNG, WEBP · Máximo 2 MB por foto ·
            Pega del portapapeles con <kbd>Ctrl</kbd>+<kbd>V</kbd>
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
