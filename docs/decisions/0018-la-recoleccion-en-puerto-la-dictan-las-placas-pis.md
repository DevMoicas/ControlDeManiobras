# ADR-0018: La RECOLECCIÓN EN PUERTO la dictan las placas PIS, no la marca TERCERO

## Estado

Aceptada

## Fecha

2026-09-03

## Contexto

El reporte de viaje tiene un campo RECOLECCIÓN con dos valores, *Propio* y *Tercero*. Al
automatizar el reporte (ADR-0017) hubo que decidir de dónde sale.

La primera lectura fue la obvia y **era la equivocada**: usar la casilla TERCERO de la
maniobra. El usuario la corrigió el mismo día:

> *"en el apartado de recolección, se refiere únicamente a la recolección de puerto, por
> lo que tendríamos que hacer un filtro por las placas [...] la información que dicta esto
> viene de `placas_pis`."*

Son **dos preguntas distintas**. La marca TERCERO habla del viaje entero: quién lo hace.
RECOLECCIÓN habla solo de quién **recoge el contenedor en el puerto**, que puede ser otra
unidad. Un viaje propio puede recogerse con una unidad de tercero y al revés.

## Decisión

RECOLECCIÓN sale de comparar `maniobras.placas_pis` contra el catálogo de **tractos**:

- Las placas están en `tractos` → **`propio`**.
- No están → **`tercero`**.
- `placas_pis` vacío → **cadena vacía**, no `tercero`.

Ese último punto no es un detalle. El folio se asigna casi siempre **antes** de capturar
las placas, así que responder `tercero` ahí sería afirmar algo que nadie sabe todavía. El
campo nace vacío y **se rellena cuando las placas aparecen** — pero solo si sigue vacío:
lo que el coordinador haya elegido a mano en el reporte manda (decisión del usuario).

El catálogo es la fuente correcta porque el propio selector de `placas_pis` ya está
construido así: ofrece los tractos propios **y** las unidades de todos los terceros (ver
`PlacasSelector` con `todas`). "No está en `tractos`" es exactamente "es de un tercero".

## Alternativas descartadas

### Usar la casilla TERCERO de la maniobra

Es la pregunta equivocada, y el error no se vería: el reporte saldría impreso y firmado
con una recolección que nadie contrastó. Esa misma casilla **sí** se usa, junto al
transportista, para decidir si el reporte se abre (ADR-0017) — pero eso es otra cosa.

### Calcularlo en el navegador

El modal que abre un reporte a mano lee `folios-recientes`, así que podría cruzarlo con
`/tractos/` en el cliente. Serían **dos copias de la misma regla** y se separarían con el
tiempo. El endpoint manda el valor ya resuelto; el frontend solo lo copia.

## Consecuencias

- `folios-recientes` resuelve la recolección para toda la página con **una sola consulta**:
  las placas del puerto entran en el mismo mapa `placas → tracto` que ya se armaba para el
  Tipo de Unidad. Sin eso sería una consulta por folio, y el selector ofrece hasta 50.
  Hay una prueba con `assertNumQueries` que se rompe si vuelve el N+1.
- Un tracto dado de baja del catálogo haría que sus viajes viejos se leyeran como
  `tercero`. No se corrige: la recolección se copia al reporte **al crearlo**, y desde ahí
  vive en el papel.
- El reporte de un viaje de tercero también precarga la recolección: no abre reporte solo,
  pero cuando alguien lo abre a mano tiene que precargar igual.

## Referencias

- `api/views.py`: `_recoleccion_del_puerto`, `folios_recientes`.
- `api/test_reporte_automatico.py`: `RecoleccionEnPuertoTests`.
- ADR-0017 (el reporte se abre solo).
- Commit `9f7a1a1a` (backend).
