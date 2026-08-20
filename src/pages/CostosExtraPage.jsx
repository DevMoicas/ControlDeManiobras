import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SquarePen, Trash2 } from "lucide-react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { apiClient } from "../api/apiClient";
import { useAuthContext } from "../context/AuthContext";
import SearchBar from "../components/SearchBar/SearchBar";
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import { formatearCosto } from "../components/CostosExtraSelector/CostosExtraSelector";
// Misma hoja que Catálogos: la tabla, el botón de agregar y el modal son los
// mismos componentes visuales. Importarla es lo que garantiza que sigan
// pareciéndose cuando alguien retoque aquella.
import "./CatalogosPage.css";

const VACIO = { movimiento: "", costo: "" };

export default function CostosExtraPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const { isAdmin } = useAuthContext();

  const [data, setData] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [formData, setFormData] = useState(VACIO);
  const [editando, setEditando] = useState(null);   // registro | null
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refTabla = useRef(null);

  useEffect(() => {
    let cancelado = false;
    // ponytail: primera página únicamente (PAGE_SIZE=60 global), igual que el
    // resto de catálogos. Paginar cuando de verdad pasen de 60.
    apiClient.get("/costos-extra/")
      .then((res) => {
        if (cancelado) return;
        setData(Array.isArray(res) ? res : (res?.results ?? []));
      })
      .catch(() => {
        if (!cancelado) alerta({ tipo: "error", msg: "No se pudieron cargar los costos extra." });
      });
    return () => { cancelado = true; };
    // Solo al montar: la lista se mantiene al día con las respuestas del alta,
    // la edición y el borrado, sin recargarla entera cada vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirAgregar = () => {
    setFormData(VACIO);
    setEditando(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (item) => {
    setFormData({ movimiento: item.movimiento, costo: item.costo });
    setEditando(item);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setFormData(VACIO);
    setEditando(null);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const resultado = editando
        ? await apiClient.put(`/costos-extra/${editando.id}/`, formData)
        : await apiClient.post("/costos-extra/", formData);

      setData((prev) => editando
        ? prev.map((x) => (x.id === editando.id ? resultado : x))
        : [...prev, resultado]);

      cerrarModal();
      alerta({ tipo: "ok", msg: editando ? "Costo extra actualizado." : "Costo extra creado." });
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo guardar el costo extra." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const eliminar = async (item) => {
    if (!isAdmin) {
      alerta({ tipo: "error", msg: "No tienes permisos para eliminar." });
      return;
    }
    if (!await preguntar({
      titulo: "Eliminar costo extra",
      mensaje: "Se borrará del catálogo y dejará de ofrecerse en Maniobras. Lo ya asignado a una maniobra conserva su importe.",
      dato: `${item.movimiento} · ${formatearCosto(item.costo)}`,
      accion: "Eliminar",
      peligro: true,
    })) return;

    setIsSubmitting(true);
    try {
      await apiClient.delete(`/costos-extra/${item.id}/`);
      setData((prev) => prev.filter((x) => x.id !== item.id));
      alerta({ tipo: "ok", msg: "Costo extra eliminado." });
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo eliminar el costo extra." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtrada = data.filter((item) =>
    !busqueda || `${item.movimiento} ${item.costo}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="noeco-container">

      <header className="noeco-header">
        <p className="cp-eyebrow">Finanzas</p>
        <h1 className="noeco-title">Costos extra</h1>
        <p className="cp-lead">
          Movimientos que se cobran aparte. Se asignan a cada maniobra desde su columna Costos Extra.
        </p>
      </header>

      <div className="cp-search">
        <SearchBar value={busqueda} onChange={setBusqueda} />
      </div>

      <div className="bst-zona">
        <BarraScrollTabla contenedorRef={refTabla} />
        <div className="table-container" ref={refTabla}>
          <div className="add-button-container">
            <button onClick={abrirAgregar} className="btn-add" disabled={isSubmitting}>
              <span>+</span> Agregar Costo Extra
            </button>
          </div>

          <table className="custom-table">
            <thead>
              <tr>
                <th>Movimiento</th>
                <th>Costo</th>
                <th style={{ textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                    No hay costos extra registrados
                  </td>
                </tr>
              ) : (
                filtrada.map((item) => (
                  <tr key={item.id}>
                    <td>{item.movimiento}</td>
                    <td>{formatearCosto(item.costo)}</td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                        <button className="btn-edit" onClick={() => abrirEdicion(item)} disabled={isSubmitting}>
                          <SquarePen size={18} />
                        </button>
                        {isAdmin && (
                          <button className="btn-delete" onClick={() => eliminar(item)} disabled={isSubmitting}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <motion.div className="modal-overlay" {...overlayMotion}>
            <motion.div className="modal-content" {...contentMotion}>
              <h2 className="modal-title">{editando ? "Editar" : "Agregar"} Costo Extra</h2>
              <form onSubmit={guardar}>
                <div className="form-group">
                  <label htmlFor="ce-movimiento">Movimiento</label>
                  <input
                    id="ce-movimiento"
                    type="text"
                    className="form-input"
                    maxLength={255}
                    autoFocus
                    required
                    placeholder="Ingresa el movimiento"
                    value={formData.movimiento}
                    onChange={(e) => setFormData({ ...formData, movimiento: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ce-costo">Costo</label>
                  {/* type=number con min/step: la validación de "solo números y no
                      negativos" la hace el navegador, sin escribirla a mano. El
                      serializer la repite en el servidor, que es donde cuenta. */}
                  <input
                    id="ce-costo"
                    type="number"
                    className="form-input"
                    min="0"
                    step="0.01"
                    required
                    inputMode="decimal"
                    placeholder="0.00"
                    value={formData.costo}
                    onChange={(e) => setFormData({ ...formData, costo: e.target.value })}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={cerrarModal} disabled={isSubmitting}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-save" disabled={isSubmitting}>
                    {isSubmitting ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BotonArriba />
    </div>
  );
}
