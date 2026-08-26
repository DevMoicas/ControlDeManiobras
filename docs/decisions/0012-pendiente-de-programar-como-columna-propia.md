# ADR-0012: PENDIENTE DE PROGRAMAR es columna propia, no un valor de `status`

## Estado

Aceptada

## Fecha

2026-08-26

## Contexto

El desglose de PENDIENTES del panel de seguimientos es la lista que se repasa para
decidir qué se programa. Se pidió una casilla por servicio, como la de la página de
Pendientes: al marcarla la fila se pinta, al quitarla se despinta.

La diferencia con esa página es que allí `hecho` es un campo del modelo `Pendiente`.
Aquí las filas son **maniobras**, que no tenían nada equivalente.

## Decisión

Columna propia `maniobras.pendiente_programar` (boolean `NOT NULL DEFAULT false`,
migración `0057`), **guardada en la base**: el repaso es compartido y lo que marca una
persona lo tienen que ver las demás. Al preguntarlo, el usuario descartó las dos
opciones locales.

Como marcarla mueve `updated_at`, la marca aparece sola en la pantalla de los demás por
el refresco automático (ADR-0010), sin que nadie recargue.

**La fila se pinta de verde y NADA MÁS: el texto no se tacha.** En la página de
Pendientes un pendiente hecho ya no interesa; aquí el servicio sigue en piso y hay que
poder leerlo igual de bien después de marcarlo.

## Alternativas descartadas

### Un valor más de `status`

Marcar **no** saca el servicio de pendiente, solo anota que ya se revisó. Si tocara el
status, el servicio **desaparecería de la propia lista al marcarlo** — hay una prueba
que fija justamente eso. Además obligaría a inventar combinaciones y perdería el estado
real al desmarcar. Mismo razonamiento que llevó a `vacios.reprogramado` a tener columna
propia (ADR-0002).

### Guardarlo en el navegador (localStorage) o solo mientras el popup está abierto

Sin migración y sin backend, y cada quien llevaría su propio repaso. Se ofrecieron las
dos; el usuario las descartó porque todos deben ver lo mismo.

### Nullable en vez de `NOT NULL DEFAULT false`

Aquí "sin marcar" y "no se sabe" son lo mismo, así que un tercer estado NULL solo daría
a la interfaz un caso más que distinguir. Desde Postgres 11 un `ADD COLUMN` con default
constante no reescribe la tabla, así que sigue siendo barato sobre las 414 filas.

## Consecuencias

- **El marcado es optimista**: pinta al instante y revierte si el PATCH falla. Esperar
  la respuesta convertiría repasar una lista larga en un clic y una pausa, un clic y
  una pausa. La casilla se desactiva mientras guarda para que dos clics seguidos no
  manden dos PATCH cruzados.
- **La FECHA DE ENTREGA no se tiñe** con el verde de la fila y va en negrita: es la que
  se mira primero, y justo en el servicio ya revisado es cuando más importa localizarla.
- **El serializer no se toca**: usa `exclude`, así que el campo entra solo.
- La casilla existe **solo en el desglose de PENDIENTES**. Un servicio activo ya está
  programado.
- **Migración `0057`, que hay que aplicar a producción ANTES de desplegar.** Aquí no es
  una formalidad: el modelo declara la columna, así que si el código sale primero
  revienta *cualquier* consulta a maniobras y se cae la pantalla entera, no solo la
  casilla nueva.

## Cambio relacionado en la misma lista

El criterio del desglose pasa a ser **solo el status**. Antes exigía además
`sin_asignar=1` (ni transportista ni operador), así que un servicio con operador puesto
desaparecía de ahí aunque siguiera pendiente. Ahora sale mientras tenga el status y deja
de salir cuando se lo quitan.

Efecto secundario buscado: el número del botón cuenta **todas** las pendientes
(`resumen-status` nunca aplicó `sin_asignar`), así que hasta ahora **el contador y la
lista no cuadraban**. El filtro `sin_asignar` sigue en el backend, ya sin uso.

La lista ordena por **fecha de entrega** ascendente en vez de por fecha PIS,
conservando el sentido: lo más próximo arriba, las que aún no la tienen al final por
`OrdenNullsLast`.

## Referencias

- `api/models.py`: `Maniobra.pendiente_programar`.
- `api/migrations/0057_maniobra_pendiente_programar.py`.
- `api/test_pendiente_programar.py`: 7 pruebas.
- `src/components/Seguimientos/Seguimientos.jsx` y su CSS.
- Commits `37d783a3` (backend), `5443098` y `56b79c0` (frontend).
