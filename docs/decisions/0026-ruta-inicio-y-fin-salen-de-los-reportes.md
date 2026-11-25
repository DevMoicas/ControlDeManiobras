# ADR-0026: RUTA INICIO y RUTA FIN salen de los reportes de viaje

## Estado

Aceptada. Modifica el ADR-0022.

## Fecha

2026-11-25

## Contexto

El ADR-0022 copiaba la FECHA Y HORA REAL DE SALIDA del reporte a `maniobras.ruta_inicio`.
En producción había maniobras sin RUTA INICIO. El usuario pidió dos cosas: que se llene
**siempre**, y que RUTA FIN se llene igual con la FECHA Y HORA DE LLEGADA A MANZANILLO.
Cualquier cambio en el reporte también debe llegar a la maniobra.

Las maniobras se quedaban vacías por tres causas:

1. El reporte se abrió antes de que la maniobra tuviera el folio. La copia corría al
   guardar el reporte, y en ese momento el reporte no tenía maniobra.
2. Hay maniobras sin reporte: el histórico y los viajes de terceros.
3. Hay reportes que todavía no tienen salida real.

## Decisión

- `ReporteViaje.RUTA_DEL_REPORTE` lleva dos pares: `salida_real → ruta_inicio` y
  `llegada_manzanillo → ruta_fin`. La copia la hace `volcar_ruta_a_la_maniobra()`, que
  sustituye a `volcar_salida_a_la_maniobra()`.
- **Full repartido** (dos reportes, una sola maniobra): RUTA INICIO es la salida **más
  temprana** y RUTA FIN la llegada **más tardía** (`ruta_de_los_reportes`). Antes ganaba
  el último reporte que se guardaba, y los dos se pisaban entre sí.
- **Borrar** una fecha del reporte solo vacía la de la maniobra si todavía tenía el valor
  anterior del reporte. Si alguien la cambió a mano en Maniobras, se queda.
- La causa 1 se arregla en `_crear_reportes_del_folio`: si el reporte del folio ya
  existía, copia en ese momento.
- Los datos de antes se repasan con `sincronizar_rutas.py`
  (`migrar_prod.sh rutas-ver` / `rutas-sincronizar`).
  - Solo copia cuando el folio coincide **exacto**.
  - Un folio parecido (`C-2256` frente a `'C-2256 - 2'`) puede ser otro viaje, y lo fue:
    se lista para revisarlo, pero no se toca.

## Alternativas descartadas

- **Una columna de ruta por operador** en el Full: nadie la pidió, y con mín./máx. el
  viaje completo queda bien representado.
- **Emparejar folios ignorando espacios** al copiar: en la base había un caso real de dos
  viajes distintos con folios así.

## Consecuencias

- La maniobra se puede mover de día en la Torre de Control, igual que en el ADR-0022.
  Ahora también puede pasar por RUTA FIN.
- Las causas 2 y 3 no tienen arreglo automático: el diagnóstico las lista.
- La migración no tocó nada de esto: es lógica de sincronización y no cambia el esquema.

## Referencias

- `api/models.py`: `ReporteViaje.RUTA_DEL_REPORTE`, `ruta_de_los_reportes`,
  `volcar_ruta_a_la_maniobra`, `_mismo_instante`.
- `api/views.py`: `_crear_reportes_del_folio`.
- `api/test_reporte_automatico.py`.
- Backend `1182a547`. `PRACTICAS/sincronizar_rutas.py`.
