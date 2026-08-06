import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { overlayMotion, contentMotion } from "../animations/modalMotion";
import { Trash2, SquarePen, Camera, X } from "lucide-react";
import { useManiobras } from "../hooks/useManiobras";
import { useStatusUpdate } from "../hooks/useStatusUpdate";
import { useVacioStatusUpdate } from "../hooks/useVacioStatusUpdate";
import { getStatusConfig } from "../config/statusConfig";
import StatusSelector from "../components/StatusSelector/StatusSelector";
import PlacasSelector from "../components/PlacasSelector/PlacasSelector";
import RemolqueSelector from "../components/RemolqueSelector/RemolqueSelector";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import TransportistaSelector from "../components/TransportistaSelector/TransportistaSelector";
import PatioSelector from "../components/PatioSelector/PatioSelector";
import ClienteSelector from "../components/ClienteSelector/ClienteSelector";
import CiudadSelector from "../components/CiudadSelector/CiudadSelector";
import VacioStatusSelector from "../components/VacioStatusSelector/VacioStatusSelector";
import TerceroSelector from "../components/TerceroSelector/TerceroSelector";
import TipoServicioSelector, { getTipoServicioLabel, esServicioFull } from "../components/TipoServicioSelector/TipoServicioSelector";
import "./ManiobrasPage.css";
import SearchBar from "../components/SearchBar/SearchBar";
import { useAuthContext } from "../context/AuthContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import FotoModal from "../components/FotoModal/FotoModal";
registerLocale("es", es);

// ── Constantes ────────────────────────────────────────────────────────────────

// Campo "tipo": fuerza el formato "IZQUIERDA / DERECHA". La diagonal es fija,
// nunca editable ni borrable por el usuario — se compone automáticamente al
// unir los dos sub-campos. Cada lado admite texto libre, incluyendo un "-"
// interno para casos con dos valores (ej. "40 - 20" o "HC - DC").
function TipoSplitInput({ value, onChange, disabled, idPrefix }) {
  const partes = (value || "").split("/");
  const izquierda = (partes[0] || "").trim();
  const derecha   = (partes[1] || "").trim();

  const emitir = (nuevaIzquierda, nuevaDerecha) => {
    const izq = nuevaIzquierda !== undefined ? nuevaIzquierda : izquierda;
    const der = nuevaDerecha   !== undefined ? nuevaDerecha   : derecha;
    onChange(izq || der ? `${izq} / ${der}` : "");
  };

  return (
    <div className="tipo-split-input">
      <input
        id={idPrefix ? `${idPrefix}-izq` : undefined}
        type="text"
        value={izquierda}
        onChange={(e) => emitir(e.target.value, undefined)}
        placeholder="Ej. 40"
        disabled={disabled}
        aria-label="Tipo (izquierda)"
        className="tipo-split-campo"
        size={Math.max(6, izquierda.length + 2)}
      />
      <span className="tipo-split-separador">/</span>
      <input
        id={idPrefix ? `${idPrefix}-der` : undefined}
        type="text"
        value={derecha}
        onChange={(e) => emitir(undefined, e.target.value)}
        placeholder="Ej. HC"
        disabled={disabled}
        aria-label="Tipo (derecha)"
        className="tipo-split-campo"
        size={Math.max(6, derecha.length + 2)}
      />
    </div>
  );
}

// ── Servicio Full: dos valores en una sola columna ────────────────────────────
// Los pares del Full se guardan en las MISMAS columnas (tipo/peso/contenedor)
// separados por " - ", que es el separador que el backend ya parsea
// (_parsear_tipo, _sumar_peso) y el texto exacto que espera la celda C17.
// Así el Full no necesita columnas nuevas en la base de datos.

// "20 - 40" → ["20", "40"].  Corta en el PRIMER guion: los valores reales
// (contenedores, pesos) no llevan guiones internos.
function partirDoble(valor) {
  const s = String(valor || "");
  const i = s.indexOf("-");
  if (i === -1) return [s.trim(), ""];
  return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

// ["20", "40"] → "20 - 40".  Sin segundo valor devuelve solo el primero.
function unirDoble(a, b) {
  const izq = (a || "").trim();
  const der = (b || "").trim();
  return der ? `${izq} - ${der}` : izq;
}

// "20 / DC" → ["20", "DC"]  (el formato que emite TipoSplitInput)
function partesDelPar(par) {
  const p = String(par || "").split("/");
  return [(p[0] || "").trim(), (p[1] || "").trim()];
}

// "20 - 40 / DC - HC" → ["20 / DC", "40 / HC"]
function partirTipoFull(tipo) {
  const [izquierda, derecha] = partesDelPar(tipo);
  const [n1, n2] = partirDoble(izquierda);
  const [l1, l2] = partirDoble(derecha);
  return [
    n1 || l1 ? `${n1} / ${l1}` : "",
    n2 || l2 ? `${n2} / ${l2}` : "",
  ];
}

// ["20 / DC", "40 / HC"] → "20 - 40 / DC - HC"
function unirTipoFull(par1, par2) {
  const [n1, l1] = partesDelPar(par1);
  const [n2, l2] = partesDelPar(par2);
  const numeros = unirDoble(n1, n2);
  const letras  = unirDoble(l1, l2);
  return numeros || letras ? `${numeros} / ${letras}` : "";
}

// Cambiar el tipo de servicio colapsa los campos que dejan de tener dos inputs,
// para no arrastrar el segundo valor de un Full a un servicio que ya no lo usa.
// Carga suelta conserva los dos pares de TIPO DE CARGA (dos tipos de bulto).
function aplicarCambioTipoServicio(datos, onChange, nuevo) {
  onChange("tipo_servicio", nuevo);
  if (nuevo === "full") return;
  onChange("peso",       partirDoble(datos.peso)[0]);
  onChange("contenedor", partirDoble(datos.contenedor)[0]);
  if (nuevo === "sencillo") onChange("tipo", partirTipoFull(datos.tipo)[0]);
}

// Full: dos inputs "TIPO DE CARGA" apilados, uno por contenedor.
function TipoFullInput({ value, onChange, disabled, idPrefix }) {
  const [par1, par2] = partirTipoFull(value);
  return (
    <div className="tipo-full-input">
      <TipoSplitInput
        value={par1}
        onChange={(v) => onChange(unirTipoFull(v, par2))}
        disabled={disabled}
        idPrefix={idPrefix ? `${idPrefix}-1` : undefined}
      />
      <TipoSplitInput
        value={par2}
        onChange={(v) => onChange(unirTipoFull(par1, v))}
        disabled={disabled}
        idPrefix={idPrefix ? `${idPrefix}-2` : undefined}
      />
    </div>
  );
}

// Full: dos inputs en una celda (peso y contenedor), guardados como "A - B".
function DobleInput({ value, onChange, disabled, etiqueta, idPrefix }) {
  const [a, b] = partirDoble(value);
  return (
    <div className="tipo-split-input">
      <input
        id={idPrefix ? `${idPrefix}-1` : undefined}
        type="text"
        value={a}
        onChange={(e) => onChange(unirDoble(e.target.value, b))}
        placeholder={`${etiqueta} 1`}
        aria-label={`${etiqueta} 1`}
        disabled={disabled}
        className="tipo-split-campo"
        size={Math.max(10, a.length + 2)}
      />
      <input
        id={idPrefix ? `${idPrefix}-2` : undefined}
        type="text"
        value={b}
        onChange={(e) => onChange(unirDoble(a, e.target.value))}
        placeholder={`${etiqueta} 2`}
        aria-label={`${etiqueta} 2`}
        disabled={disabled}
        className="tipo-split-campo"
        size={Math.max(10, b.length + 2)}
      />
    </div>
  );
}

const COLUMNAS = [
  { key: "solicita", label: "Solicita" },
  { key: "agencia", label: "Agencia" },
  {
    key: "codigo_pis", label: "Código PIS",
    style: { color: "var(--primary-blue)", fontWeight: "bold", fontFamily: "monospace" }
  },
  { key: "terminal", label: "Terminal" },
  { key: "placas_pis", label: "Placas PIS", isPlacas: true },
  { key: "fecha_pis", label: "Fecha PIS", sortable: true },
  { key: "horario", label: "Horario", isHora: true },
  { key: "tipo_servicio", label: "TIPO DE SERVICIO", isTipoServicio: true },
  { key: "tipo",  label: "TIPO DE CARGA", isTipo: true },
  { key: "peso",  label: "Peso", isDoble: true },
  { key: "contenedor", label: "Contenedor", isDoble: true },
  { key: "referencia", label: "Referencia" },
  { key: "pedimento", label: "Pedimento" },
  { key: "cliente", label: "Cliente", isCliente: true },
  { key: "origen", label: "Origen", isOrigen: true },
  { key: "destino", label: "Destino", isDestino: true },
  { key: "transportista", label: "Transportista", isTransportista: true },
  { key: "tercero", label: "Tercero", isTercero: true },
  { key: "asignacion_operador_status", label: "Operador", isOperador: true },
  { key: "unidad", label: "Unidad", isPlacas: true },
  { key: "remolque",   label: "Remolque 1", isRemolque: true },
  { key: "remolque_2", label: "Remolque 2", isRemolque2: true },
  { key: "folio", label: "Folio" },
  { key: "vacio_patio", label: "Vacio Patio", isPatio: true },
  { key: "status_vacio", label: "Status Vacío", isStatusVacio: true },
  { key: "fecha_entrega_mercancia", label: "Entrega Mercancía", sortable: true },
  { key: "no_factura", label: "No. Factura" },
  { key: "ccp", label: "CCP" },
  { key: "ruta_inicio", label: "Ruta Inicio", isFechaHora: true },
  { key: "ruta_fin",    label: "Ruta Fin",    isFechaHora: true },
];

const MANIOBRA_VACIA = {
  solicita: "", agencia: "", codigo_pis: "", terminal: "", placas_pis: "",
  fecha_pis: "", horario: "", tipo_servicio: "sencillo", tipo: "", peso: "", contenedor: "", referencia: "", pedimento: "",
  // cliente = nombre (lo que se ve en la tabla); cliente_id = a cuál fila del
  // catálogo apunta. El id es lo único que distingue dos clientes homónimos.
  cliente: "", cliente_id: null, origen: "", destino: "", transportista: "", tercero: "", asignacion_operador_status: "",
  unidad: "", remolque: "", remolque_2: "", folio: "", vacio_patio: "", status_vacio: "",
  fecha_entrega_mercancia: "", no_factura: "", ccp: "", ruta_inicio: "", ruta_fin: "",
};

const MODAL_CERRADO = { abierto: false, datos: null };

// Convierte YYYY-MM-DD (backend) → DD/MM/YYYY (lo que ve el usuario)
function fechaParaMostrar(valor) {
  if (!valor) return "";
  const [y, m, d] = valor.split("-");
  if (!y || !m || !d) return valor;
  return `${d}/${m}/${y}`;
}

// Convierte ISO datetime (backend) → DD/MM/YYYY HH:mm para mostrar en la tabla
function fechaHoraParaMostrar(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Convierte "HH:mm" (backend) → objeto Date (hoy con esa hora) para el DatePicker
function horaADate(valor) {
  if (!valor) return null;
  const [h, m] = String(valor).split(":");
  if (h === undefined || m === undefined) return null;
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

// Convierte objeto Date → "HH:mm" para el backend
function dateAHora(date) {
  if (!date) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

// Convierte DD/MM/YYYY (input del usuario) → YYYY-MM-DD (backend)
function fechaParaBackend(valor) {
  if (!valor) return "";
  const [d, m, y] = valor.split("/");
  if (!y || !m || !d) return valor;
  return `${y}-${m}-${d}`;
}

// Convierte YYYY-MM-DD → objeto Date para el DatePicker
function fechaADate(valorYYYYMMDD) {
  if (!valorYYYYMMDD) return null;
  const parts = valorYYYYMMDD.split("-");
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(d.getTime())) return null;
  return d;
}

// Convierte objeto Date → YYYY-MM-DD para el backend
function dateAFechaBackend(dateObject) {
  if (!dateObject) return "";
  const y = dateObject.getFullYear();
  const m = String(dateObject.getMonth() + 1).padStart(2, "0");
  const d = String(dateObject.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const FILTROS = [
  { id: "todos",     label: "Todos" },
  { id: "activo",    label: "Activos" },
  { id: "pendiente", label: "Pendientes" },
  { id: "quemada",   label: "Quemados" },
  { id: "por_salir", label: "Lázaro" },
  { id: "tercero",   label: "Terceros" },
];

// Columnas del header — reutilizadas en ambas tablas
function HeaderRow({ ordenFecha, onOrdenar }) {
  const iconoFlecha = ordenFecha === "asc" ? "↑" : "↓";
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <th key={col.key}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {col.label}
            {col.sortable && (
              <button
                className="btn-ordenar"
                onClick={() => onOrdenar(col.key)}
                title={ordenFecha === "asc" ? "Más reciente primero" : "Más antiguo primero"}
              >
                {iconoFlecha}
              </button>
            )}
          </div>
        </th>
      ))}
      <th style={{ textAlign: "center" }}>Status</th>
      <th style={{ textAlign: "center" }}>Acciones</th>
    </tr>
  );
}

// ── Sub-componente: fila nueva ────────────────────────────────────────────────

function FilaNueva({ datos, onChange, onGuardar, onCancelar, isSubmitting }) {
  const esFull = esServicioFull(datos);
  return (
    <tr>
      {COLUMNAS.map((col) => (
        <td key={col.key}>
          {col.sortable ? (
            <DatePicker
              locale="es"
              dateFormat="dd/MM/yyyy"
              selected={fechaADate(datos[col.key])}
              onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
              placeholderText="DD/MM/YYYY"
              className="date-picker-input"
              isClearable
            />
          ) : col.isPlacas ? (
            <PlacasSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
              transportista={col.key === "unidad" ? datos.transportista : undefined}
              todas={col.key === "placas_pis"}
            />
          ) : col.isOperador ? (
            <OperadorSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
              transportista={datos.transportista}
            />
          ) : col.isTransportista ? (
            <TransportistaSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isTercero ? (
            <TerceroSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              loading={false}
            />
          ) : col.isFechaHora ? (
            <DatePicker
              locale="es"
              selected={datos[col.key] ? new Date(datos[col.key]) : null}
              onChange={(date) => onChange(col.key, date ? date.toISOString() : "")}
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              dateFormat="dd/MM/yyyy HH:mm"
              placeholderText="DD/MM/YYYY HH:mm"
              className="date-picker-input"
              isClearable
            />
          ) : col.isHora ? (
            <DatePicker
              selected={horaADate(datos[col.key])}
              onChange={(date) => onChange(col.key, dateAHora(date))}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Hora"
              timeFormat="HH:mm"
              dateFormat="HH:mm"
              placeholderText="HH:mm"
              className="date-picker-input"
              isClearable
            />
          ) : col.isCliente ? (
            <ClienteSelector
              currentValue={datos[col.key]}
              currentId={datos.cliente_id}
              onSelect={(c) => { onChange(col.key, c.nombre_cliente); onChange("cliente_id", c.id ?? null); }}
              disabled={isSubmitting}
            />
          ) : col.isOrigen ? (
            <CiudadSelector
              endpoint="/origenes/"
              placeholder="— Seleccionar origen —"
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isDestino ? (
            <CiudadSelector
              endpoint="/destinos/"
              placeholder="— Seleccionar destino —"
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isPatio ? (
            <PatioSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isStatusVacio ? (
            <VacioStatusSelector
              currentStatus={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              loading={false}
            />
          ) : col.isRemolque ? (
            <RemolqueSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isRemolque2 ? (
            <RemolqueSelector
              currentValue={datos[col.key]}
              onSelect={(val) => onChange(col.key, val)}
              disabled={isSubmitting || !esFull}
            />
          ) : col.isTipoServicio ? (
            <TipoServicioSelector
              currentValue={datos[col.key]}
              onSelect={(val) => aplicarCambioTipoServicio(datos, onChange, val)}
              disabled={isSubmitting}
            />
          ) : col.isTipo ? (
            esFull ? (
              <TipoFullInput
                value={datos[col.key]}
                onChange={(val) => onChange(col.key, val)}
                disabled={isSubmitting}
              />
            ) : (
              <TipoSplitInput
                value={datos[col.key]}
                onChange={(val) => onChange(col.key, val)}
                disabled={isSubmitting}
              />
            )
          ) : col.isDoble && esFull ? (
            <DobleInput
              value={datos[col.key]}
              onChange={(val) => onChange(col.key, val)}
              disabled={isSubmitting}
              etiqueta={col.label}
            />
          ) : (
            <input
              value={datos[col.key]}
              onChange={(e) => onChange(col.key, e.target.value)}
              placeholder={col.label}
              aria-label={col.label}
              autoFocus={col.key === "solicita"}
              className={col.key === "peso" ? "campo-expandible" : undefined}
              size={col.key === "peso" ? Math.max(14, String(datos[col.key] || "").length + 2) : undefined}
            />
          )}
        </td>
      ))}
      <td />
      <td>
        <div style={{ display: "flex", gap: "4px" }}>
          <button className="btn-accion btn-guardar-fila" onClick={onGuardar} disabled={isSubmitting}>{isSubmitting ? '...' : 'Guardar'}</button>
          <button className="btn-accion btn-cancelar-fila" onClick={onCancelar} disabled={isSubmitting}>Cancelar</button>
        </div>
      </td>
    </tr>
  );
}

// ── Sub-componente: modal edición ─────────────────────────────────────────────

function ModalEditar({ datos, onChange, onGuardar, onCerrar, isSubmitting }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const esFull = esServicioFull(datos);

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
      {...overlayMotion}
    >
      <motion.div className="modal-content" {...contentMotion}>
        <div className="modal-header">
          <h2 id="modal-titulo" className="modal-titulo">Editar Maniobra</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onGuardar} className="modal-form">
          <div className="modal-grid">
            {COLUMNAS.map((col) => (
              <div key={col.key} className="modal-campo">
                <label htmlFor={`edit-${col.key}`}>{col.label}</label>
                {col.sortable ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    locale="es"
                    dateFormat="dd/MM/yyyy"
                    selected={fechaADate(datos[col.key] ?? "")}
                    onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
                    placeholderText="DD/MM/YYYY"
                    className="date-picker-input"
                    isClearable
                  />
                ) : col.isPlacas ? (
                  <PlacasSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                    transportista={col.key === "unidad" ? datos.transportista : undefined}
                    todas={col.key === "placas_pis"}
                  />
                ) : col.isOperador ? (
                  <OperadorSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                    transportista={datos.transportista}
                  />
                ) : col.isTransportista ? (
                  <TransportistaSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isTercero ? (
                  <TerceroSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    loading={false}
                  />
                ) : col.isFechaHora ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    locale="es"
                    selected={datos[col.key] ? new Date(datos[col.key]) : null}
                    onChange={(date) => onChange(col.key, date ? date.toISOString() : "")}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="dd/MM/yyyy HH:mm"
                    placeholderText="DD/MM/YYYY HH:mm"
                    className="date-picker-input"
                    isClearable
                  />
                ) : col.isHora ? (
                  <DatePicker
                    id={`edit-${col.key}`}
                    selected={horaADate(datos[col.key] ?? "")}
                    onChange={(date) => onChange(col.key, dateAHora(date))}
                    showTimeSelect
                    showTimeSelectOnly
                    timeIntervals={15}
                    timeCaption="Hora"
                    timeFormat="HH:mm"
                    dateFormat="HH:mm"
                    placeholderText="HH:mm"
                    className="date-picker-input"
                    isClearable
                  />
                ) : col.isCliente ? (
                  <ClienteSelector
                    currentValue={datos[col.key] ?? ""}
                    currentId={datos.cliente_id}
                    onSelect={(c) => { onChange(col.key, c.nombre_cliente); onChange("cliente_id", c.id ?? null); }}
                    disabled={isSubmitting}
                  />
                ) : col.isOrigen ? (
                  <CiudadSelector
                    endpoint="/origenes/"
                    placeholder="— Seleccionar origen —"
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isDestino ? (
                  <CiudadSelector
                    endpoint="/destinos/"
                    placeholder="— Seleccionar destino —"
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isPatio ? (
                  <PatioSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isStatusVacio ? (
                  <VacioStatusSelector
                    currentStatus={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    loading={false}
                  />
                ) : col.isRemolque ? (
                  <RemolqueSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isRemolque2 ? (
                  <RemolqueSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => onChange(col.key, val)}
                    disabled={isSubmitting || !esFull}
                  />
                ) : col.isTipoServicio ? (
                  <TipoServicioSelector
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => aplicarCambioTipoServicio(datos, onChange, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isTipo ? (
                  esFull ? (
                    <TipoFullInput
                      idPrefix={`edit-${col.key}`}
                      value={datos[col.key] ?? ""}
                      onChange={(val) => onChange(col.key, val)}
                      disabled={isSubmitting}
                    />
                  ) : (
                    <TipoSplitInput
                      idPrefix={`edit-${col.key}`}
                      value={datos[col.key] ?? ""}
                      onChange={(val) => onChange(col.key, val)}
                      disabled={isSubmitting}
                    />
                  )
                ) : col.isDoble && esFull ? (
                  <DobleInput
                    idPrefix={`edit-${col.key}`}
                    value={datos[col.key] ?? ""}
                    onChange={(val) => onChange(col.key, val)}
                    disabled={isSubmitting}
                    etiqueta={col.label}
                  />
                ) : (
                  <input
                    id={`edit-${col.key}`}
                    value={datos[col.key] ?? ""}
                    onChange={(e) => onChange(col.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="modal-acciones">
            <button type="button" className="btn-cancelar" onClick={onCerrar} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="btn-guardar" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar Cambios'}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Sub-componente: fila de la tabla (memoizada) ──────────────────────────────
// isUpdating e isUpdatingVacio se pasan ya resueltos (booleanos) en vez del
// updatingId crudo: así solo la fila que cambia recibe una prop nueva; las demás
// mantienen `false` entre renders y React.memo las salta, evitando re-renderizar
// ~2000 filas por cada cambio de status de una sola.
const FilaManiobra = memo(function FilaManiobra({
  maniobra, isUpdating, isUpdatingVacio, isUpdatingTercero, isAdmin, isSubmitting,
  onStatusChange, onVacioStatusChange, onTerceroChange, onEditar, onVerFotos, onEliminar,
}) {
  const statusConfig = getStatusConfig(maniobra.status);
  return (
    <tr className={statusConfig?.rowClass ?? ""}>
      {COLUMNAS.map((col) => (
        <td key={col.key} style={col.style ?? {}}>
          {col.sortable ? (
            fechaParaMostrar(maniobra[col.key])
          ) : col.isFechaHora ? (
            fechaHoraParaMostrar(maniobra[col.key])
          ) : col.isTipoServicio ? (
            /* Solo lectura en la tabla: se edita desde el modal, porque cambiarlo
               reajusta también los campos de tipo/peso/contenedor. */
            getTipoServicioLabel(maniobra[col.key])
          ) : col.isStatusVacio ? (
            /* Editable en la propia tabla, igual que en Vacíos: no hace falta
               abrir el modal para cambiar el status del vacío. */
            <VacioStatusSelector
              currentStatus={maniobra[col.key]}
              onSelect={(nuevoStatus) => onVacioStatusChange(maniobra, nuevoStatus)}
              loading={isUpdatingVacio}
            />
          ) : col.isTercero ? (
            /* Editable en la propia tabla, igual que el status de vacío. */
            <TerceroSelector
              currentValue={maniobra[col.key]}
              onSelect={(nuevoValor) => onTerceroChange(maniobra, nuevoValor)}
              loading={isUpdatingTercero}
            />
          ) : (
            maniobra[col.key]
          )}
        </td>
      ))}
      <td style={{ whiteSpace: "nowrap" }}>
        <StatusSelector
          currentStatus={maniobra.status}
          onSelect={(newStatus) => onStatusChange(maniobra, newStatus)}
          loading={isUpdating}
        />
      </td>
      <td>
        <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
          <button
            className="btn-icon btn-editar"
            onClick={() => onEditar(maniobra)}
            aria-label="Editar maniobra"
            title="Editar"
            disabled={isSubmitting}
          >
            <SquarePen size={18} />
          </button>
          <button
            type="button"
            className="btn-icon btn-foto"
            onClick={() => onVerFotos(maniobra.id)}
            aria-label="Ver fotos de la maniobra"
            title="Fotos"
            disabled={isSubmitting}
          >
            <Camera size={18} />
          </button>
          {isAdmin && (
            <button
              className="btn-icon btn-eliminar"
              onClick={() => onEliminar(maniobra.id)}
              aria-label="Eliminar maniobra"
              title="Eliminar"
              disabled={isSubmitting}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

// ── Encabezado ────────────────────────────────────────────────────────────────
// Mismo patrón que Movimientos Locales y Documentos de Viaje: antetítulo, título
// y entradilla. Se reutiliza en los tres estados de la página (carga, error, tabla).
function Intro() {
  return (
    <header className="mp-intro">
      <p className="mp-eyebrow">Tablero operativo</p>
      <h1 className="maniobras-title">Control de Maniobras</h1>
      <p className="mp-lead">
        Registra y sigue el estado de cada maniobra en curso.
      </p>
    </header>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ManiobrasPage() {
  const [filtroStatus, setFiltroStatus] = useState("todos");
  // busquedaInput: feedback inmediato en el input. busqueda (debounced 350ms):
  // la que realmente alimenta el filtro memoizado, para no recalcular sobre
  // todas las filas cargadas en cada tecla — mismo patrón ya probado en
  // MovimientosLocalesPage.jsx.
  const [busquedaInput, setBusquedaInput] = useState("");
  const [busqueda,      setBusqueda]      = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(busquedaInput), 350);
    return () => clearTimeout(t);
  }, [busquedaInput]);
  const [ordenFecha, setOrdenFecha] = useState("desc");
  const handleOrdenar = useCallback((campo) => {
  setOrdenFecha((prev) => {
    const nuevo = prev === "desc" ? "asc" : "desc";
    return nuevo;
  });
}, []);

  const {
    maniobras, setManiobras,
    loading, loadingMore, hasMore, error,
    loadMore, eliminar, actualizar, agregar,
  } = useManiobras(filtroStatus, ordenFecha);

  const { updatingId, updateStatus } = useStatusUpdate(setManiobras);

  // Status de vacío editable desde la tabla. Mismo hook que usa Vacíos; aquí
  // apunta al propio registro de maniobra (PATCH /maniobras/{id}/ { status_vacio }).
  const {
    updatingId: updatingVacioId,
    updateStatus: updateVacioStatus,
  } = useVacioStatusUpdate(setManiobras, { recurso: "maniobras", campo: "status_vacio" });

  // Marca TERCERO editable desde la tabla. Mismo hook genérico que status_vacio,
  // apuntando al campo `tercero` del propio registro (PATCH /maniobras/{id}/ { tercero }).
  const {
    updatingId: updatingTerceroId,
    updateStatus: updateTercero,
  } = useVacioStatusUpdate(setManiobras, { recurso: "maniobras", campo: "tercero" });
  const { isAdmin } = useAuthContext();

  const [modoAgregar,   setModoAgregar]   = useState(false);
  const [nuevaManiobra, setNuevaManiobra] = useState(MANIOBRA_VACIA);
  const scrollRef = useRef(null);
  const [modal,         setModal]         = useState(MODAL_CERRADO);
  const [notif,         setNotif]         = useState(null);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [fotoModal,     setFotoModal]     = useState(null); // { registroId } | null

  // ── Scroll listener en window ─────────────────────────────────────────────
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const scrolled  = window.scrollY + window.innerHeight;
        const threshold = document.documentElement.scrollHeight - 300;
        if (scrolled >= threshold && hasMore && !loadingMore) loadMore();
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadingMore, loadMore]);

  // ── Auto-dismiss notificaciones ───────────────────────────────────────────
  useEffect(() => {
    if (!notif) return;
    const t = setTimeout(() => setNotif(null), 3000);
    return () => clearTimeout(t);
  }, [notif]);

  // ── Handlers CRUD ─────────────────────────────────────────────────────────

  const handleEliminar = useCallback(async (id) => {
    if (!isAdmin) {
      setNotif({ tipo: "error", msg: "No tienes permisos para eliminar." });
      return;
    }
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta maniobra?")) return;
    setIsSubmitting(true);
    try {
      await eliminar(id);
      setNotif({ tipo: "ok", msg: "Maniobra eliminada correctamente." });
    } catch {
      setNotif({ tipo: "error", msg: "Error al eliminar la maniobra." });
    } finally {
      setIsSubmitting(false);
    }
  }, [eliminar, isAdmin]);

  const handleAbrirEdicion  = useCallback((m) => setModal({ abierto: true, datos: { ...m } }), []);
  const handleCambioModal   = useCallback((key, value) =>
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } })), []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await actualizar(modal.datos.id, modal.datos);
      setNotif({ tipo: "ok", msg: "Maniobra actualizada correctamente." });
      setModal(MODAL_CERRADO);
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al actualizar la maniobra." });
    } finally {
      setIsSubmitting(false);
    }
  }, [modal.datos, actualizar]);

  const handleCambioNueva = useCallback((key, value) =>
    setNuevaManiobra((prev) => ({ ...prev, [key]: value })), []);

  const handleGuardarNueva = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await agregar(nuevaManiobra);
      setNuevaManiobra(MANIOBRA_VACIA);
      setModoAgregar(false);
      setNotif({ tipo: "ok", msg: "Maniobra agregada correctamente." });
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al agregar la maniobra." });
    } finally {
      setIsSubmitting(false);
    }
  }, [nuevaManiobra, agregar]);

  const handleCancelarNueva = useCallback(() => {
    setModoAgregar(false);
    setNuevaManiobra(MANIOBRA_VACIA);
  }, []);

  const handleStatusChange = useCallback(async (maniobra, newStatus) => {
    try {
      await updateStatus(maniobra, newStatus);
      setNotif({ tipo: "ok", msg: "Status actualizado." });
    } catch (err) {
      setNotif({ tipo: "error", msg: `Error al cambiar status: ${err.message}` });
    }
  }, [updateStatus]);

  const handleVacioStatusChange = useCallback(async (maniobra, nuevoStatus) => {
    try {
      await updateVacioStatus(maniobra, nuevoStatus);
      setNotif({ tipo: "ok", msg: "Status de vacío actualizado." });
    } catch (err) {
      setNotif({ tipo: "error", msg: `Error al cambiar status de vacío: ${err.message}` });
    }
  }, [updateVacioStatus]);

  const handleTerceroChange = useCallback(async (maniobra, nuevoValor) => {
    try {
      await updateTercero(maniobra, nuevoValor);
      setNotif({ tipo: "ok", msg: "Tercero actualizado." });
    } catch (err) {
      setNotif({ tipo: "error", msg: `Error al actualizar tercero: ${err.message}` });
    }
  }, [updateTercero]);

  // ── Filtrado (memoizado: solo recalcula si cambian datos/búsqueda) ──
  // Los filtros de status y el de "Terceros" se resuelven en el backend (ver
  // useManiobras.buildUrl), así que aquí solo queda el filtro de búsqueda local
  // sobre lo ya cargado.
  const maniobrasFiltradas = useMemo(() => (
    maniobras.filter((m) =>
      !busqueda ||
      Object.values(m).some((v) =>
        String(v).toLowerCase().includes(busqueda.toLowerCase())
      )
    )
  ), [maniobras, busqueda]);

  const handleVerFotos = useCallback((id) => setFotoModal({ registroId: id }), []);

  // ── Estados de carga / error ──────────────────────────────────────────────

  if (loading) return (
    <div className="maniobras-container">
      <Intro />
      <div className="loading-box"><p className="loading-text">Cargando datos…</p></div>
    </div>
  );

  if (error) return (
    <div className="maniobras-container">
      <Intro />
      <div className="error-box">
        <h2 className="error-title">No se pudo cargar</h2>
        <p className="error-text">No hay conexión con el servidor: {error}</p>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="maniobras-container">
      <Intro />

      <div className="mp-search">
        <SearchBar value={busquedaInput} onChange={setBusquedaInput} />
      </div>

      {notif && (
        <div className={`notif notif-${notif.tipo}`} role="alert" aria-live="polite">
          {notif.msg}
        </div>
      )}

      <div className="toolbar">
        <div className="filtros-status">
          {FILTROS.map(({ id, label }) => (
            <button
              key={id}
              className={`btn-filtro ${filtroStatus === id ? "active" : ""}`}
              onClick={() => setFiltroStatus(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar-acciones">
          <button
            className="btn-salto"
            onClick={() => scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" })}
            title="Ir al inicio de la tabla"
          >
            ⇤ Inicio
          </button>
          <button
            className="btn-salto"
            onClick={() => scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: "smooth" })}
            title="Ir al final de la tabla"
          >
            Fin ⇥
          </button>
          <button
            className="btn-agregar"
            onClick={() => {
              setModoAgregar(true);
              // La fila nueva se monta al inicio: llevar la vista al principio de la tabla
              window.scrollTo({ top: 0, behavior: "smooth" });
              scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
            }}
            disabled={modoAgregar || isSubmitting}
          >
            + Agregar Registro
          </button>
        </div>
      </div>

      <div className="table-responsive">

        {/* ── BODY — scroll horizontal + vertical ── */}
        <div className="table-scroll-wrapper" ref={scrollRef}>
          <table className="maniobras-table">
            {/* thead fantasma para sincronizar anchos de columna */}
            <thead className="thead-ghost">
              <HeaderRow ordenFecha={ordenFecha} onOrdenar={handleOrdenar} />
            </thead>
            <tbody>
              {modoAgregar && (
                <FilaNueva
                  datos={nuevaManiobra}
                  onChange={handleCambioNueva}
                  onGuardar={handleGuardarNueva}
                  onCancelar={handleCancelarNueva}
                  isSubmitting={isSubmitting}
                />
              )}

              {maniobrasFiltradas.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNAS.length + 2}
                    style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}
                  >
                    No hay maniobras que mostrar con el filtro actual
                  </td>
                </tr>
              ) : (
                maniobrasFiltradas.map((maniobra) => (
                  <FilaManiobra
                    key={maniobra.id}
                    maniobra={maniobra}
                    isUpdating={updatingId === maniobra.id}
                    isUpdatingVacio={updatingVacioId === maniobra.id}
                    isUpdatingTercero={updatingTerceroId === maniobra.id}
                    isAdmin={isAdmin}
                    isSubmitting={isSubmitting}
                    onStatusChange={handleStatusChange}
                    onVacioStatusChange={handleVacioStatusChange}
                    onTerceroChange={handleTerceroChange}
                    onEditar={handleAbrirEdicion}
                    onVerFotos={handleVerFotos}
                    onEliminar={handleEliminar}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {loadingMore && (
        <div className="loading-more" aria-live="polite">
          <span className="loading-more-spinner" />
          Cargando más registros…
        </div>
      )}

      {!hasMore && maniobras.length > 0 && !loadingMore && (
        <p className="end-of-list">— Todos los registros cargados —</p>
      )}

      <AnimatePresence>
        {modal.abierto && modal.datos && (
          <ModalEditar
            datos={modal.datos}
            onChange={handleCambioModal}
            onGuardar={handleGuardarEdicion}
            onCerrar={() => setModal(MODAL_CERRADO)}
            isSubmitting={isSubmitting}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fotoModal && (
          <FotoModal
            tipo="maniobra"
            registroId={fotoModal.registroId}
            onCerrar={() => setFotoModal(null)}
            isAdmin={isAdmin}
          />
        )}
      </AnimatePresence>
    </div>
  );
}