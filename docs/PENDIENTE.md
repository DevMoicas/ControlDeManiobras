# Pendiente

Anotado el 2026-08-25 al cerrar la sesión.

⚠️ Este documento describe **estado**, así que caduca — es justo el tipo de documento
del que avisa `README.md`. Verificar contra el código antes de fiarse, y borrar cada
punto al completarlo en vez de dejarlo criando polvo.

---

## 1. ADRs pendientes de escribir

Quedan dos de la sesión del 2026-08-20 que hoy solo viven en mensajes de commit. Aquí
está el material para no tener que reconstruir el razonamiento.

> El **ADR-0004** que estaba reservado aquí ya está escrito, y **sustituido el mismo
> día por el 0007**: los pendientes ahora se borran a mano. Se escribió igualmente
> para que quede el histórico de por qué antes no se podían borrar.

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
  - *Pendientes:* el permiso se concedió para el barrido automático de los caducados,
    que corría con el rol de quien mirara la página.
- **⚠️ Al escribirlo, corregir esa segunda justificación.** Desde el 2026-08-25 el
  borrado de pendientes **sí es una acción de usuario** (ADR-0007). El permiso ya
  estaba concedido, así que aquel cambio no necesitó migración — y el criterio del
  ADR ("datos efímeros o de enlace, nunca registro de negocio") es justamente el que
  lo autoriza. Escribirlo con esa lectura, no con la de agosto 20.
- **Consecuencia:** maniobras, folios y catálogos siguen siendo indelebles sin admin.
- **Verificado** contra Postgres real con el rol `standard`, no solo con las pruebas
  (`config/settings_test.py` avisa de que en la BD de test no hay separación de roles).

---

## 2. Decisión abierta: `vacios.transportista`

La columna se retiró de la vista el 2026-08-20 (commit `275d6e0`) porque no resultó
útil, pero **el campo sigue en el modelo y en la base con sus datos**.

- En la BD local: 226 vacíos, **uno solo** con valor (`'PEPE'`, con pinta de prueba).
- **En producción no se ha mirado.** Es lo que falta para decidir.
- Si se confirma que no hay nada que conservar, la migración sería un `DROP COLUMN` —
  irreversible.
- Mientras tanto no molesta: un `varchar` nullable cuyo coste es cero.

---

## 3. Abierto tras la sesión del 2026-08-25

### Desglose de ACTIVOS y PENDIENTES en la pantalla de inicio

Los dos botones del panel SEGUIMIENTOS abren su lista. Funcionan, pero:

- **Tope de 60 filas.** Es lo que devuelve una página de la API y `page_size` no es
  configurable. Hoy sobra de largo; si algún día una de las dos listas pasa de 60,
  hay que paginar en el modal. Está marcado con un comentario `ponytail:`.
- Añadir un tercer desglose es una entrada más en `VISTAS` (`Seguimientos.jsx`):
  consulta, columnas y texto de lista vacía.

### Folios anteriores al 2026-08-25

No se rellenó la ASIGNACIÓN de los folios que ya estaban puestos en servicios
existentes (ADR-0005). **Decisión cerrada del usuario: se quedan así.** De 376
maniobras con folio, solo 8 de esos folios existen en el catálogo, así que el backfill
habría tocado 5 filas.

### Zona horaria de `ruta_inicio` / `ruta_fin`

Son `timestamp` con `USE_TZ = True` y `TIME_ZONE = 'UTC'`, así que arrastran el mismo
desfase que llevó a separar la hora de entrega (ADR-0008). **Hoy no se manifiesta**
porque nadie recorta esas dos columnas a fecha. Si alguna vez se imprimen o se agrupan
por día, hay que normalizar a `America/Mexico_City` primero.

---

## 4. Menor

- `fecha_vencimiento_licencia` y `fecha_vencimiento_poliza` ya salen en DD/MM/AAAA en
  Catálogos. `fecha_ingreso` de empleados **no**, a propósito: es `CharField` en la base
  y no siempre trae una fecha. Si algún día se normaliza, entra en `COLUMNAS_FECHA`.
- El CI avisa en **cada despliegue** de que `actions/checkout@v4`, `setup-node@v4` y
  `azure/login@v2` apuntan a Node 20, ya deprecado, y GitHub los fuerza a Node 24.
  Funciona hoy; el día que dejen de forzarlo, el workflow del frontend falla. Es subir
  esas tres acciones de versión.
- La tabla de Maniobras está en densidad compacta desde el 2026-08-25 (caben ~18 filas
  donde antes 12). Los valores originales quedaron anotados en un comentario de
  `ManiobrasPage.css` por si hay que volver a medio camino.
