import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Check, Trash2 } from "lucide-react";
import { apiClient } from "../api/apiClient";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import "./PendientesPage.css";

// Los cinco tableros, en el orden en que se leen: fila 1 (Ali, Enrique), fila 2
// (Mari, Shell) y Edson centrado debajo. El `id` es el valor que guarda el
// backend (choices de Pendiente.TABLERO_CHOICES); si se añade uno, va aquí y en
// api/models.py.
const TABLEROS = [
  { id: "ali",     nombre: "Ali" },
  { id: "enrique", nombre: "Enrique" },
  { id: "mari",    nombre: "Mari" },
  { id: "shell",   nombre: "Shell" },
  { id: "edson",   nombre: "Edson" },
];

// ── Una línea de la lista ────────────────────────────────────────────────────
// El estado de edición vive AQUÍ y no en la página: subirlo haría que cada tecla
// re-montara la lista entera y el input perdería el foco a media palabra.
// ponytail: sin React.memo — cinco listas de unas pocas líneas, no las ~2000 filas
// de Maniobras. Memoizar obligaría además a un ref para que la callback de
// guardado no cambiara de identidad, a cambio de nada medible.
function Pendiente({ pendiente, onGuardar, onMarcar, onEliminar }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");

  const iniciar = () => {
    setValor(pendiente.texto);
    setEditando(true);
  };

  const confirmar = () => {
    setEditando(false);
    const limpio = valor.trim();
    // Vaciar el texto se descarta en vez de mandar un PATCH que el serializer
    // va a rechazar igual: `texto` no admite blanco. Para quitarlo está el botón
    // de borrar, que además pregunta antes.
    if (limpio && limpio !== pendiente.texto) onGuardar(pendiente.id, { texto: limpio });
  };

  return (
    <li className={`pd-item ${pendiente.hecho ? "pd-item--hecho" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={pendiente.hecho}
        aria-label={pendiente.hecho ? "Desmarcar pendiente" : "Marcar pendiente"}
        className="pd-check"
        onClick={() => onMarcar(pendiente.id, !pendiente.hecho)}
      >
        {pendiente.hecho && <Check size={14} strokeWidth={3} />}
      </button>

      {editando ? (
        <input
          className="pd-input"
          value={valor}
          autoFocus
          maxLength={500}
          aria-label="Texto del pendiente"
          onChange={(e) => setValor(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmar();
            if (e.key === "Escape") setEditando(false);
          }}
        />
      ) : (
        <span
          className="pd-texto"
          title="Click para editar"
          role="button"
          tabIndex={0}
          onClick={iniciar}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); iniciar(); } }}
        >
          {pendiente.texto}
        </span>
      )}

      <button
        type="button"
        className="pd-borrar"
        aria-label={`Borrar pendiente: ${pendiente.texto}`}
        title="Borrar"
        onClick={() => onEliminar(pendiente)}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

// ── Un tablero ───────────────────────────────────────────────────────────────
function Tablero({ nombre, tableroId, pendientes, onCrear, onGuardar, onMarcar, onEliminar, solo }) {
  // Agregar es una línea vacía al final que ya viene enfocada, no un modal: es
  // el mismo gesto que editar, y para un texto suelto un diálogo sobra.
  const [nuevo, setNuevo] = useState(null);   // string | null
  const inputRef = useRef(null);

  useEffect(() => { if (nuevo !== null) inputRef.current?.focus(); }, [nuevo]);

  const confirmarNuevo = async () => {
    const texto = (nuevo ?? "").trim();
    setNuevo(null);
    if (texto) await onCrear(tableroId, texto);
  };

  return (
    <section className={`pd-tablero ${solo ? "pd-tablero--solo" : ""}`}>
      <header className="pd-tablero-head">
        <h2>{nombre}</h2>
        <span className="pd-cuenta">
          {pendientes.filter((p) => p.hecho).length}/{pendientes.length}
        </span>
      </header>

      <ul className="pd-lista">
        {pendientes.length === 0 && nuevo === null && (
          <li className="pd-vacio">Sin pendientes</li>
        )}

        {pendientes.map((p) => (
          <Pendiente key={p.id} pendiente={p} onGuardar={onGuardar} onMarcar={onMarcar} onEliminar={onEliminar} />
        ))}

        {nuevo !== null && (
          <li className="pd-item">
            <span className="pd-check pd-check--fantasma" aria-hidden="true" />
            <input
              ref={inputRef}
              className="pd-input"
              value={nuevo}
              maxLength={500}
              placeholder="Escribe el pendiente y pulsa Enter"
              aria-label={`Nuevo pendiente de ${nombre}`}
              onChange={(e) => setNuevo(e.target.value)}
              onBlur={confirmarNuevo}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarNuevo();
                if (e.key === "Escape") setNuevo(null);
              }}
            />
          </li>
        )}
      </ul>

      <button type="button" className="pd-agregar" onClick={() => setNuevo("")}>
        <Plus size={16} /> Agregar pendiente
      </button>
    </section>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function PendientesPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const [pendientes, setPendientes] = useState([]);

  useEffect(() => {
    let cancelado = false;
    // Sin paginar (ver PendienteViewSet): la respuesta es la lista entera.
    apiClient.get("/pendientes/")
      .then((res) => {
        if (!cancelado) setPendientes(Array.isArray(res) ? res : (res?.results ?? []));
      })
      .catch(() => {
        if (!cancelado) alerta({ tipo: "error", msg: "No se pudieron cargar los pendientes." });
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crear = useCallback(async (tablero, texto) => {
    try {
      const creado = await apiClient.post("/pendientes/", { tablero, texto });
      setPendientes((prev) => [...prev, creado]);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo agregar el pendiente." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = useCallback(async (id, campos) => {
    // Optimista: el cambio se pinta ya y se revierte si el servidor lo rechaza.
    // Marcar una casilla que tarda medio segundo en responder se siente rota.
    const previo = pendientes;
    setPendientes((prev) => prev.map((p) => (p.id === id ? { ...p, ...campos } : p)));
    try {
      const actualizado = await apiClient.patch(`/pendientes/${id}/`, campos);
      setPendientes((prev) => prev.map((p) => (p.id === id ? actualizado : p)));
    } catch (err) {
      setPendientes(previo);
      alerta({ tipo: "error", msg: err.message || "No se pudo guardar el pendiente." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendientes]);

  const marcar = useCallback((id, hecho) => guardar(id, { hecho }), [guardar]);

  // Se pregunta antes: el borrado es definitivo y no hay papelera ni auditoría
  // en esta tabla. No es optimista a propósito — una fila que desaparece y
  // vuelve a aparecer es peor que medio segundo de espera.
  const eliminar = useCallback(async (pendiente) => {
    if (!await preguntar({
      titulo: "Borrar pendiente",
      mensaje: `Se borrará "${pendiente.texto}". No se puede deshacer.`,
      accion: "Borrar",
      peligro: true,
    })) return;
    try {
      await apiClient.delete(`/pendientes/${pendiente.id}/`);
      setPendientes((prev) => prev.filter((p) => p.id !== pendiente.id));
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo borrar el pendiente." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preguntar]);

  const de = (tableroId) => pendientes.filter((p) => p.tablero === tableroId);

  return (
    <div className="pd-container">
      <header className="pd-header">
        <p className="pd-eyebrow">Control de Maniobras</p>
        <h1 className="pd-title">Pendientes</h1>
        <p className="pd-lead">
          Listas por persona. Los pendientes se quedan hasta que alguien los borra.
        </p>
      </header>

      <div className="pd-grid">
        {TABLEROS.map((t, i) => (
          <Tablero
            key={t.id}
            nombre={t.nombre}
            tableroId={t.id}
            pendientes={de(t.id)}
            solo={i === TABLEROS.length - 1 && TABLEROS.length % 2 === 1}
            onCrear={crear}
            onGuardar={guardar}
            onMarcar={marcar}
            onEliminar={eliminar}
          />
        ))}
      </div>

      <BotonArriba />
    </div>
  );
}
