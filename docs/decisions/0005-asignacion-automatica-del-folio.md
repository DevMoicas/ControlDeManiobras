# ADR-0005: La asignación del folio la escribe la maniobra que lo tiene puesto

## Estado

Aceptada

## Fecha

2026-08-25

## Contexto

La página FOLIOS es el talonario: una fila por folio de papel, con dos columnas
editables a mano, `codigo` y `asignacion`. Hasta ahora alguien escribía a mano en
ASIGNACIÓN quién llevaba ese folio.

Lo que hay que decidir: **quién escribe esa columna** cuando el folio ya está
asignado a un servicio que sabe perfectamente quién lo lleva.

Restricciones conocidas en el momento de decidir:

- El vínculo entre maniobra y folio es la **cadena** `codigo`, no una FK: `maniobras`
  es `managed=False`.
- El folio se asigna desde **cuatro sitios** de la pantalla de Maniobras: fila nueva,
  modal, celda de la tabla, y el vaciado automático al cambiar de plaza.
- `folios/disponibles/` considera **ocupado todo folio con algo escrito en
  `asignacion`**. Es la vía por la que se retiran de circulación los talonarios
  viejos usados fuera del sistema, sin columna de estado.
- Un viaje de tercero no lo lleva un chofer nuestro.

## Decisión

`ManiobraViewSet.perform_create` / `perform_update` derivan la asignación de la
maniobra y la escriben en el folio:

- **FRABA o sin transportista** → las dos primeras palabras del operador.
- **Tercero** → `"TERCERO <transportista>"`.
- Sin ese dato todavía → cadena vacía, y se rellena sola en cuanto se capture.

Se recalcula en **cada guardado**, no solo cuando el folio pasa de vacío a lleno: lo
normal es asignar el folio antes de saber quién lo llevará.

**Al soltar o cambiar el folio, su asignación se limpia.**

## Alternativas consideradas

### Hacerlo en el frontend, donde se elige el folio

Rechazada: son cuatro puntos de escritura y cada uno tendría que acordarse. El
backend es un punto solo y cubre cualquier vía futura. Es el mismo razonamiento —
y el mismo hook— del gasto automático.

### Dejar la asignación escrita al soltar el folio

Rechazada, y es la trampa de esta función: como `disponibles/` da por ocupado todo
folio con texto, un nombre olvidado **retiraría ese folio del talonario para
siempre** aunque nadie lo estuviera usando. El talonario se agotaría en falso.

### Respetar lo escrito a mano

Rechazada por el usuario: la maniobra es la verdad, lo escrito a mano era un apunte
provisional. Además esos folios no aparecen en el desplegable, así que el caso casi
no puede ocurrir salvo con talonarios viejos.

## Consecuencias

- El automatismo **pisa** lo que hubiera escrito a mano en ese folio.
- Los folios de las maniobras anteriores a este cambio **no se rellenan**: se decidió
  no hacer backfill. De 376 maniobras con folio, solo 8 de esos folios existían en el
  catálogo, así que el relleno habría tocado 5 filas.
- El criterio de "es de FRABA" es el mismo `_es_de_fraba()` del gasto automático, para
  no tener dos definiciones de tercero que puedan discrepar.
- La asignación se recorta a 40 caracteres (`Folio.asignacion`): un nombre largo se
  corta en vez de reventar el guardado de la maniobra.

## Referencias

- `api/views.py`: `_asignacion_del_folio`, `_sincronizar_asignacion_folios`.
- `api/test_asignacion_folio.py` — en especial `SeLimpiaTests`, que cubre la trampa.
- Commit `541b5155`.
