# ADR-0009: Las cargas de diésel no tienen tope, pero el papel solo imprime cinco

## Estado

Aceptada

## Fecha

2026-08-25

## Contexto

El bloque EN TRAYECTO del reporte de viaje tenía cinco renglones de carga de diésel,
fijos. Se pidió un botón para añadir más.

El cinco no era una elección de software: `REPORTE COORDINADORES.xlsx` es una rejilla
fija. La fila 12 es el renglón 1, la 16 es el 5, y **la fila 17 ya es el aceite**.
No hay hueco físico para un sexto. El PDF sale de convertir ese mismo Excel.

Además, `CARGAS_POR_REPORTE = 5` vivía en un `CheckConstraint` de la base
(`orden` entre 1 y 5), puesto a propósito para que una carga de orden 9 no pudiera
entrar y quedarse invisible en una pantalla que solo pintaba cinco.

## Decisión

Se consultó al usuario con las tres opciones sobre la mesa y eligió:

- **El CHECK pierde el tope superior.** Se conserva `orden >= 1`: un orden 0 o
  negativo no es un renglón, y el `ordering = ['orden']` lo colaría delante del
  primero.
- **El documento sigue imprimiendo los cinco renglones del papel.** De la sexta carga
  en adelante no sale impresa.
- **Todas las cargas cuentan** para el total del diésel —que es lo que se vuelca al
  gasto del viaje— y para el rendimiento. Que es para lo que se pidió el botón.
- La pantalla lo avisa en cuanto se pasa de cinco.

`CARGAS_POR_REPORTE` pasa a llamarse **`CARGAS_EN_EL_PAPEL`** en los dos lados. Con
el nombre viejo, el siguiente que lo leyera volvería a usarlo como máximo por
reporte; ahora mide solo lo que cabe en la plantilla.

## Alternativas descartadas

### Ampliar la plantilla del Excel

Habría que añadir renglones al `.xlsx` y correr hacia abajo el aceite, la reparación,
el rescate y todo el bloque de regreso. Se ofreció; el usuario prefirió no cambiar el
aspecto del documento que hoy se firma.

### Insertar filas al generar, según cuántas cargas traiga cada reporte

Lo más flexible y lo más frágil: `openpyxl` no arrastra bien bordes ni celdas
combinadas al insertar, y el PDF sale de convertir ese Excel con LibreOffice.

### Un tope alto pero finito (10, 15)

Se ofreció; el usuario eligió sin tope.

## Consecuencias

- **Hay datos capturados que no aparecen en el documento.** Es la contrapartida
  aceptada, y por eso la pantalla lo dice en vez de dejar que se descubra al abrir el
  PDF.
- Nada impide que un cliente defectuoso cree miles de renglones colgando de un
  reporte. Se aceptó a cambio de no volver a tropezar con un tope.
- La urea **no** se amplía: los renglones añadidos son de diésel y sus celdas de urea
  salen marcadas como no aplicables. El papel no lleva urea más allá de sus cinco.
- El renglón nuevo se numera por el **orden más alto**, no por cuántos hay: con un
  hueco, contar daría un número repetido y el upsert por `orden` del backend pisaría
  un renglón existente.
- Migración `0056`.

## Referencias

- `api/models.py`: `CARGAS_EN_EL_PAPEL`, `CargaCombustible.Meta`.
- `api/views.py`: el bucle de escritura del Excel.
- `src/utils/reporteViaje.mjs`: `cargaNueva()` y sus pruebas.
- Commits `608fabf4` (backend) y `2fe7cb1` (frontend).
