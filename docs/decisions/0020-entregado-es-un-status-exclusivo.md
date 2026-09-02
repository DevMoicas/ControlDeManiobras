# ADR-0020: ENTREGADO es un status exclusivo y no pinta la fila

## Estado

Aceptada

## Fecha

2026-09-01

## Contexto

Una maniobra puede llevar **hasta dos status a la vez**, guardados en la misma columna
separados por coma y siempre en orden de prioridad. Cada combinación válida está
enumerada en `STATUS_CHOICES`, y eso es lo que hace que un combo mal formado lo rechace
DRF solo, sin validación escrita.

El usuario pidió un status nuevo, ENTREGADO, que dejara la fila **en blanco, o sea en el
color por defecto**.

## Decisión

ENTREGADO **no entra en ninguna combinación**. Es el único status exclusivo: marcarlo deja
la maniobra solo con él, y marcar otro estando puesto lo sustituye. Lo eligió el usuario
entre las tres opciones que se le plantearon.

Eso sale casi gratis en el servidor: como `"entregado,activo"` no es un choice válido, DRF
lo rechaza con un 400 aunque alguien lo mande saltándose el selector. La regla del gesto
vive en `alternarStatus()`, una función pura probada sin React.

**La fila se deja en el color por defecto no pintándola**: la entrada del status tiene la
clase de fila vacía. Así la `<tr>` se queda con el fondo normal de la tabla, sin una regla
CSS que la repinte de blanco y sin un caso especial en ninguna parte.

## Alternativas descartadas

### Que ENTREGADO se combine como los demás, ganando o perdiendo el color

Se plantearon las dos variantes (que gane el otro status, o que gane Entregado y la fila
quede blanca). El usuario prefirió que fuera exclusivo: un viaje entregado ya no está
activo ni pendiente, así que la combinación no describe nada real.

### Pintar la fila de blanco con una regla CSS

Funciona, pero deja una clase que hay que mantener a la par del resto y un color explícito
donde lo correcto es *no tener color*. Sin clase, la fila vuelve sola a lo que diga su
status si algún día se le quita ENTREGADO.

## Consecuencias

- ENTREGADO nunca se deshabilita por el tope de dos status, porque sustituye en vez de
  sumarse.
- Sigue estando en `PRIORITY_ORDER` aunque no pueda compartir fila: `parseStatusValue` y
  `joinStatusIds` consultan `indexOf()`, y sin él daría −1 y lo ordenaría por delante de
  todos.
- No hay filtro "Entregados" en la barra de la tabla. Se preguntó y el usuario lo descartó
  por ahora: es una entrada más en `FILTROS` y en `STATUS_BACKEND` el día que haga falta.
