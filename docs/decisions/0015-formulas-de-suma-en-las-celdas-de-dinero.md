# ADR-0015: El desglose de las celdas de dinero se guarda aparte, en un jsonb

## Estado

Aceptada

## Fecha

2026-08-27

## Contexto

Cinco casetas se pagan de una en una, pero la tabla de Gastos tiene **una** columna. Se
sacaba la calculadora, se escribía el total y el desglose se perdía. El usuario lo
planteó como lo hace en Excel: `=150+230+430+320+320`.

La columna es un `DecimalField(10,2)`: ahí no cabe una suma. Y en la primera versión solo
se guardó el resultado, con lo que al volver a abrir la celda el desglose ya no estaba —
que era justo lo que se quería recuperar.

## Decisión

La celda acepta la fórmula, y al guardar se separan las dos cosas:

- **El total** va a su columna de dinero de siempre (es lo que suma `Gasto.save()`).
- **El texto de la fórmula** va a **`gastos.formulas`**, un `jsonb` con forma
  `{"casetas_ida": "=150+230+430"}` (migración `0058`). La celda se abre con él, como la
  barra de fórmulas de Excel.

Se resuelve en `useGastos`, que es por donde pasan los tres sitios donde se escribe un
gasto: celda, fila nueva y modal.

El `=` es **obligatorio**, igual que en Excel: sin él, `150+230` es texto y se queda tal
cual. Y solo se evalúa en los **campos de dinero**: en `descripcion_gastos` una fórmula
convertiría la nota de una persona en un número.

**Nada de `eval()` ni `new Function()`**: esto viaja a un campo de dinero y solo entran
cifras, `+`, `-` y espacios. Se suma en **centavos enteros** para que `=0.1+0.2` dé
`0.30` y no `0.30000000000000004`.

## Alternativas descartadas

### Una columna por campo de dinero

Son ocho campos: ocho columnas `formula_*` que nadie indexa ni consulta. `operador_2`,
`remolque_3` y `remolque_4` ya enseñaron adónde lleva numerar columnas.

### No guardar la fórmula, solo el total

Fue la primera versión, y el usuario la rechazó en cuanto la probó: al reabrir la celda
veía `1450.00` y el desglose se había perdido.

### Guardarla en la columna Descripción

Es un campo del usuario. Meter ahí datos del sistema es pisarle su texto.

### Recalcular el importe a partir de la fórmula al leer

Convertiría la fórmula en la fuente de verdad, y entonces un desglose desfasado
cambiaría un importe ya conciliado. El número que manda es siempre el de la columna.

## Consecuencias

- **Migración `0058`.**
- **La fórmula se olvida sola** cuando su celda deja de valer lo que ella suma —alguien
  escribió el total a mano, o vació la celda—. Mientras el número cuadre, sobrevive a los
  `PUT` de los demás campos, que mandan la fila entera.
- `formulas` es un jsonb **abierto que llega del cliente**, así que el serializer lo
  valida entero: solo campos de dinero como clave, valores de texto, la misma gramática
  que aplica el front y un tope de 200 caracteres para que la fila no se use como
  almacén de texto arbitrario.
- **`apiClient.sanitizarPayload` tuvo que cambiar**: aplastaba todo valor a texto, así
  que `formulas` llegaba como `"[object Object]"` y el serializer lo rechazaba —el fallo
  apareció en la primera prueba del usuario. Ahora deja pasar un **mapa plano de texto a
  texto**, comprobando el prototipo y no `typeof`, para que un `Date` o un `File` no
  cuelen como objeto plano. Lo anidado de verdad sigue sin pasar.
- El buscador de Gastos encuentra también por el desglose (`150+230`), porque los objetos
  de la fila se aplanan por sus valores.
- Las fórmulas viejas no existen: las filas anteriores tienen `{}` y no cambia nada para
  ellas.

## Referencias

- `src/utils/formulaSuma.mjs` y `formulaSuma.test.mjs`: 14 pruebas.
- `api/migrations/0058_gasto_formulas.py`, `api/Serializers.py` (`validate_formulas`,
  `CAMPOS_CON_FORMULA`), `api/test_formulas_gasto.py`: 8 pruebas.
- `src/api/apiClient.js`: `esMapaDeTexto`.
- Commits `657f4b74` (backend), `6a895cf` y `437f37e` (frontend).
