# PLAN — Lotes de folios hacia atrás

> Implementado el 2026-08-10. Pendiente: desplegar y pulsar el botón una vez en
> Manzanillo para dejar cargado `F-2265`…`R-2278`.

## Contexto

El generador solo sabe avanzar: `generar()` toma el `numero` más alto de la tabla y crea
los 14 siguientes. Manzanillo arranca en 2279 y Lázaro en 323 (sembrados por la migración
0031), así que **todo lo anterior a esos números es inalcanzable desde el sistema**.

Hace falta cargar el lote inmediatamente anterior de Manzanillo, `F-2265` … `R-2278`, que
es el que precede al primero sembrado. Y no como parche de una vez: se pide poder añadir
lotes anteriores en las dos tablas, tantas veces como haga falta.

Decisión confirmada: un folio con algo escrito en la columna **ASIGNACIÓN** deja de
ofrecerse en el selector de Maniobras. Es lo que permite cargar el histórico y marcarlo a
mano sin inventar una columna de estado.

## Diseño

**Un solo endpoint, no dos.** `generar()` acepta un `direccion` opcional en el body:
sin él avanza (lo de siempre), con `"anterior"` retrocede. Mismo bloqueo, mismo
`bulk_create`, misma respuesta — retroceder solo cambia de qué fila sale el número base.
Un `generar-anterior` aparte sería 20 líneas duplicadas de un flujo ya delicado (el
`atomic(using=get_db_alias())`).

Las letras siguen saliendo de `LETRAS_CICLO` por índice dentro del lote, así que un lote
hacia atrás también empieza en F: `F-2265` … `R-2278`. Coincide con lo pedido.

**Sin migraciones ni columnas nuevas.** La `UniqueConstraint(tabla, numero)` que ya existe
es la red que impide solapar lotes pase lo que pase.

---

## Backend — `C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras\api`

### 1. `views.py` → `FolioViewSet.generar` (línea ~1006)

Sustituir el cálculo del número base. El resto del método (validación de `tabla`, el
`atomic`, el `bulk_create`, la respuesta 201) no se toca:

```python
tabla = request.data.get('tabla')
if tabla not in dict(Folio.TABLA_CHOICES):
    return Response({'detail': 'tabla inválida.'}, status=status.HTTP_400_BAD_REQUEST)
hacia_atras = request.data.get('direccion') == 'anterior'

with transaction.atomic(using=get_db_alias()):
    if hacia_atras:
        # Bloquea la fila MÁS BAJA (la que define el hueco anterior), igual que la
        # rama de avanzar bloquea la más alta: dos clics simultáneos se serializan.
        primero = (Folio.objects.select_for_update()
                   .filter(tabla=tabla).order_by('numero').first())
        if primero is None:
            return Response({'detail': 'No hay folios en esta tabla todavía: genera el primer lote antes de retroceder.'},
                            status=status.HTTP_400_BAD_REQUEST)
        siguiente = primero.numero - BATCH_SIZE
        if siguiente < 1:
            return Response({'detail': 'No se puede retroceder más: el lote anterior caería por debajo de 1.'},
                            status=status.HTTP_400_BAD_REQUEST)
    else:
        ultimo = (Folio.objects.select_for_update()
                  .filter(tabla=tabla).order_by('-numero').first())
        siguiente = ultimo.numero + 1 if ultimo else START_NUMERO[tabla]
    # ... formato / nuevos / bulk_create tal cual están hoy
```

`BATCH_SIZE` ya se importa desde `models.py`? **No** — hoy `views.py` importa
`LETRAS_CICLO`, `FORMATO_CODIGO` y `START_NUMERO`. Añadir `BATCH_SIZE` a ese import
(línea 5). Es `len(LETRAS_CICLO)`, definido en `models.py:299`.

Actualizar el docstring: el body admite `{"tabla": …, "direccion": "anterior"}`.

### 2. `views.py` → `FolioViewSet.disponibles`

Una línea: un folio con ASIGNACIÓN escrita cuenta como ocupado.

```python
libres = (Folio.objects.filter(tabla=tabla, asignacion='')
          .exclude(codigo__in=usados)
          .order_by('numero')[:5])
```

Con el comentario de por qué: `asignacion` es el único campo que el usuario rellena a mano,
y sirve para marcar como ocupado un folio que se usó fuera del sistema. `blank=True,
default=''` más `validate_asignacion` garantizan que "vacío" es siempre `''`, nunca NULL,
así que la comparación no necesita `Q(asignacion__isnull=True)`.

> **Ojo, esto cambia el comportamiento actual:** cualquier folio que YA tenga algo escrito
> en ASIGNACIÓN desaparecerá del selector de Maniobras. Es lo pedido, pero conviene mirar
> la página de Folios en producción antes de desplegar por si hay notas sueltas escritas
> ahí que no signifiquen "ocupado".

### 3. `test_folios.py` — pruebas nuevas

En `FoliosTests` (lote anterior, sin depender de maniobras):
- el lote anterior de Manzanillo es exactamente `F-2265` … `R-2278` (el caso real pedido);
- dos lotes anteriores seguidos encadenan hacia abajo (`F-2251` … `R-2264`);
- retroceder no mueve el contador de avanzar: tras un lote anterior, `generar` normal
  sigue dando `F-2293`;
- Lázaro retrocede en su propia secuencia (`F-LCR-309`);
- tabla vacía → 400; caer por debajo de 1 → 400.

En `FoliosEnManiobrasTests` (columna ASIGNACIÓN):
- un folio con ASIGNACIÓN escrita desaparece de `disponibles`;
- vaciar la ASIGNACIÓN lo devuelve a la lista.

---

## Frontend — `C:\Users\PC\Downloads\PRACTICAS\front\ControlDeManiobras\src`

### 4. `hooks/useFolios.js` → `anadirFolios`

Segundo parámetro `direccion`, y el lote anterior se antepone en vez de añadirse al final
(sus números son más bajos y la tabla se pinta ordenada por `numero`):

```js
const anadirFolios = useCallback(async (tabla, direccion) => {
  try {
    const nuevos = await apiClient.post("/folios/generar/", { tabla, direccion });
    setterDe(tabla)((prev) =>
      direccion === "anterior" ? [...nuevos, ...prev] : [...prev, ...nuevos]);
    mostrarNotif(direccion === "anterior" ? "Lote anterior añadido." : "Folios añadidos.");
  } catch (err) { /* igual que hoy */ }
}, [mostrarNotif]);
```

`sanitizarPayload()` del apiClient descarta las claves `undefined`, así que la llamada de
siempre (`anadirFolios(tabla)`) sigue mandando solo `{tabla}` — el backend no ve
`direccion` y avanza. Sin cambios en las llamadas existentes.

### 5. `pages/FoliosPage.jsx`

- `FolioTabla` recibe una prop más, `onAnadirAnterior`, y pinta un segundo botón a la
  izquierda del actual dentro de `.fp-panel-head` (envolver los dos en un `<div>` con
  `gap`, porque la cabecera es `justify-content: space-between`).
- `handleAnadir(tabla, direccion)` reenvía la dirección. El flag `anadiendo[tabla]` que ya
  existe deshabilita los dos botones mientras haya una petición en vuelo: un solo estado,
  no hace falta uno por botón.

### 6. `pages/FoliosPage.css`

Un modificador para que el botón nuevo no compita visualmente con la acción principal:

```css
.fp-btn-anadir--sec { background: #fff; color: var(--primary, #2563eb); border: 1px solid #bfdbfe; }
.fp-btn-anadir--sec:hover:not(:disabled) { background: #eff6ff; }
.fp-btn-acciones { display: flex; align-items: center; gap: 8px; }
```

## Qué NO se toca

`models.py`, migraciones, `FolioSerializer`, `FolioDisponibleSelector`, `ManiobrasPage`,
`perform_update`. El cambio pendiente sin commitear de `tablaDeFolios` (fallback a
Manzanillo) sigue en el árbol de trabajo y viaja en el mismo despliegue.

## Verificación

**Backend** (`C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras`):
```
.venv\Scripts\python.exe Manage.py test api.test_folios --settings=config.settings_test --noinput
```

**Local** (`npm run dev`, ya levantado):

1. Folios → **+ Lote anterior** en FOLIOS MANZANILLO → aparecen 14 filas nuevas
   **a la izquierda**, `F-2265` … `R-2278`, y `F-2279` sigue donde estaba.
2. Pulsarlo otra vez → `F-2251` … `R-2264`. Las columnas siguen cuadrando de 14 en 14.
3. **+ Añadir folios** (el de siempre) → sigue dando el siguiente hacia arriba, sin saltos.
4. Repetir 1 en FOLIOS LÁZARO C → `F-LCR-309` … `R-LCR-322`.
5. Maniobras → nueva con Origen Manzanillo: el desplegable ahora ofrece `F-2265` primero.
   Escribir algo en la ASIGNACIÓN de `F-2265` en la página de Folios → vuelve a Maniobras:
   `F-2265` ya no se ofrece. Borrar la ASIGNACIÓN → reaparece.

**Producción**: no hay migración. Tras desplegar, pulsar **+ Lote anterior** una vez en
Manzanillo para dejar cargado el lote `F-2265`…`R-2278` que motivó todo esto.
