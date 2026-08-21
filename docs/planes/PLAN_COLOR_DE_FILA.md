# PLAN — Color de fila (el balde de pintura)

Fecha: 2026-08-21 · Estado: **✅ desplegado en producción el 2026-08-21**, en el mismo viaje que la
torre de control (ver `PLAN_TORRE_CONTROL.md`, que lleva el detalle del despliegue).

Rellenar a mano la fila de una maniobra o de un vacío, como en una hoja de cálculo. Control junto al
selector de status, con la rejilla estándar de Google Sheets y un balde por icono.

| Repo | Commit | Contenido |
|---|---|---|
| backend | `48eb7baa` | Columna `color` en `maniobras` y `vacios`, validación compartida, migraciones `0047` y `0048`, 10 pruebas |
| frontend | `28e3887` | `ColorSelector`, paleta, contraste y su prueba; enganche en las dos páginas |

## Decisiones

**Paleta cerrada, no rueda de color.** Se descartó `<input type="color">`, que es una línea y da la
rueda completa: deja elegir negro o azul marino, y como el texto de la fila es oscuro la maniobra se
vuelve ilegible. Además no tiene noción de "sin relleno", así que el botón de restablecer habría que
ponerlo aparte igualmente. La rejilla de Sheets (80 tonos) fue elección del usuario.

**La jerarquía se resuelve por ORDEN en el CSS, no a la fuerza.** La regla del color manual tiene la
misma especificidad que las del status y va declarada después, así que gana sin `!important` ni
selectores inflados. Si alguien mueve ese bloque por encima de las reglas de status, deja de mandar —
está avisado en el propio CSS.

**Restablecer no recuerda nada.** Sin color no se pone la clase `row-pintada`, así que las reglas del
status vuelven a aplicar solas. No hay "color anterior" que guardar ni que pueda desincronizarse: el
status nunca se pierde al pintar, solo queda tapado.

**El texto se vuelve blanco sobre fondos oscuros.** La paleta llega hasta el negro y las tres últimas
filas son sombras; sin esto, pintar de `#20124d` deja texto oscuro sobre fondo oscuro. Se decide por
luminancia WCAG y **no** por la media de los tres canales: con la media, el azul puro y el amarillo
puro salen casi iguales y tienen legibilidad opuesta. Hay una prueba fijada justo en ese caso.

**El servidor valida el color.** Solo entra `#rrggbb`; cualquier otra cosa es `400`. El valor acaba
dentro del CSS de la tabla y lo ven todos los usuarios, así que la paleta del frontend no puede ser la
única defensa — quien tenga la consola abierta manda lo que quiera. Las pruebas incluyen el intento de
colar CSS detrás del hex.

**Una sola validación para los dos modelos.** Al aparecer el segundo (Vacíos), la comprobación salió
del serializer de Maniobras a `validar_color_de_fila()`. Es una comprobación de seguridad: duplicarla
sería pedir que las dos copias se separen con el tiempo y que una acabe aceptando lo que la otra
rechaza. Si mañana se añade la columna a un tercer modelo, **el `validate_color` hay que engancharlo a
mano**: sin él la puerta queda abierta y nada falla. Por eso las pruebas de Vacíos comprueban el
enganche y no la validación en sí.

## Diferencia entre las dos pantallas

En **Maniobras** las filas ya se pintaban por status, así que el color manual se sobrepone. En
**Vacíos** no se pintan solas: el balde pinta sobre el fondo normal y restablecer devuelve a él. Ahí
hubo que tratar el hover aparte —una fila pintada se oscurece sobre su propio color en vez de
sustituirlo—, porque la regla de hover de esa tabla habría borrado el color al pasar el ratón.

## Cómo funciona por dentro

Columna `color` (`varchar(7)`, NULL = sin pintar) en las dos tablas, añadida con
`SeparateDatabaseAndState` + `RunSQL` porque `maniobras` y `vacios` son `managed=False`. Los GRANT del
rol estándar sobre esas tablas son a nivel de tabla, así que las columnas nuevas quedan cubiertas sin
conceder nada extra.

La fila publica dos variables CSS en su atributo `style` (`--color-fila` y `--texto-fila`) y una clase
`row-pintada`. El guardado reutiliza la vía genérica que ya existía en cada página
(`onGuardarCampos` en Maniobras, `handleGuardarCampo` en Vacíos): no hizo falta fontanería nueva.

## Comprobación

```
node --test src/utils/colorFila.test.mjs          # paleta, contraste y hex válido
Manage.py test api.test_color_fila --settings=config.settings_test
```

## Lo que no se hizo

| Descartado | Cuándo añadirlo |
|---|---|
| Colores personalizados fuera de la paleta | Si alguien los pide. Habría que resolver antes la legibilidad, que la paleta cerrada garantiza hoy |
| El balde en Gastos, Folios y demás tablas | Se reutiliza `ColorSelector` tal cual; el trabajo es la columna, su migración y la regla CSS de esa tabla |
| Filtrar o agrupar por color | Cuando el color signifique algo estable. Hoy es una marca visual libre, no un dato de negocio |
