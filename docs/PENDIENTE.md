# Pendiente

Anotado el 2026-08-25 y **actualizado el 2026-08-28** al cerrar la sesión.

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

---

## 5. Abierto tras la sesión del 2026-08-26

### Carga masiva de servicios desde Excel — SIN EMPEZAR

El usuario tiene servicios en un Excel y quiere subirlos de una vez a producción, sin
capturarlos a mano. Se habló pero **no se hizo nada**: falta el archivo (no aparece en
Descargas ningún `.xlsx` reciente que cuadre; los `CONTROL DE MANIOBRAS.xlsx` son de
marzo y abril, el histórico del que salió la base).

**La decisión que hay que tomar ANTES de escribir el script**, y es la razón de que no
se empezara: si esos servicios traen folio, insertarlos dispara los tres automatismos
—gasto por servicio, uno o dos vacíos por servicio, y la reescritura de la asignación
del folio en el catálogo—. Con 100 servicios son 100 gastos y hasta 200 vacíos de golpe
en producción, y ni las maniobras ni los vacíos se borran sin admin. Sirven las dos
vías: por el ORM directo NO se disparan, por la API SÍ. Depende de si son servicios
históricos (probablemente no se quieren) o activos (probablemente sí).

**Camino previsto:** un script que lea el Excel con `openpyxl` (ya está en
`requirements.txt`) y cree por el ORM —no con SQL directo, para respetar validaciones,
longitudes de columna y la auditoría—, probado antes contra la base local. Para llegar
a producción encaja como un modo más de `migrar_prod.sh`, que ya hace el ritual de la
regla de firewall temporal y el volcado de credenciales.

**Ojo al mapear:** `origen`/`destino` están topados a 30 caracteres, y varias fechas de
`maniobras` son TEXT en Postgres aunque el modelo diga `DateField`.

### Escalón de coste en Azure sin explicar — ABIERTO

El **22 de agosto el gasto diario saltó de $0.462492 a $0.911292** y ahí sigue: un
escalón limpio de **+$0.4488/día, +$13.46/mes**, justo al día siguiente de restaurar la
suscripción caída del 21. No es una subida gradual por más uso —el gasto es plano por
definición, ver ADR-0010—: es la firma de **un recurso encendido**.

Cuesta más que cualquiera de las mejoras que se evaluaron ese día. Falta abrir el
desglose por recurso en Azure y ver qué apareció.

De paso quedó medido que **la factura real de agosto fue de $16.55**, cuando
`PLAN_DESPLIEGUE_PRODUCCION.md` presupuesta $45–60. O ese export cubre solo parte de
los recursos, o el plan lleva tiempo sobreestimando; conviene aclararlo antes de usar
esa cifra para decidir nada.

### El filtro `sin_asignar` quedó sin uso

Lo usaba solo el desglose de PENDIENTES, que desde el 2026-08-26 filtra únicamente por
status (ADR-0012). Sigue en `ManiobraFilter` porque la regla del proyecto es no tocar
lo que no hace falta. Si se limpia, va en un commit aparte.

### Vacíos que no se vuelven a juntar

El automatismo del ADR-0011 separa la fila de un Full cuando aparece el segundo
operador, pero **no la vuelve a juntar** si ese operador se quita. Se ajusta a mano.
Sin decidir si merece arreglarse: hasta ahora no ha pasado.

---

## 6. Abierto tras la sesión del 2026-08-27

### El renombrado de un folio deja huérfano su reporte de viaje — SIN ARREGLAR

Encontrado al validar el volcado del diésel, y **confirmado ejecutándolo**: al renombrar
un folio se actualizan `maniobras.folio`, `maniobras.folio_2` y `torre_folio.folio`, pero
**no `api_reporteviaje.folio`**. El reporte se queda apuntando al código viejo.

Prueba real: folio `F-2279` con 7.440 ya volcados → se renombra a `F-2279-2` → la maniobra
queda en `F-2279-2` y el reporte sigue en `F-2279` → se añade una carga de 2.450 y el
gasto **se queda en 7.440** en vez de 9.890. En silencio, sin error.

No es raro: según el propio comentario del código, con el `-2` automático de los Full el
renombrado ocurre en cada maniobra que se marca. Hoy no ha mordido porque **en producción
todavía no hay ningún reporte de viaje**.

**Arreglo previsto:** añadir `ReporteViaje.objects.filter(folio=anterior).update(...)` junto
a las tres tablas que ya se actualizan, en `FolioViewSet` (`api/views.py`, alrededor de la
línea 1786). Es una línea y su prueba.

### Una carga de diésel sin precio se excluye del importe pero cuenta para el rendimiento

Confirmado ejecutándolo: con cargas de 300 L a 24.80 y 100 L **sin precio**, al gasto le
llegan 7.440 mientras el reporte enseña las dos cargas y calcula el rendimiento con 400 L.
Es invisible: la pantalla del reporte solo muestra el total de cada renglón, no un total
general.

Con el ADR-0013 ya no borra nada —ahora saldría como descuadre—, pero sigue siendo la
causa más probable de "no coincide" en el uso real. **Lo propuesto y no hecho:** enseñar en
el reporte el total de diésel que va a mandar a Gastos. Alternativa más agresiva: que una
carga sin precio tampoco cuente para el rendimiento, para que las dos cifras hablen del
mismo conjunto de cargas.

### Vaciar las cargas de un reporte no corrige el gasto

`total_diesel()` devuelve None ("no se sabe") y el volcado no escribe, así que el importe
anterior se queda en Gastos. Corregir un precio **a la baja** sí funciona. Sin decidir: la
alternativa es poner el diésel en blanco, pero eso pisaría también lo capturado a mano.

### El buscador del selector de folios

Busca **solo por número de folio**, sin acentos ni mayúsculas, y devuelve las **50
coincidencias más recientes**. Si se busca algo muy genérico (`8`) salen 50 y hay que
afinar. Ampliarlo a cliente u operador es una línea en el filtro; subir el tope hace lento
el desplegable, porque cada folio trae su ficha completa.

### Formatos mezclados en `gastos.fecha_entrega_mercancia`

En la base local, de 18 gastos: 4 en `DD/MM/YYYY`, 3 en ISO, un `'200'`, 6 vacíos y 3 NULL.
Se normalizan solos según se toque la fecha de cada maniobra (ADR-0016). Mientras haya
mezcla, el orden depende de la clave normalizada que se calcula al leer.

### `docs/planes/PLAN_GASTO_AUTOMATICO.md` no está commiteado

El docstring de `api/test_gasto_automatico.py` lo referencia ("ver docs/planes/…, rama
main"), pero el archivo aparece como **untracked** en el worktree de `main`, junto con
`PLAN_REPORTE_COORDINADORES.md`, `REPORTE COORDINADORES.md` y `analisis_de_costos.md`, y
`PLAN_TORRE_CONTROL.md` con cambios sin commitear. No se tocaron: son trabajo previo del
usuario y no me corresponde decidir si están listos.


---

## 7. Abierto tras la sesión del 2026-08-28

### Visibilidad de secciones por cargo — PLANIFICADO, SIN EMPEZAR

El plan entero está en **`docs/planes/PLAN_ROLES_POR_CARGO.md`**, con las ocho decisiones
ya cerradas con el usuario, el modelo de datos, el mapa de endpoints y las cuatro fases.
Para retomarlo basta con ese archivo; aquí solo queda por qué está parado y qué mirar antes
de escribir la primera línea.

**Qué es:** un tercer eje de permisos —qué pantallas ve cada quien, según el cargo del
empleado que tenga asignado— encima de los dos que ya hay. El rol de BD, la RLS, los GRANTs,
`is_staff` y la decisión A1 del borrado **no se tocan**: este eje solo resta.

**Por qué está parado:** el usuario pidió planear y nada más. No hay código escrito, ni
migraciones, ni ramas.

**Lo que hay que verificar antes de implementar**, porque el plan lo da por bueno sin
comprobarlo en producción:

- **El mapa `ENDPOINTS` es un borrador.** Se armó leyendo qué componente llama a qué ruta en
  el front de hoy. Antes de codificarlo hay que repasarlo pantalla por pantalla: un endpoint
  mal anotado no da error, deja de responder a quien sí debía verlo.
- **Cuántos empleados tienen un `cargo` que no casa con el catálogo.** Es texto libre. En
  producción no se ha mirado, y de esa cifra depende cuánta gente empieza en "ve todo" por
  desenganche en vez de por decisión.
- **Si hay usuarios que no son ninguna persona** (cuentas de prueba, de sistema). Se quedarían
  sin `PerfilUsuario` y por tanto viendo la app entera.

**La trampa del diseño, escrita para que no se olvide:** con el "ve todo por defecto" que se
eligió, el sistema **falla a favor del acceso**. Renombrar un cargo desde Catálogos desengancha
a todos sus empleados y los abre a la app entera sin un solo error por ningún lado. Por eso el
arrastre de `empleados.cargo` al renombrar no es un extra del plan: es lo que lo sostiene.

### Desplegado hoy (2026-08-28)

- **Backend `b14f60ce`:** la ASIGNACIÓN del folio se lleva entero el apellido compuesto
  ("ROBERTO DE LOERA" en vez de "ROBERTO DE"). Los folios ya escritos no se corrigen solos: se
  reescriben la próxima vez que se guarde su maniobra.
- **Frontend `767cdfe`:** el verde del repaso de PENDIENTES ya no se pinta en el desglose de
  ACTIVOS. La bandera `pendiente_programar` sigue guardada, así que un servicio que vuelva a
  pendiente reaparece marcado.
