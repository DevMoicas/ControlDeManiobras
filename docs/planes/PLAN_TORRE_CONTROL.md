# PLAN — Torre de control

Fecha: 2026-08-21 · Estado: **sin empezar**. Especificación cerrada con el usuario; nada escrito todavía.

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
| ¿Orden del cajón? | No. Eco ascendente, el menor pegado al borde derecho |

## Modelo de datos

```sql
CREATE TABLE torre_control (
    id        SERIAL   PRIMARY KEY,
    tracto_id INTEGER  NOT NULL REFERENCES tractos(id) ON DELETE CASCADE,
    indice    SMALLINT NOT NULL DEFAULT 1 CHECK (indice BETWEEN 1 AND 2),
    fecha     DATE     NOT NULL,
    UNIQUE (tracto_id, indice)
);
```

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
entra (`RoleBasedRouter` en `api/routers.py`, alias `default` y `standard`, credenciales en
`DB_ADMIN_USER` y `DB_STANDARD_USER`). Una tabla nueva nace sin permisos para el segundo:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON torre_control TO <DB_STANDARD_USER>;
GRANT USAGE, SELECT ON SEQUENCE torre_control_id_seq TO <DB_STANDARD_USER>;
```

Sin esto la torre funciona con una cuenta admin y falla con `permission denied for table
torre_control` para todos los demás — que son justo los que la van a usar. No hay ningún
`GRANT` versionado en el repo: los permisos se aplicaron a mano en producción, así que este
paso es manual y fácil de olvidar.

**Pendiente de comprobar antes de escribir el SQL:** si las tablas existentes tienen RLS
activo (`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('tractos','vacios')`),
hay que decidir si `torre_control` replica el criterio o queda fuera a propósito.

## Backend

| Archivo | Cambio |
|---|---|
| `api/models.py` | `class TorreControl` con `managed = False`, `db_table = 'torre_control'`, FK a `Tracto` |
| `api/Serializers.py` | Expone `no_eco` de solo lectura (`source='tracto.no_eco'`) para que el frontend no cruce dos listas |
| viewset + urls | `ModelViewSet` con `IsAuthenticated`, registrado como `/torre-control/` igual que el resto de catálogos |
| `api/test_torre_control.py` | Un segundo POST del mismo `(tracto, indice)` devuelve 400 sin crear fila; un usuario `standard` puede mover |

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
- `onPointerUp` resuelve el destino con `document.elementFromPoint(x, y)` y busca el
  `data-fecha` de la casilla que haya debajo.
- La bolita lleva `touch-action: none` en CSS: sin eso, el navegador se queda el gesto para
  hacer scroll y el arrastre nunca empieza en un móvil.

Un mismo camino para ratón y dedo, sin dependencia nueva. Si el arrastre a mano pelea con el
scroll de la página más de lo previsto, la salida es `@dnd-kit/core`, que trae sensores de
puntero y de toque — pero solo si hace falta, no de entrada.

**La rejilla con `date-fns`**, que ya es dependencia: `startOfMonth`, `endOfMonth`,
`eachDayOfInterval`, `getDay` y el locale `es`. Nada de calcular días a mano.

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

El pintado de derecha a izquierda
se hace con `flex-direction: row-reverse`, que deja el DOM en orden ascendente —correcto para
lector de pantalla y tabulador— y coloca el menor a la derecha.

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

1. **SQL contra la base de producción**: `CREATE TABLE`, los dos `GRANT` y la comprobación de RLS. Lo corre el usuario.
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
