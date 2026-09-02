# ADR-0018: Pintar celdas sueltas con un `jsonb`, sin tocar el balde de fila

## Estado

Aceptada

## Fecha

2026-09-01

## Contexto

Las tres tablas grandes ya tenían un balde de pintura que rellena **la fila entera**
(`color`, migraciones 0047/0048/0059). El usuario pidió poder pintar **una sola celda**,
como en Excel, y lo justificó así: para señalar un dato, pintar la fila tapa los otros
treinta. Lo pidió explícitamente como algo **adicional**, no como sustituto.

## Decisión

Una columna `colores` de tipo `jsonb` por tabla (migración 0062), con la forma
`{columna: "#rrggbb"}`. Las tres tablas —maniobras, vacios, gastos— en la misma migración:
es una sola decisión, y partirla solo daría tres ocasiones de que una se quede sin
aplicar.

**Precedencia: celda > fila > status.** Es lo que espera cualquiera que venga de Excel, y
sale gratis: el estilo en línea del `<td>` le gana por especificidad a la clase de la fila.

**Dos gestos, los dos disponibles a la vez**, decidido con el usuario:

- **Modo pintura**: el balde de la barra de la tabla enciende el modo y cada clic pinta.
- **Clic derecho** sobre una celda: paleta ahí mismo, sin encender nada.

El modo hace falta porque **la celda ya usa su clic para abrir su editor**. Sin él, "clic
para pintar" y "clic para editar" son el mismo gesto. Por eso el manejador va en fase de
**captura**: se queda el clic antes de que llegue a la celda.

**La clave del `jsonb` se valida por FORMA, no contra una lista de columnas.** Esa lista
viviría en el servidor y en `COLUMNAS` del frontend, y las dos copias se separarían a la
primera columna nueva. Una clave que no case con ninguna columna no pinta nada: es inerte,
no un error. El **valor** sí se valida estricto (`#rrggbb`), porque acaba dentro del CSS
que ven todos los usuarios.

## Alternativas descartadas

### Una columna por celda pintable

Treinta columnas nuevas en `maniobras` para un dato que nadie va a indexar ni filtrar. El
`jsonb` es el mismo patrón que `gastos.formulas` (ADR-0015), que ya guarda
`{campo: valor}` por el mismo motivo.

### Guardar el pintado en el navegador (localStorage)

Sería por persona y se perdería al cambiar de equipo. El pintado es **compartido**: lo que
marca uno lo tienen que ver los demás, igual que se decidió con `pendiente_programar`
(ADR-0012).

### Solo el clic derecho, sin modo

Es el gesto de Excel y no ensucia la pantalla, pero no tiene equivalente táctil y la app se
usa desde tablet en el patio. Se dejaron los dos.

### Un balde en cada celda

Treinta iconos por fila, sesenta filas: ruido visual y render más lento, para una acción
que no es la principal de la tabla.

## Consecuencias

- Un tope de 60 celdas pintadas por fila. No es una regla de negocio: es lo que impide
  engordar el `jsonb` sin freno con una sesión válida.
- Mientras el modo está encendido, el cursor sobre las celdas pasa a cruz. El balde vive
  en la barra de la tabla y **se va con el scroll**; sin esa señal no habría forma de saber
  que el siguiente clic va a pintar.
- El clic derecho cede ante un campo abierto: quien está escribiendo espera el menú del
  navegador para cortar y pegar.
- Las filas de Maniobras van con `React.memo` y reciben solo la función de celda, que es
  estable. Pasarles el objeto entero del hook repintaría las ~2000 filas al abrir la
  paleta.
