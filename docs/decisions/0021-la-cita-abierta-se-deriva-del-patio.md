# ADR-0021: la CITA ABIERTA se deriva del patio, no se escribe en el vacío

## Estado

Aceptada

## Fecha

2026-09-02

## Contexto

Un patio o exige una **hora concreta** para recibir el vacío, o recibe cuando se llegue
—lo que en el puerto se dice "cita abierta"—. Eso no estaba en ningún sitio del sistema:
la columna CITA de Vacíos se quedaba en blanco en los dos casos, así que un blanco no
distinguía "todavía no hay hora" de "aquí no hace falta ninguna". El coordinador tenía que
saberlo de memoria o preguntar por teléfono.

`vacios.cita` acababa de convertirse en `timestamptz` el día anterior (migración 0063,
ADR-0019), justamente para dejar de ser texto libre.

El usuario pidió una casilla CON CITA en el catálogo de Patios y que, en los que no la
tengan, la columna CITA de Vacíos se rellene sola con "CITA ABIERTA".

## Decisión

La casilla vive en el patio (`api_patio.con_cita`, boolean, `default false`, migración
**0064**) y lo que se lee en la celda del vacío se **DERIVA** de ella al pintar. No se
escribe nada en `vacios.cita`, que sigue siendo `timestamptz`.

La regla, en este orden:

1. Si el vacío tiene una **hora escrita**, gana esa hora. "CITA ABIERTA" solo rellena el
   hueco, y la celda se sigue editando como antes: es la salida para la excepción sin
   tener que desmarcar el patio entero.
2. Si el patio **está en el catálogo y no está marcado** → "CITA ABIERTA".
3. En cualquier otro caso —sin patio, patio que no está en el catálogo, o catálogo aún sin
   cargar— la celda se queda **en blanco**, como hoy.

La misma regla la aplica el backend al imprimir el reporte en Excel
(`_celda_reporte_vacios`), con una sola consulta por hoja: el papel lo lee el coordinador
**en** el patio, y ahí una celda vacía le obliga a preguntar.

El cruce es por **nombre** normalizado (mayúsculas, sin espacios de sobra) en los dos
lados, porque `vacios.patio` guarda el nombre del patio y no una FK.

## Alternativas descartadas

### Devolver `cita` a texto y escribir "CITA ABIERTA" en cada vacío

Es lo que el usuario propuso de entrada, y lo que primero parece "rellenar". Deshace la
0063 del día anterior: se pierde el calendario con hora, el orden por fecha y el formateo
del reporte, y los patios que sí exigen hora vuelven a texto libre. Además congela una
copia del dato: cambiar la casilla del patio ya no corregiría los vacíos ya escritos, y
las dos copias se contradirían meses después. Se le explicó y eligió la derivada.

### Una columna nueva en el vacío (`cita_abierta` boolean)

Mismo problema de la copia, más una columna que mantener a la par de la del patio.

### Decir "CITA ABIERTA" también de los patios que no están en el catálogo

Descartada al medir: en la base local, **131 de 227** vacíos con patio llevan un nombre
que el catálogo no tiene (`CIMA`, `CIMA ASIPONA`, `SSA 9 PM 25 NOV`…), herencia de cuando
la columna era texto libre. Afirmar "cita abierta" de esos sería inventárselo, y el
usuario no podría corregirlo: marcar `CIMA` en Catálogos no alcanza a `CIMA ASIPONA`,
porque el cruce es por nombre exacto. Un operador presentándose a deshora en una terminal
que sí pedía cita es más caro que una celda en blanco.

### `default=True` en la casilla

Dejaría a todos los patios existentes en "exige cita", que es justo el estado que hay que
capturar a mano — lo contrario de lo que se pedía.

## Consecuencias

- Marcar o desmarcar un patio corrige **de golpe** todos sus vacíos, pasados incluidos. No
  hay backfill que correr ni datos que migrar.
- Los vacíos con un patio fuera del catálogo se quedan como estaban. Para que entren, hay
  que normalizar esos nombres o dar de alta el patio con el nombre exacto; ninguna de las
  dos cosas se hizo, y queda anotado en `PENDIENTE.md`.
- La 0064 deja el `DEFAULT false` puesto **en la base** (Django lo quita después de
  rellenar las filas viejas) porque la migración corre ANTES del despliegue: durante esa
  ventana el código viejo sigue dando de alta patios sin la columna, y sin default ese
  INSERT chocaría con el `NOT NULL`.
- La regla de pantalla vive en `src/utils/citaAbierta.mjs`, fuera del componente, para
  probarla sin React. Está duplicada a propósito en `api/views.py` para el reporte: son
  dos lecturas del mismo dato, no dos fuentes de verdad.
