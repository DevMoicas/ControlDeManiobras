/**
 * ReporteVaciosModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Elegir coordinador y descargar la lista de SUS vacíos pendientes en PDF.
 *
 * Sin CSS propio, al revés que los modales de documentos de Maniobras: este vive
 * dentro de `.vacios-container`, así que hereda las clases de VaciosPage.css
 * (.modal-overlay, .modal-content, .modal-header, .modal-acciones…) y sale
 * consistente con el modal de editar vacío sin duplicar una hoja de estilos.
 * Lo único suyo es `.modal-estrecho`, que lo baja de 1100px a tamaño de diálogo.
 *
 * El filtro (status pendiente + coordinador) lo hace el BACKEND y no esta
 * pantalla: la tabla va paginada de 60 en 60, así que filtrar aquí solo miraría
 * los vacíos ya cargados y el reporte saldría corto sin avisar.
 *
 * Props:
 *   endpoint  string    catálogo de coordinadores (lo pasa VaciosPage)
 *   onCerrar  function
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { overlayMotion, contentMotion } from "../../animations/modalMotion";
import { X, Download, Loader } from "lucide-react";
import { apiClient } from "../../api/apiClient";
// El mismo selector que la columna Coordinador de la tabla.
import CatalogoSelector from "../CiudadSelector/CiudadSelector";

export default function ReporteVaciosModal({ endpoint, onCerrar }) {
  const [coordinador, setCoordinador] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const descargar = async () => {
    setError(null);
    setGenerando(true);
    try {
      const blob = await apiClient.download("/documentos/reporte-vacios/", {
        coordinador,
        formato: "pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `REPORTE VACIOS ${coordinador}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      onCerrar();
    } catch (err) {
      // El backend responde con `detail` cuando ese coordinador no tiene ningún
      // vacío pendiente: se enseña aquí en vez de bajar un PDF con la tabla vacía.
      setError(err.message || "No se pudo generar el reporte.");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reporte-vacios-titulo"
      {...overlayMotion}
    >
      <motion.div className="modal-content modal-estrecho" {...contentMotion}>
        <div className="modal-header">
          <h2 id="reporte-vacios-titulo" className="modal-titulo">Reporte de Vacíos</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <form
          className="modal-form"
          onSubmit={(e) => { e.preventDefault(); descargar(); }}
        >
          <div className="modal-grid">
            <div className="modal-campo">
              {/* Sin htmlFor: CatalogoSelector no renderiza un input con id, así
                  que apuntar a uno inventado sería peor que no apuntar a nada. */}
              <label>Coordinador</label>
              <CatalogoSelector
                endpoint={endpoint}
                campo="nombre_trabajador"
                placeholder="— Elegir —"
                currentValue={coordinador}
                onSelect={(valor) => { setCoordinador(valor || ""); setError(null); }}
                disabled={generando}
              />
              <p className="rv-ayuda">
                Se imprimen sus vacíos con status <strong>Pendiente</strong>.
              </p>
            </div>
          </div>

          {error && <p className="rv-error">{error}</p>}

          <div className="modal-acciones">
            <button
              type="button"
              className="btn-cancelar"
              onClick={onCerrar}
              disabled={generando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-guardar"
              disabled={generando || !coordinador}
            >
              {generando
                ? <><Loader size={15} className="rv-girando" /> Generando…</>
                : <><Download size={15} /> Descargar Reporte</>}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
