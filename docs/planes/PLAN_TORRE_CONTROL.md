# PLAN — Torre de control

Fecha: 2026-08-21 · Estado: **✅ desplegado en producción el 2026-08-21.**

| Repo | Commit | Contenido |
|---|---|---|
| backend | `48eb7baa` | Modelo, viewset, ruta `/torre-control/`, migraciones `0045`–`0048` y 19 pruebas |
| frontend | `28e3887` | Pantalla, arrastre táctil y 23 pruebas de lógica pura |

Un solo commit por repo, no dos: `models.py` y `Serializers.py` llevaban cambios de la torre **y**
del color de fila (ver `PLAN_COLOR_DE_FILA.md`), que se desplegaron juntos, y separarlos por archivo
no era posible.

Orden seguido, el de siempre: migraciones `0045`–`0048` contra prod por la vía oficial
(`migrar_prod.sh`) → backend en verde → frontend. 168/168 pruebas del backend y 23/23 de la lógica
del frontend.

**La comprobación que de verdad cerró la migración** no fue el `401` de la API: eso no prueba que una
columna exista, porque la petición se rechaza antes de tocar la base. Fue cargar Maniobras y Vacíos en
producción con el frontend **viejo** ya hablando con el backend **nuevo** — que serializa `color`. Si
la migración no hubiera llegado, esas dos páginas habrían dado `500` en ese momento exacto. Cargaron.

Verificado después del frontend: assets con su MIME correcto y del tamaño del build local, los deep
links `/torre-control`, `/maniobras` y `/vacios` en `200`, `/api/torre-control/` en `401` JSON, un
asset inexistente en `404`, y el ETag rotado de `"76416003"` a `"28960995"` (cachés curadas solas).

Un tablero de ocupación de las unidades propias de FRABA. Una rejilla de un mes, y una bolita
por unidad que está o en el cajón **UNIDADES LIBRES** o pegada a un día del calendario. Una
unidad ocupada **no se libera sola**: se queda donde la dejaron hasta que alguien la mueva.

## Decisiones cerradas con el usuario (2026-08-21)

| Pregunta | Respuesta |
|---|---|
| ¿Qué unidades? | Las de FRABA: catálogo **Tractos** (`GET /tractos/`), campo `no_eco`. Las de terceros (`/unidades-terceros/`) quedan fuera |
| ¿Dónde se guarda la posición? | Backend compartido: todos los usuarios ven la misma torre |
| ¿Cuándo se libera una bolita? | Nunca sola. Solo al arrastrarla de vuelta a UNIDADES LIBRES |
| ¿Forma del calendario? | Rejilla mensual clásica: 7 columnas LUN–DOM, 5 o 6 filas. Las bolitas se apilan dentro del día |
| ¿Cambio de mes? | Automático. Al entrar en septiembre se muestra septiembre |
| ¿Y lo que quedó ocupado en agosto? | Aviso permanente con los No. Eco pendientes y una flecha al mes anterior. Desaparece solo cuando esas bolitas dejan de estar allí |
| ¿Navegación? | Hacia atrás hasta el mes de la bolita ocupada más antigua, ni un mes más |
| ¿Quién puede arrastrar? | Todos los usuarios autenticados. Solo existen los roles `admin` y `standard` |
| ¿Dónde se usa? | PC, tabletas y móviles. El arrastre tiene que funcionar con el dedo |
| ¿Bolitas por unidad? | 1, con el código preparado para 2 |
| ¿Orden del cajón? | No. Eco ascendente de izquierda a derecha. Se pidió al revés al principio (el menor pegado al borde derecho) y se cambió al verlo funcionando el 2026-08-21 |

## Modelo de datos

Tabla `api_torrecontrol`, **`managed = True` con migración** — la convención vigente del repo:
solo las tablas heredadas (`tractos`, `vacios`, `maniobras`, `empleados`) son `managed = False`.
Así la crea `migrate` en local y en producción, y no hay DDL a mano que se olvide en un entorno.

```
tracto  FK → tractos, CASCADE, db_constraint=False
indice  PositiveSmallInteger, por defecto 1
fecha   Date
UNIQUE (tracto, indice)  ·  CHECK (indice entre 1 y 2)
```

`db_constraint=False` en la FK por el mismo motivo que `ManiobraCostoExtra.maniobra`: `api` corre
sin migraciones en la base de test, donde `tractos` (managed=False) no existe, y un constraint
contra ella rompería la creación de la BD de pruebas. El CASCADE del ORM sigue actuando.

**Una fila es una bolita ocupada. Sin fila, la unidad está libre.** No hay columna `ocupada`
que pueda desincronizarse del calendario: colocar o mover es `INSERT`/`UPDATE fecha`, liberar
es `DELETE`. El cajón UNIDADES LIBRES se calcula como los tractos que no tienen fila.

El `UNIQUE (tracto_id, indice)` es la regla "una bolita por unidad" puesta en la base y no en
el código, y de paso acota la tabla a `nº de tractos × 2` filas: nadie puede inflarla. El
`CHECK` ya admite la segunda bolita, así que subir de 1 a 2 no toca el esquema.

Se descarta una columna de auditoría (`actualizado_en`, `movido_por`): nadie la ha pedido y
el aviso de mes anterior se deriva de `fecha`. Se añade cuando alguien pregunte quién movió qué.

### Trampa: los permisos del rol `standard`

El backend enruta las consultas a **dos usuarios de Postgres distintos** según el rol de quien
entra (`RoleBasedRouter` en `api/routers.py`, alias `default` y `standard`). Una tabla nueva nace
sin permisos para el segundo, y su secuencia se crea después del `GRANT ON ALL SEQUENCES` de la
migración 0005, así que aquella concesión tampoco la alcanza. Sin esto, la torre funcionaría con
una cuenta admin y daría `permission denied` a todos los demás — que son justo quienes la usan.

El repo ya tiene resuelto el patrón y **no hace falta SQL a mano**: una migración aparte que
concede los permisos y habilita RLS, como `0038` (costos extra) y `0040` (pendientes). Aquí es
`0046_grant_torrecontrol_to_standard_role`, con las cuatro operaciones —DELETE incluido, porque
en este tablero borrar la fila *es* liberar la unidad— y políticas `USING (true)`, que gatean por
rol y no por dueño de la fila: la torre es un tablero compartido por toda la empresa.

Verificación tras migrar, la misma que se usa en producción:

```sql
SELECT privilege_type FROM information_schema.role_table_grants
 WHERE table_name = 'api_torrecontrol' AND grantee = 'django_standard_role';
```

⚠️ `settings_test` se salta las migraciones de `api`, así que **en la base de pruebas no existen
ni los GRANT ni la RLS** y no hay separación de roles. Las pruebas cubren lógica; los permisos
solo se dan por buenos contra una base real.

## Backend

| Archivo | Cambio |
|---|---|
| `api/models.py` | `class TorreControl` con `managed = True` y la constante `BOLITAS_POR_UNIDAD`, FK a `Tracto` |
| `api/Serializers.py` | Expone `no_eco` de solo lectura (`source='tracto.no_eco'`) para que el frontend no cruce dos listas |
| viewset + urls | `ModelViewSet` con `IsAuthenticated`, registrado como `/torre-control/` igual que el resto de catálogos |
| `api/migrations/` | `0045_torrecontrol` crea la tabla y `0046_grant_torrecontrol_to_standard_role` concede permisos y RLS |
| `api/test_torre_control.py` | 9 pruebas: unicidad como 400 legible, `indice` fuera de rango, mover sin duplicar, liberar y volver a ocupar, `no_eco` en el listado, sin paginar y sin sesión |

`indice` se valida en el servidor contra el máximo permitido y `fecha` la valida ya `DateField`.
La interfaz no es una defensa: cualquiera con la consola del navegador abierta manda lo que quiera.

## Frontend

| Archivo | Contenido |
|---|---|
| `src/pages/TorreControlPage.jsx` + `.css` | La rejilla, el cajón y el aviso |
| `src/hooks/useTorreControl.js` | Carga y escritura, mismo patrón que `useVacios` |
| `src/hooks/useArrastre.js` | Arrastre con pointer events, válido para ratón y para dedo |
| `src/utils/torreControl.mjs` + `.test.mjs` | Lógica pura: orden del cajón y pendientes del mes anterior |
| `src/App.jsx` | Ruta y azulejo en el menú |

**Arrastrar con pointer events, no con el drag & drop de HTML5.** La API nativa de arrastre
(`draggable` + `onDragStart`/`onDrop`) es la más corta, pero **no responde al dedo**, y la torre
se va a usar en tabletas y móviles. Un hook propio, `src/hooks/useArrastre.js`:

- `onPointerDown` en la bolita captura el puntero y guarda `tracto_id:indice`.
- `onPointerMove` mueve una copia flotante siguiendo el dedo o el ratón.
- `onPointerUp` resuelve el destino con `document.elementFromPoint(x, y)` y sube al
  `[data-destino]` más cercano: la fecha en una casilla, `"libres"` en el cajón. El destino lo
  declara el HTML, así que el hook no sabe nada de calendarios ni de bolitas.
- La bolita lleva `touch-action: none` en CSS: sin eso, el navegador se queda el gesto para
  hacer scroll y el arrastre nunca empieza en un móvil.

Un mismo camino para ratón y dedo, sin dependencia nueva. Si el arrastre a mano pelea con el
scroll de la página más de lo previsto, la salida es `@dnd-kit/core`, que trae sensores de
puntero y de toque — pero solo si hace falta, no de entrada.

**La rejilla sin `date-fns`, y sin `Date` sobre textos.** Se planteó usar `date-fns`, que ya es
dependencia, pero las tres líneas que hacen falta —primer día del mes, su día de la semana y
cuántos días tiene— salen con `new Date(anio, mes, dia)`, que es hora local. Lo importante no es
ahorrarse el import: es que **nada parsea "2026-08-21"**. `new Date("2026-08-21")` es medianoche
UTC y en México (UTC-6) se pinta como el día 20. Todo se compara como texto, así que el día que
guarda el backend es el día que se ve. Hay prueba para eso.

**El orden del cajón necesita orden natural, no alfabético.** Los datos reales mezclan
`'NO. 01'` (con espacio) y `'NO.10'` (sin él). Un `sort()` de texto acierta con los 11 tractos
de hoy por pura casualidad —los números van rellenos con cero— y se rompe en cuanto alguien
teclee un `'NO. 12'` sin relleno.

Se valoró uniformar los `no_eco` a `NO.1`, `NO.2`… y confiar en que el orden alfabético bastara.
**No basta: lo empeora.** Sin el cero de relleno, el texto ordena `NO.1, NO.10, NO.11, NO.2`.
Para que el orden alfabético funcione haría falta `NO.01`…`NO.10`, es decir, mantener el relleno
y además tocar datos de producción. `ordenPorNoEco()` extrae el número y ordena numéricamente:
tres líneas que funcionan con cualquiera de los tres formatos y no dependen de que nadie
recuerde una convención. Uniformar el texto queda como cambio cosmético aparte, si se quiere.

Se pinta de izquierda a derecha,
así que el orden del DOM, el visual y el del tabulador son el mismo y no hace falta ningún truco
de dirección en el CSS.

**El aviso se deriva, no se guarda.** `pendientesMesAnterior(bolitas, hoy)` devuelve los No. Eco
con `fecha` en un mes anterior al actual. Si la lista está vacía no hay aviso; si tiene algo,
sale fijo arriba con la flecha al mes correspondiente. Sin endpoint extra, sin estado que
mantener, sin forma de que el aviso se quede pegado cuando ya no toca.

**`BOLITAS_POR_UNIDAD = 1`** en `torreControl.mjs`. Subirla a 2 genera la segunda bolita de cada
unidad; el `CHECK` y el `UNIQUE` de la base ya lo admiten. No hay nada más que tocar.

Escritura optimista con vuelta atrás si el backend falla, avisando con `useAlerta` como el resto
del sistema.

## El límite de la navegación lo marca la bolita más antigua

Con un límite fijo de un mes, una bolita olvidada en julio dejaría de ser alcanzable en
septiembre: no está en UNIDADES LIBRES porque sigue ocupada, y ninguna flecha llega a su mes.
La unidad quedaría bloqueada para siempre, invisible e inmovible.

Por eso el límite no es un número de meses sino un dato: **la flecha atrás llega hasta el mes de
la bolita ocupada más antigua, y ni uno más.** Si no hay nada pendiente, no hay flecha atrás.
Nada que se pueda quedar fuera de alcance, y sin convertirlo en navegación libre. El mismo dato
alimenta el aviso, que mira cualquier mes anterior y no solo el inmediato.

## En pantalla pequeña

Una rejilla de 7 columnas con bolitas apiladas dentro no cabe en un móvil sin encogerla hasta
lo ilegible. La rejilla mantiene un ancho mínimo por columna y la tabla desplaza en horizontal
dentro de su propio contenedor — el mismo recurso que ya usan las tablas del sistema, sin
inventar una vista aparte para móvil. Se revisa con el dispositivo delante antes de dar por
buena la pantalla.

## Lo que no se hace, y cuándo añadirlo

| Descartado | Cuándo añadirlo |
|---|---|
| Librería de drag & drop (`@dnd-kit/core`) | Si el arrastre a mano con pointer events pelea con el scroll más de lo previsto, o si hace falta reordenar bolitas dentro de un mismo día |
| Uniformar los `no_eco` en producción | Nunca por el orden: `ordenPorNoEco()` ya lo resuelve. Solo si se quiere por estética, y entonces con relleno de cero |
| Histórico de movimientos | Cuando alguien pregunte quién movió una bolita |
| Refresco entre usuarios | Si molesta que dos personas con la torre abierta no se vean entre sí. El patrón ya existe: el panel de SEGUIMIENTOS sondea cada minuto |
| Filtros y búsqueda | Con 11 unidades caben todas de un vistazo |

## Orden de despliegue

El de siempre, y los dos saltos ya han fallado antes:

1. **Migrar la base de producción**: `0045_torrecontrol` (crea la tabla) y `0046_grant_torrecontrol_to_standard_role` (permisos y RLS). Por la vía oficial de siempre: cortafuegos temporal, `migrate` en local contra prod, cerrar el cortafuegos. Lo corre el usuario. Nada de SQL a mano — la tabla la crea la migración, y crearla antes haría fallar la 0045.
2. **Backend** a `backend/api`, esperar el CI en verde. Presupuestar que el gate de `pip-audit` puede tumbar el despliegue por CVE nuevas sin relación con este cambio.
3. **Frontend** a `feature/inicio-botones`, que publica en producción sin PR ni staging.

Antes de todo eso, la funcionalidad entera probada en local contra la base local.

## Comprobación

```
node --test src/utils/torreControl.test.mjs
```

- `ordenPorNoEco(['NO.10','NO. 2','NO. 12'])` sale como 2, 10, 12 y no en orden alfabético. Mismo resultado con `['NO.10','NO.2','NO.12']`, sin espacios, que es donde el orden de texto falla.
- `pendientesMesAnterior` detecta la bolita de agosto vista desde septiembre, y no señala la de septiembre.
- `mesMinimoNavegable` devuelve el mes de la bolita más antigua, y el mes actual cuando no hay ninguna ocupada.

El arrastre en sí no lleva prueba automática: es interacción de navegador y se comprueba a mano,
con ratón y con dedo, en un móvil de verdad.

En el backend, `api/test_torre_control.py` cubre la unicidad y que un usuario `standard` pueda escribir.

---

# Segunda entrega — el folio como vínculo con Maniobras

Fecha: 2026-08-21 · Estado: **hecho y probado en local, SIN desplegar.**
Commits `84a53889` (backend) y `090c012` (frontend). Migraciones `0049` y `0050` pendientes de prod.

La torre pasó de "una bolita por unidad en un día" a **dos bolitas —verde la salida, roja el
regreso— y un folio por unidad** que trae la información del viaje.

## Cómo saber el rango y el servicio: tres caminos, dos descartados

La pregunta era de qué día a qué día está ocupada cada unidad y qué servicio lleva. Se
construyeron y se probaron las tres opciones antes de elegir.

**A — La torre se pinta sola desde Maniobras.** Cruzando `Maniobra.unidad` (que guarda las placas)
con el catálogo, y pintando de `ruta_inicio` a `ruta_fin`. Cero captura doble, cero columnas
nuevas, imposible que la torre contradiga a Maniobras. **Descartada:** apuesta todo el tablero a
que esas dos columnas se llenen, y hoy están vacías en las 409 maniobras de la base local. Además
no cabe lo que no es un viaje —taller, mantenimiento— y una maniobra sin `ruta_fin` deja la unidad
ocupada para siempre.

**B — La bolita gana un `fecha_fin` y se estira arrastrando su borde.** El servicio se deducía
cruzando placas y solape de fechas. **Descartada por el usuario tras probarla.**

**C — El folio, que es la elegida.** El vínculo lo pone una persona eligiendo un folio de una
lista, y de ahí sale todo lo demás. Funciona hoy porque el folio **ya se captura siempre**, al
contrario que las fechas de ruta. Y no renuncia al tablero manual: las bolitas se siguen moviendo
a mano para lo que no es un viaje.

⚠️ Lo que esto significa: **`ruta_inicio` y `ruta_fin` se quedan por fines operativos, pero la
torre NO decide nada con ellas.** Solo las usa para acomodar las bolitas al asignar un folio.

## Decisiones

**El folio bloquea.** `api_torrefolio` es un OneToOne con Tracto y su `folio` es `unique`: un Eco
lleva un folio a la vez y un folio no puede estar en dos Ecos. Las dos reglas viven en la base, no
en el código, así que dos peticiones simultáneas no pueden colarse. El error dice **qué unidad** lo
tiene — "ya está asignado" a secas obliga a ir a buscarlo.

**La torre no copia nada de la maniobra.** Ruta, cliente y operador se leen del folio en cada
carga. Editar la maniobra se refleja en la torre sin sincronizar nada, y no hay una segunda copia
que se quede vieja. Hay una prueba que lo fija.

**Reasignar es una sola petición.** Un "borra y crea" desde el frontend deja un instante en el que
la unidad no tiene folio y otro usuario podría llevarse el suyo.

**Acomodar no es fijar.** Al asignar un folio con fechas de ruta, la verde va a `ruta_inicio` y la
roja a `ruta_fin`. Después se mueven libremente y nada las devuelve a su sitio. Sin fechas, no se
toca ninguna bolita.

**El filtro de folios va antes del corte, no después.** `folios-recientes` acepta `?placas=` y
acota a los folios de esa unidad. Si se filtrara después del corte a 30, una unidad que llevara
días sin salir se quedaría sin ningún folio que ofrecer. En un Full, cada unidad ve solo el suyo:
si se colara el del otro operador, se le asignaría el viaje equivocado.

**Se reutilizó `FolioSelector`, no se copió.** Es el mismo componente de las cartas porte, con un
parámetro `placas` **opcional**. Sin él se comporta igual que siempre — eso es lo que protege a los
documentos que ya dependen de él, y hay prueba de ello.

## Contraste al pintar (afecta también a Maniobras y Vacíos)

`textoSobre()` elegía la tinta con un umbral fijo de luminancia (0.4) y erraba en los tonos medios
de la paleta: en `#6d9eeb`, `#93c47d` o `#f6b26b` ponía blanco cuando la tinta oscura contrasta
casi el doble. Ahora compara los dos contrastes WCAG y gana el mayor — sin umbral que ajustar. Una
prueba recorre los 80 colores y comprueba que en ninguno se eligió el peor. Las filas pintadas van
además en semibold. **Solo en `.row-pintada`:** los colores de status no cambian.

## Pendiente

1. **Desplegar.** Migrar prod (`0049`, `0050`) → backend → frontend. Nada de esto está en producción.
2. **`torre_control` guarda bolitas de la versión de un solo color.** Al subir `BOLITAS_POR_UNIDAD` a
   2, las filas existentes con `indice = 1` pasan a ser bolitas verdes. Es lo correcto, pero conviene
   saberlo antes de mirar producción y preguntarse por qué solo hay verdes.
3. **La trampa que sigue viva:** el folio es texto. Renombrar un folio en su tabla no arrastra la
   asignación de la torre, que se quedaría apuntando a un código que ya no existe y mostraría la
   unidad sin servicio. `FolioViewSet.perform_update` ya arrastra el renombrado a la maniobra; la
   torre no está contemplada ahí.
