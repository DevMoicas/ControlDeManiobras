import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { FileText, ScrollText, ArrowRight } from "lucide-react";
import BitacoraSuenoModal from "../components/BitacoraSuenoModal/BitacoraSuenoModal";
import CtaPortModal from "../components/CtaPortModal/CtaPortModal";
import CtaPorteTercerosModal from "../components/CtaPorteTercerosModal/CtaPorteTercerosModal";
import "./DocumentosViajePage.css";

// La "clase" es el tipo legal real del documento — no numeración decorativa.
const DOCUMENTOS = [
  {
    id: "bitacora",
    clase: "Registro de servicio",
    titulo: "Bitácora de Sueño",
    desc: "Horas de servicio del operador: vehículo, ruta y fechas de salida y llegada.",
    campos: ["Operador", "Placas", "Ruta", "Fechas"],
    Icon: ScrollText,
  },
  {
    id: "ctaport",
    clase: "Carta porte + Bitácora de gastos",
    titulo: "CTA Porte Fraba Container",
    desc: "Genera dos documentos: la Carta Porte de la carga y la Bitácora de Gastos de viaje.",
    campos: ["Cliente", "Carga", "Conductor", "Total de gastos"],
    Icon: FileText,
  },
  {
    id: "ctaporte-terceros",
    clase: "Carta porte",
    titulo: "CTA Porte Terceros",
    desc: "Genera la Carta Porte para transportistas terceros.",
    campos: ["Cliente", "Carga", "Conductor"],
    Icon: FileText,
  },
];

/**
 * DocumentosViajePage
 * Mesa de emisión de documentos de viaje. Cada tarjeta es un formato oficial
 * que se llena en su modal y se descarga como PDF.
 */
export default function DocumentosViajePage() {
  const [modalAbierto, setModalAbierto] = useState(null); // 'bitacora' | 'ctaport' | 'ctaporte-terceros' | null

  return (
    <div className="dvp-page">
      <div className="dvp">
        <header className="dvp-intro">
          <p className="dvp-eyebrow">Emisión de documentos</p>
          <h1 className="dvp-title">Documentos de Viaje</h1>
          <p className="dvp-lead">
            Genera y descarga los formatos oficiales del viaje en PDF.
          </p>
        </header>

        <div className="dvp-grid">
          {DOCUMENTOS.map(({ id, clase, titulo, desc, campos, Icon }, i) => (
            <article className="dvp-doc" key={id} style={{ "--i": i }}>
              <div className="dvp-doc-head">
                <span className="dvp-doc-chip">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span className="dvp-doc-class">{clase}</span>
              </div>

              <h2 className="dvp-doc-title">{titulo}</h2>
              <p className="dvp-doc-desc">{desc}</p>

              <ul className="dvp-doc-fields" aria-label="Datos que incluye">
                {campos.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>

              <button
                type="button"
                className="dvp-doc-action"
                onClick={() => setModalAbierto(id)}
              >
                Generar PDF
                <ArrowRight size={17} className="dvp-doc-arrow" />
              </button>
            </article>
          ))}
        </div>
      </div>

      {/* Modales */}
      <AnimatePresence>
        {modalAbierto === "bitacora" && (
          <BitacoraSuenoModal onCerrar={() => setModalAbierto(null)} />
        )}
        {modalAbierto === "ctaport" && (
          <CtaPortModal onCerrar={() => setModalAbierto(null)} />
        )}
        {modalAbierto === "ctaporte-terceros" && (
          <CtaPorteTercerosModal onCerrar={() => setModalAbierto(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
