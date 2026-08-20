# PLAN — Carga editable, Remolque 2 libre y segundo operador

Fecha: 2026-08-19 · Estado: **bloque 1 hecho** (sin desplegar), bloques 2 y 3 pendientes.

| Bloque | Contenido | Estado |
|---|---|---|
| 1 | Remolque 2 libre, carga editable, `(editable)` fuera, aviso de la diagonal, conteo del PDF | **Hecho y probado en local.** Sin desplegar |
| 2 | Migración `0035` + backend del segundo operador | **Hecho y probado en local**, 111/111 pruebas |
| 3 | Frontend del segundo operador | **Hecho y probado en local**, build en verde y 23/23 en `dobleValor.test.mjs` |

## ✅ Desplegado en producción el 2026-08-19

Orden seguido: migración `0035` contra prod → backend → frontend.

| Repo | Commit | Contenido |
|---|---|---|
| backend | `e64d14ce` | Segundo operador, migración `0035`, unicidad de `folio_2`, `folios-recientes` por folio, conteo del PDF |
| backend | `a3cfcd14` | Django 6.0.8 y sqlparse 0.6.0 (gate de dependencias) |
| frontend | `1d874d5` | Carga editable, Remolque 2 libre, columnas del operador 2, desplegable de contenedores |

Migración aplicada por la vía oficial (cortafuegos temporal + `migrate` en local contra prod);
`showmigrations` confirmó que solo faltaba la `0035`, y el cortafuegos quedó cerrado después.
SPA `200` · `/api/maniobras/` `401`. Los tres jobs del backend y el del frontend, en verde.

**El primer push del backend (`e64d14ce`) falló y NO desplegó.** No fue el código —`manage.py check`
y las 111 pruebas pasaron— sino el gate de dependencias: `pip-audit` encontró PYSEC-2026-3717 en
Django 6.0.7 y PYSEC-2026-3696/97/98/99 en sqlparse 0.5.5, publicados después del despliegue del
2026-08-14. Como las dos tenían versión de arreglo se subió versión, que es lo que dicta el
comentario del propio workflow (las excepciones `--ignore-vuln` son solo para avisos sin arreglo).
Producción quedó intacta durante el fallo: el despliegue ni empezó, y la migración ya aplicada solo
añade columnas nullable que el backend anterior ignora.

Verificado en producción por el usuario.

## Entregas posteriores del mismo día

| Repo | Commit | Contenido |
|---|---|---|
| backend | `778e1799` | `ccp_2` + migración `0036`, CCP emparejado a cada folio, endpoint `/maniobras/resumen-status/`, `filtro_status()` compartido, 5 pruebas |
| frontend | `f3161e5` | Columna CCP 2, panel SEGUIMIENTOS y alertas de vencimiento movidas a la columna derecha |
| frontend | `38342cd` | El panel se refresca solo cada minuto |

Refresco verificado en producción con 8 comprobaciones: intervalo de ~60 s, los números cambian
solos en una segunda ventana, no consulta con la pestaña en segundo plano, el remontaje al navegar
actualiza al instante, el aviso de error se limpia al recuperar la red, el temporizador se corta al
salir de la pantalla, y los conteos cuadran con la tabla incluyendo un estado combinado.

El panel cuenta con `filtro_status()`, la misma regla que usa el filtro de la tabla, para que un
combo `"por_salir,activo"` cuente como activo en los dos sitios. Existe como endpoint y no como
conteo en el cliente porque `PAGE_SIZE` es global (60) y `page_size` no es configurable.

Al mover las alertas dentro de `.home-head` se les colaron los colores de la cabecera: `.home-head
h1`/`p` eran selectores de descendiente y pasaron a hijos directos (`>`). Vale la pena recordarlo
antes de mover cualquier otra cosa ahí dentro.

**Fallo encontrado y corregido en la prueba local (2026-08-19):** el folio del segundo operador
salía sin carga. El backend repartía leyendo `tipo_2/peso_2/contenedor_2` en crudo, pero un
registro anterior a la 0035 los tiene vacíos (los dos contenedores viven en la primera columna).
Arreglado mandando la carga en crudo más un campo `parte` y dejando el reparto a `cargaDeParte()`
en el frontend, que sí entiende los dos formatos. Regresión fijada en `dobleValor.test.mjs`.

Pruebas automáticas añadidas: `api/test_folios.py` (5 casos de `folio_2`: unicidad entre las dos
columnas, choque en PATCH parcial y desaparición de la lista de libres) y
`src/utils/dobleValor.test.mjs` (`leerPar`, `cargaDeParte`, `tieneDosContenedores` — incluida la
garantía de que "Los dos" reconstruye el registro viejo carácter por carácter).

## Contexto

Tres necesidades que llegaron encadenadas y acabaron siendo una sola:

1. La información que se autollena en los documentos de viaje desde el folio debe poder
   **modificarse** — en concreto la sección **Carga** de `CTA PORT FRABA CONTAINER`.
2. El botón del **segundo remolque** no debe bloquearse aunque el servicio sea sencillo,
   ni en los documentos ni en Maniobras. Cambio de requisitos del negocio.
3. Un servicio **Full** puede repartirse entre **dos operadores**: cada uno se lleva un
   contenedor, con su propio tracto y sus propios remolques. El sistema tiene que
   **guardar** qué operador se llevó qué contenedor, pensando en los módulos futuros de
   **facturación y nóminas**.

La (3) es la que manda: convierte lo que iba a ser una elección del documento en **dato
persistente de la maniobra**.

---

## Decisión de diseño (por qué SÍ se toca el esquema esta vez)

El plan de folios en Maniobras evitó la migración a propósito (ver
`PLAN_FOLIOS_MANIOBRAS.md`): allí el estado *"folio usado"* era **derivable** de un campo
que ya existía. Aquí no hay nada de lo que derivar quién se llevó qué contenedor: hoy la
maniobra tiene **un solo juego de asignación** (`asignacion_operador_status`, `unidad`,
`remolque`, `remolque_2`) y la carga vive en **una** columna de texto con los dos valores
dentro (`"WHLU5591210 / WHSU6575360"`).

Guardar el reparto por posición dentro de esa cadena funcionaría para imprimir el PDF,
pero facturación y nóminas tendrían que partir cadenas en SQL, con separadores mezclados
(`-` y `/` según la época del registro). Se descarta: **columnas propias por operador**.

### Decisiones confirmadas por el usuario

- **Columnas nuevas**: `operador_2`, `unidad_2`, `folio_2`, `remolque_3`, `remolque_4`,
  `contenedor_2`, `tipo_2`, `peso_2`. La unidad 2 tiene *sus* dos remolques; el operador 1
  conserva Remolque 1 y 2.
- **Emparejamiento posicional y fijo**: folio 1 → operador 1 → contenedor 1 (con unidad y
  remolques 1-2); folio 2 → operador 2 → contenedor 2 (con unidad 2 y remolques 3-4).
- **Histórico intacto**: sin backfill. Los Full ya existentes siguen con los dos valores en
  una sola columna y sus documentos salen exactamente igual que hoy. Conviven los dos
  formatos, igual que ya conviven los registros con y sin `tipo_servicio`.
- **En la tabla de Maniobras la carga se sigue viendo como una celda de dos huecos**
  (mismo aspecto de hoy); lo que cambia es que cada hueco guarda en su propia columna.
- **Visibilidad**: `Folio 2`, `Unidad 2`, `Remolque 3` y `Remolque 4` solo aparecen cuando
  hay operador 2. `Tipo 2`, `Peso 2` y `Contenedor 2` **siempre visibles en Full**: la
  carga del segundo contenedor se registra cuando se conoce, aunque el operador se asigne
  después.
- **Desplegable 1 / 2 / Los dos en el modal**: solo cuando la maniobra tiene **un** operador,
  por defecto *Los dos* (lo que hace el sistema hoy). Con dos operadores manda el folio y
  no hay desplegable — así el documento nunca puede contradecir lo guardado.
- **TIPO editable como texto libre**, con aviso si falta la diagonal.
- Alcance del **remolque 2 libre**: los 4 sitios (CTA Port Fraba, Maniobras, CTA Porte
  Terceros, Bitácoras de Sueño y Gastos).
- Alcance de la **carga editable**: los dos modales de Carta Porte.

### Consecuencia obligatoria: la unicidad de folios

Hoy *"folio ocupado"* **no es una columna**: se deriva mirando `maniobras.folio` en dos
sitios. Los dos miran **solo** esa columna. Si se añade `folio_2` sin ampliarlos, un folio
puesto como folio 2 seguiría ofreciéndose como libre y acabaría el mismo folio en dos
maniobras — en documentos fiscales. **No es opcional, va en el mismo cambio.**

---

## Esquema — migración `0035`

Ocho columnas `varchar` nullable en `maniobras`. Patrón calcado de la
`0034_maniobra_saca_gasto_unidad.py`:

```python
migrations.SeparateDatabaseAndState(
    state_operations=[ ... AddField x8 ... ],          # solo estado de Django
    database_operations=[
        migrations.RunSQL(
            sql="ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS operador_2 varchar(100);",
            reverse_sql="ALTER TABLE maniobras DROP COLUMN IF EXISTS operador_2;",
        ),
        # ... idem para unidad_2, folio_2, remolque_3, remolque_4,
        #     contenedor_2 varchar(255), tipo_2 varchar(100), peso_2 varchar(50)
    ],
)
```

- `maniobras` es `managed = False`: un `AddField` **no** genera DDL, por eso el `RunSQL`.
- `ADD COLUMN` nullable sin default es **metadata-only** en Postgres: no reescribe la
  tabla, no bloquea.
- `IF NOT EXISTS` / `IF EXISTS` lo hacen idempotente y reversible.
- **Sin GRANT adicional**: los permisos de `django_standard_role` sobre `maniobras` son a
  nivel de tabla desde la `0005`, así que las columnas nuevas quedan cubiertas solas.
- Se aplica contra producción por la vía oficial (firewall temporal + `migrate` en local
  apuntando a prod). **Lo lanza el usuario**, no el asistente.

---

## Backend — `C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras\api`

### 1. `models.py` → `Maniobra`

Los 8 `CharField(null=True, blank=True)` junto a los existentes, con comentario de por qué
`contenedor_2`/`tipo_2`/`peso_2` no son un backfill del formato viejo.

### 2. `serializers.py` → `ManiobraSerializer` (línea ~64)

**Cero cambios en `Meta`.** Usa `exclude = ('cliente_fk',)`, así que los campos nuevos se
exponen automáticamente.

**Sí cambia `validate()` (línea ~103).** Hoy:

```python
folio = (data.get('folio') or '').strip()
if folio and (self.instance is None or (self.instance.folio or '') != folio):
    otras = Maniobra.objects.filter(folio=folio)
```

Pasa a comprobar los dos folios contra las dos columnas de todas las maniobras
(`Q(folio=x) | Q(folio_2=x)`), y además que `folio` y `folio_2` **de la misma fila** no
coincidan. Se mantiene la regla de solo comprobar cuando el folio CAMBIA: los registros
viejos de la época del texto libre pueden venir duplicados y editarles otra cosa no debe
fallar por eso. El error sigue bajo la clave `detail`, que es la única que lee el
`apiClient`.

### 3. `views.py` → `FolioViewSet.disponibles` (línea ~998)

`usados` se construye hoy solo con `folio`:

```python
usados = (Maniobra.objects.exclude(folio__isnull=True).exclude(folio='')
          .values_list('folio', flat=True))
```

Tiene que incluir también `folio_2`. Sin esto el desplegable ofrece folios ya puestos.

### 4. `views.py` → `folios_recientes` (línea ~561)

El cambio de más enjundia. Hoy devuelve **una fila por maniobra** con `folio` no vacío,
mapeando `operador ← asignacion_operador_status`, `placas ← unidad`,
`remolque_1 ← remolque`, `remolque_2`, más `tipo_unidad`/`anio` buscados en `tractos` por
las placas.

Pasa a devolver **una fila por folio**:

| fila | operador | placas | remolques | carga |
|---|---|---|---|---|
| `folio` | `asignacion_operador_status` | `unidad` | `remolque`, `remolque_2` | `tipo`, `peso`, `contenedor` |
| `folio_2` | `operador_2` | `unidad_2` | `remolque_3`, `remolque_4` | `tipo_2`, `peso_2`, `contenedor_2` |

El mapa `placas → tracto` que ya existe para evitar N consultas debe cubrir también
`unidad_2` (Tipo de Unidad y Modelo los usa la Bitácora de Sueño). Los registros viejos,
que no tienen `folio_2`, siguen produciendo una sola fila: comportamiento idéntico.

### 5. `views.py` → `_generar_pdf_cta_port`, conteo de contenedores (línea ~343)

Hoy el número y la palabra salen de la **etiqueta del servicio**, no de la carga:

```python
cantidad_label = 2 if es_full else 1
tipo_label     = 'CONTENEDORES' if es_full else 'CONTENEDOR'
```

Tres líneas más abajo ya se parsea el tipo en cuatro piezas
(`numero_1, numero_2, letra_1, letra_2`) y la segunda fila solo se imprime si hay segundo
par. El conteo pasa a mirar lo mismo que se imprime: **si el tipo llega con un solo par,
es `1 CONTENEDOR`**.

**Acotado a cuando `tipo_servicio` llega explícito como `'full'`.** Los registros
anteriores a ese campo entran en `es_full` por la heurística del contenedor largo; si se
les cambia la regla, documentos que hoy salen con `2 CONTENEDORES` empezarían a salir con
`1`. Acotándolo, el histórico queda intacto.

**El resto de `_generar_pdf_cta_port` no se toca**: ya escribe `tipo`, `peso` y
`contenedor` tal como llegan, y `_concat_placas_remolques` (línea ~168) ya concatena los
remolques que vengan, sin mirar el tipo de servicio.

---

## Frontend — `C:\Users\PC\Downloads\PRACTICAS\front\ControlDeManiobras`

### 6. Remolque 2 sin bloqueo (5 líneas, independiente de todo lo demás)

| Archivo | Líneas | Cambio |
|---|---|---|
| `CtaPortModal.jsx` | 89, 112, 416 | Fuera `remolque2Habilitado`; `disabled={false}`; en `handleFolio` copiar siempre `maniobra.remolque_2` (hoy lo borra si no es Full) |
| `ManiobrasPage.jsx` | 498, 701, 925 | Quitar `!esFull` / `(col.isRemolque2 && !esFull)`; queda solo `isSubmitting` |
| `CtaPorteTercerosModal.jsx` | equivalentes | Idem |
| `BitacoraGastosModal.jsx` | 73, 97, 314 | Idem |
| `BitacoraSuenoModal.jsx` | 121, 264, **268** | Idem + borrar el texto *"Remolque 2 disponible solo para viajes con tipo de servicio Full"* |

**No se toca** el resto de la lógica `esFull`: TIPO DE CARGA y los dobles de Peso y
Contenedor siguen igual, y `aplicarCambioTipoServicio` nunca tocó `remolque_2`.

### 7. Carga editable — `CtaPortModal.jsx:319-343` y `CtaPorteTercerosModal.jsx:320-343`

- Quitar `readOnly` y la clase `cpm-input--readonly` de los **cinco** campos (Tipo, Peso,
  Contenedor, Referencia, Pedimento) y añadirles `onChange` — `cambiarCampo` ya existe.
- Título de sección `Carga (auto desde folio)` → `Carga`; placeholder `—` → `Auto desde folio`.
- Actualizar los comentarios que dicen *"solo lectura"* (líneas 39 y 320), que quedarían
  mintiendo.
- **Aviso de la diagonal**: si el campo Tipo tiene texto y no contiene `/`, advertencia
  bajo el input. `_parsear_tipo` devuelve las cuatro piezas vacías sin error cuando falta
  la diagonal, así que sin aviso el PDF sale con esa línea en blanco y nadie se entera.
  **Advierte, no bloquea** el botón Generar.

### 8. Borrar `(editable)` de las etiquetas — 7 sitios

`CtaPortModal.jsx:246,275,285` · `CtaPorteTercerosModal.jsx:247,276,286` ·
`BitacoraGastosModal.jsx:270`.

### 9. Maniobras — columnas del segundo operador

- `COLUMNAS` y `MANIOBRA_VACIA` (`ManiobrasPage.jsx:~230-270`): las entradas nuevas. Los
  renderizadores ya son genéricos (`isOperador`, `isPlacas`, `isRemolque`, `isFolio`), así
  que no hay lógica nueva por columna.
- Visibilidad condicionada al operador 2 para Folio 2, Unidad 2, Remolque 3 y 4.

### 10. Maniobras — el editor de dos huecos (**el punto caliente**)

`DobleInput` (`:189`) y `TipoFullInput` (`:168`) escriben hoy `"A - B"` en **una** columna,
apoyándose en `partirDoble`/`unirDoble` (`utils/dobleValor.mjs`) y en
`partirTipoFull`/`unirTipoFull` (dentro de `ManiobrasPage.jsx`). Pasan a escribir cada
hueco en **su** columna, manteniendo el mismo aspecto en pantalla.

Los usan **tres** caminos: la fila nueva (`:520`), el modal de edición (`:725`) y la
edición en línea de ~2000 filas (`:948`). Es el cambio con más riesgo del plan.

Además:
- `aplicarCambioTipoServicio` (`:123`): al salir de Full ahora **vacía** las columnas `_2`
  en vez de truncar cadenas.
- **Lectura del formato viejo**: si `contenedor_2` viene vacío y `contenedor` trae dos
  valores, es un registro anterior — se sigue partiendo la cadena como hoy.

### 11. Modales — selección por folio

Al elegir folio viene su mitad ya resuelta (operador, placas, remolques y carga). Como cada
operador tiene su folio, **el `FolioSelector` es de facto el selector de operador**: la
lista mostrará `F-2280 · OPERADOR 1` y `F-2281 · OPERADOR 2`.

El desplegable 1 / 2 / Los dos solo cuando la maniobra tiene un operador, por defecto
*Los dos*. Cuando se eligen los dos, el frontend recompone la cadena combinada antes de
mandarla, para que el backend imprima ambos.

---

## Riesgos

1. **El editor de dos huecos** (punto 10). Mitigación: función pura de lectura/escritura
   probada con `node --test` antes de enchufarla, siguiendo el patrón que ya existe en
   `utils/dobleValor.mjs` y `utils/sumarPeso.mjs`.
2. **Convivencia de formatos**. Sin backfill, cada sitio que lea la carga entiende los dos.
   Es la misma deuda que ya existe con los registros sin `tipo_servicio`, pero suma.
3. **Dos despliegues a producción**, y ambos publican al hacer push (sin staging ni PR):
   primero backend con la migración ya aplicada, después frontend. En ese orden — el
   frontend nuevo pide campos que el backend debe estar sirviendo ya.

---

## Orden de ejecución

1. **Bloque sin esquema** (puntos 5, 6, 7, 8): remolque 2 libre, carga editable,
   `(editable)` fuera, aviso de la diagonal, conteo del PDF. Desplegable y usable de
   inmediato, sin depender de la migración.
2. **Migración `0035` + backend** (puntos 1-4).
3. **Frontend del segundo operador** (puntos 9-11).

## Verificación

- `npm run build` en el frontend antes de cada push.
- Un Full con dos contenedores y **un** operador: elegir *contenedor 1* → el PDF dice
  `1 CONTENEDOR` y una sola fila de medida.
- El mismo Full sin tocar el desplegable → `2 CONTENEDORES`, idéntico a hoy.
- Un registro **viejo** (sin `tipo_servicio`) → documento byte a byte igual que antes.
- Poner un folio en `folio_2` y comprobar que **deja de ofrecerse** en el desplegable de
  otra maniobra y que el serializer lo rechaza.
- Servicio **sencillo**: el botón de Remolque 2 se puede usar y el remolque sale en el PDF
  (celda `F23`, vía `_concat_placas_remolques`).

## Supuestos pendientes de confirmar

Quedaron sin respuesta explícita y se resolvieron por defecto:

- El aviso de la diagonal **advierte pero no bloquea** el botón Generar.
- **Pedimento y Referencia también editables**, no solo Tipo, Peso y Contenedor.
- El peso de la **Bitácora de Gastos sigue automático** (suma de folios empatados) como hoy.
- **CTA Porte Terceros** recibe la carga editable pero no se marcó para la selección de
  operador. Con la selección por folio la asimetría se diluye: si su `FolioSelector` usa el
  mismo endpoint, verá también las filas de folio 2.
