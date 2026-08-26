# ADR-0008: La hora de entrega va en su propia columna, no dentro de la fecha

## Estado

Aceptada

## Fecha

2026-08-25

## Contexto

Se pidió un selector de hora para FECHA DE ENTREGA en Maniobras: *"a veces se
requiere poner hora"*. La petición literal era meter la hora **dentro** del mismo
campo, como ya hacen RUTA INICIO y RUTA FIN.

`maniobras.fecha_entrega_mercancia` es una columna `date` real en Postgres, así que
no puede guardar hora. Meterla exigía convertirla a `timestamp`.

Lo que hay que decidir: **convertir la columna, o añadir una hora aparte.**

Restricciones conocidas en el momento de decidir:

- `USE_TZ = True` y `TIME_ZONE = 'UTC'`. La operación es local (UTC−6).
- Esa fecha **no es solo una fecha en pantalla**. Viaja como `'YYYY-MM-DD'` a
  `folios-recientes/`, que alimenta el autollenado de la **Carta Porte**; se copia al
  **gasto automático** (`Gasto.fecha_entrega_mercancia`, que es TEXT); y el dashboard
  de **Gastos** agrupa importes por ella.
- 77 de 412 maniobras no la tienen.

## Decisión

Columna nueva `maniobras.hora_entrega`, **texto `'HH:mm'`**, separada de la fecha.
En la tabla de Maniobras es una columna propia con selector de hora, justo después de
ENTREGA MERCANCÍA.

Es el mismo par que `fecha_pis` + `horario`, que ya existía y estaba separado por
este mismo motivo — el código lo dice desde antes en `views.py`: *"juntarlos aquí
exigiría decidir la zona horaria en el servidor, y el horario es la hora LOCAL a la
que se capturó"*.

## Alternativa descartada: convertir la columna a `timestamp`

Es lo que se pidió, y lo que hace RUTA INICIO. Se descartó por el **desfase de día**:

Con el servidor en UTC, una entrega puesta a las 18:00 hora local se guarda como las
00:00 del día siguiente. Los tres consumidores de arriba recortan esa fecha a
`'YYYY-MM-DD'`, así que **imprimirían y facturarían el día equivocado** — en la Carta
Porte, en el gasto del viaje y en el dashboard financiero.

Como texto local no hay conversión que pueda desplazarla.

Una tercera vía —convertir la columna *y* normalizar la zona horaria a
`America/Mexico_City` en los tres puntos que la leen— se ofreció al usuario y no se
eligió: toca código de documentos y de dinero, y pedía probarlo con calma.

## Consecuencias

- Dos campos que capturar en vez de uno. En el desglose de PENDIENTES se pintan
  pegados (`25/08/2026 14:30`) porque esa lista es de solo lectura; en Maniobras van
  separados porque se editan aparte.
- `RUTA INICIO` y `RUTA FIN` siguen siendo `timestamp` y siguen teniendo el desfase
  latente. No se tocaron: hoy nadie recorta esas dos a fecha, así que el problema no
  se manifiesta.
- Migración `0055`, aditiva y metadata-only.

## Referencias

- `api/models.py`: `Maniobra.hora_entrega`, y el par `fecha_pis` + `horario`.
- `api/views.py:876` — el comentario que ya documentaba el criterio.
- Commit `61c6472e`.
