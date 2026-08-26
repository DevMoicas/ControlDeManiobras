# ADR-0004: Pendientes sin ruta de borrado

## Estado

Sustituida por [ADR-0007](0007-pendientes-se-borran-a-mano.md) el 2026-08-25.

Se escribe igualmente, y no se omite, porque el ADR-0007 solo se entiende sabiendo
que lo de antes **no era un descuido**: era un requisito explícito.

## Fecha

2026-08-20

## Contexto

La página PENDIENTES son cinco tableros con nombre de persona, compartidos por toda
la empresa. El requisito del usuario fue que **nadie** pudiera borrar una línea, y
que las líneas se fueran solas a las 28 horas de crearse.

## Decisión

`PendienteViewSet` no hereda de `ModelViewSet`: monta solo `List`, `Create` y
`Update`. La ruta de borrado **no existe** — devuelve 405 a cualquiera, también a
un administrador.

La caducidad se aplicaba en el listado: cada `GET` barría lo que pasara de 28 horas,
y el `get_queryset` filtraba por la misma regla para que un pendiente ya caducado no
pudiera leerse ni editarse entre dos listados.

## Alternativa descartada

Un `destroy` con `if not request.user.is_staff`, como el resto de los ViewSets. Se
descartó porque el requisito era que nadie borrara: **una URL que no está es más
difícil de romper por accidente que una comprobación que alguien puede relajar.**

## Consecuencias

- El `GRANT DELETE` sobre `api_pendiente` (migración `0040`) existía solo para el
  barrido automático, que corre con el rol de quien mire la página — no para una
  acción de usuario. Ver ADR-0003.
- Sin cron ni Celery: el barrido perezoso en el listado bastaba para una tabla que
  nunca pasaría de unas decenas de filas.

## Referencias

- `api/test_pendientes.py` (`SinBorradoTests`, `CaducidadTests`), commit `799936da`.
