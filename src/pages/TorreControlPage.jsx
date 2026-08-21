import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, TriangleAlert, Truck } from "lucide-react";
import { useTorreControl } from "../hooks/useTorreControl";
import { useArrastre } from "../hooks/useArrastre";
import { useAlerta } from "../components/Alertas/Alertas";
import {
  BOLITAS_POR_UNIDAD, ordenPorNoEco, mesHoy, desplazarMes, celdasDelMes,
  pendientesDeMesesAnteriores, mesMinimoNavegable, mesDe, fechaHoy,
} from "../utils/torreControl.mjs";
import "./TorreControlPage.css";

const DIAS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

// Cada cuánto se mira el reloj para saber si ya cambió el mes. No es una
// petición: es comparar dos textos. Mismo intervalo que el resto del sistema.
const TICK_MS = 60_000;

// Identidad de una bolita a lo largo del arrastre. Lleva el índice porque el día
// que BOLITAS_POR_UNIDAD sea 2, la misma unidad tendrá dos bolitas distintas.
const claveDe = (tractoId, indice) => `${tractoId}:${indice}`;

const nombreDelMes = (mes) => {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(anio, numero - 1, 1)
    .toLocaleDateString("es-MX", { month: "long", year: "numeric" });
};

function Bolita({ noEco, alPresionar, atenuada }) {
  return (
    <span
      className={`tc-bolita${atenuada ? " tc-bolita-atenuada" : ""}`}
      onPointerDown={alPresionar}
      title={noEco}
    >
      {/* El mismo Truck que ya identifica a Maniobras y a la marca de la
          cabecera: la unidad se reconoce igual en toda la aplicación. */}
      <Truck size={14} aria-hidden="true" />
      {noEco}
    </span>
  );
}

export default function TorreControlPage() {
  const alerta = useAlerta();
  const { unidades, bolitas, cargando, error, mover, liberar } = useTorreControl();

  // `hoy` es el mes real; `mes` es el que se está mirando. Son distintos en
  // cuanto alguien retrocede con la flecha.
  const [hoy, setHoy] = useState(mesHoy);
  const [mes, setMes] = useState(mesHoy);

  // El calendario se actualiza solo: si la pestaña lleva abierta desde agosto y
  // ya es septiembre, salta al mes nuevo. Solo arrastra la vista si estaba
  // mirando el mes que acaba de terminar — a quien esté revisando un mes pasado
  // no se le mueve la pantalla debajo.
  useEffect(() => {
    const id = setInterval(() => {
      const ahora = mesHoy();
      if (ahora === hoy) return;
      setHoy(ahora);
      setMes((visto) => (visto === hoy ? ahora : visto));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [hoy]);

  // Se recalcula al cambiar de mes, que es cuando puede quedar obsoleta.
  const fechaDeHoy = useMemo(() => fechaHoy(), [hoy]);

  const pendientes = useMemo(
    () => ordenPorNoEco(pendientesDeMesesAnteriores(bolitas, hoy)),
    [bolitas, hoy],
  );

  // Hasta dónde llega la flecha atrás: el mes de la bolita más antigua. Sin
  // pendientes no hay hacia dónde ir, y así ninguna unidad queda inalcanzable.
  const mesMinimo = useMemo(() => mesMinimoNavegable(bolitas, hoy), [bolitas, hoy]);

  // El No. Eco de cada bolita, por clave. Lo usa el fantasma que sigue al dedo:
  // mientras se arrastra, la bolita puede estar en el calendario o en libres.
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
    return mapa;
  }, [bolitas]);

  // Libres = las que no están ocupadas. No se guardan en ningún sitio: se restan.
  const libres = useMemo(() => {
    const ocupadas = new Set(bolitas.map((b) => claveDe(b.tracto, b.indice)));
    const sueltas = [];
    for (const unidad of ordenPorNoEco(unidades)) {
      for (let indice = 1; indice <= BOLITAS_POR_UNIDAD; indice++) {
        if (!ocupadas.has(claveDe(unidad.id, indice))) {
          sueltas.push({ clave: claveDe(unidad.id, indice), no_eco: unidad.no_eco });
        }
      }
    }
    return sueltas;
  }, [unidades, bolitas]);

  const alSoltar = useCallback((clave, destino) => {
    const [tracto, indice] = clave.split(":").map(Number);
    const accion = destino === "libres"
      ? liberar(tracto, indice)
      : mover(tracto, indice, destino);

    Promise.resolve(accion).catch((err) =>
      alerta({ tipo: "error", msg: err.message || "No se pudo mover la unidad." }));
  }, [mover, liberar, alerta]);

  const { arrastrando, alPresionar } = useArrastre(alSoltar);

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
          unidad seguiría bloqueada sin que nadie lo supiera. */}
      {pendientes.length > 0 && (
        <div className="tc-aviso" role="status">
          <TriangleAlert size={18} />
          <span>
            {pendientes.map((b) => b.no_eco).join(", ")}
            {pendientes.length === 1 ? " sigue ocupada" : " siguen ocupadas"} en
            {" "}{[...new Set(pendientes.map((b) => nombreDelMes(mesDe(b.fecha))))].join(", ")}.
          </span>
          <button
            className="tc-aviso-ir"
            onClick={() => setMes(mesDe(pendientes[0].fecha))}
          >
            Ir <ChevronLeft size={16} />
          </button>
        </div>
      )}

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
        {/* Ascendente de izquierda a derecha: el orden del DOM, el visual y el
            del tabulador son el mismo. */}
        <div className="tc-libres-fila">
          {libres.map(({ clave, no_eco }) => (
            <Bolita
              key={clave}
              noEco={no_eco}
              atenuada={arrastrando?.clave === clave}
              alPresionar={alPresionar(clave)}
            />
          ))}
          {libres.length === 0 && (
            <p className="tc-libres-vacio">Todas las unidades están ocupadas.</p>
          )}
        </div>
      </section>

      {/* La copia que sigue al dedo o al ratón. pointer-events: none en el CSS,
          o taparía justo el punto que elementFromPoint tiene que leer. */}
      {arrastrando && (
        <span
          className="tc-fantasma"
          style={{ left: arrastrando.x, top: arrastrando.y }}
        >
          <Truck size={14} aria-hidden="true" />
          {etiquetas.get(arrastrando.clave)}
        </span>
      )}
    </div>
  );
}
