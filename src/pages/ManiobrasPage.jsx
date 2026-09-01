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
import BarraScrollTabla from "../components/BarraScrollTabla/BarraScrollTabla";
import RemolqueSelector from "../components/RemolqueSelector/RemolqueSelector";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import TransportistaSelector from "../components/TransportistaSelector/TransportistaSelector";
import PatioSelector from "../components/PatioSelector/PatioSelector";
import ClienteSelector from "../components/ClienteSelector/ClienteSelector";
import CiudadSelector from "../components/CiudadSelector/CiudadSelector";
import FolioDisponibleSelector from "../components/FolioDisponibleSelector/FolioDisponibleSelector";
import VacioStatusSelector from "../components/VacioStatusSelector/VacioStatusSelector";
import TerceroSelector from "../components/TerceroSelector/TerceroSelector";
import TipoServicioSelector, { esServicioFull } from "../components/TipoServicioSelector/TipoServicioSelector";
import CostosExtraSelector from "../components/CostosExtraSelector/CostosExtraSelector";
import "./ManiobrasPage.css";
import SearchBar from "../components/SearchBar/SearchBar";
import { useAlerta } from "../components/Alertas/Alertas";
import ColorSelector from "../components/ColorSelector/ColorSelector";
import { esColorValido, textoSobre } from "../utils/colorFila.mjs";
import { filtrarBusqueda } from "../utils/buscar.mjs";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import { useAuthContext } from "../context/AuthContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import es from "date-fns/locale/es";
import FotoModal from "../components/FotoModal/FotoModal";
import BotonArriba from "../components/BotonArriba/BotonArriba";
import { partirDoble, partirTipoFull, leerPar, textoDelPar, conUnidad } from "../utils/dobleValor.mjs";
import { codigoFolioFull, sinSufijoFull } from "../utils/folioFull.mjs";
import { apiClient } from "../api/apiClient";
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
// Los pares del Full se guardan en las MISMAS columnas (tipo/peso/contenedor),
// así que el Full no necesita columnas nuevas en la base de datos.
// El separador canónico es " - ", pero el histórico también trae "/" (la mayoría
// de los contenedores de dos: "WHLU5591210/WHSU6575360"). El backend acepta las
// dos formas (_sumar_peso) y en Contenedor imprime el texto tal cual en C17, así
// que al editar se conserva el separador que traía — ver utils/dobleValor.mjs.

// partirDoble / unirDoble / partirTipoFull / leerPar viven en utils/dobleValor.mjs:
// parten por '-' Y por '/' (el histórico usa las dos) y devuelven el separador
// para no reescribirlo al guardar. Módulo suelto para poder probarlo con
// node --test, y compartido con los modales de documentos.
//
// Desde la 0035 cada mitad de la carga tiene SU columna (tipo_2, peso_2,
// contenedor_2) porque facturación necesita saber qué operador se llevó qué
// contenedor. Los registros anteriores traen las dos dentro de la primera:
// leerPar() devuelve el par venga en el formato que venga, y escribir va
// siempre a las dos columnas, así que cada fila se migra al editarla.

// Cambiar el tipo de servicio colapsa los campos que dejan de tener dos inputs,
// para no arrastrar el segundo valor de un Full a un servicio que ya no lo usa.
// Carga suelta conserva los dos pares de TIPO DE CARGA (dos tipos de bulto).
function aplicarCambioTipoServicio(datos, onChange, nuevo) {
  onChange("tipo_servicio", nuevo);
  // Deseleccionar ("") no es elegir un servicio más chico: es dejar de afirmar
  // cuál es. Colapsar peso/contenedor ahí borraría el segundo valor de un Full a
  // cambio de nada, así que solo se quita la etiqueta y la carga se queda como
  // está — que es justo el estado de los registros anteriores al campo.
  if (!nuevo || nuevo === "full") return;
  // Se colapsa leyendo el par (los registros viejos traen los dos valores en la
  // columna 1) y se limpia la columna 2, que es donde vive ahora el segundo.
  onChange("peso",         leerPar(datos.peso, datos.peso_2)[0]);
  onChange("peso_2",       "");
  onChange("contenedor",   leerPar(datos.contenedor, datos.contenedor_2)[0]);
  onChange("contenedor_2", "");
  if (nuevo === "sencillo") {
    onChange("tipo",   leerPar(datos.tipo, datos.tipo_2, partirTipoFull)[0]);
    onChange("tipo_2", "");
  }
}

// ── Folios: qué tabla toca según la plaza del viaje ───────────────────────────
// Sin acentos y en mayúsculas porque el catálogo de ciudades lo escribe el
// usuario en Catálogos ("Lázaro Cárdenas", "LAZARO CARDENAS", "Manzanillo, Col.").
// NFD separa la letra de su tilde y \p{M} (marcas combinantes) se la lleva.
const sinAcentos = (s) =>
  (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

// Manda el Origen; si el origen no es ninguna de las dos plazas, decide el Destino.
// Y si ninguno de los dos lo es (Colima → Guadalajara, o la fila recién abierta
// sin ruta todavía), la tabla por defecto es Manzanillo: solo existen esas dos
// secuencias de folios y toda maniobra necesita una, asi que no hay caso "sin tabla".
function tablaDeFolios({ origen, destino }) {
  for (const plaza of [origen, destino]) {
    const p = sinAcentos(plaza);
    if (p.includes("MANZANILLO")) return "manzanillo";
    if (p.includes("LAZARO")) return "lazaro";
  }
  return "manzanillo";
}

// Cambiar de plaza cambia la tabla de folios, así que el folio ya elegido deja de
// valer: se vacía y con eso vuelve a estar disponible para otra maniobra de su
// plaza (no hay estado "usado" en la BD, se deriva de que alguien lo tenga puesto).
// Si la plaza cambia dentro de la misma tabla (Colima → Manzanillo, las dos caen en
// Manzanillo) el folio se queda: solo se pierde al saltar de secuencia.
function aplicarCambioPlaza(datos, onChange, key, valor) {
  onChange(key, valor);
  const antes = tablaDeFolios(datos);
  const ahora = tablaDeFolios({ ...datos, [key]: valor });
  // Los dos folios salen de la MISMA secuencia de la plaza, así que al saltar de
  // tabla se pierden los dos; si no, el del operador 2 quedaría con un código de
  // la otra plaza (y ocupándolo para siempre).
  if (ahora !== antes) {
    onChange("folio", "");
    onChange("folio_2", "");
  }
}

// ── Folio de un Full: el "-2" se pone renombrando el folio del catálogo ───────
// Se engancha en los TRES puntos de escritura (fila nueva, modal y tabla) y no
// en los selectores: así una sola llamada cubre elegir folio, quitarlo, marcar
// Full, desmarcarlo, repartirlo entre dos operadores y cambiar de plaza (que
// libera el folio), en vez de repetir la regla en seis sitios.

// Devuelve si el folio se renombró de verdad.
async function renombrarFolio(actual, nuevo) {
  if (!actual || actual === nuevo) return false;
  // `codigo` es unique en la BD, así que no hace falta filtrar también por tabla.
  const res = await apiClient.get(`/folios/?codigo=${encodeURIComponent(actual)}`);
  // find() y no [0]: si el backend todavía no filtra por codigo, DRF ignora el
  // parámetro y devuelve la tabla entera — coger el primero renombraría un folio
  // ajeno. Así el orden de despliegue deja de importar.
  const folio = (Array.isArray(res) ? res : (res?.results ?? [])).find((f) => f.codigo === actual);
  // Un folio que no está en el catálogo (texto libre de la época anterior al
  // desplegable) no se puede renombrar: la maniobra se guarda igual.
  if (!folio) return false;
  // El backend arrastra el nuevo código a la maniobra que lo tuviera asignado
  // (FolioViewSet.perform_update), así que aquí no hay que propagar nada.
  await apiClient.patch(`/folios/${folio.id}/`, { codigo: nuevo });
  return true;
}

// Deja el catálogo en su sitio y devuelve los campos ya corregidos.
// ponytail: dos escrituras sin transacción — hacerlas atómicas pide un endpoint
// nuevo en el backend. Si la segunda falla, el folio queda renombrado y la
// maniobra no; se arregla volviendo a tocar la fila. Endpoint dedicado si eso
// llega a pasar de verdad.
async function sincronizarFolioFull(antes, campos) {
  const despues = { ...antes, ...campos };
  // El folio que se suelta vuelve a su código base: si no, el "-2" se queda
  // pegado al talonario aunque el folio ya esté libre para otra maniobra.
  if (antes.folio && antes.folio !== despues.folio) {
    await renombrarFolio(antes.folio, sinSufijoFull(antes.folio));
  }
  const deseado = codigoFolioFull(despues);
  if (!despues.folio || despues.folio === deseado) return campos;
  // Si no se renombró (folio de texto libre, anterior al desplegable), el campo
  // se queda como está: maniobra y catálogo tienen que decir SIEMPRE lo mismo o
  // /folios/disponibles/ vuelve a ofrecer el número base como libre.
  if (!(await renombrarFolio(despues.folio, deseado))) return campos;
  return { ...campos, folio: deseado };
}

// Full: dos inputs "TIPO DE CARGA" apilados, uno por contenedor.
// Cada hueco guarda en SU columna: el de arriba es del operador 1 y el de abajo
// del operador 2. `onChange(a, b)` escribe las dos de una vez para que nunca
// queden a medias. Mismo aspecto que antes de la 0035.
function TipoFullInput({ value, value2, onChange, disabled, idPrefix }) {
  const [par1, par2] = leerPar(value, value2, partirTipoFull);
  return (
    <div className="tipo-full-input">
      <TipoSplitInput
        value={par1}
        onChange={(v) => onChange(v, par2)}
        disabled={disabled}
        idPrefix={idPrefix ? `${idPrefix}-1` : undefined}
      />
      <TipoSplitInput
        value={par2}
        onChange={(v) => onChange(par1, v)}
        disabled={disabled}
        idPrefix={idPrefix ? `${idPrefix}-2` : undefined}
      />
    </div>
  );
}

// Full: dos inputs en una celda (peso y contenedor), cada uno en su columna.
function DobleInput({ value, value2, onChange, disabled, etiqueta, idPrefix }) {
  const [a, b] = leerPar(value, value2);
  return (
    <div className="tipo-split-input">
      <input
        id={idPrefix ? `${idPrefix}-1` : undefined}
        type="text"
        value={a}
        onChange={(e) => onChange(e.target.value, b)}
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
        onChange={(e) => onChange(a, e.target.value)}
        placeholder={`${etiqueta} 2`}
        aria-label={`${etiqueta} 2`}
        disabled={disabled}
        className="tipo-split-campo"
        size={Math.max(10, b.length + 2)}
      />
    </div>
  );
}

// `inline`: la celda se edita con un clic encima, sin abrir el modal (mismo gesto
// que Folios). `max` es el límite del SERIALIZER, que en varios campos es más
// estricto que el del modelo (agencia/terminal: 30 vs 255): cortar aquí evita un
// 400 que el apiClient solo sabe mostrar como "HTTP 400" (sin clave `detail`).
// `obligatorio` marca la que el backend rechaza vacía (allow_blank=False).
const COLUMNAS = [
  { key: "solicita", label: "Solicita", inline: true, max: 30, obligatorio: true },
  { key: "agencia", label: "Agencia", inline: true, max: 30 },
  {
    key: "codigo_pis", label: "Código PIS", inline: true, max: 100,
    style: { color: "var(--primary-blue)", fontWeight: "bold", fontFamily: "monospace" }
  },
  { key: "terminal", label: "Terminal", inline: true, max: 30 },
  { key: "placas_pis", label: "Placas PIS", isPlacas: true },
  { key: "saca", label: "SACA", inline: true, max: 100 },
  { key: "fecha_pis", label: "Fecha PIS", esFecha: true, sortable: true },
  { key: "horario", label: "Horario", isHora: true },
  { key: "tipo_servicio", label: "TIPO DE SERVICIO", isTipoServicio: true },
  // key2 = la columna del segundo contenedor. La celda sigue viéndose igual (dos
  // huecos en Full), pero cada hueco guarda en la suya para que facturación
  // sepa qué se llevó cada operador sin partir texto en SQL.
  { key: "tipo",  label: "TIPO DE CARGA", isTipo: true, key2: "tipo_2" },
  { key: "peso",  label: "Peso", isDoble: true, max: 50, key2: "peso_2", sufijo: "KG" },
  { key: "contenedor", label: "Contenedor", isDoble: true, max: 255, key2: "contenedor_2" },
  { key: "referencia", label: "Referencia", inline: true, max: 255 },
  { key: "pedimento", label: "Pedimento", inline: true, max: 255 },
  { key: "cliente", label: "Cliente", isCliente: true },
  { key: "origen", label: "Origen", isOrigen: true },
  { key: "destino", label: "Destino", isDestino: true },
  // Texto libre: en qué situación está la carga mientras sigue en piso.
  { key: "status_piso", label: "Status Piso", inline: true, max: 255 },
  { key: "transportista", label: "Transportista", isTransportista: true },
  { key: "tercero", label: "Tercero", isTercero: true },
  { key: "asignacion_operador_status", label: "Operador", isOperador: true },
  { key: "unidad", label: "Unidad", isPlacas: true },
  { key: "remolque",   label: "Remolque 1", isRemolque: true },
  { key: "remolque_2", label: "Remolque 2", isRemolque2: true },
  { key: "folio", label: "Folio", isFolio: true },
  // ── Segundo operador ───────────────────────────────────────────────────────
  // Un Full puede repartirse entre dos: cada uno se lleva UN contenedor con su
  // tracto y sus remolques, y gasta su propio folio. Todo lo que cuelga del
  // operador 2 (`requiereOperador2`) permanece oculto mientras no se le asigne
  // uno: sin operador no hay a quién asignarle folio, unidad ni remolques.
  { key: "operador_2", label: "Operador 2", isOperador: true },
  { key: "unidad_2", label: "Unidad 2", isPlacas: true, requiereOperador2: true },
  { key: "remolque_3", label: "Remolque 3", isRemolque: true, requiereOperador2: true },
  { key: "remolque_4", label: "Remolque 4", isRemolque: true, requiereOperador2: true },
  { key: "folio_2", label: "Folio 2", isFolio: true, requiereOperador2: true },
  // ── Espejo de Vacíos (solo lectura) ────────────────────────────────────────
  // Las tres se leen de la fila de Vacíos enlazada a esta maniobra y NO se
  // escriben desde aquí: es lo que evita que la tabla y Vacíos acaben diciendo
  // cosas distintas por una captura a mano. El backend las manda ya formateadas
  // (DD/MM/AAAA, y los dos valores unidos por " - " cuando el Full va repartido
  // entre dos operadores y tiene un vacío cada uno), así que la celda solo
  // imprime texto. Ver "Espejo de Vacios" en api/Serializers.py.
  { key: "fecha_maniobra_v", label: "Fecha Maniobra V", soloLectura: true },
  { key: "fecha_entrega_v", label: "Fecha entrega V", soloLectura: true },
  { key: "patio_v", label: "Vacio Patio", soloLectura: true },
  { key: "status_vacio", label: "Status Vacío", isStatusVacio: true },
  { key: "fecha_entrega_mercancia", label: "Entrega Mercancía", esFecha: true },
  // La hora va aparte de la fecha, como Horario acompaña a Fecha PIS: la fecha
  // viaja a la Carta Porte y al gasto, y un timestamp en UTC la desplazaría.
  { key: "hora_entrega", label: "Hora Entrega", isHora: true },
  { key: "no_factura", label: "No. Factura", inline: true, max: 100 },
  { key: "dd", label: "DD", inline: true, max: 100 },
  { key: "ccp", label: "CCP", inline: true, max: 100 },
  // El CCP va emparejado al folio: la remisión del documento es "folio / ccp",
  // así que el operador 2 necesita el suyo. Oculto hasta que se le asigna uno,
  // igual que su folio y su unidad.
  { key: "ccp_2", label: "CCP 2", inline: true, max: 100, requiereOperador2: true },
  { key: "ruta_inicio", label: "Ruta Inicio", isFechaHora: true },
  { key: "ruta_fin",    label: "Ruta Fin",    isFechaHora: true },
  // Costos extra: la ÚNICA columna cuya key no es la del backend. Se LEE de
  // `costos_extra` (lista con el importe congelado) y se ESCRIBE en
  // `costos_extra_ids` (solo ids). La key es la de escritura para que el aviso
  // de guardado encuentre su etiqueta sin caso especial.
  { key: "costos_extra_ids", label: "Costos Extra", isCostosExtra: true },
];

// Ids del catálogo que tiene marcados una maniobra. Se filtra el null: un costo
// borrado del catálogo deja su enlace huérfano (conserva el importe cobrado)
// pero ya no hay casilla que marcar.
const idsDeCostos = (m) => (m?.costos_extra ?? []).map((c) => c.id).filter((id) => id != null);

const MANIOBRA_VACIA = {
  solicita: "", agencia: "", codigo_pis: "", terminal: "", placas_pis: "", saca: "",
  fecha_pis: "", horario: "", tipo_servicio: "sencillo", tipo: "", peso: "", contenedor: "", referencia: "", pedimento: "",
  // cliente = nombre (lo que se ve en la tabla); cliente_id = a cuál fila del
  // catálogo apunta. El id es lo único que distingue dos clientes homónimos.
  cliente: "", cliente_id: null, origen: "", destino: "", status_piso: "", transportista: "", tercero: "", asignacion_operador_status: "",
  // STATUS VACÍO nace en "pendiente": el contenedor de una maniobra recién dada
  // de alta siempre está por devolver, así que el estado inicial es el mismo que
  // el de la fila que se crea en Vacíos (_crear_vacios_del_folio). Se puede
  // cambiar en la propia fila nueva antes de guardar.
  unidad: "", remolque: "", remolque_2: "", folio: "", vacio_patio: "", status_vacio: "pendiente",
  fecha_entrega_mercancia: "", hora_entrega: "", no_factura: "", dd: "", ccp: "", ruta_inicio: "", ruta_fin: "",
  // Segundo operador y su carga (migración 0035)
  operador_2: "", unidad_2: "", folio_2: "", remolque_3: "", remolque_4: "",
  tipo_2: "", peso_2: "", contenedor_2: "", ccp_2: "",
  // Lista, no cadena: viaja tal cual en el POST (ver sanitizarPayload).
  costos_extra_ids: [],
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
  { id: "cancelado", label: "Cancelados" },
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
          {/* soloLectura: el vacío no existe hasta que se le asigna folio, así
              que en la fila nueva no hay nada que enseñar todavía. */}
          {col.requiereOperador2 && !datos.operador_2 ? null : col.soloLectura ? null : col.esFecha ? (
            <DatePicker
              locale="es"
              dateFormat="dd/MM/yyyy"
              selected={fechaADate(datos[col.key])}
              onChange={(date) => onChange(col.key, dateAFechaBackend(date))}
              placeholderText="DD/MM/YYYY"
              className="date-picker-input"
              isClearable
            />
          ) : col.isCostosExtra ? (
            <CostosExtraSelector
              seleccionados={datos.costos_extra_ids ?? []}
              onChange={(ids) => onChange(col.key, ids)}
              disabled={isSubmitting}
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
              onSelect={(val) => aplicarCambioPlaza(datos, onChange, col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isDestino ? (
            <CiudadSelector
              endpoint="/destinos/"
              placeholder="— Seleccionar destino —"
              currentValue={datos[col.key]}
              onSelect={(val) => aplicarCambioPlaza(datos, onChange, col.key, val)}
              disabled={isSubmitting}
            />
          ) : col.isFolio ? (
            <FolioDisponibleSelector
              tabla={tablaDeFolios(datos)}
              currentValue={datos[col.key]}
              onSelect={(codigo) => onChange(col.key, codigo)}
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
              disabled={isSubmitting}
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
                value2={datos[col.key2]}
                onChange={(a, b) => { onChange(col.key, a); onChange(col.key2, b); }}
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
              value2={datos[col.key2]}
              onChange={(a, b) => { onChange(col.key, a); onChange(col.key2, b); }}
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
            {/* Las de solo lectura no salen en el formulario: no son campos que
                se editen, se ven en la tabla. */}
            {COLUMNAS.filter((col) => !col.soloLectura)
                     .filter((col) => !col.requiereOperador2 || datos.operador_2).map((col) => (
              <div key={col.key} className="modal-campo">
                <label htmlFor={`edit-${col.key}`}>{col.label}</label>
                {col.esFecha ? (
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
                ) : col.isCostosExtra ? (
                  /* Sin tocar nada, `datos.costos_extra_ids` no existe aún: se
                     parte de lo que ya tiene guardado la maniobra. */
                  <CostosExtraSelector
                    seleccionados={datos.costos_extra_ids ?? idsDeCostos(datos)}
                    onChange={(ids) => onChange(col.key, ids)}
                    disabled={isSubmitting}
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
                    onSelect={(val) => aplicarCambioPlaza(datos, onChange, col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isDestino ? (
                  <CiudadSelector
                    endpoint="/destinos/"
                    placeholder="— Seleccionar destino —"
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(val) => aplicarCambioPlaza(datos, onChange, col.key, val)}
                    disabled={isSubmitting}
                  />
                ) : col.isFolio ? (
                  <FolioDisponibleSelector
                    tabla={tablaDeFolios(datos)}
                    currentValue={datos[col.key] ?? ""}
                    onSelect={(codigo) => onChange(col.key, codigo)}
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
                    disabled={isSubmitting}
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
                      value2={datos[col.key2] ?? ""}
                      onChange={(a, b) => { onChange(col.key, a); onChange(col.key2, b); }}
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
                    value2={datos[col.key2] ?? ""}
                    onChange={(a, b) => { onChange(col.key, a); onChange(col.key2, b); }}
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
  maniobra, isUpdating, isUpdatingVacio, isUpdatingTercero, isAdmin, isSubmitting, recienCambiada,
  onStatusChange, onVacioStatusChange, onTerceroChange, onGuardarCampos, onEditar, onVerFotos, onEliminar,
}) {
  const statusConfig = getStatusConfig(maniobra.status);
  // El color manual manda sobre el del status. Un valor guardado que no sea
  // "#rrggbb" se ignora en vez de acabar dentro del CSS de la tabla.
  const pintado = esColorValido(maniobra.color) ? maniobra.color : null;
  const esFull = esServicioFull(maniobra);
  const preguntar = useConfirmacion();

  // Edición inline. El estado vive AQUÍ y no en la página a propósito: si viviera
  // arriba, cada tecla cambiaría una prop de las ~2000 filas y el memo dejaría de
  // servir. Así solo se re-renderiza la fila que se está editando.
  const [celdaEditando, setCeldaEditando] = useState(null); // col.key | null
  const [valorEditando, setValorEditando] = useState("");
  // Segunda mitad de la carga de un Full (tipo_2/peso_2/contenedor_2). Solo la
  // usan las celdas con dos huecos; en el resto se queda a "" y no estorba.
  const [valorEditando2, setValorEditando2] = useState("");

  // La carga se parte en dos columnas SOLO en Full: fuera de ahí la segunda no
  // se toca (y aplicarCambioTipoServicio ya la vacía al salir de Full).
  const dosColumnas = (col) => Boolean(col.key2) && esFull;

  const guardar = (campos) => onGuardarCampos(maniobra.id, campos, maniobra);

  const iniciarEdicion = (col) => {
    setCeldaEditando(col.key);
    // leerPar para que un registro del formato viejo ("A - B" en la columna 1)
    // se abra ya repartido en los dos huecos.
    const [a, b] = dosColumnas(col)
      ? leerPar(maniobra[col.key], maniobra[col.key2], col.isTipo ? partirTipoFull : partirDoble)
      : [maniobra[col.key] ?? "", ""];
    setValorEditando(a);
    setValorEditando2(b);
  };

  const confirmarEdicion = async (col) => {
    const valor = col.obligatorio ? valorEditando.trim() : valorEditando;
    if (dosColumnas(col)) {
      // Las dos mitades viajan juntas: mandar solo la primera dejaría la segunda
      // con el valor viejo, y un registro del formato antiguo quedaría duplicado
      // (los dos valores en la columna 1 y otra vez el segundo en la 2).
      const cambio = valor !== (maniobra[col.key] ?? "")
                  || valorEditando2 !== (maniobra[col.key2] ?? "");
      if (cambio) await guardar({ [col.key]: valor, [col.key2]: valorEditando2 });
      setCeldaEditando(null);
      return;
    }
    // Vaciar una columna obligatoria se descarta aquí en vez de mandar un PATCH
    // que el backend va a rechazar igualmente (allow_blank=False en el serializer).
    const hayCambio = valor !== (maniobra[col.key] ?? "") && !(col.obligatorio && !valor);
    if (hayCambio) await guardar({ [col.key]: valor });
    setCeldaEditando(null);
  };

  // Las fechas se guardan al CERRAR el calendario, no en cada clic: con hora hay
  // dos pasos (día y hora) y guardar en el primero cerraría el picker a medias.
  const cerrarFecha = (col) => {
    if (valorEditando !== (maniobra[col.key] ?? "")) guardar({ [col.key]: valorEditando });
    setCeldaEditando(null);
  };

  // Hay dos cambios que arrastran otros campos (la plaza libera el folio; salir de
  // Full colapsa peso/contenedor/tipo). Las reglas ya existen para el modal y se
  // reutilizan tal cual: en vez de escribir N veces, se recoge lo que tocan en UN
  // objeto y sale un solo PATCH. Así la regla no puede divergir entre modal y tabla.
  const recogerCampos = (aplicar) => {
    const campos = {};
    aplicar((k, v) => { campos[k] = v; });
    return campos;
  };

  const guardarPlaza = (col, valor) =>
    guardar(recogerCampos((set) => aplicarCambioPlaza(maniobra, set, col.key, valor)));

  const guardarTipoServicio = async (valor) => {
    const campos = recogerCampos((set) => aplicarCambioTipoServicio(maniobra, set, valor));
    // Salir de Full descarta el segundo valor de peso/contenedor/tipo. En el modal
    // se puede cancelar antes de guardar; aquí el clic escribe directo, así que se
    // pregunta — pero solo cuando de verdad hay un segundo valor que perder.
    // Las columnas _2 entran en la cuenta: en un registro ya migrado el segundo
    // valor vive SOLO ahí, así que mirando únicamente peso/contenedor/tipo el
    // borrado pasaría sin preguntar.
    const pierdeDatos = ["peso", "contenedor", "tipo",
                         "peso_2", "contenedor_2", "tipo_2"].some(
      (k) => campos[k] !== undefined && campos[k] !== (maniobra[k] ?? "")
    );
    if (pierdeDatos && !await preguntar({
      titulo: "Cambiar tipo de servicio",
      mensaje: "Se descartará el segundo valor de Peso, Contenedor y Tipo de carga.",
      dato: `${maniobra.peso || "—"}  ·  ${maniobra.contenedor || "—"}`,
      accion: "Cambiar",
      peligro: true,
    })) return;
    return guardar(campos);
  };

  // Ref estable (no una flecha en línea, que React re-ejecutaría en cada render y
  // robaría el foco al segundo input): enfoca el primer hueco al abrir la celda.
  const enfocarPrimerInput = useCallback((el) => { el?.querySelector("input")?.focus(); }, []);

  // Celda de solo-texto que se abre al hacer clic. El guion no es decorativo: sin
  // él una celda vacía no tendría superficie donde hacer clic.
  const celdaClicable = (col, texto) => (
    <span
      className="mp-celda-texto"
      title="Click para editar"
      role="button"
      tabIndex={0}
      onClick={() => iniciarEdicion(col)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); iniciarEdicion(col); } }}
    >
      {/* La unidad (KG) se añade AL PINTAR, no al dato: iniciarEdicion lee
          maniobra[col.key], así que el input se abre limpio y el backend nunca
          la ve. Los documentos siguen imprimiendo el peso tal cual. */}
      {(col.sufijo ? conUnidad(texto, col.sufijo) : texto)
        || <em className="mp-placeholder">—</em>}
    </span>
  );

  const renderCelda = (col) => {
    // Folio 2, Unidad 2 y sus remolques no existen hasta que hay un segundo
    // operador a quien asignárselos: la columna sigue en la tabla (es global),
    // pero la celda queda vacía en las filas que no lo tienen.
    if (col.requiereOperador2 && !maniobra.operador_2) return null;

    // Espejo de Vacíos: texto y nada más. No es celdaClicable porque aquí no hay
    // nada que editar — esos tres datos se capturan en la página de Vacíos.
    if (col.soloLectura) {
      return maniobra[col.key] || <em className="mp-placeholder">—</em>;
    }

    // ── Selectores: montados siempre, igual que Status Vacío y Tercero ya lo
    // estaban. Cerrados solo cuestan un <button>: ninguno pide su catálogo hasta
    // que se abre (ver el `if (!open) return` de sus useEffect).
    if (col.isCostosExtra) return (
      <CostosExtraSelector
        seleccionados={idsDeCostos(maniobra)}
        onChange={(ids) => guardar({ costos_extra_ids: ids })}
        disabled={isSubmitting}
      />
    );
    if (col.isPlacas) return (
      <PlacasSelector
        currentValue={maniobra[col.key]}
        onSelect={(val) => guardar({ [col.key]: val })}
        disabled={isSubmitting}
        transportista={col.key === "unidad" ? maniobra.transportista : undefined}
        todas={col.key === "placas_pis"}
      />
    );
    if (col.isOperador) return (
      <OperadorSelector
        currentValue={maniobra[col.key]}
        onSelect={(val) => guardar({ [col.key]: val })}
        disabled={isSubmitting}
        transportista={maniobra.transportista}
      />
    );
    if (col.isTransportista) return (
      <TransportistaSelector
        currentValue={maniobra[col.key]}
        onSelect={(val) => guardar({ [col.key]: val })}
        disabled={isSubmitting}
      />
    );
    if (col.isTercero) return (
      <TerceroSelector
        currentValue={maniobra[col.key]}
        onSelect={(nuevoValor) => onTerceroChange(maniobra, nuevoValor)}
        loading={isUpdatingTercero}
      />
    );
    if (col.isStatusVacio) return (
      <VacioStatusSelector
        currentStatus={maniobra[col.key]}
        onSelect={(nuevoStatus) => onVacioStatusChange(maniobra, nuevoStatus)}
        loading={isUpdatingVacio}
      />
    );
    if (col.isCliente) return (
      /* Dos campos en un PATCH: el nombre es lo que se ve, el id es lo único que
         distingue dos clientes homónimos. */
      <ClienteSelector
        currentValue={maniobra[col.key]}
        currentId={maniobra.cliente_id}
        onSelect={(c) => guardar({ cliente: c.nombre_cliente, cliente_id: c.id ?? null })}
        disabled={isSubmitting}
      />
    );
    if (col.isOrigen || col.isDestino) return (
      <CiudadSelector
        endpoint={col.isOrigen ? "/origenes/" : "/destinos/"}
        placeholder={col.isOrigen ? "— Seleccionar origen —" : "— Seleccionar destino —"}
        currentValue={maniobra[col.key]}
        onSelect={(val) => guardarPlaza(col, val)}
        disabled={isSubmitting}
      />
    );
    if (col.isFolio) return (
      <FolioDisponibleSelector
        tabla={tablaDeFolios(maniobra)}
        currentValue={maniobra[col.key]}
        onSelect={(codigo) => guardar({ [col.key]: codigo })}
        disabled={isSubmitting}
      />
    );
    if (col.isPatio) return (
      <PatioSelector
        currentValue={maniobra[col.key]}
        onSelect={(val) => guardar({ [col.key]: val })}
        disabled={isSubmitting}
      />
    );
    if (col.isRemolque || col.isRemolque2) return (
      <RemolqueSelector
        currentValue={maniobra[col.key]}
        onSelect={(val) => guardar({ [col.key]: val })}
        disabled={isSubmitting}
      />
    );

    if (col.isTipoServicio) return (
      <TipoServicioSelector
        currentValue={maniobra[col.key]}
        onSelect={guardarTipoServicio}
        disabled={isSubmitting}
      />
    );

    // TIPO DE CARGA: no es un campo, son 2 huecos ("40 / HC") o 4 si es Full. Se
    // monta el mismo editor compuesto del modal y se guarda cuando el foco sale
    // del grupo entero — si no, pasar del hueco izquierdo al derecho guardaría a
    // medias. relatedTarget es a dónde va el foco; null (clic fuera) también sale.
    // Estas celdas no son un campo: son 2 o 4 huecos. TIPO DE CARGA siempre
    // ("40 / HC", y en Full dos pares); Peso y Contenedor solo en Full, donde
    // guardan dos valores como "A - B". Se monta el MISMO editor que usa el
    // modal y se guarda cuando el foco sale del grupo entero — si no, pasar de
    // un hueco al de al lado guardaría a medias.
    const EditorCompuesto =
      col.isTipo               ? (esFull ? TipoFullInput : TipoSplitInput)
      : (col.isDoble && esFull) ? DobleInput
      :                           null;

    if (EditorCompuesto) {
      if (celdaEditando !== col.key) {
        // Las DOS mitades, no solo la columna 1: desde la 0035 la segunda vive
        // en su propia columna y la celda enseñaba un solo contenedor mientras
        // que al abrirla salían los dos. Misma condición que usa el editor.
        const texto = dosColumnas(col)
          ? textoDelPar(maniobra[col.key], maniobra[col.key2], col.isTipo)
          : maniobra[col.key];
        return celdaClicable(col, texto);
      }
      return (
        <div
          ref={enfocarPrimerInput}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) confirmarEdicion(col); }}
          onKeyDown={(e) => {
            if (e.key === "Enter")  confirmarEdicion(col);
            if (e.key === "Escape") setCeldaEditando(null);
          }}
        >
          <EditorCompuesto
            value={valorEditando}
            value2={valorEditando2}
            // TipoSplitInput (el de un solo par) llama con un argumento;
            // TipoFullInput y DobleInput, con los dos. Una sola firma sirve.
            onChange={(a, b) => {
              setValorEditando(a);
              if (b !== undefined) setValorEditando2(b);
            }}
            disabled={isSubmitting}
            etiqueta={col.label}
          />
        </div>
      );
    }

    // ── Fechas: bajo demanda. El DatePicker abre su calendario al recibir el foco,
    // así que montarlo con autoFocus lo deja abierto con UN clic. Mientras no se
    // edita, la celda enseña texto — que es lo que se lee de un vistazo en una
    // tabla de 30 columnas.
    if (col.esFecha || col.isHora || col.isFechaHora) {
      if (celdaEditando !== col.key) {
        const texto = col.esFecha     ? fechaParaMostrar(maniobra[col.key])
                    : col.isFechaHora ? fechaHoraParaMostrar(maniobra[col.key])
                    :                   maniobra[col.key];
        return celdaClicable(col, texto);
      }
      const comunes = {
        autoFocus: true,
        className: "date-picker-input",
        isClearable: true,
        onClickOutside: () => cerrarFecha(col),
        onCalendarClose: () => cerrarFecha(col),
      };
      if (col.esFecha) return (
        <DatePicker
          {...comunes}
          locale="es"
          dateFormat="dd/MM/yyyy"
          placeholderText="DD/MM/YYYY"
          selected={fechaADate(valorEditando)}
          onChange={(date) => setValorEditando(dateAFechaBackend(date))}
        />
      );
      if (col.isHora) return (
        <DatePicker
          {...comunes}
          showTimeSelect
          showTimeSelectOnly
          timeIntervals={15}
          timeCaption="Hora"
          timeFormat="HH:mm"
          dateFormat="HH:mm"
          placeholderText="HH:mm"
          selected={horaADate(valorEditando)}
          onChange={(date) => setValorEditando(dateAHora(date))}
        />
      );
      return (
        <DatePicker
          {...comunes}
          locale="es"
          showTimeSelect
          timeFormat="HH:mm"
          timeIntervals={15}
          dateFormat="dd/MM/yyyy HH:mm"
          placeholderText="DD/MM/YYYY HH:mm"
          selected={valorEditando ? new Date(valorEditando) : null}
          onChange={(date) => setValorEditando(date ? date.toISOString() : "")}
        />
      );
    }

    // ── Texto: clic → escribir → blur/Enter guarda, Escape cancela.
    // Peso y Contenedor solo cuando NO es Full: en Full guardan dos valores
    // ("A - B") y componerlos a mano es cosa del modal.
    // isDoble que llega hasta aquí ya es un servicio NO Full: un solo valor.
    if (col.inline || col.isDoble) {
      if (celdaEditando !== col.key) return celdaClicable(col, maniobra[col.key]);
      return (
        <input
          type="text"
          value={valorEditando}
          autoFocus
          maxLength={col.max}
          aria-label={col.label}
          onChange={(e) => setValorEditando(e.target.value)}
          onBlur={() => confirmarEdicion(col)}
          onKeyDown={(e) => {
            if (e.key === "Enter")  confirmarEdicion(col);
            if (e.key === "Escape") setCeldaEditando(null);
          }}
        />
      );
    }

    return maniobra[col.key];
  };

  return (
    <tr
      // `fila-cambiada` la pone el refresco automático: un parpadeo de un
      // segundo para que el cambio de otra persona se vea llegar en vez de
      // colarse sin que nadie lo note.
      className={`${statusConfig?.rowClass ?? ""}${pintado ? " row-pintada" : ""}${recienCambiada ? " fila-cambiada" : ""}`}
      // Sin color no hay ni clase ni variables: la fila vuelve sola a lo que
      // pinte su status, sin tener que recordar cuál era.
      style={pintado ? { "--color-fila": pintado, "--texto-fila": textoSobre(pintado) } : undefined}
    >
      {COLUMNAS.map((col) => (
        <td key={col.key} style={col.style ?? {}}>
          {renderCelda(col)}
        </td>
      ))}
      <td style={{ whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <StatusSelector
            currentStatus={maniobra.status}
            onSelect={(newStatus) => onStatusChange(maniobra, newStatus)}
            loading={isUpdating}
          />
          <ColorSelector
            color={maniobra.color}
            onSelect={(valor) => guardar({ color: valor })}
          />
        </div>
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
    loadMore, eliminar, actualizar, agregar, recienCambiadas,
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
  const setNotif = useAlerta();
  const preguntar = useConfirmacion();
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

  // ── Handlers CRUD ─────────────────────────────────────────────────────────

  const handleEliminar = useCallback(async (id) => {
    if (!isAdmin) {
      setNotif({ tipo: "error", msg: "No tienes permisos para eliminar." });
      return;
    }
    if (!await preguntar({
      titulo: "Eliminar maniobra",
      mensaje: "Se borrará el registro completo. No se puede deshacer.",
      accion: "Eliminar",
      peligro: true,
    })) return;
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

  const handleAbrirEdicion  = useCallback((m) => setModal({ abierto: true, datos: { ...m }, original: m }), []);
  const handleCambioModal   = useCallback((key, value) =>
    setModal((prev) => ({ ...prev, datos: { ...prev.datos, [key]: value } })), []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await actualizar(modal.datos.id, await sincronizarFolioFull(modal.original ?? {}, modal.datos));
      setNotif({ tipo: "ok", msg: "Maniobra actualizada correctamente." });
      setModal(MODAL_CERRADO);
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al actualizar la maniobra." });
    } finally {
      setIsSubmitting(false);
    }
  }, [modal.datos, modal.original, actualizar]);

  // Guardado desde la tabla: PATCH parcial. Recibe un objeto y no un solo campo
  // porque hay dos casos de dos campos a la vez (cliente + cliente_id, y plaza +
  // folio liberado) que tienen que viajar en la MISMA escritura.
  // useCallback porque la referencia viaja a las ~2000 filas memoizadas.
  const handleGuardarCampos = useCallback(async (id, campos, maniobra = {}) => {
    try {
      const finales = await sincronizarFolioFull(maniobra, campos);
      await actualizar(id, finales);
      // Se confirma QUÉ se escribió, no "campo actualizado": el valor va en la
      // línea monoespaciada del aviso porque es un código que hay que verificar.
      const [campo, valor] = Object.entries(finales)[0];
      setNotif({
        tipo: "ok",
        msg: COLUMNAS.find((c) => c.key === campo)?.label ?? campo,
        // Los costos extra viajan como lista de ids: pintarlos crudos en el
        // aviso ("37") no dice nada. Se resume por cantidad.
        dato: Array.isArray(valor)
          ? (valor.length ? `${valor.length} seleccionado${valor.length > 1 ? "s" : ""}` : "(ninguno)")
          : (valor || "(vacío)"),
      });
    } catch (err) {
      setNotif({ tipo: "error", msg: err.message || "Error al actualizar el campo." });
    }
  }, [actualizar]);

  const handleCambioNueva = useCallback((key, value) =>
    setNuevaManiobra((prev) => ({ ...prev, [key]: value })), []);

  const handleGuardarNueva = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await agregar(await sincronizarFolioFull({}, nuevaManiobra));
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
  // Acepta exclusiones ("-zuñiga") y frases entre comillas; ver utils/buscar.mjs,
  // que es donde vive el caso de `costos_extra` (lista de objetos).
  const maniobrasFiltradas = useMemo(
    () => filtrarBusqueda(maniobras, busqueda),
    [maniobras, busqueda]
  );

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
        <SearchBar
          value={busquedaInput}
          onChange={setBusquedaInput}
          placeholder='Buscar…  ("-" excluye. ej: -zuñiga/-"jose zuñiga")'
        />
      </div>

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
        <div className="bst-zona">
        <BarraScrollTabla contenedorRef={scrollRef} />
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
                    recienCambiada={recienCambiadas.includes(maniobra.id)}
                    isUpdating={updatingId === maniobra.id}
                    isUpdatingVacio={updatingVacioId === maniobra.id}
                    isUpdatingTercero={updatingTerceroId === maniobra.id}
                    isAdmin={isAdmin}
                    isSubmitting={isSubmitting}
                    onStatusChange={handleStatusChange}
                    onVacioStatusChange={handleVacioStatusChange}
                    onTerceroChange={handleTerceroChange}
                    onGuardarCampos={handleGuardarCampos}
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
      <BotonArriba contenedorRef={scrollRef} />
    </div>
  );
}