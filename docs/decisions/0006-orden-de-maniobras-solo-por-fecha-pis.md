# ADR-0006: La tabla de Maniobras se ordena solo por FECHA PIS

## Estado

Aceptada

## Fecha

2026-08-25

## Contexto

La tabla de Maniobras ordenaba por `id` (orden de creación) aunque la flecha de
ordenar colgara de la columna FECHA PIS. Coincidían mientras se capturara en orden
cronológico; en cuanto alguien metía una maniobra vieja tarde, se descolocaba.

Al arreglarlo se probó, **el mismo día y a petición del usuario**, a añadir un
segundo criterio: poner arriba las maniobras sin FECHA DE ENTREGA, porque están
pendientes de que se la pongan y en medio de la lista se pierden.

Esa prueba se revirtió unas horas después: *"me está moviendo servicios"*.

## Decisión

El orden por defecto es `sin_pis, -fecha_pis, -id`:

1. **Las que no tienen FECHA PIS, arriba del todo.** Están pendientes de que se la
   pongan.
2. Debajo, por FECHA PIS de la más próxima hacia atrás.
3. El `id` desempata.

**FECHA PIS es la única fecha que ordena esta tabla.** No hay criterio por fecha de
entrega, y `sin_entrega` se retiró del `annotate` y de `ordering_fields` para que no
pueda volver ni pidiéndolo por URL.

## Alternativas consideradas

### Agrupar también por "tiene o no fecha de entrega"

Probada y revertida el mismo día. Movía servicios de sitio sin que se viera por qué:
con dos criterios de agrupación encadenados, una fila podía saltar media tabla al
capturar un dato que aparentemente no tenía que ver con el orden.

### Apoyarse en `nulls_first` para subir las que no tienen fecha

Rechazada. `OrdenNullsLast` manda los NULL al final en cualquier orden, y ese
comportamiento **lo necesita el desglose de PENDIENTES**, que pega al mismo endpoint
y pide `ordering=fecha_pis,id`. Por eso `sin_pis` va como campo agrupador anotado y
no como modificador del orden: cada consumidor pide lo que quiere.

El primer intento sí se apoyó en el grupo y produjo el fallo intermedio: las
maniobras sin FECHA PIS caían al fondo de **su** grupo y aparecían a media tabla en
vez de encabezarla.

### Un `order_by` fijo en el queryset

Rechazada por lo mismo: impondría el criterio a todas las consultas de maniobras,
incluidas las de los desgloses del panel de seguimientos, que no lo quieren.

## Consecuencias

- El desempate por `id` no es cosmético: sin él, dos maniobras del mismo día salen en
  orden arbitrario y la paginación de 60 en 60 puede repetir o saltarse filas.
- En el frontend, `sortable` hacía dos trabajos a la vez —marcar que una columna es
  de tipo fecha y pintar la flecha de ordenar—, así que ENTREGA MERCANCÍA heredaba
  una flecha que en realidad reordenaba por FECHA PIS. Se separó en `esFecha` (tipo) y
  `sortable` (flecha).
- Hay dos pruebas que fallan si alguien vuelve a meter la fecha de entrega en el
  orden.

## Referencias

- `api/views.py`: `OrdenNullsLast`, `ManiobraViewSet.get_queryset`.
- `api/test_orden_maniobras.py` (`NoOrdenaPorFechaDeEntregaTests`).
- Commits `5ed8562d` (el intento) y `c86c55ad` (la reversión).
