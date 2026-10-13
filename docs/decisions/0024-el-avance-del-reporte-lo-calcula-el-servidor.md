# ADR-0024: El avance del reporte de viaje lo calcula el servidor

## Estado

Aceptada.

## Fecha

2026-10-12

## Contexto

El avance en % de cada reporte de viaje (25 por bloque: identificación, trayecto,
diésel, regreso) se calculaba en el frontend (`src/utils/reporteViaje.mjs`). El usuario
pidió ver **cuántos reportes están al 100 %** junto al contador, respetando los filtros.
La lista va paginada (60 por página), así que el frontend no tiene todos los reportes
para contarlos. Para contarlos en el servidor hacía falta la regla también allí, y dos
copias de la regla en dos lenguajes acaban dando cifras distintas entre la barra de la
fila y el contador.

A la vez, el usuario pidió que las **cargas sueltas en unidades que no llevan porta**
no se queden por debajo del 100 % para siempre por el hueco de la porta.

## Decisión

- La regla vive en `ReporteViaje.avance(tipos_tracto)` y `ReporteViaje.porcentaje(avance)`
  (`api/models.py`). El serializer manda `avance` (lista de 4) y `porcentaje` en cada
  reporte. El frontend solo pinta, y se borró su copia de la regla.
- La lista `/reportes-viaje/` añade `completos` junto a `count`: cuántos de **todos** los
  filtrados están al 100 %.
- **Porta automática:** en `carga_suelta`, si la unidad (placas) es un tracto del catálogo
  `Tracto` cuyo tipo **no** es `trailer`, la porta cuenta como llena. Si la unidad no está
  en el catálogo (tercero) o está vacía, la porta sigue pendiente (decisión del usuario).
- El redondeo es `int(x + 0.5)`, igual que el `Math.round` que había en JS. `round` de
  Python redondea al par y cambiaría algún %.

## Consecuencias

- `completos` calcula el avance de cada reporte filtrado en Python. Es una vuelta por
  reporte, con las cargas en prefetch. Con cientos va bien. Si llegan a ser miles, hay que
  guardar el % en una columna (anotado con `ponytail:` en `ReporteViajeViewSet.list`).
- Cambiar el tipo de un tracto en el catálogo cambia el % de sus cargas sueltas, también
  las pasadas. Es lo esperado: el % no se guarda.
- Las pruebas que tocan reportes crean la tabla `tractos` (`managed=False`).

## Referencias

- Backend `1f346c94`. Frontend `6d68178`.
- `api/test_reporte_viaje.py`: `ReporteViajeAvanceTests`.
