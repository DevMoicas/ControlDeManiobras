# ADR-0001: Congelar la tarifa de los costos extra al seleccionarlos

## Estado

Aceptada

## Fecha

2026-08-20

## Contexto

La página Finanzas → Costos extra es un catálogo de conceptos que se cobran aparte
(`movimiento` + `costo`). Desde la tabla de Maniobras se pueden seleccionar varios
conceptos para una maniobra concreta.

Lo que hay que decidir: **qué importe queda asociado a la maniobra** cuando, meses
después, alguien edita el precio en el catálogo.

Restricciones conocidas en el momento de decidir:

- Los importes se van a sumar por folio en un reporte que todavía no existe
  ("posteriormente la recuperaremos con el folio", requisito del usuario).
- `maniobras` es una tabla `managed=False`: las columnas nuevas se añaden por
  `RunSQL` y no hay FK a los catálogos administrados por Django.
- El catálogo tiene borrado, reservado a administradores.
- Este es un dato de facturación: un importe equivocado no es un fallo cosmético.

## Decisión

Al seleccionar un costo extra en una maniobra se **copian `movimiento` y `costo`**
del catálogo a la fila de enlace (`api_maniobracostoextra`), y esos valores **no
vuelven a tocarse nunca**.

- Cambiar la tarifa del catálogo afecta **solo a selecciones futuras**.
- Reguardar una maniobra con la misma selección **no** repone los importes:
  `ManiobraSerializer._sincronizar_costos_extra` borra los enlaces que sobran y crea
  los que faltan, pero deja intactos los que ya estaban.
- Borrar un concepto del catálogo usa `on_delete=SET_NULL`, no `CASCADE`: el enlace
  sobrevive huérfano conservando el importe que se cobró.

## Alternativas consideradas

### Referencia viva (JOIN al catálogo, sin copiar el importe)

- **A favor:** normalización estricta; corregir una errata de precio se propaga sola;
  una columna menos.
- **En contra:** reescribe el histórico. Subir "Grúa" de $500 a $600 cambiaría el total
  de todos los servicios de agosto ya cerrados. Y `on_delete` no tendría buena salida:
  `CASCADE` borra lo cobrado, `PROTECT` deja el catálogo imborrable.
- **Rechazada:** un documento ya emitido no cambia de importe porque suba una tarifa.
  Es el comportamiento estándar en facturación y fue la decisión explícita del usuario
  el 2026-08-20.

### Columna JSONB en `maniobras`

- **A favor:** sin tabla nueva y sin permisos nuevos — `maniobras` ya tiene `UPDATE`
  para el rol estándar, así que desmarcar sería un `UPDATE` y no un `DELETE`.
- **En contra:** el reporte por folio pasa a ser `jsonb_array_elements` + cast a
  `numeric` en vez de un `SUM` sobre un `JOIN`; sin integridad referencial.
- **Rechazada:** el reporte que motiva la función es exactamente la consulta que esta
  opción complica.

## Consecuencias

- `api_maniobracostoextra` guarda `movimiento` y `costo` **a propósito duplicados**
  del catálogo. No es un descuido de normalización: es el mecanismo de la decisión.
  Quien vea la duplicación y la "arregle" con un JOIN romperá el histórico.
- El contrato de la API es asimétrico: se **lee** `costos_extra` (con importes) y se
  **escribe** `costos_extra_ids` (solo ids). El precio lo pone siempre el servidor;
  si el cliente pudiera mandar el importe, podría fijar el precio.
- Desmarcar un costo exige `DELETE` sobre la tabla de enlace, y por eso la migración
  `0038` concede ese permiso al rol estándar — el primero del proyecto. Está acotado a
  esa tabla: maniobras, folios y catálogos siguen siendo indelebles sin admin.
- Un concepto borrado del catálogo deja enlaces con `costo_extra_id = NULL`. Los
  reportes que agrupen por concepto deben contemplarlo.
- La regla no la sostiene el esquema: la sostiene `_sincronizar_costos_extra`. Por eso
  hay pruebas dedicadas en `api/test_costos_extra.py`
  (`TarifaCongeladaTests`) que fallan si alguien la cambia.

## Referencias

- `api/models.py` — `CostoExtra`, `ManiobraCostoExtra`
- `api/Serializers.py` — `ManiobraSerializer._sincronizar_costos_extra`
- `api/migrations/0037_costoextra_maniobracostoextra.py`, `0038_grant_costos_extra_to_standard_role.py`
- `api/test_costos_extra.py` — `TarifaCongeladaTests`
- Commit `799936da`
