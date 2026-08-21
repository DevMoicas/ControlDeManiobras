# Pendiente

Anotado el 2026-08-20 al cerrar la sesión. Para retomar el 2026-08-21.

⚠️ Este documento describe **estado**, así que caduca — es justo el tipo de documento
del que avisa `README.md`. Verificar contra el código antes de fiarse, y borrar cada
punto al completarlo en vez de dejarlo criando polvo.

---

## 1. ADRs pendientes de escribir

`docs/decisions/` se estrenó con el `0001` (tarifa congelada). Quedan tres decisiones de
la sesión del 2026-08-20 que hoy solo viven en mensajes de commit. Aquí está el material
para no tener que reconstruir el razonamiento.

### ADR-0002 — `reprogramado` como estado independiente de `status`

- **Decisión:** columna propia `vacios.reprogramado` (boolean), no un valor más de
  `status`. El filtro REPROGRAMADOS pregunta por `?reprogramado=true`, no por `?status`.
- **Descartado 1:** que "Sí" pusiera `status = 'reprogramado'`. Habría pisado el
  Entregado o Pendiente que hubiera antes, y al marcar "No" ese valor ya no volvería.
- **Descartado 2:** guardar el status anterior en una columna `status_previo` para poder
  restaurarlo. Una columna invisible más que mantener a la par.
- **Motivo real:** un vacío entregado **puede** estar reprogramado a la vez. Son dos ejes,
  no dos valores del mismo eje. Lo aclaró el usuario después de una primera lectura mía
  equivocada.
- **Consecuencia:** el filtro cruza los dos estados, cosa que un `?status` no podría.
- **Referencias:** migración `0043`, `api/test_vacio_reprogramado.py`
  (`IndependenciaDelStatusTests`), commit `538d1c62`.

### ADR-0003 — `GRANT DELETE` acotado al rol estándar

- **Decisión:** conceder `DELETE` a `django_standard_role` sobre exactamente dos tablas,
  `api_maniobracostoextra` (migración `0038`) y `api_pendiente` (`0040`). Son los dos
  primeros del proyecto.
- **Contexto:** la decisión A1 reserva el borrado al admin, y hasta ahora ningún rol
  no-admin borraba nada en ninguna tabla.
- **Por qué la excepción:**
  - *Enlace de costos extra:* desmarcar un concepto de una maniobra es una edición
    corriente, no un borrado de negocio. Sin el permiso, quedaría media función:
    marcar sí, desmarcar no.
  - *Pendientes:* el borrado **no** es una acción de usuario — la API no expone ruta de
    borrado a nadie, ni a un admin. El permiso solo lo usa el barrido automático de los
    caducados a las 28 h, que corre con el rol de quien mire la página.
- **Consecuencia:** maniobras, folios y catálogos siguen siendo indelebles sin admin.
  El criterio para futuras excepciones es "datos efímeros o de enlace, nunca registro de
  negocio".
- **Verificado** contra Postgres real con el rol `standard`, no solo con las pruebas
  (`config/settings_test.py` avisa de que en la BD de test no hay separación de roles).

### ADR-0004 — Pendientes sin ruta de borrado

- **Decisión:** `PendienteViewSet` no hereda de `ModelViewSet`; monta solo List, Create y
  Update. La ruta de borrado **no existe** (405), tampoco para administradores.
- **Alternativa descartada:** un `destroy` con `if not request.user.is_staff` como el
  resto de los ViewSets. Se descartó porque el requisito era que **nadie** pudiera
  borrar, y una URL que no está es más difícil de romper por accidente que una
  comprobación que alguien puede relajar.
- **Referencias:** `api/test_pendientes.py` (`SinBorradoTests`), commit `799936da`.

### Nota sobre un cuarto candidato

"Tabla de enlace frente a columna JSON" **ya está cubierto** en el ADR-0001, en la
sección de alternativas. No merece un ADR propio; si acaso, ampliar allí.

---

## 2. Decisión abierta: `vacios.transportista`

La columna se retiró de la vista el 2026-08-20 (commit `275d6e0`) porque no resultó
útil, pero **el campo sigue en el modelo y en la base con sus datos**.

- En la BD local: 226 vacíos, **uno solo** con valor (`'PEPE'`, con pinta de prueba).
- **En producción no se ha mirado.** Es lo que falta para decidir.
- Si se confirma que no hay nada que conservar, la migración `0044+` sería un
  `DROP COLUMN` — irreversible.
- Mientras tanto no molesta: un `varchar` nullable cuyo coste es cero.

---

## 3. Menor

- `fecha_vencimiento_licencia` y `fecha_vencimiento_poliza` ya salen en DD/MM/AAAA en
  Catálogos. `fecha_ingreso` de empleados **no**, a propósito: es `CharField` en la base
  y no siempre trae una fecha. Si algún día se normaliza, entra en `COLUMNAS_FECHA`.
- El CI avisa de que `actions/checkout@v4`, `setup-node@v4` y `azure/login@v2` apuntan a
  Node 20, ya deprecado, y GitHub los fuerza a Node 24. Funciona hoy; en algún momento
  habrá que subir esas acciones.
