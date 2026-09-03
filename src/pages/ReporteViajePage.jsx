import { useState, useEffect, useMemo } from "react";
import DatePicker from "react-datepicker";
import { ArrowLeft, FileSpreadsheet, FileText, Trash2, Plus, TriangleAlert } from "lucide-react";
import { useReportesViaje } from "../hooks/useReportesViaje";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import { useAuthContext } from "../context/AuthContext";
import FolioSelector from "../components/FolioSelector/FolioSelector";
import PatioSelector from "../components/PatioSelector/PatioSelector";
import PlacasSelector from "../components/PlacasSelector/PlacasSelector";
import OperadorSelector from "../components/OperadorSelector/OperadorSelector";
import RemolqueSelector from "../components/RemolqueSelector/RemolqueSelector";
import CatalogoSelector from "../components/CiudadSelector/CiudadSelector";
import VacioStatusSelector from "../components/VacioStatusSelector/VacioStatusSelector";
import SearchBar from "../components/SearchBar/SearchBar";
import {
  REPORTE_VACIO, SI_NO_OPCIONES, RECOLECCION_OPCIONES,
  aTriEstado, deTriEstado, desdeFolio,
  kmTotales, rendimiento, totalCarga, avance, NOMBRES_BLOQUES,
  CARGAS_EN_EL_PAPEL, cargaNueva,
} from "../utils/reporteViaje.mjs";
import "./ReporteViajePage.css";

// El mismo desplegable que ya usa Vacíos para su coordinador: /empleados/ filtra
// por cargo en el servidor (cargo__iexact), así que un empleado dado de alta como
// "coordinadora" o "Coord." no saldrá aquí. Es el comportamiento que ya existe.
const ENDPOINT_COORDINADORES = "/empleados/?cargo=Coordinador";

const SERVICIOS = { sencillo: "Sencillo", full: "Full", carga_suelta: "Carga suelta" };

const sinAcentos = (s) => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const fechaCorta = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const mostrarNumero = (valor, sufijo = "") =>
  valor === null || valor === undefined ? "—" : `${valor}${sufijo}`;

// Importe con dos decimales y separador de miles, para el aviso del diésel.
const dinero = (valor) =>
  `$${Number(valor).toLocaleString("es-MX", { minimumFractionDigits: 2,
                                              maximumFractionDigits: 2 })}`;

// ── Piezas del formulario ────────────────────────────────────────────────────

function Campo({ label, children, ancho }) {
  return (
    <div className={`rv-campo ${ancho ? `rv-campo--${ancho}` : ""}`}>
      <label className="rv-label">{label}</label>
      {children}
    </div>
  );
}

/** Valor que sale del sistema y no se captura: se enseña, no se edita. */
function Calculado({ label, valor }) {
  return (
    <div className="rv-campo">
      <label className="rv-label">{label}</label>
      <output className="rv-calc">{valor}</output>
    </div>
  );
}

function FechaHora({ value, onChange, id }) {
  return (
    <DatePicker
      id={id}
      locale="es"
      selected={value ? new Date(value) : null}
      onChange={(date) => onChange(date ? date.toISOString() : null)}
      showTimeSelect
      timeFormat="HH:mm"
      timeIntervals={15}
      dateFormat="dd/MM/yyyy HH:mm"
      placeholderText="DD/MM/YYYY HH:mm"
      className="date-picker-input"
      isClearable
    />
  );
}

/** Botón de dos opciones con tercer estado. Reelegir la puesta = deseleccionar,
 *  que aquí significa "sin contestar" y NO "no" — ver reporteViaje.mjs. */
function SiNo({ value, onChange }) {
  return (
    <VacioStatusSelector
      opciones={SI_NO_OPCIONES}
      currentStatus={deTriEstado(value)}
      onSelect={(v) => onChange(aTriEstado(v))}
      loading={false}
    />
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

export default function ReporteViajePage() {
  const {
    reportes, cargando, cargar, crear, actualizar, eliminar, buscarPorFolio, descargar,
  } = useReportesViaje();
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const { isAdmin } = useAuthContext();

  const [abierto, setAbierto] = useState(null);   // el reporte en pantalla | null = lista
  const [guardando, setGuardando] = useState(false);
  const [bajando, setBajando] = useState(null);   // "excel" | "pdf" | null
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => { cargar().catch(() => alerta({ tipo: "error", msg: "Error al cargar los reportes." })); },
    [cargar, alerta]);

  // ponytail: el filtro es sobre lo ya cargado (la primera página de 60). Con
  // más volumen, mover la búsqueda al servidor con ?search=.
  const visibles = useMemo(() => {
    const q = sinAcentos(busqueda).trim();
    if (!q) return reportes;
    return reportes.filter((r) =>
      [r.folio, r.cliente, r.coordinador, r.operador, r.origen, r.destino]
        .some((c) => sinAcentos(c).includes(q))
    );
  }, [reportes, busqueda]);

  const cambiar = (campo, valor) => setAbierto((prev) => ({ ...prev, [campo]: valor }));

  // La unidad y el operador de rescate solo se capturan si hubo rescate. Al
  // contestar que NO se limpian: dejarlos escritos imprimiría una unidad de
  // rescate en un viaje que dice no haberlo tenido.
  const hayRescate = abierto?.rescate === true;
  const cambiarRescate = (valor) =>
    setAbierto((prev) => ({
      ...prev,
      rescate: valor,
      ...(valor === true ? {} : { rescate_unidad: "", rescate_operador: "" }),
    }));

  const cambiarCarga = (orden, campo, valor) =>
    setAbierto((prev) => ({
      ...prev,
      cargas: prev.cargas.map((c) => (c.orden === orden ? { ...c, [campo]: valor } : c)),
    }));

  /** El backend no manda los renglones vacíos (no existen en la base): se
   *  rellenan aquí para que el formulario siempre pinte los cinco del papel.
   *  Los añadidos a mano (orden > 5) solo aparecen si el reporte los trae. */
  const normalizar = (reporte) => {
    const recibidas = reporte.cargas || [];
    const porOrden = new Map(recibidas.map((c) => [c.orden, c]));
    const extra = recibidas
      .filter((c) => c.orden > CARGAS_EN_EL_PAPEL)
      .sort((a, b) => a.orden - b.orden)
      .map((c) => ({ litros_diesel: "", precio_litro: "", ...c }));
    return {
      ...REPORTE_VACIO, ...reporte,
      cargas: [
        ...REPORTE_VACIO.cargas.map((vacia) => ({ ...vacia, ...porOrden.get(vacia.orden) })),
        ...extra,
      ],
    };
  };

  const anadirCarga = () =>
    setAbierto((prev) => ({ ...prev, cargas: [...prev.cargas, cargaNueva(prev.cargas)] }));

  /** Al elegir folio: si ya tiene reporte se abre ESE, en vez de dejar que el
   *  usuario llene una pantalla entera para chocar con un 400 al guardar. */
  const elegirFolio = async (maniobra) => {
    if (!maniobra?.folio) return;
    try {
      const existente = await buscarPorFolio(maniobra.folio);
      if (existente) {
        alerta({ tipo: "aviso", msg: `El folio ${maniobra.folio} ya tiene reporte. Se abrió el que hay.` });
        setAbierto(normalizar(existente));
        return;
      }
    } catch {
      // Si la consulta falla se sigue: el backend rechaza el duplicado igual.
    }
    const precarga = desdeFolio(maniobra);
    setAbierto((prev) => ({ ...prev, ...precarga }));
    // La cita sale de fecha_pis + horario de la maniobra y hacen falta LOS DOS.
    // Si falta alguno no hay nada que precargar: se avisa en vez de dejar el
    // campo vacio sin explicacion, que se lee como que el automatismo fallo.
    if (!precarga.cita) {
      alerta({
        tipo: "aviso",
        msg: "La maniobra no trae fecha PIS y horario: captura la cita a mano.",
        dato: maniobra.folio,
      });
    }
  };

  const guardar = async () => {
    if (!abierto.folio) {
      alerta({ tipo: "error", msg: "Elige el folio del viaje antes de guardar." });
      return;
    }
    setGuardando(true);
    try {
      const guardado = abierto.id
        ? await actualizar(abierto.id, abierto)
        : await crear(abierto);
      setAbierto(normalizar(guardado));
      alerta({ tipo: "exito", msg: "Reporte guardado.", dato: guardado.folio });
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo guardar el reporte." });
    } finally {
      setGuardando(false);
    }
  };

  const bajar = async (reporte, formato) => {
    setBajando(formato);
    try {
      await descargar(reporte, formato);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo generar el documento." });
    } finally {
      setBajando(null);
    }
  };

  const borrar = async (reporte) => {
    if (!await preguntar({
      titulo: "Eliminar reporte",
      mensaje: "El reporte y sus cargas de combustible se borran para siempre.",
      dato: reporte.folio,
      accion: "Eliminar",
      peligro: true,
    })) return;
    try {
      await eliminar(reporte.id);
      alerta({ tipo: "exito", msg: "Reporte eliminado." });
      setAbierto(null);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo eliminar." });
    }
  };

  // ── Lista ──────────────────────────────────────────────────────────────
  if (!abierto) {
    return (
      <div className="rv-page">
       <div className="rv-contenido">
        <header className="rv-intro">
          <p className="rv-eyebrow">Coordinadores</p>
          <h1 className="rv-title">Reportes de Viaje</h1>
        </header>

        <div className="rv-barra">
          {/* SearchBar no acepta placeholder: lo trae fijo. */}
          <SearchBar value={busqueda} onChange={setBusqueda} />
          <button className="rv-btn--primario" onClick={() => setAbierto({ ...REPORTE_VACIO })}>
            <Plus size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Nuevo reporte
          </button>
        </div>

        <div className="rv-hoja">
         <div className="rv-tabla-scroll tabla-cabecera-fija">
          <table className="rv-tabla">
            <thead>
              <tr>
                <th>Folio</th><th>Fecha</th><th>Coordinador</th>
                <th>Operador</th><th>Cliente</th><th>Ruta</th><th>Avance</th><th />
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={8} className="rv-estado">Cargando…</td></tr>}
              {!cargando && visibles.length === 0 && (
                <tr><td colSpan={8} className="rv-estado">
                  {busqueda ? "Ningún reporte coincide." : "Todavía no hay reportes."}
                </td></tr>
              )}
              {visibles.map((r) => (
                <tr key={r.id} onClick={() => setAbierto(normalizar(r))}>
                  <td className="rv-folio">{r.folio}</td>
                  <td>{fechaCorta(r.fecha)}</td>
                  <td>{r.coordinador || "—"}</td>
                  <td>{r.operador || "—"}</td>
                  <td>{r.cliente || "—"}</td>
                  <td>{r.origen || "—"} → {r.destino || "—"}</td>
                  <td>
                    <span className="rv-avance">
                      {avance(r).map((hecho, i) => (
                        <i
                          key={i}
                          className={hecho ? "rv-punto rv-punto--on" : "rv-punto"}
                          title={`${NOMBRES_BLOQUES[i]}: ${hecho ? "capturado" : "sin capturar"}`}
                        />
                      ))}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {/* Con etiqueta y no solo el icono: dos iconos de archivo
                        a 16px no se distinguen, y el title obliga a esperar el
                        tooltip para saber cuál es cuál. */}
                    <div className="rv-acciones">
                      {/* Aviso de descuadre del diésel. Solo cuando las dos
                          cifras existen y difieren: el backend ya se negó a
                          pisar lo capturado en Gastos, así que sin esto nadie se
                          enteraría de que hay dos números distintos. Lo decide
                          el servidor (diesel_coincide), no esta pantalla. */}
                      {r.diesel_coincide === false && (
                        <span
                          className="rv-descuadre"
                          title={`Diésel: el reporte suma ${dinero(r.diesel_reporte)} y en Gastos hay ${dinero(r.diesel_gasto)}. `
                                 + `No se sobrescribió lo capturado en Gastos: corrige una de las dos y vuelve a guardar el reporte.`}
                        >
                          <TriangleAlert size={13} /> Diésel
                        </span>
                      )}
                      <button className="rv-btn rv-btn--mini" title="Descargar en Excel"
                              onClick={() => bajar(r, "excel")} disabled={bajando}>
                        <FileSpreadsheet size={13} /> Excel
                      </button>
                      <button className="rv-btn rv-btn--mini" title="Descargar en PDF"
                              onClick={() => bajar(r, "pdf")} disabled={bajando}>
                        <FileText size={13} /> PDF
                      </button>
                      {isAdmin && (
                        <button className="rv-icono rv-icono--peligro" title="Eliminar"
                                onClick={() => borrar(r)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
        </div>
       </div>
      </div>
    );
  }

  // ── Formulario ─────────────────────────────────────────────────────────
  const km = kmTotales(abierto);
  const rend = rendimiento(abierto);

  return (
    <div className="rv-page">
     <div className="rv-contenido">
      <header className="rv-head">
        <div className="rv-head-izq">
          <button className="rv-btn" onClick={() => setAbierto(null)}>
            <ArrowLeft size={16} /> Volver
          </button>
          <h1 className="rv-title rv-title--fila">
            Reporte de Viaje {abierto.folio && <span className="rv-folio-chip">{abierto.folio}</span>}
          </h1>
        </div>
        <div className="rv-acciones">
          {abierto.id && (
            <>
              <button className="rv-btn" onClick={() => bajar(abierto, "excel")} disabled={bajando}>
                <FileSpreadsheet size={16} /> {bajando === "excel" ? "Generando…" : "Excel"}
              </button>
              <button className="rv-btn" onClick={() => bajar(abierto, "pdf")} disabled={bajando}>
                <FileText size={16} /> {bajando === "pdf" ? "Generando…" : "PDF"}
              </button>
            </>
          )}
          <button className="rv-btn rv-btn--primario" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </header>

      {/* ── Identificación ── */}
      <section className="rv-bloque">
        <h2 className="rv-bloque-titulo">Identificación</h2>
        <div className="rv-rejilla">
          <Campo label="Folio del viaje">
            {/* Solo al abrir uno nuevo: cambiar el folio de un reporte guardado
                movería el papel a otro viaje. */}
            {abierto.id
              ? <output className="rv-calc">{abierto.folio}</output>
              : <FolioSelector currentValue={abierto.folio} onSelect={elegirFolio} />}
          </Campo>
          <Campo label="Fecha">
            <DatePicker
              locale="es"
              selected={abierto.fecha ? new Date(abierto.fecha) : null}
              onChange={(d) => cambiar("fecha", d ? d.toISOString().slice(0, 10) : null)}
              dateFormat="dd/MM/yyyy"
              placeholderText="DD/MM/YYYY"
              className="date-picker-input"
              isClearable
            />
          </Campo>
          <Campo label="Coordinador">
            <CatalogoSelector
              endpoint={ENDPOINT_COORDINADORES}
              campo="nombre_trabajador"
              placeholder="— Seleccionar coordinador —"
              currentValue={abierto.coordinador}
              onSelect={(v) => cambiar("coordinador", v)}
            />
          </Campo>
          <Campo label="Servicio">
            <output className="rv-calc">{SERVICIOS[abierto.servicio] || "—"}</output>
          </Campo>
          <Campo label="Cliente">
            <input value={abierto.cliente} onChange={(e) => cambiar("cliente", e.target.value)} />
          </Campo>
          <Campo label="Recolección en puerto">
            <VacioStatusSelector
              opciones={RECOLECCION_OPCIONES}
              currentStatus={abierto.recoleccion}
              onSelect={(v) => cambiar("recoleccion", v)}
              loading={false}
            />
          </Campo>
          <Campo label="Origen">
            <input value={abierto.origen} onChange={(e) => cambiar("origen", e.target.value)} />
          </Campo>
          <Campo label="Destino">
            <input value={abierto.destino} onChange={(e) => cambiar("destino", e.target.value)} />
          </Campo>
          <Campo label="Operador o tercero" ancho="doble">
            <input value={abierto.operador} onChange={(e) => cambiar("operador", e.target.value)} />
          </Campo>
          <Campo label="Fecha y hora de la cita">
            <FechaHora value={abierto.cita} onChange={(v) => cambiar("cita", v)} />
          </Campo>
          <Campo label="Fecha y hora salida pto.">
            <FechaHora value={abierto.salida_puerto} onChange={(v) => cambiar("salida_puerto", v)} />
          </Campo>
          <Campo label="Fecha y hora de inicio pactada">
            <FechaHora value={abierto.inicio_pactado} onChange={(v) => cambiar("inicio_pactado", v)} />
          </Campo>
          <Campo label="Fecha y hora real de salida">
            <FechaHora value={abierto.salida_real} onChange={(v) => cambiar("salida_real", v)} />
          </Campo>
        </div>
      </section>

      {/* ── Información del viaje ── */}
      <section className="rv-bloque">
        <h2 className="rv-bloque-titulo">Información del viaje</h2>
        <div className="rv-rejilla">
          {/* Con desplegable y no texto libre: el folio los precarga, pero si
              hubo un cambio de última hora que no se registró en Maniobras hay
              que poder corregirlo aquí — y contra el mismo catálogo, para que no
              entren placas escritas a mano que no existen. */}
          <Campo label="Unidad">
            <PlacasSelector currentValue={abierto.unidad}
                            onSelect={(v) => cambiar("unidad", v)} />
          </Campo>
          <Campo label="Porta 1">
            <RemolqueSelector currentValue={abierto.remolque_1}
                              onSelect={(v) => cambiar("remolque_1", v)} />
          </Campo>
          <Campo label="Porta 2">
            <RemolqueSelector currentValue={abierto.remolque_2}
                              onSelect={(v) => cambiar("remolque_2", v)} />
          </Campo>
          <Campo label="Km inicial">
            <input type="number" min="0" value={abierto.km_inicial ?? ""}
                   onChange={(e) => cambiar("km_inicial", e.target.value)} />
          </Campo>
          <Campo label="Km final">
            <input type="number" min="0" value={abierto.km_final ?? ""}
                   onChange={(e) => cambiar("km_final", e.target.value)} />
          </Campo>
          <Calculado label="Km totales" valor={mostrarNumero(km)} />
          <Campo label="Fecha y hora llegada con cliente">
            <FechaHora value={abierto.llegada_cliente} onChange={(v) => cambiar("llegada_cliente", v)} />
          </Campo>
          <Campo label="Fecha y hora de descarga">
            <FechaHora value={abierto.descarga} onChange={(v) => cambiar("descarga", v)} />
          </Campo>
        </div>
      </section>

      {/* ── En trayecto ── */}
      <section className="rv-bloque">
        <h2 className="rv-bloque-titulo">En trayecto</h2>
        <div className="rv-tabla-scroll">
          <table className="rv-cargas">
            <thead>
              <tr>
                <th>#</th><th>Lt diésel</th><th>Precio x litro</th><th>Total</th>
                <th>Lt urea</th><th>Total urea</th>
              </tr>
            </thead>
            <tbody>
              {abierto.cargas.map((c) => (
                <tr key={c.orden}>
                  <td className="rv-orden">{c.orden}</td>
                  <td><input type="number" step="0.01" min="0" value={c.litros_diesel ?? ""}
                             onChange={(e) => cambiarCarga(c.orden, "litros_diesel", e.target.value)} /></td>
                  <td><input type="number" step="0.01" min="0" value={c.precio_litro ?? ""}
                             onChange={(e) => cambiarCarga(c.orden, "precio_litro", e.target.value)} /></td>
                  {/* Calculado: litros × precio */}
                  <td className="rv-celda-calc">{mostrarNumero(totalCarga(c))}</td>
                  {/* La urea solo en los cinco del papel: los renglones que se
                      añaden a mano son de diésel y nada más. */}
                  {c.orden > CARGAS_EN_EL_PAPEL ? (
                    <>
                      <td className="rv-celda-na" aria-hidden="true">—</td>
                      <td className="rv-celda-na" aria-hidden="true">—</td>
                    </>
                  ) : (
                    <>
                      <td><input type="number" step="0.01" min="0" value={c.litros_urea ?? ""}
                                 onChange={(e) => cambiarCarga(c.orden, "litros_urea", e.target.value)} /></td>
                      {/* Se captura: el papel no trae precio por litro para la urea */}
                      <td><input type="number" step="0.01" min="0" value={c.total_urea ?? ""}
                                 onChange={(e) => cambiarCarga(c.orden, "total_urea", e.target.value)} /></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rv-cargas-pie">
          <button type="button" className="rv-btn rv-btn--mini" onClick={anadirCarga}>
            + Añadir carga de diésel
          </button>
          {/* El Excel/PDF tiene cinco renglones fijos (fila 12 a 16; la 17 ya es
              el aceite). Lo que se capture de más cuenta para el total y el
              rendimiento, pero no sale impreso — mejor decirlo que descubrirlo
              al abrir el documento. */}
          {abierto.cargas.length > CARGAS_EN_EL_PAPEL && (
            <p className="rv-nota">
              El documento imprime los primeros {CARGAS_EN_EL_PAPEL} renglones; el resto
              cuenta para el total y el rendimiento.
            </p>
          )}
        </div>

        <div className="rv-rejilla">
          <Calculado label="Rendimiento" valor={mostrarNumero(rend, " km/lt")} />
          <Campo label="Lt aceite">
            <input type="number" step="0.01" min="0" value={abierto.litros_aceite ?? ""}
                   onChange={(e) => cambiar("litros_aceite", e.target.value)} />
          </Campo>
          <Campo label="Precio lt aceite">
            <input type="number" step="0.01" min="0" value={abierto.precio_aceite ?? ""}
                   onChange={(e) => cambiar("precio_aceite", e.target.value)} />
          </Campo>
          <Campo label="¿Reparación?">
            <SiNo value={abierto.reparacion} onChange={(v) => cambiar("reparacion", v)} />
          </Campo>
          <Campo label="¿Qué?" ancho="doble">
            <input value={abierto.reparacion_que}
                   onChange={(e) => cambiar("reparacion_que", e.target.value)} />
          </Campo>
          <Campo label="Costo">
            <input type="number" step="0.01" min="0" value={abierto.reparacion_costo ?? ""}
                   onChange={(e) => cambiar("reparacion_costo", e.target.value)} />
          </Campo>
          <Campo label="¿Rescate?">
            <SiNo value={abierto.rescate} onChange={(v) => cambiarRescate(v)} />
          </Campo>
          {/* Cerrados hasta que se conteste que SÍ: sin rescate no hay unidad de
              rescate que capturar, y dejarlos abiertos invita a llenar un dato
              que el papel imprimiría contradiciendo al "NO" de al lado. */}
          <Campo label="Unidad de rescate">
            <input value={abierto.rescate_unidad} disabled={!hayRescate}
                   onChange={(e) => cambiar("rescate_unidad", e.target.value)} />
          </Campo>
          <Campo label="Operador de rescate">
            <input value={abierto.rescate_operador} disabled={!hayRescate}
                   onChange={(e) => cambiar("rescate_operador", e.target.value)} />
          </Campo>
        </div>
      </section>

      {/* ── Regreso ── */}
      <section className="rv-bloque">
        <h2 className="rv-bloque-titulo">Regreso</h2>
        <div className="rv-rejilla">
          <Campo label="Fecha y hora de llegada a Manzanillo" ancho="doble">
            <FechaHora value={abierto.llegada_manzanillo}
                       onChange={(v) => cambiar("llegada_manzanillo", v)} />
          </Campo>
          <Campo label="¿Maniobra de vacío?">
            <SiNo value={abierto.maniobra_vacio} onChange={(v) => cambiar("maniobra_vacio", v)} />
          </Campo>
          <Campo label="Patio de entrega">
            <PatioSelector currentValue={abierto.patio_entrega}
                           onSelect={(v) => cambiar("patio_entrega", v)} />
          </Campo>
          <Campo label="Cita">
            <FechaHora value={abierto.cita_vacio} onChange={(v) => cambiar("cita_vacio", v)} />
          </Campo>
          <Campo label="Unidad">
            <PlacasSelector currentValue={abierto.unidad_vacio}
                            onSelect={(v) => cambiar("unidad_vacio", v)} />
          </Campo>
          <Campo label="Operador">
            <OperadorSelector currentValue={abierto.operador_vacio}
                              onSelect={(v) => cambiar("operador_vacio", v)} />
          </Campo>
          <Campo label="¿Estadías?">
            <SiNo value={abierto.estadias} onChange={(v) => cambiar("estadias", v)} />
          </Campo>
          <Campo label="¿Cuántas? (12 hrs libres de descarga)">
            <input type="number" min="0" value={abierto.estadias_horas ?? ""}
                   onChange={(e) => cambiar("estadias_horas", e.target.value)} />
          </Campo>
        </div>
      </section>

      {/* ── Comentarios ── */}
      <section className="rv-bloque">
        <h2 className="rv-bloque-titulo">Comentarios</h2>
        <textarea className="rv-comentarios" rows={3} value={abierto.comentarios}
                  onChange={(e) => cambiar("comentarios", e.target.value)} />
        <p className="rv-nota">
          La firma del coordinador va en papel: el documento la deja en blanco.
        </p>
      </section>
     </div>
    </div>
  );
}
