# ADR-0019: La CITA del vacío es un instante, no el par fecha + hora

## Estado

Aceptada

## Fecha

2026-09-01

## Contexto

El usuario pidió que la columna Cita de Vacíos fuera **de fecha con hora** y que además
saliera impresa en el reporte de vacíos pendientes.

La columna ya existía desde la 0002 como `varchar` de texto libre, y **nadie la había
usado nunca**: 0 de 236 filas con algo escrito en la base local. El usuario, al verlo,
decidió reutilizarla en vez de dejar una columna muerta y crear otra con el mismo nombre
al lado. De paso se movió a donde le toca: entre Fecha Maniobra y Fecha Entrega, porque es
lo que pasa entre una y otra.

El ADR-0008 dice lo contrario para la entrega: allí la fecha y la hora van **separadas**,
con la hora como texto `'HH:mm'`. Este ADR existe para explicar por qué aquí no aplica.

## Decisión

`vacios.cita` pasa a `timestamptz` (migración 0063). Un solo campo, un solo instante.

El ADR-0008 separó fecha y hora porque **`fecha_entrega_mercancia` se RECORTA a día**:
viaja como `'YYYY-MM-DD'` al autollenado de la Carta Porte y al gasto automático, y con
`USE_TZ=True` y `TIME_ZONE='UTC'` una entrega de la tarde se registraría como del día
siguiente. Ese recorte es el problema, no el tipo de columna.

**La cita no se recorta: se lee entera.** Y el proyecto ya sabe imprimir un instante en la
hora de operación — `_fecha_hora_doc()` lo convierte a `America/Mexico_City` para los
documentos. Es además el mismo tipo que `ReporteViaje.cita`, que es esta misma idea en
otra tabla.

Esa conversión no es un detalle: la cita se guarda en UTC y **el reporte lo arma el
servidor**, así que sin pasarla por ese helper saldría seis horas corrida en el papel. La
prueba escribe las 14:30 en hora de operación y exige leer 14:30 en el Excel, que es el
viaje de ida y vuelta entero.

## Alternativas descartadas

### El par `cita` (date) + `cita_hora` (varchar 'HH:mm'), como la entrega

Es lo que iba a hacerse hasta encontrar `_fecha_hora_doc`. Habría obligado a combinar dos
campos en cada uno de los tres sitios que pintan la columna y en el reporte, para evitar un
desfase que aquí no puede ocurrir porque nadie recorta la cita a día.

### Guardarla como texto `'YYYY-MM-DD HH:mm'`

Sin zona horaria y sin conversiones, pero es un `varchar` disfrazado de fecha. El proyecto
ya se quemó con eso: `gastos.fecha_entrega_mercancia` convive hoy en dos formatos y hay que
ordenarla por una clave normalizada.

### Dejar la `cita` de texto y crear columnas nuevas

Era la opción segura si en producción hubiera datos. Se ofreció y el usuario eligió
convertir la existente.

## Consecuencias

- El `ALTER ... USING` lleva un cast a propósito: si en producción hubiera texto que no
  fuera una fecha, la migración **falla y se deshace entera**. Mejor pararse que convertir
  a medias y perder lo que alguien escribió. El paso `ver` de `migrar_prod.sh` enseña el
  contenido de la columna antes de lanzar la conversión.
- `CeldaEditable` gana el modo `fechaHora`, hermano del `fecha` que ya tenía. Los
  conversores viven en `fechaCelda.mjs` con los otros, que es donde se prueban sin React.
- La Cita entró entre las dos fechas del reporte, así que **corrió una posición** todas las
  columnas que van detrás. Su prueba seguía mirando el índice viejo.
