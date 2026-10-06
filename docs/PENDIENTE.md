# Pendiente

Anotado el 2026-08-25 y **actualizado el 2026-09-30** al cerrar la sesión.

⚠️ Este documento describe **estado**, así que caduca — es justo el tipo de documento
del que avisa `README.md`. Verificar contra el código antes de fiarse, y borrar cada
punto al completarlo en vez de dejarlo criando polvo.

---

## 0. Desplegado el 2026-09-02

Dos despliegues el mismo día, los dos en el orden de siempre (migrar si toca, backend en
verde, luego frontend):

**Por la mañana** — lo que el 2026-09-01 se quedó en local, sin migración pendiente:

- **Backend `d4942c6d`** — la Cita como instante y en el reporte (`f79c3c66`, el que
  acompañaba a la migración 0063, aplicada desde el 2026-09-01) + el STATUS EIR naciendo
  en `pendiente`.
- **Frontend `28ebf45`** — la Cita con hora entre las dos fechas (`088d5ed`) + la fila
  nueva de Vacíos con el EIR en `pendiente`.

**Por la tarde** — la casilla CON CITA de Patios, con la **migración 0064** aplicada en
producción antes de empujar (ADR-0021):

- **Backend `ea271be6`** · **Frontend `27e0c19`**.

**Por la noche** — los documentos y vencimientos de Tractos y Remolques, con la
**migración 0065** aplicada en producción antes de empujar (ADR-0022):

- **Backend `ff76e106`** · **Frontend `a5ac41c`**.

**Después, ya sin migración:**

- **Frontend `d00612d` y `9cb7eec`** — la tabla de Tractos, que con las columnas nuevas
  dejó de caber en la columna de 1320px: esa pestaña ensancha su contenido hasta la
  pantalla, la tarjeta se ajusta al ancho de la tabla (`width: fit-content`) y tarjeta y
  pestañas se centran. Los demás catálogos no cambian.
- **Frontend `242c433`** — el status QUEMADA se lee "Quemada/En falso". Solo la etiqueta:
  el id sigue siendo `quemada` en la base y en `STATUS_CHOICES`.
- **Backend `23d40f9c`** · **Frontend `63fd862`** — los plazos de los avisos nuevos, que
  salieron a 60 días y el usuario ajustó al verlos: Permisos Full a 1 mes, Físico Mecánica
  y Humo el día que vencen y mientras sigan vencidos (ADR-0022).

**Queda abierto de todo esto:**

- Los vacíos que YA existían con el **STATUS EIR en blanco** se quedaron como estaban: el
  cambio solo decide con qué valor nacen los nuevos. Ponerlos todos en `pendiente` sería
  una migración de datos, y no se sabe si ese blanco es decisión de alguien.
- Los vacíos cuyo **patio no está en el catálogo** no dicen "CITA ABIERTA" y no hay forma
  de que lo digan: el cruce es por nombre exacto y `vacios.patio` arrastra nombres sueltos
  del histórico. En la base local son **131 de 227** (`CIMA` 64, `TIMSA` 23, `SSA` 9,
  `ISL` 8, `APM` 6…); en producción lo dijo el paso `ver` de `migrar_prod.sh`. Para que
  entren hay que **normalizar esos nombres** o dar de alta el patio con el nombre exacto.
  Ninguna de las dos se hizo: es una decisión de negocio sobre datos que ya existen.
- Los **documentos ocupan espacio en la base**: hasta 10 MB por archivo, sin recomprimir.
  Con ~40 unidades y 4 documentos cada una son cientos de MB en el peor caso, sobre disco
  ya provisionado. Nadie lo ha medido en producción todavía; si algún día molesta, la
  conversación es Blob Storage y el punto de cambio es `_guardar()` en `api/views.py`.
- La **Tarjeta de Circulación no vence** en el sistema: se decidió que fuera solo el
  archivo. Si algún día tiene que avisar, es una columna de fecha más y una línea en
  `TRAMITES_TRACTO`.
- **La tabla de Tractos cabe hoy, pero no hay margen.** El ancho se ganó ensanchando la
  columna y dejando que los títulos ocupen dos líneas. Una columna más y vuelve a
  arrastrarse; la siguiente palanca sin tocar datos es bajar la tipografía de esa tabla.
- **Verificar en producción el borrado de documentos.** Está cubierto por prueba
  (`test_documentos_catalogos.py`), pero no se pudo comprobar a mano: en local el admin
  tiene un TOTP que no está sincronizado. Para eso se creó `adminlocal`, un superusuario
  **solo de la base local** y sin segundo factor — no existe en producción.

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

### Zona horaria de `ruta_inicio` / `ruta_fin` — YA SE MANIFESTÓ (2026-09-03)

Aquí decía que el desfase **no se manifestaba** porque nadie recortaba esas columnas a
fecha. **Desde el 2026-09-03 sí**: la FECHA del reporte de viaje es el día de
`ruta_inicio` (ADR-0022). Se resolvió convirtiendo a `America/Mexico_City` antes de
recortar — sin eso, toda salida de tarde salía con el día siguiente.

Y de paso apareció lo que este apunte daba por sabido y no lo era: **`maniobras.ruta_inicio`
y `ruta_fin` son `timestamp WITHOUT time zone`**, no con zona. Django devuelve un datetime
*naive* y `timezone.localtime()` revienta con uno. Lo guardado es UTC
(`settings.TIME_ZONE`), y por eso la API lo devuelve con la `Z` y el navegador lo lee bien.

**Queda abierto** el mismo cuidado para cualquier otro uso futuro: agrupar por día,
imprimir o comparar esas dos columnas exige marcarlas como UTC y convertir primero.

---

## 4. Menor

- `fecha_vencimiento_licencia` y `fecha_vencimiento_poliza` ya salen en DD/MM/AAAA en
  Catálogos. `fecha_ingreso` de empleados **no**.
  ⚠️ **Corregido el 2026-09-03:** aquí decía que la columna es `CharField` en la base. **No
  lo es.** El MODELO dice `CharField`; la columna real es `date` (`empleados` es
  `managed=False`, la creó pgAdmin y cambiar el modelo nunca alteró el esquema). Django
  devuelve un objeto `date`, y fiarse del modelo costó un 500 en la primera lectura de la
  nómina contra la base de verdad. Sigue fuera de `COLUMNAS_FECHA` porque nadie lo ha
  pedido, no porque sea texto.
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


---

## 7. Abierto tras la sesión del 2026-09-01

### El gate de dependencias tumbó los dos despliegues del día

Ninguna de las dos tenía que ver con el código que se subía:

- **Frontend:** `GHSA-c83g-rgw3-j3cx` y `GHSA-73wf-gq98-2v4g` en **browserslist ≤ 4.28.6**
  (transitiva de autoprefixer y babel). Arreglado subiendo a 4.28.8 — solo `package-lock.json`,
  no entra en el bundle.
- **Backend:** `CVE-2026-73228` y `CVE-2026-73229` en **djangorestframework 3.17.1**.
  Arreglado subiendo a 3.17.2, con las 423 pruebas pasadas sobre la versión nueva antes de
  empujar.

Los dos se **arreglaron** en vez de excepcionarse porque había versión con parche. Vale la
pena presupuestar este rato en cada despliegue: pasa casi siempre.

### `react-router` ya tiene arreglo y su excepción se puede retirar

`audit-excepciones.txt` dice que la excepción de `GHSA-qwww-vcr4-c8h2` se retira "en cuanto
exista una versión con arreglo". **Ya existe**: el rango vulnerable es `>=7.12.0 <7.18.2`,
así que 7.18.2 lo cierra. No se hizo en la sesión porque subir el router tiene riesgo
propio y no bloqueaba el despliegue.

### Un vacío duplicado en la base local

Al enlazar los vacíos con su maniobra (migración `0061`) salieron **dos filas pendientes con el
mismo contenedor** (`MSKU5536563`, ids 231 y 233), las dos apuntando a la maniobra 4490.
Esa maniobra enseña tres valores donde deberían ser dos. Es un duplicado de datos, no del
enlace, y borrar un vacío pide admin. Sin mirar en producción.

### El reporte de vacíos a una sola página tiene un techo

`fitToHeight = 1` mete la lista en un folio pase lo que pase. **Medido**: con 15 vacíos la
tabla sale a tamaño completo; con 45 sigue cabiendo pero encogida a menos de la mitad y,
como el escalado es uniforme, se estrecha y deja media hoja en blanco. Si algún coordinador
acumula tantos pendientes, `fitToHeight = 0` devuelve la lista a varias hojas con la letra
intacta.

### El pintado de celdas no se imprime en el reporte

El balde de celdas (migración `0062`) es de pantalla. El reporte en PDF sale siempre con su
zebrado, ignorando los colores que alguien haya puesto. No se pidió; si se quiere, hay que
decidir antes el contraste del texto, porque la paleta de Sheets llega hasta el negro.

### Sigue el aviso de Node 20 en el CI

Sin cambios desde el 2026-08-27: `actions/checkout@v4`, `setup-node@v4` y `azure/login@v2`
apuntan a Node 20 y GitHub los fuerza a Node 24. Es subir esas tres acciones de versión.


---

## 8. Abierto tras la sesión del 2026-09-03

Sesión larga: se desplegaron tres tandas (`9f7a1a1a` + `26e773a`, `038b95d`, `e6646a21` +
`2099e96`) y se escribieron seis ADR nuevos, del **0017 al 0022**. Lo que sigue es lo que
NO quedó cerrado.

> ⚠️ Dos apuntes de la sesión del 2026-09-01 citaban un "ADR-0017" y un "ADR-0018" que
> nunca existieron: se referían a las migraciones `0061` y `0062`. Corregido arriba, porque
> esos dos números ya están ocupados por ADRs de verdad.

### La nómina en producción está vacía y sin verificar

Se desplegó, pero **nadie ha capturado un sueldo todavía**. Antes de fiarse de ninguna
prima conviene mirar dos cosas en producción:

- **Cuántos empleados tienen `fecha_ingreso` legible.** Sin ella salen con 0 días de
  vacaciones y la celda los marca en rojo. En la base local, de 3 empleados **solo 1** la
  tenía. Si en producción la proporción es parecida, la mitad de la tabla nace en cero.
- **Que el usuario que la va a llevar sea `staff`.** Si no, la tarjeta ni aparece
  (ADR-0020), y eso se lee como "está roto".

### El calendario de vacaciones borra de día en día

Quitar unas vacaciones de una semana son cinco clics. Está marcado con un comentario
`ponytail:` y el arreglo es un borrado por rango en el ViewSet, igual que el alta
(ADR-0021). Sin decidir si merece la pena.

### Un Full repartido pisa su propio RUTA INICIO

Dos reportes, una sola columna `ruta_inicio`: el último que guarde su salida real manda
(ADR-0022). Separarlos pide una columna por operador y no se pidió. Hoy no ha mordido
porque en producción todavía casi no hay reportes.

### El tope de la nómina de 31 años en adelante

La escalera de días de vacaciones se queda en 30 a partir del año 31, que es el último
tramo que se dictó. La LFT suma dos días por cada cinco años. El sitio está marcado en
`dias_de_vacaciones()`; hace falta que el usuario diga hasta dónde sube.

### `--tabla-tope: 300px` sin medir contra pantalla

La cabecera fija de las tablas (`.tabla-cabecera-fija` en `App.css`) acota la caja a
`100vh - 300px`. Ese número es **lo que ocupa la página por encima de la tabla** y se eligió
deliberadamente **corto**: pasarse deja la caja bajo el pliegue y entonces scrollea primero
el documento, con la cabecera saliéndose — que es el fallo que se venía a arreglar.
Quedarse corto solo desaprovecha píxeles. **No se midió página por página**; si alguna tabla
se ve más baja de lo que da el monitor, es declarar `--tabla-tope` en su hoja.

### Lo que estas pruebas NO pueden ver

Quedó demostrado dos veces en una sola sesión, y conviene que no se olvide:

> `config/settings_test.py` crea las tablas de `api` **desde los modelos**. Cuando el modelo
> miente sobre el tipo de columna —y en este proyecto miente a menudo, porque media base es
> `managed=False`— **las pruebas prueban el modelo, no la base**.

Los dos 500 del día (`empleados.fecha_ingreso` como `date`, `maniobras.ruta_inicio` sin
zona) pasaron 526 pruebas en verde y se cayeron en la primera lectura contra Postgres real.
**Levantar el backend local y leer los endpoints nuevos antes de empujar** es lo único que
los encontró. Ya son cuatro columnas conocidas con este problema; ver también
`gastos.fecha_entrega_mercancia` (ADR-0016) y `maniobras.fecha_pis`.

### Cuenta local `admin1`

Se creó en la base **local** un admin sin segundo factor (`admin1`) porque el `admin` de
siempre pide TOTP y en local no se valida. **No existe en producción y no debería**: es un
administrador sin MFA con una contraseña que circuló por el chat. Si algún día hace falta un
segundo admin en producción, que sea con su TOTP dado de alta.

### Sigue el aviso de Node 20 en el CI

Sin cambios desde el 2026-08-27, y ya van tres sesiones: `actions/checkout@v4`,
`setup-node@v4` y `azure/login@v2` apuntan a Node 20 y GitHub los fuerza a Node 24. Es
subir esas tres acciones de versión.

---

## 9. Abierto tras la sesión del 2026-09-09

### Módulo Finanzas: en definición, sin una línea de código

La sesión se fue entera en leer `docs/planes/FRABA_Modulo_Finanzas_Resumen.md` y en
preguntar lo que no se podía deducir. **No se tocó ni el frontend ni el backend.**

Todo lo abierto vive en **`docs/planes/PREGUNTAS_MODULO_FINANZAS.md`**, que es el punto
de entrada para retomar, no este. Estado al 2026-09-29: respondidas de la 1 a la 69 salvo
lo que lista *Queda abierto* al final de esta sección.

**Alcance de lo primero que se implementa:** la sección *Gráficas* del plan, líneas 142 a
169, y la página de Facturación con la lectura del Excel
`docs/planes/FORMATO_LECTURA_FACTURACION.xlsx`.

**Cuatro decisiones ya cerradas** (D1 a D4 en el archivo de preguntas):

- Ventas mensuales son **dos dashboards**: uno cuenta servicios por tipo, otro cuenta el
  dinero de la factura. El enlace maniobra-factura es `maniobras.no_factura` contra
  **serie + folio** del Excel: `SEF 456` casa con serie SEF y folio 456.
- Las ventas van **con IVA**, columna `Total` del Excel.
- Los duplicados de factura se detectan por el **UUID fiscal**, columna M del Excel. Se
  guarda en la base y no se muestra.
- Los clientes se agrupan con una **tabla nueva de grupos**. La tabla actual **no** se
  renombra: solo cambia el rótulo en pantalla a Direcciones.

**Lo que condiciona el diseño y conviene no volver a descubrir:**

- **`Gasto.facturado` sí guarda un ingreso** (corregido el 2026-09-29; antes aquí decía
  lo contrario): es la columna Ingresos de Gastos, solo staff, texto a mano, y hoy nadie la
  llena. Decisión (pregunta 58): se rellena sola con la suma de las facturas ligadas.
- **`maniobras.no_factura` es texto libre**, 100 caracteres, sin validación ni
  normalización — es una celda más de `ManiobrasPage.jsx`. En la base local aparecen
  `S 155/ 156` para dos facturas de una misma maniobra, con una o dos diagonales, con la
  serie repetida o sin repetir, y valores que no son factura como `EFECTIVO`. El usuario
  confirmó que la diagonal significa **suma de las dos facturas** y que EFECTIVO se ignora
  por no ser deducible.
- **`maniobras.tipo_servicio` está casi vacío en el histórico**: 12 de 415 en la base
  local. El usuario dice que hoy se llena siempre. Como respaldo ya existe la heurística
  del backend para documentos: el texto CARGA SUELTA manda, más de 12 caracteres de
  contenedor es full y el resto sencillo (`_es_carga_suelta` en `api/views.py`).
- **La base local no tiene ni una fila de 2024 ni de 2025.** Es una copia parcial: 265
  maniobras de 2022, 93 de 2023 y 36 de 2026. Ningún conteo sacado de ahí describe
  producción, y los del archivo de preguntas van marcados como tales.
- **`openpyxl` ya está en `requirements.txt`.** La lectura del Excel va en el backend. En
  el navegador haría falta una dependencia nueva que además tropieza con el gate de
  `npm audit` del CI.
- **Para las gráficas, `recharts`.** Está instalada y ya se usa en `AdministracionGastos`.
  `chart.js` también está y se usa en `AdministracionNoEco`. No se añade nada nuevo.
- **El diseño de referencia es `docs/planes/Frontend Sistema de Finanzas_files/codigo.html`**
  (el otro `.html` es solo el visor de Canva). Sirve para la **distribución**; colores y
  tipografía son los del sistema actual (preguntas 49 y 50).

**Queda abierto (2026-09-29):**

- **Pregunta 62 — PENDIENTE a propósito.** A qué mes va cada semana de nómina y si el
  sueldo se congela por semana. El criterio lo tiene que resolver alguien ajeno al usuario;
  no se decide por defecto. Bloquea solo el término *nómina administrativa* de la utilidad
  mensual: Facturación y lo demás pueden avanzar.
- Todo lo demás está respondido y el plan está escrito:
  **`docs/planes/PLAN_MODULO_FINANZAS.md`**. Dos puntos marcados *Por defecto (validar)*
  dentro del plan.

**Al retomar:** las fases 0 a 6 están hechas (ver sección 11). Lo que queda del plan está
allí.

---

## 10. Sesión del 2026-09-29

### Desplegado

- **Backend `e3618db6` + `e41b8f55`, frontend `79977b1`, sin migración.** El diésel ya no se
  edita en Gastos: solo lo escribe el reporte de viaje, y pisa siempre (ADR-0023, que
  sustituye a ADR-0013).
- El primer push del backend lo paró `pip-audit`: diez avisos nuevos en PyJWT 2.13.0. Se
  subió a **2.14.0**, se volvió a pasar la auditoría en local (limpia) y las 549 pruebas
  (verde). Es la situación que ya estaba anotada en memoria: cuenta con ello en cada
  despliegue tras una pausa.
- Commit y push los hace Claude a partir de ahora, a petición del usuario. Las reglas de
  permiso están en `front/.claude/settings.local.json`.

### Decidir al retomar — CERRADO el 2026-09-30

Las tres se decidieron el 2026-09-30: el diésel **se queda como está** (1 y 2: opción (a),
aceptarlo, y los descuadres viejos se curan solos al volver a guardar cada reporte), y
Reparaciones va con **la regla vieja** (3), ya implementada en la Fase 5. Se conserva el
texto original debajo como registro.

1. **Diésel de viajes sin reporte.** ADR-0013 había descartado bloquear el campo porque hay
   viajes sin reporte y folios antiguos donde el diésel solo se captura a mano. Con el
   bloqueo de hoy, **esos gastos no pueden registrar diésel**. Opciones: (a) aceptarlo;
   (b) dejarlo editable solo cuando la maniobra no tiene reporte de viaje; (c) editable
   solo para staff. Se implementó sin plantearlo; el fallo es de Claude, no del usuario.
2. **Gastos con diésel manual anterior** siguen con el aviso "Diésel" en Reportes de viaje
   hasta que alguien vuelva a guardar su reporte. ¿Se hace un volcado masivo, o se van
   curando solos?
3. **Reparaciones (fase 5 del plan):** ¿también de solo lectura, como el diésel, o con la
   regla vieja? Con solo lectura, la fase se simplifica y no necesita migración.

### Finanzas: planificación cerrada

- **Plan:** `docs/planes/PLAN_MODULO_FINANZAS.md`. Preguntas 1–71 respondidas en
  `PREGUNTAS_MODULO_FINANZAS.md`.
- **Única abierta: la 62**, a propósito (semana de nómina → mes y sueldo sin historial).
  Solo bloquea la nómina administrativa de la utilidad.
- ~~Siguiente paso: Fase 0.~~ Hecha el 2026-09-30, con el resto de fases: ver sección 11.
  El plan de roles por cargo (`PLAN_ROLES_POR_CARGO.md`) sigue sin implementarse; de él
  solo se tomó el perfil usuario → empleado.
- Siguen sin commitear, a propósito y sin relación con Finanzas: `PLAN_TORRE_CONTROL.md`
  (con cambios), `PLAN_GASTO_AUTOMATICO.md`, `PLAN_REPORTE_COORDINADORES.md`,
  `REPORTE COORDINADORES.md`, `analisis_de_costos.md` y el resto de la carpeta de Canva.

---

## 11. Sesión del 2026-09-30 — Módulo Finanzas, fases 0 a 6

### Desplegado

- **Fase 0 en producción:** backend `99ca5eae`, con la **migración 0069** aplicada antes de
  empujar. Tabla `api_perfilusuario` (usuario 1:1 → empleado 1:1 nullable), asignada en
  `/admin` → Perfiles de usuario. El rol estándar solo tiene SELECT. El usuario ya ligó los
  usuarios de producción a sus empleados.

### Hecho y probado en local, SIN DESPLEGAR

Todo con suite en verde (605 pruebas al cerrar), `npm run build` limpio, `pip-audit` limpio
y humo por HTTP contra el backend local levantado y Postgres real al cerrar cada fase.

| Fase | Backend | Frontend | Migración |
|---|---|---|---|
| 1 · Facturación: carga del Excel (.xlsx/.xls/.csv), liga por `no_factura`, Ingresos en Gastos | `c16fcbe6` | `0370e35` | 0070 |
| 2 · Clientes principales; Catálogos → Clientes pasa a **Direcciones** | `9eeb0eab`, `8441e3ae` | `35b13be`, `ab3523f` | 0071 |
| 3 · Cuentas por cobrar (antigüedad), cobranza semanal, casilla Cobrada | `0b0b5e85` | `d3b4fa6` | 0072 |
| 4 · Cuentas por pagar (fletes, locales, mantenimiento), gastos fijos, gastos financieros | `355c722f` | `9ae36b8` + 4 de ajustes visuales | 0073 |
| 5 · Reparaciones del reporte a Gastos, con aviso de descuadre | `9842defb` | `dda8292` | 0074 |
| 6 · Dashboards: una sola tarjeta DASHBOARDS con un botón por cada uno de los nueve (las páginas por grupo se quitaron por redundantes) | `57270c8e` | `4855da1`, `ae3efc7`, `d5038cc`, `575d024` | — |
| Botón Cancelar igual en toda la app (clase `btn-cancelar-app`) | — | `f476538` | — |

En total **7 commits de backend** (sobre `99ca5eae`) y **15 de frontend** (sobre `79977b1`).
Además, `PyJWT` sube a **2.15.0** (CVE-2026-101918 en la 2.14.0) y entra **`xlrd` 2.0.2**, la
única dependencia nueva, solo para leer `.xls` (P12).

### Decisiones tomadas con el usuario hoy (no están en el plan)

- **Acceso:** se cerró por cargo Facturación, Cuentas por pagar, Gastos financieros y los
  dashboards. El hub de Finanzas, Costos extra y Nómina siguen como estaban.
- **Serie desconocida** en el Excel (ni SEF ni S): se omite y sale en el resumen.
- **Días de crédito opcionales** en clientes principales y cuentas por pagar: vacío = 0.
- **Factura sin maniobra ligada, o ligada sin cliente principal:** fuera de la antigüedad de
  saldos, listada aparte.
- **Cuentas por pagar:** casilla **Pagada** (no estaba en el plan); fletes y locales solo
  **desde agosto de 2026**; dos tarjetas en Finanzas (Cuentas por pagar con 4 pestañas y
  Gastos financieros).
- **Fase 5:** regla vieja del diésel para Reparaciones (no pisa lo capturado a mano).
- **Fase 6:** una maniobra sin factura cuenta como servicio en el mes de su **fecha PIS**,
  con nota (el "por defecto (validar)" del plan, aceptado).

### Decisiones de Claude que conviene conocer

- **Una factura ligada a otra maniobra no se le quita** al guardar un No. Factura que la
  nombra: con un número mal tecleado, quitársela a la maniobra correcta sería silencioso.
  Si dos maniobras la nombran al cargar, queda pendiente de ligar y se avisa.
- **Ingresos de Gastos** solo se recalcula en maniobras cuya liga cambia: un ingreso escrito
  a mano antes de Facturación no se toca.
- **Costo de ventas** se agrupa por `maniobras.fecha_entrega_mercancia` (`date`) y no por la
  copia de `gastos`, que es texto con formatos mezclados (`20/10/2026`, `2026-06-28`, vacío).
- **El "hoy"** de antigüedades y vencimientos es el de `America/Mexico_City`, no el UTC del
  servidor.
- **Permisos por columna** en `api_factura` y `api_cuentaporpagar`: el rol estándar no puede
  tocar importes, `estado` (cancelar es solo staff) ni la maniobra. Por eso la edición de
  una cuenta por pagar guarda solo los campos tocados (`save(update_fields=...)`).
- Las cuentas por pagar **no se borran nunca** (P55); gastos fijos y capturas mensuales, solo
  staff.

### Lo que falta

1. **Desplegar las fases 1 a 6 — PENDIENTE por decisión del usuario al cerrar la sesión
   del 2026-09-30** ("las migraciones las dejaremos pendientes"). Nada de las fases 1 a 6
   está en producción. `migrar_prod.sh` ya está preparado para **0070 a 0075** (ver §12) y
   comprueba los permisos reales en Postgres. Orden de siempre: el usuario corre `abrir` →
   `ver` → `migrar` → `cerrar`; luego backend en verde; luego frontend.
   - En `ver`, deben faltar exactamente de la 0070 a la 0075.
   - ~~Espera además a definir lo pendiente de la nómina~~: resuelto el 2026-10-06 (§13).
     Ya no hay nada que bloquee el despliegue salvo que el usuario lo lance.
   - Presupuestar `pip-audit` (pasa casi siempre tras una pausa).
2. **Revisar en el navegador** las pantallas nuevas: se compilaron y se probaron por HTTP,
   pero **las gráficas de los dashboards no se han mirado en pantalla**.
3. ~~Pregunta 62~~ — cerrada el 2026-10-06 (§13).
4. **Estados de cuenta** sigue siendo una tarjeta vacía en Finanzas (bancos, fuera del plan).
5. **Regla `autoMode` en `front/.claude/settings.local.json`** para que Claude pueda empujar:
   quedó escrita pero sin validar; el usuario decide si la deja o la quita. Sin ella, el
   push lo lanza el usuario con `!`.
6. **Datos para probar Fletes y Locales en local:** la base local solo tiene una maniobra
   desde agosto y es de FRABA; hace falta un transportista ajeno o placas PIS de terceros.
7. **Si antes de desplegar entra otra migración (0076…),** `migrar_prod.sh` se AMPLÍA, no
   se reescribe: hoy comprueba de la 0070 a la 0075 y todas tienen que llegar juntas.

### Límites conocidos (anotados con `ponytail:` o en el código)

- La lista de Facturación trae todas las páginas de golpe; si pesa, paginar como Gastos.
- La caché de pestañas de Catálogos no se invalida al editar (coordinador, Con Cita…). Solo
  la asignación de cliente principal la actualiza; lo demás es un problema previo.
- Placas de terceros y transportistas se comparan sin mayúsculas ni espacios, pero **sin
  quitar guiones**: `ABC-123` y `ABC 123` no casan.
- Borrar un gasto fijo (staff) borra también sus pagos de meses pasados.
- Los dashboards comparan contra otro periodo en las tarjetas; las gráficas no superponen
  las dos series.

## 12. Sesión del 2026-10-02 — Decimales del diésel, SIN DESPLEGAR

### Hecho y probado en local

Reporte de viaje, bloque EN TRAYECTO: **litros de diésel, precio por litro, litros de urea
y total de urea** aceptan hasta **10 decimales** (antes 2). El usuario pidió "sin límite";
se eligió con él `numeric(20,10)` en vez de `numeric` sin precisión, que en Django exige un
campo propio. Los totales calculados (litros × precio, volcado al gasto) siguen
redondeándose a centavos al calcularse, no al capturarse.

- Backend: modelo `CargaCombustible`, **migración 0075** (`AlterField` de las cuatro
  columnas: solo ensancha, nada se trunca) y `CargaCombustibleSerializer.to_representation`,
  que devuelve `300.00` y no `300.0000000000`, y `24.3579` sin ceros de relleno. Prueba
  `test_el_diesel_acepta_mas_de_dos_decimales`. Suite: 606 en verde.
- Frontend: los cuatro inputs pasan de `step="0.01"` a `step="any"`. Build limpio.
- `migrar_prod.sh` ampliado: cabecera, `ver` (0070 a 0075) y `migrar` comprueba en
  `information_schema` que las cuatro columnas son `numeric(20,10)`. Ya validado contra la
  base local con la 0075 aplicada.

### Por qué no se desplegó

La 0075 depende de la 0074 (Finanzas), así que no puede salir sola. Separarla obligaría a
rebasarla sobre la 0069, hacer una migración de unión y un cherry-pick a otra rama: el
usuario decidió **desplegar todo junto** con Finanzas, que a su vez espera a definir lo de
la nómina (§11, «Lo que falta», punto 1).

- Al desplegar, levantar local y capturar a mano un renglón con 3 o más decimales antes de
  empujar: las pruebas no ven la pantalla.

---

## 13. Sesión del 2026-10-06 — Nómina en la utilidad, SIN DESPLEGAR

Con la **migración 0076** (historial de sueldos). `migrar_prod.sh` cubre ya de **0070 a
0076**: en `ver` deben faltar exactamente esas siete.

Decidido por el usuario, y con ello **cerrada la P62**:

- La columna **Sueldo** se llama **Sueldo Semanal**, solo en pantalla. La columna de la base
  sigue siendo `sueldo`.
- Nueva columna **Sueldo Diario** = semanal × 4 ÷ días del **mes en curso**. Calculada y no
  guardada, así que cambia sola al cambiar de mes.
- La **prima vacacional no cambia**: sigue usando semanal ÷ 7, así que el diario de la tabla y
  el de la prima son distintos a propósito.
- **Nómina administrativa** del mes = Σ semanal × 4 de los empleados con usuario staff (P63)
  dados de alta algún día de ese mes: mes completo, sin prorratear. Un empleado sin fecha de
  ingreso legible cuenta siempre. La utilidad operacional ya la resta.
- Los cargos de Finanzas que no son staff ven **solo el total** del mes: el cálculo lee la
  nómina con la conexión de administrador (`ALIAS_NOMINA` en `dashboards.py`) porque el rol
  estándar no tiene permisos sobre ella (0067).

**Historial de sueldos (segunda mitad de la P62, decidido por el usuario):**

- Tabla `api_sueldohistorial`: un renglón por cambio de sueldo con su fecha `desde`. Lo
  escribe el PATCH de la nómina; la tabla de Nómina sigue enseñando el sueldo actual.
- Un mes de la utilidad cuenta el sueldo **vigente su último día**: subirlo en noviembre no
  mueve agosto.
- Corregir el mismo día **pisa** el renglón de hoy. Un error de días anteriores se corrige
  en **/admin → Historial de sueldos**.
- Los sueldos que ya existían entran **desde siempre** (`desde` vacío), así que la utilidad
  pasada no se mueve al desplegar.
- **Decisión de Claude, a validar:** el **primer** sueldo que se le captura a un empleado
  también vale desde siempre, como los ya existentes: es el dato inicial, no un cambio. Si no
  fuera así, quien reciba hoy su primer sueldo saldría con nómina 0 en todos los meses
  anteriores. Está en `NominaViewSet._anotar_sueldo`.
- Sin GRANT al rol estándar, como la 0067.
