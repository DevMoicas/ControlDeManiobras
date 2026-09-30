# ADR-0023: El diésel de Gastos solo lo escribe el reporte de viaje

## Estado

Aceptada. Sustituye a ADR-0013.

## Fecha

2026-09-29

## Contexto

ADR-0013 dejaba el diésel editable en Gastos y hacía que el reporte no pisara lo capturado
a mano: si las dos cifras discrepaban, avisaba. El usuario pidió lo contrario: que la
columna **no se pueda editar**, para que el dato entre por un solo sitio. Así se acaba el
trabajo doble y las discrepancias.

Con la columna bloqueada, la regla de "no pisar lo manual" se vuelve una trampa. Un importe
capturado a mano antes del cambio quedaría fijo para siempre: nadie podría editarlo en
Gastos y el reporte tendría prohibido sobrescribirlo.

## Decisión

- `gasto_diesel` es **read_only** en el `GastoSerializer`. Un PUT o PATCH que lo incluya
  responde 200 y no lo toca. En la pantalla, la celda se muestra como moneda y está
  deshabilitada.
- `volcar_diesel_al_gasto` **pisa siempre** que su total difiera del que hay en Gastos
  (el usuario lo eligió el 2026-09-29). Si no hay gasto, sigue sin crear ninguno.
- `diesel_volcado` y `_recordar_volcado` quedan sin uso. Se borró la función. La columna
  se queda en la base para no meter una migración solo para borrarla.
- `gasto_diesel` sigue en `CAMPOS_CON_FORMULA`. Si se quitara, un PUT que traiga fórmulas
  antiguas de diésel en el jsonb `formulas` respondería 400.

## Consecuencias

- **Abierto: se pierde la vía manual.** ADR-0013 descartó bloquear el campo justo por
  esto: *"hay viajes sin reporte y folios antiguos donde el diésel se captura a mano y
  no hay otra vía"*. Esos gastos ya no pueden registrar diésel, y el importe que tenían
  se conserva. Está pendiente de decidir con el usuario; ver `PENDIENTE.md`.
- El aviso "Diésel" de Reportes de viaje sigue existiendo, pero solo sale en los gastos
  con diésel manual anterior al cambio. Desaparece al volver a guardar ese reporte,
  aunque no se cambie nada.
- La fase 5 del plan de Finanzas (reparaciones del reporte a Gastos) mantiene la regla
  de ADR-0013, porque Reparaciones sigue siendo editable.

## Referencias

- Backend `e3618db6` (el cambio) y `e41b8f55` (PyJWT 2.14.0, que pedía `pip-audit`).
- Frontend `79977b1`.
- `api/models.py`: `ReporteViaje.volcar_diesel_al_gasto`. `api/Serializers.py`:
  `GastoSerializer.Meta.read_only_fields`.
- `api/test_gasto_automatico.py`:
  - `test_el_reporte_pisa_el_diesel_capturado_a_mano`
  - `test_un_descuadre_anterior_se_sigue_viendo_hasta_volver_a_guardar`
  - `test_el_diesel_no_se_edita_desde_gastos`
