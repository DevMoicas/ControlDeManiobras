# PLAN — Reporte de viaje (coordinadores)

Fecha: 2026-08-24 · Estado: **✅ desplegado en producción el 2026-08-24.**

| Repo | Commit | Contenido |
|---|---|---|
| backend | `805536e4` | Modelos, migraciones `0051`–`0053`, serializers, `/reportes-viaje/`, el documento y 44 pruebas |
| frontend | `c4e14aa` | Pantalla, hook, lógica pura con 25 pruebas, y el folio "-2" de los Full |

Orden seguido, el de siempre: migraciones `0049`–`0053` contra prod por la vía oficial
(`migrar_prod.sh`) → backend en verde → frontend. 239/239 pruebas del backend y 64/64 de la
lógica pura del frontend.

La tanda de migraciones llevó también la `0049`–`0050` de la torre de control, que se había
quedado sin desplegar (ver `PLAN_TORRE_CONTROL.md`).

**La trampa de este despliegue** fue la `0053`: es la primera migración de DATOS con ORM sobre
una tabla `managed=True` del proyecto, y sin `using=schema_editor.connection.alias` el
`RoleBasedRouter` manda sus consultas por otra conexión, que se queda esperando el lock que
tiene la propia migración. El `migrate` se cuelga **sin error y sin traza**. Se diagnosticó
mirando `pg_blocking_pids` en vivo. Cualquier migración de datos futura sobre estas tablas
necesita ese `using=`.

| Fase | Estado | Qué hay |
|---|---|---|
| 1 — Backend | ✅ | Modelos, migraciones `0051`–`0052`, serializers, `ReporteViajeViewSet`, ruta `/reportes-viaje/` |
| 2 — Captura | ✅ | `ReporteViajePage` (lista + formulario), `useReportesViaje`, `reporteViaje.mjs`, ruta y módulo en el Home |
| 3 — Salida | ✅ | `GET /reportes-viaje/{id}/documento/?formato=excel\|pdf` sobre la plantilla del papel |

Verificado: 219/219 pruebas del backend (33 del reporte), 18/18 de la lógica pura del
frontend, `npm run build` en verde, migraciones aplicadas y **deshechas** contra la BD local,
GRANT/RLS del rol estándar comprobados a mano, y una prueba de humo por HTTP contra el
servidor local que recorre crear → duplicado rechazado → PATCH parcial → filtro → Excel → PDF.

Formato en papel que llenan los coordinadores por cada viaje. Hoy vive fuera del sistema:
`docs/planes/REPORTE COORDINADORES.md` (exportación degradada) y la plantilla real en
`api/documentos/templates/REPORTE COORDINADORES.xlsx`, 12 columnas × 25 filas.

El objetivo es capturarlo en el sistema, guardarlo en base de datos y poder descargarlo
en Excel o PDF para firmarlo.

## Decisiones cerradas con el usuario (2026-08-24)

| Pregunta | Respuesta |
|---|---|
| ¿"Portas" son los remolques? | Sí. `remolque` y `remolque_2` de la maniobra |
| ¿Quién es el coordinador? | El que captura. Campo libre **o** desplegable de empleados con cargo `Coordinador` |
| ¿Cuántas cargas de combustible? | 5, "de momento siempre" |
| ¿El diésel del reporte alimenta `Gasto.gasto_diesel`? | **No.** No se hablan. La captura del reporte es manual e independiente |
| ¿Un reporte por folio o por viaje? | **Por folio.** Un Full repartido entre dos operadores son dos reportes |
| ¿Roles? | Ninguno. Lo llena y lo ve cualquier usuario autenticado |
| ¿Importes y reparaciones? | Se capturan **a mano en el reporte**, aunque `Gasto` ya tenga cifras parecidas |
| ¿Vacíos? | Un desplegable con la lista de patios. Nada más |
| ¿Cita y patio de entrega? | **Campos separados**, aunque en el papel compartan renglón |
| ¿Ruta inicio y fin? | Manuales, salvo que la maniobra ya las tenga: entonces precargan |
| ¿`ruta_inicio` / `ruta_fin` a qué campos del papel corresponden? | `ruta_inicio` → **FECHA Y HORA DE INICIO PACTADA**; `ruta_fin` → **FECHA Y HORA DE LLEGADA A MANZANILLO** |
| ¿Buscar folios viejos? | No hace falta. Se llenan con una semana de margen y las 30 maniobras recientes del `FolioSelector` bastan |
| ¿Salida? | Excel **y** PDF descargables, como opción, para cada reporte |
| ¿Cómo se capturan los Sí/No? | Con un **botón de dos opciones**, no con casillas. Se reusa `VacioStatusSelector`, que ya acepta sus opciones por prop |

## La decisión de arquitectura: el folio precarga, no enlaza

La torre de control lee la maniobra **en vivo** y nunca copia (`TorreFolioSerializer.get_servicio`).
Aquí es al revés y a propósito: **el reporte se firma**. Si leyera en vivo y alguien corrigiera la
maniobra la semana siguiente, el papel firmado y la pantalla dejarían de coincidir, y el que vale es
el papel.

Así que al crear el reporte se **copia** lo que el sistema ya sabe, y desde ese momento todo vive en
el reporte y es editable. Un reporte es una foto de lo que pasó, no una vista de lo que hay.

## Modelo de datos

Dos tablas nuevas, `managed = True` con migración, la convención vigente (solo las heredadas
—`maniobras`, `vacios`, `tractos`, `empleados`, `gastos`— son `managed = False`).

### `ReporteViaje` — una fila por folio

```
folio               CharField(100), unique=True, db_index    <- "un reporte por folio" en la BD, no en código
fecha               Date
coordinador         Char(255), blank
servicio            Char(20), blank        <- precarga de Maniobra.tipo_servicio
cliente             Char(255), blank       <- precarga
recoleccion         Char(10), choices propio|tercero, blank
origen              Char(100), blank       <- precarga
destino             Char(100), blank       <- precarga
operador            Char(255), blank       <- precarga
cita                DateTime, null
salida_puerto       DateTime, null
inicio_pactado      DateTime, null         <- precarga de Maniobra.ruta_inicio
salida_real         DateTime, null

unidad              Char(100), blank       <- precarga
remolque_1          Char(255), blank       <- precarga
remolque_2          Char(255), blank       <- precarga
km_inicial          PositiveInteger, null
km_final            PositiveInteger, null
llegada_cliente     DateTime, null
descarga            DateTime, null

litros_aceite       Decimal(10,2), null
precio_aceite       Decimal(10,2), null
reparacion          Boolean, null          <- tres estados: Sí / No / sin contestar
reparacion_que      Char(255), blank
reparacion_costo    Decimal(10,2), null
rescate             Boolean, null
rescate_unidad      Char(100), blank
rescate_operador    Char(255), blank

llegada_manzanillo  DateTime, null         <- precarga de Maniobra.ruta_fin
maniobra_vacio      Boolean, null
patio_entrega       Char(100), blank
cita_vacio          DateTime, null
unidad_vacio        Char(100), blank
operador_vacio      Char(255), blank
estadias            Boolean, null
estadias_horas      PositiveSmallInteger, null

comentarios         Text, blank
creado_en / actualizado_en
```

Los Sí/No van como `BooleanField(null=True)` y no `BooleanField(default=False)`: "todavía no
contestado" no es "No", y en un formato que se llena por etapas esa diferencia importa.

### Los Sí/No en la pantalla: un botón, y el tercer estado sale gratis

Se capturan con un **botón de dos opciones**, no con casillas. No hace falta componente nuevo:
`VacioStatusSelector` ya acepta su juego de opciones por prop, y `VaciosPage` ya lo reusa así para
el Sí/No de REPROGRAMADO (`REPROGRAMADO_OPCIONES`). Aquí se le pasa un `SI_NO_OPCIONES` compartido.

El componente manda `""` al reelegir la opción que ya estaba puesta (`VacioStatusSelector.jsx:86`),
o sea que **deseleccionar es gratis** y da justo el tercer estado que necesita el papel:

```
"si" -> true      "no" -> false      ""  -> null   (sin contestar)
```

En Vacíos ese `""` se colapsa a `false` (`aBooleano`) porque la columna es `NOT NULL`. Aquí **no**
se colapsa: `null` es lo que deja el `SI / NO` impreso intacto en el Excel para rodearlo a mano.

`RECOLECCIÓN EN PUERTO` (Propio / Tercero) es el mismo widget con otras dos etiquetas.

### `CargaCombustible` — los 5 renglones de EN TRAYECTO

```
reporte        FK -> ReporteViaje, CASCADE, related_name='cargas'
orden          PositiveSmallInteger        <- 1..5
litros_diesel  Decimal(10,2), null
precio_litro   Decimal(10,2), null
litros_urea    Decimal(10,2), null
total_urea     Decimal(10,2), null
UNIQUE (reporte, orden) · ordering ['orden']
```

Tabla hija y no 20 columnas `litros_diesel_1..5`: el usuario dijo "**de momento** siempre" 5, y
`operador_2` / `remolque_3` / `remolque_4` ya enseñaron adónde lleva numerar columnas. Con la tabla
hija, un sexto renglón es una fila, no una migración.

`total_urea` **se captura**, no se calcula: la plantilla tiene precio por litro para el diésel pero
no para la urea, así que su total no es derivable de lo que hay en el papel.

### Lo que NO se guarda porque se calcula

| Campo del papel | Fórmula | Dónde |
|---|---|---|
| KM TOTALES | `km_final − km_inicial` | serializer, solo lectura |
| TOTAL (por renglón de diésel) | `litros_diesel × precio_litro` | serializer, solo lectura |
| RENDIMIENTO | `km_totales ÷ Σ litros_diesel` | serializer, solo lectura |

> **2026-10-13 (0079):** RENDIMIENTO solo lo ven staff y DIRECTOR GENERAL / DIRECTOR OPERATIVO /
> DIRECTORA COMERCIAL (`ve_rendimiento` en `facturacion.py`; Comercial NO). Para los demás el
> serializer quita el campo, y la casilla `K9` del Excel/PDF sale vacía. El coordinador captura el
> suyo a mano en `rendimiento_diesel`, sin ver el del sistema, para comparar los dos.

Guardar un dato junto a sus operandos es garantizar que algún día se contradigan. `Gasto` guarda
`gastos_totales` calculándolo en `save()`; aquí no hace falta porque nadie consulta el reporte por
esas cifras.

## Mapa de celdas de la plantilla

`REPORTE COORDINADORES.xlsx`, hoja `Table 1`, rango `A1:L25`, 68 combinaciones.
La etiqueta va en una celda y el valor en la siguiente:

| Fila | Etiqueta → celda de valor |
|---|---|
| 2 | FECHA `A2:B2` → **`C2`** · COORDINADOR `E2:F2` → **`G2`** · FOLIO `I2` → **`J2`** |
| 3 | SERVICIO `A3` → **`B3`** · CLIENTE `D3` → **`E3`** · RECOLECCIÓN `G3:H3` → `I3` PROPIO / `K3` TERCERO |
| 4 | ORIGEN `A4` → **`B4`** · DESTINO `D4` → **`E4`** · OPERADOR O TERCERO `G4:H4` → **`I4`** |
| 5 | CITA `A5:C5` → **`D5`** · SALIDA PTO `G5:H5` → **`I5`** |
| 6 | INICIO PACTADA `A6:C6` → **`D6`** · REAL DE SALIDA `G6:H6` → **`I6`** |
| 8 | UNIDAD Y PORTAS `A8:C8` → **`D8`** · KM INICIAL `G8` → **`H8`** · KM TOTALES `I8:J8` → **`K8`** |
| 9 | OPERADOR `A9:C9` → **`D9`** · KM FINAL `G9` → **`H9`** · RENDIMIENTO `I9:J9` → **`K9`** |
| 10 | LLEGADA CON CLIENTE `A10:C10` → **`D10`** · HR DE DESCARGA `G10:H10` → **`I10`** |
| 12–16 | LT DIESEL `A:B` → **`C`** · PRECIO X LITRO `D` → **`E`** · TOTAL `F` → **`G`** · LT UREA `H` → **`I`** · TOTAL `J` → **`K`** |
| 17 | LT ACEITE `A17:B17` → **`C17`** · PRECIO `D17` → **`E17`** · REPARACIÓN? `F17` → `G17` · ¿QUÉ? `H17` → **`I17`** · COSTO `J17` → **`K17`** |
| 18 | RESCATE `A18:B18` → `C18:D18` · UNIDAD RESCATE `E18:F18` → **`G18`** · OPERADOR `I18` → **`J18`** |
| 20 | LLEGADA A MANZANILLO `A20:D20` → **`E20`** · MANIOBRA DE VACÍO `H20:I20` → `J20:L20` |
| 21 | PATIO DE ENTREGA `A21:B21` → **`C21`** · CITA `D21` → **`E21`** · UNIDAD `G21` → **`H21`** · OPERADOR `I21` → **`J21`** |
| 22 | ESTADÍAS `D22` → `E22` SI / `F22` NO · ¿Cuántas? `G22:H22` → **`I22`** |
| 24 | COMENTARIOS (`A23:L23` es el encabezado) → **`A24`** |
| 25 | FIRMA DEL COORDINADOR `A25:E25`, espacio de firma `F25:L25` — se deja **vacío**, se firma en papel |

### Los Sí/No no tienen celda de respuesta

La plantilla imprime `SI / NO` como etiqueta para rodear a mano (reparación `G17`, rescate
`C18:D18`, maniobra de vacío `J20:L20`, estadías en `E22`/`F22`). Regla al generar el documento:
**si el campo tiene respuesta, se sobrescribe la etiqueta con `SI` o `NO`; si está sin contestar, se
deja el `SI / NO` intacto** para que se rodee a mano. Una sola regla, sin celdas nuevas ni tocar el
diseño del formato.

## Lo que ya está construido y se reusa

| Necesidad | Pieza existente |
|---|---|
| Desplegable de coordinadores | `GET /empleados/?cargo=Coordinador` con `CiudadSelector` — ya lo usa `VaciosPage` (`ENDPOINT_COORDINADORES`) |
| Desplegable de patios | `PatioSelector` |
| Botón Sí / No | `VacioStatusSelector` con `opciones={SI_NO_OPCIONES}` — el mismo truco que `REPROGRAMADO_OPCIONES` en `VaciosPage`. Ningún componente nuevo |
| Elegir folio y traerse los datos | `FolioSelector` + `GET /maniobras/folios-recientes/`, que ya devuelve origen, destino, cliente, tipo_servicio, operador, placas, remolques, `ruta_inicio` y `ruta_fin` |
| Fechas con calendario | `react-datepicker`, ya montado en Maniobras |
| Excel → PDF | `_xlsx_a_pdf` (`views.py:93`): openpyxl rellena, LibreOffice headless convierte |
| Tabla nueva `managed=True` | El patrón de `Folio` y `Pendiente` |

El Excel y el PDF son **el mismo trabajo**: se rellena el `.xlsx` y se ofrece descargarlo tal cual o
pasarlo por el convertidor. Es lo que ya hacen las cartas porte.

## Pantallas

**Lista** — entrada nueva en `HOME_MODULES`, junto a Torre de control:

```
+- Reportes de Viaje ------------------------------- [ + Nuevo reporte ] -+
|  Buscar: [ folio, cliente, operador...          ]                       |
+---------+------------+--------------+------------------+--------+-------+
| FOLIO   | FECHA      | COORDINADOR  | CLIENTE / RUTA   | AVANCE |       |
+---------+------------+--------------+------------------+--------+-------+
| F-2279-2| 24/08/2026 | Ali Ramirez  | YAZAKI · MZO>GDL | OOO.   |  ...  |
| R-2280  | 23/08/2026 | Enrique S.   | BOSCH · MZO>QRO  | OOOO   |  ...  |
+---------+------------+--------------+------------------+--------+-------+
   AVANCE = cuáles de los 4 bloques del formato ya tienen algo capturado.
   ... -> Abrir · Descargar Excel · Descargar PDF
```

**Formulario** — mismo orden que el papel, para poder seguirlo con el formato al lado:

```
+- REPORTE DE VIAJE --------------- F-2279-2 ---- [Excel] [PDF] [Guardar] +
| -- IDENTIFICACION ----------------------------------------------------- |
|  FECHA [24/08/2026 v]        COORDINADOR [Ali Ramirez             v]    |
|  SERVICIO  Full (del folio)  CLIENTE  [YAZAKI                      ]    |
|  RECOLECCION EN PUERTO   [ Propio  v ]                                  |
|  ORIGEN [Manzanillo      ]    DESTINO  [Guadalajara               ]     |
|  OPERADOR O TERCERO      [Juan Perez                              ]     |
|  CITA            [24/08 08:00 v]   SALIDA PTO   [24/08 11:30 v]         |
|  INICIO PACTADO  [24/08 12:00 v] (del folio)  SALIDA REAL [24/08 12:45] |
| -- INFORMACION DEL VIAJE ---------------------------------------------- |
|  UNIDAD [93-AF-2K]  PORTAS [R-101] [R-102]      (del folio)             |
|  KM INICIAL [124 500]  KM FINAL [125 380]   KM TOTALES  880  (calc)     |
|  LLEGADA CON CLIENTE [25/08 06:00 v]  DESCARGA [25/08 09:15 v]          |
| -- EN TRAYECTO -------------------------------------------------------- |
|   #  LT DIESEL   PRECIO/LT    TOTAL       LT UREA    TOTAL              |
|   1  [  300  ]   [ 24.80 ]    7 440.00 c  [  20  ]   [ 496.00 ]         |
|   2  [       ]   [       ]         --     [      ]   [        ]         |
|   3  [       ]   [       ]         --     [      ]   [        ]         |
|   4  [       ]   [       ]         --     [      ]   [        ]         |
|   5  [       ]   [       ]         --     [      ]   [        ]         |
|                          RENDIMIENTO  2.93 km/lt  (calc)                |
|  LT ACEITE [    ]  PRECIO [        ]                                    |
|  REPARACION? [ Si v ]  QUE? [banda alternador ]  COSTO [1 200 ]         |
|  RESCATE?    [ No v ]  UNIDAD [        ]  OPERADOR [           ]        |
| -- REGRESO ------------------------------------------------------------ |
|  LLEGADA A MANZANILLO [26/08 18:40 v] (del folio)                       |
|  MANIOBRA DE VACIO?  [ Si v ]                                           |
|  PATIO DE ENTREGA [Patio Norte      v]   CITA [27/08 09:00 v]           |
|  UNIDAD [93-AF-2K]       OPERADOR [Juan Perez                     ]     |
|  ESTADIAS? [ Si v ]   CUANTAS? [ 4 ] hrs   (12 hrs libres)              |
| -- COMENTARIOS -------------------------------------------------------- |
|  [                                                                   ]  |
|  La FIRMA DEL COORDINADOR va en el papel: sale en el PDF como espacio.  |
+-------------------------------------------------------------------------+
```

`(del folio)` = precargado y editable. `(calc)` = calculado, ni se captura ni se guarda.

## Fases

| Fase | Qué | Cómo se verifica |
|---|---|---|
| **1** — Backend | Los dos modelos, migración, serializers (calculados de solo lectura, `cargas` anidadas), `ViewSet` sin candado de rol, ruta `/reportes-viaje/` | `api/test_reporte_viaje.py`: un reporte por folio (el segundo se rechaza con mensaje bajo `detail`), los tres estados de los Sí/No, los tres calculados, y las 5 cargas escribiéndose en un solo PATCH |
| **2** — Captura | `ReporteViajePage` (lista + formulario), entrada en `HOME_MODULES`, ruta en `App.jsx`, precarga desde `FolioSelector` | `npm run build` + prueba en `.mjs` de la regla de precarga y de los calculados |
| **3** — Salida | Endpoint de descarga que rellena `REPORTE COORDINADORES.xlsx` y, con `?formato=pdf`, lo pasa por `_xlsx_a_pdf`. Botones Excel y PDF en la lista y en el formulario | Descarga real de un reporte lleno, comparada contra el papel |

Las fases 1 y 2 no dependen de la 3: se puede estar capturando antes de que la descarga exista.

## Riesgos y trampas conocidas

- **El `.xlsx` conserva su logo solo si openpyxl no lo pierde al guardar.** Ya hay una nota sobre
  esto en `views.py:45` para las cartas porte. Aplica igual aquí.
- **LibreOffice headless** es la única pieza del PDF que depende del entorno del contenedor. Si el
  PDF falla en producción y el Excel no, mirar ahí primero.
- **El desplegable de coordinadores filtra por `cargo__iexact`**, y `empleados` es `managed=False`
  con el cargo escrito a mano. Un empleado dado de alta como "coordinadora" o "Coord." no saldrá.
  No es un fallo del reporte: es el mismo comportamiento que ya tiene Vacíos.
- **`FolioSelector` trae las 30 maniobras más recientes.** Aceptado por el usuario: los reportes se
  llenan con una semana de margen. Si algún día hace falta capturar un viaje viejo, el arreglo es un
  `?folio=` en `folios-recientes`, no rediseñar la pantalla.

## Abierto

- **TOTAL de urea**: se captura porque la plantilla no tiene precio por litro para la urea. Si en la
  práctica se calcula con un precio fijo, decirlo y pasa a derivado.
- **RECOLECCIÓN EN PUERTO** en el papel son dos palabras impresas (`I3` PROPIO, `K3` TERCERO) sin
  celda de respuesta, igual que los Sí/No. Se aplica la misma regla: sobrescribir la que corresponda.
