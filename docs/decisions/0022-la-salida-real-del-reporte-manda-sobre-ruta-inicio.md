# ADR-0022: La hora real de salida del reporte manda sobre RUTA INICIO

## Estado

Aceptada

## Fecha

2026-09-03

## Contexto

`maniobras.ruta_inicio` es fecha **y** hora, pero el capturista solo sabe el día: anota
"salió el 12/01/2026" y la hora se queda en `00:00`. La hora real la conoce el coordinador
días después, cuando llena su reporte de viaje, y ahí la escribe en FECHA Y HORA REAL DE
SALIDA.

Hasta ahora esos dos datos vivían separados y **se quedaban distintos para siempre**. El
usuario lo planteó como el problema a resolver, no como una mejora:

> *"si no se actualizan en automático estas fechas y horas, habrá mucho desfase en las
> fechas y se pueden dejar olvidadas y esto se debe evitar."*

## Decisión

El dato viaja en **las dos direcciones**:

**De ida** — la FECHA del reporte (la de IDENTIFICACIÓN) se precarga con el **día** de
`ruta_inicio`. Solo el día: la hora todavía no se sabe.

**De vuelta** — al guardar FECHA Y HORA REAL DE SALIDA, esa se copia **entera** a
`ruta_inicio`. Va en `ReporteViaje.volcar_salida_a_la_maniobra()`, llamada desde el
`create` y el `update` del serializer, al lado del volcado del diésel: el reporte se llena
por etapas y la salida real puede llegar en cualquiera de ellas.

**Pisa siempre**, día incluido (decisión explícita del usuario ante las dos alternativas).
El reporte es lo que pasó de verdad, así que manda sobre lo que hubiera en Maniobras.

### La consecuencia que hay que tener presente

`ruta_inicio` alimenta la **Torre de Control**. Si la salida real cae en otro día, la
maniobra se mueve de día **también allí**. Se planteó al usuario y lo aceptó; hay una
prueba con ese nombre para que nadie lo descubra por sorpresa.

Un Full repartido tiene **dos** reportes y una sola columna `ruta_inicio`: el último que se
guarde manda. No hay forma de separarlos sin una columna por operador, y no se pidió.

## Alternativas descartadas

### Pisar solo si la hora sigue en `00:00`

Respetaría una hora que el capturista hubiera corregido a mano. Se descartó a favor de la
simple: el reporte es la fuente de verdad y menos reglas es menos desfase.

### Copiar solo la hora y dejar el día

Más conservador —nada se mueve de día solo— pero si de verdad salió otro día, la maniobra
se queda con el día equivocado, que es justo el desfase que se venía a quitar.

## Dos trampas de tipos que salieron aquí

Las dos dieron **500 en la primera lectura contra la base real**, y ninguna prueba las
veía: `settings_test` crea las tablas **desde el modelo**, así que en pruebas los tipos son
los que el modelo declara.

- **`maniobras.ruta_inicio` es `timestamp WITHOUT time zone`**, no con zona. Django
  devuelve un datetime *naive* y `timezone.localtime()` revienta con uno. Lo guardado **es
  UTC** (`settings.TIME_ZONE` es `'UTC'`, y por eso la API lo devuelve con la `Z` y el
  navegador lo lee bien), así que hay que marcarlo antes de convertir.
- El día se saca **en la hora de operación**, no recortando el ISO en UTC: una salida de
  las 18:00 de aquí ya es del día siguiente allá, así que *toda* salida de tarde saldría
  con el día equivocado.

De paso: el campo Fecha del reporte leía con `new Date("2026-01-12")`, que se parsea como
UTC y al oeste de Greenwich se lee como el día 11. Se veía en cuanto la fecha empezó a
precargarse sola; ahora usa los conversores ya probados de las celdas de tabla.

## Consecuencias

- **Sin migración**: es lógica de sincronización.
- El `save(update_fields=[...])` incluye `updated_at` a propósito: es `auto_now`, así que
  el sondeo de Maniobras repinta la fila sola en las demás pantallas abiertas.
- Un reporte cuyo folio no corresponde a ninguna maniobra —un folio viejo capturado a
  mano— se guarda igual y no copia nada. Hay una prueba.

## Referencias

- `api/models.py`: `ReporteViaje.maniobra_del_folio`, `volcar_salida_a_la_maniobra`.
- `api/views.py`: `_fecha_de_ruta_inicio`, `_reportes_del_viaje`, `folios_recientes`.
- `api/test_reporte_automatico.py`: `FechaDelViajeTests`, `FechaDeRutaInicioNaiveTests`.
- ADR-0017 (el reporte se abre solo), ADR-0013 (el diésel no pisa lo capturado a mano).
- Commit `e6646a21` (backend), `2099e96` (frontend).
