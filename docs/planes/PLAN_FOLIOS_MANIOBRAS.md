# PLAN — Selector de folios en Maniobras

## Contexto

La página **Folios** (desplegada el 2026-08-07) ya genera y administra dos secuencias
independientes: `Folio.tabla = 'manzanillo'` (`F-2279`) y `'lazaro'` (`F-LCR-323`).
Pero en **Maniobras** la columna Folio sigue siendo un `<input>` de texto libre: nada
conecta las dos pantallas. Hoy se puede teclear cualquier cosa, repetir un folio en dos
servicios y renombrar un folio en su página sin que la maniobra se entere.

Se quiere cerrar el círculo: que el folio de una maniobra **salga siempre de la tabla de
folios**, que el sistema sepa cuáles están ocupados, que elija la tabla correcta según la
plaza del viaje y que renombrar un folio se refleje en la maniobra que lo usa.

## Decisión de diseño (por qué NO se toca el esquema)

`Maniobra` es `managed = False` (tabla `maniobras` de pgAdmin): añadirle una FK a `Folio`
exigiría migración `RunSQL`, permisos nuevos para `django_standard_role` y un backfill
sobre datos vivos. **No hace falta.** El campo `maniobra.folio` (CharField) ya guarda el
código, y `Folio.codigo` es `unique=True`, así que el código *es* la clave:

- **"Folio usado"** = existe una maniobra cuyo `folio` es ese `codigo`. Estado derivado,
  cero columnas nuevas: borrar o vaciar una maniobra libera su folio solo, sin código.
- **"Renombrar se refleja"** = un `UPDATE` en cascada de una línea al renombrar.

Resultado: **sin migración, sin cambio de esquema, sin backfill, sin permisos nuevos.**

Decisiones confirmadas por el usuario:
- El selector va en la fila nueva **y** en el modal de edición (sale del mismo `COLUMNAS`:
  es menos diff que distinguir los dos casos, y cierra la puerta a duplicar folios editando).
- **Solo se elige de la lista**, no hay texto libre (un folio inventado no se podría
  rastrear ni renombrar en cascada).
- Si al cambiar Origen/Destino la plaza cambia de tabla, el folio elegido **se limpia** y
  vuelve a quedar disponible para otras maniobras de su plaza.

---

## Backend — `C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras\api`

### 1. `views.py` → `FolioViewSet` (línea ~952)

**a) Nueva acción `disponibles`** — los 5 siguientes folios libres de una tabla. Mismo
patrón de validación de `tabla` que ya usa `generar()` justo encima:

```python
@action(detail=False, methods=['get'], url_path='disponibles')
def disponibles(self, request):
    """Los 5 siguientes folios de `tabla` que ninguna maniobra está usando."""
    tabla = request.query_params.get('tabla')
    if tabla not in dict(Folio.TABLA_CHOICES):
        return Response({'detail': 'tabla inválida.'}, status=status.HTTP_400_BAD_REQUEST)
    # ponytail: "usado" se deriva de maniobras.folio, sin columna de estado — así
    # vaciar o borrar una maniobra libera su folio sola. Sin índice en maniobras.folio:
    # es un scan por apertura del desplegable; añadirlo si se nota lento.
    usados = (Maniobra.objects.exclude(folio__isnull=True).exclude(folio='')
              .values_list('folio', flat=True))
    libres = (Folio.objects.filter(tabla=tabla).exclude(codigo__in=usados)
              .order_by('numero')[:5])
    return Response(FolioSerializer(libres, many=True).data)
```

**b) Cascada del renombrado** — `perform_update` en el mismo ViewSet:

```python
def perform_update(self, serializer):
    anterior = serializer.instance.codigo
    # atomic: renombrar el folio y arrastrar las maniobras es UNA operación; a
    # medias dejaría la maniobra apuntando a un código que ya no existe.
    with transaction.atomic(using=get_db_alias()):
        folio = serializer.save()
        if folio.codigo != anterior:
            Maniobra.objects.filter(folio=anterior).update(folio=folio.codigo)
```

`Maniobra`, `transaction` y `get_db_alias` **ya están importados** en `views.py` (líneas 5
y las que usa `generar()`): no hay imports nuevos. `get_db_alias()` no es opcional —
misma razón documentada en `generar()`.

### 2. `Serializers.py` → `ManiobraSerializer.validate()` (línea ~82)

Añadir al final del `validate()` existente, antes del `return data`, el cierre de la
ventana de concurrencia (dos usuarios eligiendo el mismo folio a la vez). El error va bajo
la clave `detail` porque es la única que lee el `apiClient`:

```python
# Un folio de la tabla FOLIOS no puede quedar en dos maniobras. Solo se comprueba
# cuando el folio CAMBIA: los registros viejos de la época del texto libre pueden
# venir duplicados y editarles otro campo no debe fallar por eso.
folio = (data.get('folio') or '').strip()
if folio and (self.instance is None or (self.instance.folio or '') != folio):
    otras = Maniobra.objects.filter(folio=folio)
    if self.instance is not None:
        otras = otras.exclude(pk=self.instance.pk)
    if otras.exists():
        raise serializers.ValidationError(
            {'detail': f'El folio "{folio}" ya está usado en otra maniobra.'})
```

### 3. `test_folios.py` — 4 pruebas nuevas

Siguiendo el estilo del archivo (nombres en español, una cosa por prueba):
`disponibles` devuelve 5 y salta los ya usados por una maniobra · respeta la tabla pedida ·
`tabla` inválida es 400 · renombrar un folio arrastra el `folio` de la maniobra que lo usa.

---

## Frontend — `C:\Users\PC\Downloads\PRACTICAS\front\ControlDeManiobras\src`

### 4. Nuevo `components/FolioDisponibleSelector/` (`.jsx` + `.css`)

Copia del patrón de `components/CiudadSelector/CiudadSelector.jsx`: `createPortal` +
`position: fixed` (el desplegable vive dentro del scroll de la tabla y sin portal se
recorta), `useDropdownNav`, cierre con Escape y clic fuera, recolocación en scroll/resize.

No se reutiliza `CiudadSelector` a pesar del parecido: tendría que forkear tres
comportamientos (campo `codigo` en vez de `ciudad`, saltarse el caché, endpoint con
`tabla`) en un componente que ya sirve a 4 llamadas de Origen/Destino. Componente nuevo de
~70 líneas, riesgo cero sobre lo que funciona.

```
Props: { tabla, currentValue, onSelect, disabled }
- tabla == null  → botón deshabilitado, texto "Elige origen o destino"
- al abrir       → apiClient.get(`/folios/disponibles/?tabla=${tabla}`)
- lista          → 5 botones con f.codigo (+ f.asignacion si la tiene)
- currentValue   → se muestra en el botón aunque no esté en la lista (folio ya usado
                   por ESTA maniobra, o folio viejo escrito a mano)
```

**`apiClient.get`, NO `apiClient.getCatalogo`**: el caché de 45 s de `catalogCache` serviría
folios ya tomados por otro usuario. Es la diferencia entre "libre" y "libre hace un rato".

### 5. `pages/ManiobrasPage.jsx`

| Dónde | Cambio |
|---|---|
| imports | `import FolioDisponibleSelector from "../components/FolioDisponibleSelector/FolioDisponibleSelector";` |
| `COLUMNAS` (l.213) | `{ key: "folio", label: "Folio", isFolio: true }` |
| helpers (junto a `aplicarCambioTipoServicio`, l.127) | `tablaDeFolios()` y `aplicarCambioPlaza()` |
| `FilaNueva` (l.412/420) | las ramas `isOrigen`/`isDestino` llaman a `aplicarCambioPlaza` |
| `FilaNueva` (antes del `<input>` final, l.479) | rama `col.isFolio` → `<FolioDisponibleSelector>` |
| `ModalEditar` (l.608/616 y l.678) | los dos mismos cambios |
| `FilaManiobra` (l.710) | **sin cambios** — el folio cae al texto plano del `else` final |

```js
// La plaza manda la tabla de folios: Origen decide; si Origen no es ninguna de las
// dos, decide Destino. Comparación sin acentos ni mayúsculas porque el catálogo de
// ciudades lo escribe el usuario ("Lázaro Cárdenas", "LAZARO CARDENAS"...).
const sinAcentos = (s) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

function tablaDeFolios({ origen, destino }) {
  for (const plaza of [origen, destino]) {
    const p = sinAcentos(plaza);
    if (p.includes("MANZANILLO")) return "manzanillo";
    if (p.includes("LAZARO")) return "lazaro";
  }
  return "manzanillo";   // ninguna de las dos plazas (Colima → Guadalajara)
}

// Cambiar de plaza cambia la tabla de folios: el folio elegido deja de valer y se
// vacía, con lo que vuelve a estar disponible para otra maniobra de su plaza.
// Si la plaza cambia dentro de la misma tabla, el folio se queda.
function aplicarCambioPlaza(datos, onChange, key, valor) {
  onChange(key, valor);
  const antes  = tablaDeFolios(datos);
  const ahora  = tablaDeFolios({ ...datos, [key]: valor });
  if (ahora !== antes) onChange("folio", "");
}
```

Rama nueva en `FilaNueva` y `ModalEditar`:

```jsx
) : col.isFolio ? (
  <FolioDisponibleSelector
    tabla={tablaDeFolios(datos)}
    currentValue={datos[col.key] ?? ""}
    onSelect={(codigo) => onChange(col.key, codigo)}
    disabled={isSubmitting}
  />
) : ...
```

---

## Qué NO se toca

`FolioSelector` (el de Bitácoras/CtaPort/Gastos) es otra cosa: lista maniobras recientes
para autollenar documentos. No se renombra ni se modifica.
`useFolios`, `FoliosPage`, `models.py`, migraciones, `catalogCache`: sin cambios.

## Verificación

**Backend** (`C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras`):
```
python Manage.py test api.test_folios --settings=config.settings_test
```

**Frontend** (`front\ControlDeManiobras`): `npm run dev`, y recorrer:

1. Maniobras → **+ Nueva** → Origen `Manzanillo` → el botón Folio ofrece 5 códigos
   `F-2279…`. Sin Origen ni Destino, el botón está deshabilitado.
2. Elegir `F-2279` → Guardar → abrir otra fila nueva de Manzanillo: `F-2279` ya **no**
   aparece; la lista empieza en el siguiente.
3. Origen `Lázaro Cárdenas` → los folios son `F-LCR-…`.
4. Origen vacío + Destino `Manzanillo` → vuelven los folios de Manzanillo (el destino
   manda solo cuando el origen no es ninguna de las dos plazas).
5. Página **Folios** → renombrar `F-2279` a `F-2279-2` → volver a Maniobras y recargar:
   la maniobra muestra `F-2279-2`. Repetir con un folio de Lázaro.
6. Editar esa maniobra → cambiar Origen a `Lázaro Cárdenas`: el folio se vacía. Guardar y
   abrir una fila nueva de Manzanillo → `F-2279-2` vuelve a estar disponible.
