# ADR-0017: Las celdas de Vacíos en Maniobras se LEEN, no se copian

## Estado

Aceptada

## Fecha

2026-09-01

## Contexto

La tabla de Maniobras necesitaba enseñar tres datos que se capturan en la página de
Vacíos: la fecha de maniobra del vacío, su fecha de entrega y su patio. El motivo que dio
el usuario es literal: *"así no hay un desfase en la información por captura manual o
errónea"*. Hoy `maniobras.vacio_patio` y `maniobras.status_vacio` son precisamente eso —
copias tecleadas a mano de datos que viven en Vacíos— y se separan de la realidad.

Antes de poder leer nada había un problema más profundo: **`vacios` no tenía ninguna
columna que dijera de qué maniobra salía cada fila**. El enlace se adivinaba por el
contenedor y solo entre los pendientes (`_vacio_pendiente`), y el propio docstring de esa
función ya avisaba de que es lo único que impide duplicar. Esa vía no distingue el viaje
de hoy del de hace meses: el mismo contenedor vuelve a pasar.

## Decisión

**Dos partes, y la primera es la que sostiene a la segunda.**

1. `vacios` gana `maniobra_id` (FK, migración 0061). Lo pone `_crear_vacios_del_folio` al
   dar de alta la fila, que es el único momento en que se sabe con certeza. Un vacío
   creado a mano se queda en NULL, que es la verdad: no viene de ninguna maniobra.

2. Las tres celdas **no son columnas de `maniobras`**. Son campos de solo lectura del
   serializer (`fecha_maniobra_v`, `fecha_entrega_v`, `patio_v`) que se leen de los vacíos
   enlazados cada vez que se sirve la fila. Al no haber copia, no hay nada que pueda
   quedarse desfasado — que era el objetivo entero.

Un Full repartido tiene dos vacíos y se enseñan los dos unidos por `" - "`, el mismo
formato que ya usan Contenedor y Peso en esa fila.

`patio_v` cae al `maniobras.vacio_patio` tecleado en su día cuando no hay vacío enlazado.
Sin ese respaldo, las maniobras anteriores a la 0061 perderían en pantalla un dato que hoy
se ve.

## Alternativas descartadas

### Copiar los valores a columnas de `maniobras` y propagarlos al guardar un vacío

Es el patrón que ya usa el gasto automático, y aquí habría sido peor: tres columnas nuevas
en vez de una, código de propagación que mantener, y —lo que lo mata— **la copia puede
desfasarse**, que es exactamente el problema que se venía a resolver. Un espejo que se
mantiene con un disparador es un espejo que algún día no se mantiene.

### Seguir enlazando por contenedor, sin columna nueva

Ahorra la migración pero condena la lectura a adivinar. El mismo contenedor pasa varias
veces al año; leer del vacío equivocado es un error silencioso, de los que se descubren en
el patio y no en la pantalla. Además la migración era inevitable de todos modos si se
hubieran querido las columnas copiadas.

### Que las tres celdas se pudieran editar desde Maniobras

Es la captura manual que produce el desfase. Se decidió con el usuario que son de solo
lectura: el dato se captura en Vacíos, que es su sitio.

## Consecuencias

- Una consulta más por página (`prefetch_related('vacios')`), no 60.
- Los vacíos que ya existían se enlazaron **una sola vez** en la propia migración, por
  contenedor y quedándose con la maniobra más reciente. Solo los pendientes: un vacío
  entregado no va a cambiar de fechas ni de patio. Lo que no casó quedó en NULL.
- `maniobras.vacio_patio` sigue en la base con sus datos y las ramas `isPatio` del
  frontend quedan intactas: volver atrás es una línea.
- Leer una maniobra ahora pasa por `vacios`. Las pruebas que crean la tabla `maniobras`
  tienen que crear también la de `vacios`, o revientan con `relation "vacios" does not
  exist` — le pasó a 29 pruebas ajenas al hacer el cambio.
