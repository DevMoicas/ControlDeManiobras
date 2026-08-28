# ADR-0016: La FECHA DE ENTREGA del gasto la manda la maniobra

## Estado

Aceptada

## Fecha

2026-08-27

## Contexto

El gasto automático copiaba la fecha de entrega de la maniobra **solo al nacer**
(`_crear_gasto_del_folio`). El caso normal es justo el malo: el folio se asigna **antes**
de saber la fecha, así que el gasto nacía vacío y había que teclearla otra vez en Gastos,
a mano y fila por fila. El usuario lo describió tal cual y pidió que se actualizara sola.

## Decisión

Cada vez que la fecha **cambia** en la maniobra, baja al gasto. Va en `perform_update` del
`ManiobraViewSet`, junto al resto de automatismos del folio: es el punto por el que pasan
las cuatro vías de la pantalla de Maniobras (fila nueva, modal, celda de la tabla y el
vaciado al cambiar de plaza).

Acotado al **cambio**: editar cualquier otra cosa de la maniobra no toca el gasto, así que
una fecha capturada a mano sobrevive mientras nadie toque la de la maniobra.

**Si la fecha se borra en la maniobra, también se borra en el gasto.** Son el mismo dato;
dejar la del gasto sería dar por buena una fecha que la maniobra ya dice que no sabe.

## Alternativas descartadas

### Leerla en vivo de la maniobra, como el operador y el destino

Esos dos son `read_only` en `GastoSerializer` y salen de la maniobra enlazada, sin
copiarse. Con la fecha no se puede: `gastos.fecha_entrega_mercancia` es una columna real
**con datos propios ya capturados** —incluida basura histórica como `'200'`— y se edita
desde Gastos. Convertirla en calculada borraría de la vista lo que hay sin migrar nada.

### Propagarla en cada guardado de la maniobra, cambie o no

Pisaría la fecha capturada a mano en Gastos cada vez que alguien tocara cualquier campo
de la maniobra, que es la misma trampa del diésel (ADR-0013).

## Consecuencias

- Sin migración: es lógica de sincronización.
- Las fechas viejas del gasto **se van normalizando solas** al formato ISO según se toque
  la fecha de cada maniobra.
- Una maniobra de tercero no tiene gasto: cambiarle la fecha no falla, simplemente no
  copia nada. Hay una prueba para eso.

## Cambio relacionado: el orden de la tabla de Gastos

Se pidió ordenar los gastos de la fecha de entrega más nueva a la más vieja, como
Maniobras con la fecha PIS. Aquí apareció una trampa que conviene dejar escrita:

**`gastos.fecha_entrega_mercancia` NO es una fecha en la base.** Es `varchar`, y hoy
conviven dos formatos —el ISO que escribe el DatePicker (`2026-08-29`) y el `DD/MM/YYYY`
que quedó de cuando se tecleaba a mano—, más `''`, NULL y basura como `'200'`. Ordenar la
columna tal cual es ordenar **texto**: manda el día y no el año, y los dos formatos se
intercalan. El fallo no se ve — la tabla sale ordenada, solo que mal.

Se ordena por una **clave normalizada a ISO calculada al leer**, sin tocar el dato
guardado: reescribir la columna cambiaría lo que ve el usuario en filas que nadie pidió
tocar. Lo que no case con ninguno de los dos formatos cae al final con `nulls_last`, y el
`id` desempata para que la paginación de 60 en 60 no repita ni se salte filas.

La clave se calcula al vuelo y sin índice. Son cientos de filas; si algún día son cientos
de miles, el camino es normalizar la columna a `DATE` de una vez.

## Referencias

- `api/views.py`: `_sincronizar_fecha_entrega`, `ManiobraViewSet.perform_update`,
  `GastoViewSet.get_queryset`.
- `api/test_gasto_automatico.py`: `FechaEntregaSincronizadaTests`, 5 pruebas.
- `api/test_orden_gastos.py`: 3 pruebas.
- Commits `9ca03d84` y `699c914c` (backend), `62bc7e3` (frontend).
