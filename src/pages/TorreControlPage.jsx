import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, TriangleAlert, Truck, X, ArrowRight, RotateCcw,
} from "lucide-react";
import { useTorreControl } from "../hooks/useTorreControl";
import { useArrastre } from "../hooks/useArrastre";
import { useAlerta } from "../components/Alertas/Alertas";
import { useConfirmacion } from "../components/Confirmacion/Confirmacion";
import FolioSelector from "../components/FolioSelector/FolioSelector";
import {
  BOLITAS_POR_UNIDAD, INDICE_INICIO, INDICE_FIN, ordenPorNoEco, mesHoy,
  desplazarMes, celdasDelMes, pendientesDeMesesAnteriores, mesMinimoNavegable,
  mesDe, fechaHoy, primerNombre, diaDeFechaHora,
} from "../utils/torreControl.mjs";
import "./TorreControlPage.css";

const DIAS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

// Cada cuánto se mira el reloj para saber si ya cambió el mes. No es una
// petición: es comparar dos textos. Mismo intervalo que el resto del sistema.
const TICK_MS = 60_000;

// Identidad de una bolita a lo largo del arrastre.
const claveDe = (tractoId, indice) => `${tractoId}:${indice}`;

const nombreDelMes = (mes) => {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(anio, numero - 1, 1)
    .toLocaleDateString("es-MX", { month: "long", year: "numeric" });
};

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaLegible = (dia) =>
  dia ? `${Number(dia.slice(8))} ${MESES_CORTO[Number(dia.slice(5, 7)) - 1]}` : "";

/** Una bolita: verde la de salida (índice 1), roja la de regreso (índice 2). */
function Bolita({ noEco, indice, alPresionar, atenuada }) {
  const esInicio = indice === INDICE_INICIO;
  return (
    <span
      className={[
        "tc-bolita",
        esInicio ? "tc-bolita-inicio" : "tc-bolita-fin",
        atenuada ? "tc-bolita-atenuada" : "",
      ].filter(Boolean).join(" ")}
      onPointerDown={alPresionar}
      title={`${noEco} · ${esInicio ? "salida" : "regreso"}`}
    >
      <Truck size={13} aria-hidden="true" />
      {noEco}
    </span>
  );
}

export default function TorreControlPage() {
  const alerta = useAlerta();
  const preguntar = useConfirmacion();
  const {
    unidades, bolitas, asignaciones,
    cargando, error, mover, liberar, liberarTodas, asignarFolio, quitarFolio,
  } = useTorreControl();

  const [hoy, setHoy] = useState(mesHoy);
  const [mes, setMes] = useState(mesHoy);

  // El calendario se actualiza solo: si la pestaña lleva abierta desde agosto y
  // ya es septiembre, salta al mes nuevo. Solo arrastra la vista si estaba
  // mirando el mes que acaba de terminar.
  useEffect(() => {
    const id = setInterval(() => {
      const ahora = mesHoy();
      if (ahora === hoy) return;
      setHoy(ahora);
      setMes((visto) => (visto === hoy ? ahora : visto));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [hoy]);

  const fechaDeHoy = useMemo(() => fechaHoy(), [hoy]);

  const pendientes = useMemo(
    () => ordenPorNoEco(pendientesDeMesesAnteriores(bolitas, hoy)),
    [bolitas, hoy],
  );

  const mesMinimo = useMemo(() => mesMinimoNavegable(bolitas, hoy), [bolitas, hoy]);

  const etiquetas = useMemo(() => {
    const mapa = new Map();
    for (const unidad of unidades) {
      for (let indice = 1; indice <= BOLITAS_POR_UNIDAD; indice++) {
        mapa.set(claveDe(unidad.id, indice), unidad.no_eco);
      }
    }
    return mapa;
  }, [unidades]);

  const bolitasPorDia = useMemo(() => {
    const mapa = new Map();
    for (const bolita of ordenPorNoEco(bolitas)) {
      if (!mapa.has(bolita.fecha)) mapa.set(bolita.fecha, []);
      mapa.get(bolita.fecha).push(bolita);
    }
    // Dentro del día, la de salida antes que la de regreso.
    for (const delDia of mapa.values()) delDia.sort((a, b) => a.indice - b.indice);
    return mapa;
  }, [bolitas]);

  // Libres = las bolitas que no están puestas en ningún día.
  const libres = useMemo(() => {
    const puestas = new Set(bolitas.map((b) => claveDe(b.tracto, b.indice)));
    const sueltas = [];
    for (const unidad of ordenPorNoEco(unidades)) {
      for (let indice = 1; indice <= BOLITAS_POR_UNIDAD; indice++) {
        if (!puestas.has(claveDe(unidad.id, indice))) {
          sueltas.push({ clave: claveDe(unidad.id, indice), no_eco: unidad.no_eco, indice });
        }
      }
    }
    return sueltas;
  }, [unidades, bolitas]);

  const asignacionPorTracto = useMemo(
    () => new Map(asignaciones.map((a) => [a.tracto, a])),
    [asignaciones],
  );


  const alSoltar = useCallback((clave, destino) => {
    const [tracto, indice] = clave.split(":").map(Number);
    const accion = destino === "libres"
      ? liberar(tracto, indice)
      : mover(tracto, indice, destino);

    Promise.resolve(accion).catch((err) =>
      alerta({ tipo: "error", msg: err.message || "No se pudo mover la unidad." }));
  }, [mover, liberar, alerta]);

  const { arrastrando, alPresionar } = useArrastre(alSoltar);

  /**
   * Asigna el folio y, si la maniobra ya tiene fechas de ruta, ACOMODA las
   * bolitas: la verde en Ruta Inicio y la roja en Ruta Fin.
   *
   * Acomodar no es fijar. Las bolitas se siguen moviendo a mano después, y si
   * la maniobra no tiene esas fechas no se toca ninguna — se colocan a mano
   * como siempre.
   */
  const elegirFolio = useCallback(async (unidad, maniobra) => {
    try {
      await asignarFolio(unidad.id, maniobra.folio);

      const salida  = diaDeFechaHora(maniobra.ruta_inicio);
      const regreso = diaDeFechaHora(maniobra.ruta_fin);
      if (salida)  await mover(unidad.id, INDICE_INICIO, salida);
      if (regreso) await mover(unidad.id, INDICE_FIN, regreso);

      alerta({
        tipo: "ok",
        msg: `${unidad.no_eco} · folio ${maniobra.folio}`,
        dato: salida || regreso
          ? `bolitas acomodadas ${diaLegible(salida)}${regreso ? " → " + diaLegible(regreso) : ""}`
          : "sin fechas de ruta: coloca las bolitas a mano",
      });
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo asignar el folio." });
    }
  }, [asignarFolio, mover, alerta]);

  /** Devuelve todas las bolitas al cajón. Pregunta antes: un clic de más
   *  borraría la colocación de todo el mes y no hay deshacer. */
  const vaciarCalendario = useCallback(async () => {
    if (!await preguntar({
      titulo: "Regresar las bolitas al cajón",
      mensaje: "Se quitarán del calendario todas las bolitas colocadas, del mes que sea. Los folios asignados no se tocan.",
      dato: `${bolitas.length} bolita${bolitas.length === 1 ? "" : "s"} colocada${bolitas.length === 1 ? "" : "s"}`,
      accion: "Regresar",
      peligro: true,
    })) return;

    try {
      await liberarTodas();
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudieron regresar las bolitas." });
    }
  }, [preguntar, liberarTodas, bolitas.length, alerta]);

  const soltarFolio = useCallback(async (asignacion) => {
    try {
      await quitarFolio(asignacion.id);
    } catch (err) {
      alerta({ tipo: "error", msg: err.message || "No se pudo quitar el folio." });
    }
  }, [quitarFolio, alerta]);

  if (cargando) return <div className="tc-container"><p className="tc-estado">Cargando la torre…</p></div>;
  if (error) {
    return (
      <div className="tc-container">
        <p className="tc-estado">No se pudo cargar la torre de control. {error}</p>
      </div>
    );
  }

  const celdas = celdasDelMes(mes);

  return (
    <div className="tc-container">
      <header className="tc-header">
        <p className="tc-eyebrow">Torre de control</p>

        <div className="tc-navegacion">
          <button
            className="tc-flecha"
            onClick={() => setMes(desplazarMes(mes, -1))}
            disabled={mes <= mesMinimo}
            title={mes <= mesMinimo ? "No hay nada ocupado antes de este mes" : "Mes anterior"}
          >
            <ChevronLeft size={20} />
          </button>

          <h1 className="tc-mes">{nombreDelMes(mes)}</h1>

          <button
            className="tc-flecha"
            onClick={() => setMes(desplazarMes(mes, 1))}
            disabled={mes >= hoy}
            title={mes >= hoy ? "El mes en curso es el último" : "Mes siguiente"}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      {/* El aviso no se puede cerrar: se va solo cuando esas bolitas dejan de
          estar en un mes anterior. Un aviso que se descarta se olvida, y la
          unidad seguiría ocupada sin que nadie lo supiera. */}
      {pendientes.length > 0 && (
        <div className="tc-aviso" role="status">
          <TriangleAlert size={18} />
          <span>
            {pendientes.map((b) => b.no_eco).join(", ")}
            {pendientes.length === 1 ? " sigue ocupada" : " siguen ocupadas"} en
            {" "}{[...new Set(pendientes.map((b) => nombreDelMes(mesDe(b.fecha))))].join(", ")}.
          </span>
          <button className="tc-aviso-ir" onClick={() => setMes(mesDe(pendientes[0].fecha))}>
            Ir <ChevronLeft size={16} />
          </button>
        </div>
      )}

      <div className="tc-columnas">
        {/* ── Reporte: una fila por unidad ───────────────────────────────── */}
        <section className="tc-reporte">
          <div className="tc-reporte-cabecera">
            <h2 className="tc-reporte-titulo">Unidades y su viaje</h2>
            <button
              type="button"
              className="tc-vaciar"
              onClick={vaciarCalendario}
              disabled={bolitas.length === 0}
              title={bolitas.length === 0
                ? "No hay ninguna bolita en el calendario"
                : "Regresar todas las bolitas al cajón"}
            >
              <RotateCcw size={15} />
              Regresar al cajón
            </button>
          </div>

          <ul className="tc-reporte-lista">
            {ordenPorNoEco(unidades).map((unidad) => {
              const asignacion = asignacionPorTracto.get(unidad.id);
              const servicio = asignacion?.servicio;
              const salida  = diaDeFechaHora(servicio?.ruta_inicio);
              const regreso = diaDeFechaHora(servicio?.ruta_fin);

              return (
                <li key={unidad.id} className="tc-reporte-fila">
                  <div className="tc-reporte-cabeza">
                    <span className="tc-reporte-eco">{unidad.no_eco}</span>

                    <div className="tc-reporte-acciones">
                      {/* El mismo selector que usan CTA Port y los demás
                          documentos: folio, ruta, operador y cliente. Se deja
                          siempre visible para poder reasignar sin quitar antes.
                          `placas` lo acota a los folios de ESTA unidad. */}
                      <FolioSelector
                        currentValue={asignacion?.folio}
                        placas={unidad.placas}
                        onSelect={(maniobra) => elegirFolio(unidad, maniobra)}
                      />
                      {asignacion && (
                        <button
                          type="button"
                          className="tc-reporte-quitar"
                          onClick={() => soltarFolio(asignacion)}
                          title="Quitar el folio y liberar la unidad de este viaje"
                          aria-label={`Quitar el folio ${asignacion.folio} de ${unidad.no_eco}`}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Si el folio no tiene maniobra, o la maniobra no tiene un
                      dato, no se enseña nada en su lugar. */}
                  {servicio && (
                    <div className="tc-reporte-datos">
                      {(servicio.origen || servicio.destino) && (
                        <span className="tc-reporte-ruta">
                          {servicio.origen}
                          <ArrowRight size={13} aria-hidden="true" />
                          {servicio.destino}
                        </span>
                      )}
                      {servicio.cliente && <span>{servicio.cliente}</span>}
                      {servicio.operador && (
                        <span className="tc-reporte-operador">{primerNombre(servicio.operador)}</span>
                      )}
                      {(salida || regreso) && (
                        <span className="tc-reporte-fechas">
                          {diaLegible(salida)}
                          {regreso && <> <ArrowRight size={12} aria-hidden="true" /> {diaLegible(regreso)}</>}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Calendario ─────────────────────────────────────────────────── */}
        <div className="tc-calendario">
          <div className="tc-rejilla-scroll">
            <div className="tc-rejilla">
              {DIAS.map((dia) => (
                <div key={dia} className="tc-dia-nombre">{dia}</div>
              ))}

              {celdas.map((fecha, i) => (
                fecha === null
                  ? <div key={`hueco-${i}`} className="tc-celda tc-celda-hueca" />
                  : (
                    <div
                      key={fecha}
                      className={`tc-celda${fecha === fechaDeHoy ? " tc-celda-hoy" : ""}`}
                      data-destino={fecha}
                    >
                      <span className="tc-numero">{Number(fecha.slice(8))}</span>
                      <div className="tc-celda-bolitas">
                        {(bolitasPorDia.get(fecha) ?? []).map((bolita) => (
                          <Bolita
                            key={bolita.id}
                            noEco={bolita.no_eco}
                            indice={bolita.indice}
                            atenuada={arrastrando?.clave === claveDe(bolita.tracto, bolita.indice)}
                            alPresionar={alPresionar(claveDe(bolita.tracto, bolita.indice))}
                          />
                        ))}
                      </div>
                    </div>
                  )
              ))}
            </div>
          </div>

          <section className="tc-libres" data-destino="libres">
            <h2 className="tc-libres-titulo">Unidades libres</h2>
            <p className="tc-libres-pista">
              <span className="tc-punto tc-punto-inicio" /> salida
              <span className="tc-punto tc-punto-fin" /> regreso
            </p>
            {/* Una fila por color: las verdes arriba y las rojas debajo. Las dos
                con el mismo criterio, No. Eco ascendente de izquierda a derecha,
                así que las dos bolitas de una unidad quedan una sobre otra y se
                localizan mirando a la misma altura. */}
            {[INDICE_INICIO, INDICE_FIN].map((indice) => {
              const delColor = libres.filter((b) => b.indice === indice);
              return (
                <div key={indice} className="tc-libres-fila">
                  {delColor.map(({ clave, no_eco }) => (
                    <Bolita
                      key={clave}
                      noEco={no_eco}
                      indice={indice}
                      atenuada={arrastrando?.clave === clave}
                      alPresionar={alPresionar(clave)}
                    />
                  ))}
                </div>
              );
            })}
            {libres.length === 0 && (
              <p className="tc-libres-vacio">Todas las bolitas están puestas.</p>
            )}
          </section>
        </div>
      </div>

      {/* La copia que sigue al dedo o al ratón. pointer-events: none en el CSS,
          o taparía justo el punto que elementFromPoint tiene que leer. */}
      {arrastrando && (
        <span
          className={`tc-fantasma${arrastrando.clave.endsWith(`:${INDICE_FIN}`) ? " tc-fantasma-fin" : ""}`}
          style={{ left: arrastrando.x, top: arrastrando.y }}
        >
          <Truck size={14} aria-hidden="true" />
          {etiquetas.get(arrastrando.clave)}
        </span>
      )}
    </div>
  );
}
