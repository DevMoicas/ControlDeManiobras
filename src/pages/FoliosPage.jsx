import { useState, useEffect, useRef, Fragment } from "react";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import { useFolios } from "../hooks/useFolios";
import "./FoliosPage.css";

const BATCH_SIZE = 14;

// Las dos columnas se editan igual (clic → escribir → blur/Enter guarda,
// Escape cancela). `obligatorio` marca la que no puede quedarse vacía: el
// código identifica el documento y además es único en la BD.
const COLUMNAS = [
  { key: "codigo",     label: "Folio",      max: 30, clase: "folio", obligatorio: true },
  { key: "asignacion", label: "Asignación", max: 40, clase: "asig",  obligatorio: false },
];

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Sub-componente local (no en src/components/): las dos tablas son idénticas
// salvo título/datos/callbacks y no se reusa fuera de esta página.
function FolioTabla({ titulo, anadiendo, folios, onAnadir, onAnadirAnterior, onGuardar }) {
  // Una barra por tabla: cada plaza tiene su propio scroll horizontal.
  const scrollRef = useRef(null);
  const lotes = chunk(folios, BATCH_SIZE);
  const [editandoCelda, setEditandoCelda] = useState(null); // { id, key }
  const [valorEditando, setValorEditando] = useState("");

  const iniciarEdicion = (id, key, valorActual) => {
    setEditandoCelda({ id, key });
    setValorEditando(valorActual ?? "");
  };
  const cancelarEdicion = () => setEditandoCelda(null);
  const confirmarEdicion = async (folio, col) => {
    const valor = col.obligatorio ? valorEditando.trim() : valorEditando;
    // Vaciar una columna obligatoria se descarta aquí en vez de mandar un PATCH
    // que el backend va a rechazar igualmente.
    const hayCambio = valor !== (folio[col.key] ?? "") && !(col.obligatorio && !valor);
    if (hayCambio) await onGuardar(folio.id, col.key, valor);
    setEditandoCelda(null);
  };

  return (
    <section className="fp-panel">
      <div className="fp-panel-head">
        <h2 className="fp-panel-titulo">{titulo}</h2>
        {/* Un solo flag de "en vuelo" para los dos botones: nunca hay que pulsar
            los dos a la vez y evita duplicar estado. */}
        <div className="fp-btn-acciones">
          <button
            type="button"
            className="fp-btn-anadir fp-btn-anadir--sec"
            onClick={onAnadirAnterior}
            disabled={anadiendo}
            title="Carga los 14 folios anteriores al más bajo de esta tabla"
          >
            {anadiendo ? "..." : "+ Lote anterior"}
          </button>
          <button type="button" className="fp-btn-anadir" onClick={onAnadir} disabled={anadiendo}>
            {anadiendo ? "..." : "+ Añadir folios"}
          </button>
        </div>
      </div>
      <div className="fp-scroll" ref={scrollRef}>
        <table className="fp-tabla">
          <thead>
            <tr>
              {lotes.map((_, li) => (
                <Fragment key={li}>
                  {COLUMNAS.map((col) => (
                    <th key={col.key} className={`fp-th fp-th--${col.clase}`}>{col.label}</th>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: BATCH_SIZE }).map((_, fila) => (
              <tr key={fila}>
                {lotes.map((lote, li) => {
                  const f = lote[fila];
                  return (
                    <Fragment key={li}>
                      {COLUMNAS.map((col) => (
                        <td key={col.key} className={`fp-td fp-td--${col.clase}`}>
                          {!f ? null : editandoCelda?.id === f.id && editandoCelda?.key === col.key ? (
                            <input
                              type="text"
                              className="fp-input"
                              value={valorEditando}
                              autoFocus
                              maxLength={col.max}
                              onChange={(e) => setValorEditando(e.target.value)}
                              onBlur={() => confirmarEdicion(f, col)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") confirmarEdicion(f, col);
                                if (e.key === "Escape") cancelarEdicion();
                              }}
                            />
                          ) : (
                            <span
                              className="fp-celda-texto"
                              title="Click para editar"
                              onClick={() => iniciarEdicion(f.id, col.key, f[col.key])}
                            >
                              {f[col.key] || <em className="fp-placeholder">—</em>}
                            </span>
                          )}
                        </td>
                      ))}
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BarraScrollTabla contenedorRef={scrollRef} />
    </section>
  );
}

export default function FoliosPage() {
  const {
    foliosManzanillo,
    foliosLazaro,
    cargando,
    cargarFolios,
    anadirFolios,
    actualizarCampo,
  } = useFolios();
  const [anadiendo, setAnadiendo] = useState({ manzanillo: false, lazaro: false });

  useEffect(() => { cargarFolios(); }, [cargarFolios]);

  const handleAnadir = async (tabla, direccion) => {
    setAnadiendo((p) => ({ ...p, [tabla]: true }));
    await anadirFolios(tabla, direccion);
    setAnadiendo((p) => ({ ...p, [tabla]: false }));
  };

  return (
    <div className="fp-page">
      <div className="fp-wrap">
        <header className="fp-intro">
          <h1 className="fp-title">Folios</h1>
        </header>

        {cargando ? (
          <p className="fp-cargando">Cargando folios…</p>
        ) : (
          <>
            <FolioTabla
              titulo="FOLIOS MANZANILLO"
              anadiendo={anadiendo.manzanillo}
              folios={foliosManzanillo}
              onAnadir={() => handleAnadir("manzanillo")}
              onAnadirAnterior={() => handleAnadir("manzanillo", "anterior")}
              onGuardar={(id, campo, v) => actualizarCampo("manzanillo", id, campo, v)}
            />
            <FolioTabla
              titulo="FOLIOS LÁZARO C"
              anadiendo={anadiendo.lazaro}
              folios={foliosLazaro}
              onAnadir={() => handleAnadir("lazaro")}
              onAnadirAnterior={() => handleAnadir("lazaro", "anterior")}
              onGuardar={(id, campo, v) => actualizarCampo("lazaro", id, campo, v)}
            />
          </>
        )}
      </div>
    </div>
  );
}
