# Página FOLIOS: generación automática de folios Manzanillo / Lázaro Cárdenas

## Contexto

Hoy los folios de documentos (Manzanillo y Lázaro Cárdenas) se asignan a mano, sin
control central de qué número ya se usó. Se pide una página nueva "FOLIOS" con dos
tablas que generan códigos secuenciales bajo demanda (botón "AÑADIR FOLIOS"),
evitando duplicados y permitiendo anotar a qué se asignó cada folio.

Nomenclatura confirmada: el código cicla por las 14 letras de "FRABACONTAINER"
(F-R-A-B-A-C-O-N-T-A-I-N-E-R), cada letra con un número que avanza +1 dentro del
lote. Cada clic en "AÑADIR FOLIOS" agrega exactamente 14 folios nuevos (un ciclo
completo, siempre reiniciando en F) y el contador nunca retrocede ni se reutiliza.

- **FOLIOS MANZANILLO**: `F-2279 … R-2292` (primer lote, ya sembrado), siguiente
  lote `F-2293 … R-2306`, luego `F-2307 … R-2320`, etc.
- **FOLIOS LÁZARO C** (Lázaro Cárdenas): `F-LCR-323 … R-LCR-336` (primer lote),
  luego `F-LCR-337 … R-LCR-350`, etc. Contador independiente del de Manzanillo.

Decisiones ya confirmadas con el usuario (AskUserQuestion):
1. **Layout**: las dos tablas van **apiladas verticalmente**, cada una al 80% de
   ancho — el usuario aceptó explícitamente que en pantallas bajas puede aparecer
   scroll vertical de página; el diseño debe minimizarlo (filas compactas) pero no
   está obligado a eliminarlo del todo.
2. **Numeración**: confirmado, siempre 14 folios por lote (el "2307" que mencionó
   originalmente fue un typo — el lote correcto es 2293–2306).
3. **Permisos**: "AÑADIR FOLIOS" lo puede pulsar cualquier usuario autenticado, sin
   gate de admin — igual que el resto de altas en la app (solo `destroy()` se
   reserva a `is_staff`).

Cada folio tiene una columna editable **ASIGNACIÓN** (texto libre, máx. 40
caracteres) con edición inline "estilo Excel" — clic para editar, blur/Enter
guarda, Escape cancela — reusando **exactamente** el patrón ya existente en
`MovimientosLocalesPage.jsx` (columnas `movimiento`/`contenedor`).

Verificado contra el código actual (no solo contra el resumen del research):
imports de `views.py`, `Serializers.py`, `urls.py`, modelo `Cliente`, y
`HOME_MODULES`/rutas de `App.jsx` — todo coincide con lo que asume este plan.

---

## Backend — `C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras`

Sigue el patrón de tabla nueva **managed=True** (como `DispositivoConfianza`), NO
el patrón legacy `managed=False` de `Maniobra`/`Tracto`.

### 1. `api/models.py` — modelo `Folio` + constantes (añadir después de `Cliente`)

```python
class Folio(models.Model):
    MANZANILLO = 'manzanillo'
    LAZARO     = 'lazaro'
    TABLA_CHOICES = [
        (MANZANILLO, 'Folios Manzanillo'),
        (LAZARO,     'Folios Lázaro C'),
    ]

    tabla      = models.CharField(max_length=20, choices=TABLA_CHOICES, db_index=True)
    numero     = models.IntegerField()
    letra      = models.CharField(max_length=1)
    codigo     = models.CharField(max_length=30, unique=True)
    asignacion = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        managed = True
        ordering = ['tabla', 'numero']
        constraints = [
            models.UniqueConstraint(fields=['tabla', 'numero'], name='uniq_folio_tabla_numero'),
        ]

    def __str__(self):
        return self.codigo


# Ciclo de 14 letras "FRABA"+"CONTAINER". Cada lote de AÑADIR FOLIOS reinicia
# siempre en F (confirmado con el usuario) — el índice dentro del lote define
# la letra, no numero % 14.
LETRAS_CICLO = ['F', 'R', 'A', 'B', 'A', 'C', 'O', 'N', 'T', 'A', 'I', 'N', 'E', 'R']
BATCH_SIZE   = len(LETRAS_CICLO)  # 14

START_NUMERO = {Folio.MANZANILLO: 2279, Folio.LAZARO: 323}
FORMATO_CODIGO = {
    Folio.MANZANILLO: '{letra}-{numero}',
    Folio.LAZARO:      '{letra}-LCR-{numero}',
}
```

Sin campos de auditoría (`created_by`/`updated_by`/etc.) — el único dato editable
por usuario es `asignacion` y no hay borrado expuesto en la UI; se puede añadir
después con el bloque de 4 líneas que ya usan `Maniobra`/`Gasto`/`Vacio` si hiciera
falta.

### 2. Migraciones (tres, siguiendo a `0028_maniobra_cliente_fk.py`)

**`0029_folio.py`** — `CreateModel` plano (`managed: True`, sin `db_table`, sin SQL
crudo — como `0023_dispositivoconfianza.py`). Generar con
`python Manage.py makemigrations api` y verificar que produce eso; si el nombre de
archivo difiere, renombrarlo a `0029_folio.py` para mantener el orden.

**`0030_grant_folio_to_standard_role.py`** — copiar **literal**
`migrations/0024_grant_dispositivoconfianza_to_standard_role.py` cambiando
`TABLA = 'api_folio'` y `SECUENCIA = 'api_folio_id_seq'`. Mismo patrón: GRANT
SELECT/INSERT/UPDATE (sin DELETE — el borrado queda reservado al alias admin),
GRANT de la secuencia, RLS habilitado + 3 políticas (`std_select`/`std_insert`/
`std_update`, `USING (true)`).

**`0031_seed_folios.py`** — `RunPython` de datos, con los 28 folios iniciales
**hardcodeados como valores literales** (las migraciones no deben importar
`api.models`, que puede cambiar en el futuro):

```python
LETRAS_CICLO = ['F','R','A','B','A','C','O','N','T','A','I','N','E','R']
SEEDS = [
    ('manzanillo', 2279, '{letra}-{numero}'),
    ('lazaro',       323, '{letra}-LCR-{numero}'),
]

def seed(apps, schema_editor):
    Folio = apps.get_model('api', 'Folio')
    filas = []
    for tabla, inicio, formato in SEEDS:
        for i, letra in enumerate(LETRAS_CICLO):
            numero = inicio + i
            filas.append(Folio(tabla=tabla, numero=numero, letra=letra,
                                codigo=formato.format(letra=letra, numero=numero)))
    Folio.objects.bulk_create(filas)

def unseed(apps, schema_editor):
    Folio = apps.get_model('api', 'Folio')
    for tabla, inicio, _ in SEEDS:
        Folio.objects.filter(tabla=tabla, numero__range=(inicio, inicio + 13)).delete()
```

Esto garantiza que **siempre** exista al menos una fila por `tabla`, así el action
`generar` nunca tiene que resolver el caso "tabla vacía" al hacer el lock.

### 3. `api/Serializers.py`

Añadir `Folio` al import de modelos (línea 2) y:

```python
class FolioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folio
        fields = '__all__'
        read_only_fields = ['tabla', 'numero', 'letra', 'codigo']
```

`asignacion` queda como único campo editable vía API; el `max_length=40` del
modelo ya lo valida automáticamente (DRF lo respeta sin código extra).

### 4. `api/views.py`

- Añadir `from django.db import transaction` (no está importado en este archivo
  hoy — sí en `Serializers.py`).
- Añadir `Folio, LETRAS_CICLO, BATCH_SIZE, FORMATO_CODIGO` al import de `.models`
  (línea 5) y `FolioSerializer` al import de `.Serializers` (línea 10).

```python
class FolioViewSet(viewsets.ModelViewSet):
    queryset = Folio.objects.all()
    serializer_class = FolioSerializer
    throttle_classes = [UserRateThrottle, AnonRateThrottle]
    # Sin paginar a propósito: Folio crece sin límite (14 filas por lote, para
    # siempre) y el frontend necesita SIEMPRE la lista completa de una tabla
    # para reconstruir los lotes en columnas. Con PAGE_SIZE=60 global, el
    # quinto lote (70 filas) perdería las últimas 10 en silencio.
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['tabla']

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({'detail': 'No tienes permisos para eliminar registros.'},
                             status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='generar')
    def generar(self, request):
        """Genera el siguiente lote de 14 folios para `tabla` (body:
        {"tabla": "manzanillo"|"lazaro"}). Abierto a cualquier usuario
        autenticado — confirmado con el usuario, igual que el resto de
        altas/ediciones; solo destroy() se reserva a admin."""
        tabla = request.data.get('tabla')
        if tabla not in dict(Folio.TABLA_CHOICES):
            return Response({'detail': 'tabla inválida.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # select_for_update sobre la última fila de esta tabla serializa
            # clics concurrentes de AÑADIR FOLIOS. Siempre hay >=1 fila (la
            # seed migration la garantiza), así que no hace falta cubrir
            # "tabla vacía" aquí.
            ultimo = (Folio.objects.select_for_update()
                      .filter(tabla=tabla).order_by('-numero').first())
            siguiente = ultimo.numero + 1
            formato = FORMATO_CODIGO[tabla]
            nuevos = [
                Folio(tabla=tabla, numero=siguiente + i, letra=letra,
                      codigo=formato.format(letra=letra, numero=siguiente + i))
                for i, letra in enumerate(LETRAS_CICLO)
            ]
            creados = Folio.objects.bulk_create(nuevos)

        return Response(FolioSerializer(creados, many=True).data, status=status.HTTP_201_CREATED)
```

### 5. `api/urls.py`

```python
router.register(r'folios', FolioViewSet, basename='folios')
```
(y añadir `FolioViewSet` al import de `.views` en la cabecera del archivo).

Endpoints resultantes:
- `GET /api/folios/?tabla=manzanillo|lazaro` — lista completa sin paginar.
- `PATCH /api/folios/{id}/` — `{"asignacion": "..."}`.
- `POST /api/folios/generar/` — `{"tabla": "manzanillo"}` → 201 con las 14 filas nuevas.
- `DELETE /api/folios/{id}/` — solo `is_staff` (no se usa desde esta UI).

---

## Frontend — `C:\Users\PC\Downloads\PRACTICAS\front\ControlDeManiobras`

### 1. `src/hooks/useFolios.js` (nuevo)

Mismo patrón que `useMovimientosLocales.js` (`notif`/`cargando`, sin objeto
`error` separado). Dos arrays de estado independientes (uno por tabla) para que
editar una no re-renderice la otra.

```jsx
import { useState, useCallback, useRef, useEffect } from "react";
import { apiClient } from "../api/apiClient";

export function useFolios() {
  const [foliosManzanillo, setFoliosManzanillo] = useState([]);
  const [foliosLazaro,     setFoliosLazaro]     = useState([]);
  const [cargando, setCargando] = useState(false);
  const [notif,    setNotif]    = useState(null);
  const notifTimer = useRef(null);

  const mostrarNotif = useCallback((msg, tipo = "exito") => {
    clearTimeout(notifTimer.current);
    setNotif({ msg, tipo });
    notifTimer.current = setTimeout(() => setNotif(null), 3000);
  }, []);

  const setterDe = (tabla) => (tabla === "manzanillo" ? setFoliosManzanillo : setFoliosLazaro);
  const normalizar = (data) => (Array.isArray(data) ? data : (data?.results ?? []));

  const cargarFolios = useCallback(async () => {
    setCargando(true);
    try {
      const [mzo, lzc] = await Promise.all([
        apiClient.get("/folios/?tabla=manzanillo"),
        apiClient.get("/folios/?tabla=lazaro"),
      ]);
      setFoliosManzanillo(normalizar(mzo));
      setFoliosLazaro(normalizar(lzc));
    } catch {
      mostrarNotif("Error al cargar folios.", "error");
    } finally {
      setCargando(false);
    }
  }, [mostrarNotif]);

  const añadirFolios = useCallback(async (tabla) => {
    try {
      const nuevos = await apiClient.post("/folios/generar/", { tabla });
      setterDe(tabla)((prev) => [...prev, ...nuevos]);
      mostrarNotif("Folios añadidos.");
    } catch (err) {
      mostrarNotif(err.message || "Error al añadir folios.", "error");
    }
  }, [mostrarNotif]);

  const actualizarAsignacion = useCallback(async (tabla, id, asignacion) => {
    try {
      const actualizado = await apiClient.patch(`/folios/${id}/`, { asignacion });
      setterDe(tabla)((prev) => prev.map((f) => (f.id === id ? { ...f, ...actualizado } : f)));
    } catch (err) {
      mostrarNotif(err.message || "Error al actualizar asignación.", "error");
    }
  }, [mostrarNotif]);

  useEffect(() => () => clearTimeout(notifTimer.current), []);

  return { foliosManzanillo, foliosLazaro, cargando, notif, cargarFolios, añadirFolios, actualizarAsignacion };
}
```

### 2. `src/pages/FoliosPage.jsx` (nuevo)

Un sub-componente local `FolioTabla` (definido en el mismo archivo, no en
`src/components/` — no se reusa fuera de esta página) porque las dos tablas son
idénticas en estructura/edición y solo difieren en título/datos/callbacks; evita
duplicar ~90 líneas de JSX dos veces.

`chunk(folios, 14)` agrupa el array plano (ordenado por `numero`) en lotes; se
renderiza "por cada una de las 14 filas, un `<td>` por lote" para que los lotes
queden como pares de columnas [FOLIO|ASIGNACIÓN] hacia la derecha.

Estado `editandoCelda`/`valorEditando` — calcado de `MovimientosLocalesPage.jsx`
— vive **dentro de `FolioTabla`**, una instancia por tabla.

```jsx
import { useState, useEffect, Fragment } from "react";
import { Hash } from "lucide-react";
import { useFolios } from "../hooks/useFolios";
import "./FoliosPage.css";

const BATCH_SIZE = 14;
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function FolioTabla({ titulo, añadiendo, folios, onAñadir, onGuardarAsignacion }) {
  const lotes = chunk(folios, BATCH_SIZE);
  const [editandoCelda, setEditandoCelda] = useState(null); // { id }
  const [valorEditando, setValorEditando] = useState("");

  const iniciarEdicion = (id, valorActual) => {
    setEditandoCelda({ id });
    setValorEditando(valorActual ?? "");
  };
  const cancelarEdicion = () => setEditandoCelda(null);
  const confirmarEdicion = async (folio) => {
    if (valorEditando !== (folio.asignacion ?? "")) {
      await onGuardarAsignacion(folio.id, valorEditando);
    }
    setEditandoCelda(null);
  };

  return (
    <section className="fp-panel">
      <div className="fp-panel-head">
        <h2 className="fp-panel-titulo">{titulo}</h2>
        <button type="button" className="fp-btn-anadir" onClick={onAñadir} disabled={añadiendo}>
          {añadiendo ? "..." : "+ Añadir folios"}
        </button>
      </div>
      <div className="fp-scroll">
        <table className="fp-tabla">
          <thead>
            <tr>
              {lotes.map((_, li) => (
                <Fragment key={li}>
                  <th className="fp-th fp-th--folio">Folio</th>
                  <th className="fp-th fp-th--asig">Asignación</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: BATCH_SIZE }).map((_, fila) => (
              <tr key={fila}>
                {lotes.map((lote, li) => {
                  const f = lote[fila];
                  const editando = f && editandoCelda?.id === f.id;
                  return (
                    <Fragment key={li}>
                      <td className="fp-td fp-td--folio">{f?.codigo ?? ""}</td>
                      <td className="fp-td fp-td--asig">
                        {!f ? null : editando ? (
                          <input
                            type="text" className="fp-input" value={valorEditando} autoFocus maxLength={40}
                            onChange={(e) => setValorEditando(e.target.value)}
                            onBlur={() => confirmarEdicion(f)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmarEdicion(f);
                              if (e.key === "Escape") cancelarEdicion();
                            }}
                          />
                        ) : (
                          <span className="fp-celda-texto" title="Click para editar"
                                onClick={() => iniciarEdicion(f.id, f.asignacion)}>
                            {f.asignacion || <em className="fp-placeholder">—</em>}
                          </span>
                        )}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function FoliosPage() {
  const { foliosManzanillo, foliosLazaro, cargando, notif, cargarFolios, añadirFolios, actualizarAsignacion } = useFolios();
  const [añadiendo, setAñadiendo] = useState({ manzanillo: false, lazaro: false });

  useEffect(() => { cargarFolios(); }, [cargarFolios]);

  const handleAñadir = async (tabla) => {
    setAñadiendo((p) => ({ ...p, [tabla]: true }));
    await añadirFolios(tabla);
    setAñadiendo((p) => ({ ...p, [tabla]: false }));
  };

  return (
    <div className="fp-page">
      <div className="fp-wrap">
        <header className="fp-intro">
          <h1 className="fp-title"><Hash size={18} /> Folios</h1>
        </header>

        {notif && <div className={`fp-notif fp-notif--${notif.tipo}`}>{notif.msg}</div>}

        {cargando ? (
          <p className="fp-cargando">Cargando folios…</p>
        ) : (
          <>
            <FolioTabla titulo="FOLIOS MANZANILLO" añadiendo={añadiendo.manzanillo}
              folios={foliosManzanillo} onAñadir={() => handleAñadir("manzanillo")}
              onGuardarAsignacion={(id, v) => actualizarAsignacion("manzanillo", id, v)} />
            <FolioTabla titulo="FOLIOS LÁZARO C" añadiendo={añadiendo.lazaro}
              folios={foliosLazaro} onAñadir={() => handleAñadir("lazaro")}
              onGuardarAsignacion={(id, v) => actualizarAsignacion("lazaro", id, v)} />
          </>
        )}
      </div>
    </div>
  );
}
```

### 3. `src/pages/FoliosPage.css` (nuevo)

Puntos clave (para cumplir "sin scroll vertical" lo más posible, según lo que el
usuario ya aceptó como límite):
- Encabezado mínimo (`<h1>` solo, sin eyebrow/lead) — ahorra ~85px vs. el patrón
  `ml-page`.
- Sin toolbar de página aparte — "AÑADIR FOLIOS" vive en la cabecera de cada tabla.
- `.fp-scroll { overflow-x: auto }` **siempre activo** (patrón de
  `CatalogosPage.css`/`VaciosPage.css`, NO el `@media`-only de
  `MovimientosLocalesPage.css`) — la tabla crece hacia la derecha para siempre,
  a cualquier ancho de pantalla.
- Filas compactas (~28px: padding 6px + fuente 0.78rem) en vez de las ~40px de
  `ml-td`. Con 14 filas + cabecera + botón, cada tabla mide ~446px; las dos
  apiladas + header de página ≈ **~980px de alto total**.
- `.fp-panel { width: 80%; margin: 0 auto; }` (ancho pedido).

```css
.fp-page { min-height: calc(100vh - 40px); background: var(--bg, #f4f7fb); }

.fp-wrap { max-width: 1180px; margin: 0 auto; padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 14px; }

.fp-intro { text-align: center; }
.fp-title {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'Oswald', sans-serif; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.03em; font-size: 1.3rem; line-height: 1.15; margin: 0;
  color: var(--text, #1f2937);
}

.fp-notif { padding: 6px 12px; border-radius: 8px; font-size: 0.82rem; border: 1px solid; }
.fp-notif--exito { background: #ecfdf3; color: #15803d; border-color: #bbf7d0; }
.fp-notif--error { background: #fef2f2; color: #dc2626; border-color: #fecaca; }

.fp-panel {
  width: 80%; margin: 0 auto; background: #fff; border: 1px solid #e6ecf5;
  border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(16, 40, 80, 0.04);
}
.fp-panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; background: #f9fbfe; border-bottom: 1px solid #eef2f7;
}
.fp-panel-titulo {
  font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 0.85rem;
  letter-spacing: 0.05em; text-transform: uppercase; margin: 0; color: var(--text, #1f2937);
}
.fp-btn-anadir {
  font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 0.68rem;
  letter-spacing: 0.04em; text-transform: uppercase; padding: 5px 12px;
  border: none; border-radius: 7px; background: var(--primary, #2563eb); color: #fff; cursor: pointer;
}
.fp-btn-anadir:hover:not(:disabled) { background: #1d4ed8; }
.fp-btn-anadir:disabled { opacity: 0.55; cursor: not-allowed; }

.fp-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.fp-tabla { border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 0.78rem; }

.fp-th {
  font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 0.62rem; letter-spacing: 0.06em;
  text-transform: uppercase; text-align: left; white-space: nowrap; padding: 5px 8px;
  background: #2b3e50; color: #fff;
}
.fp-th--folio { width: 74px; }
.fp-th--asig  { width: 150px; border-right: 2px solid #1e2b38; }

.fp-td { padding: 6px 8px; border-bottom: 1px solid #eef2f7; white-space: nowrap; color: var(--text, #1f2937); }
.fp-td--asig { border-right: 1px solid #eef2f7; }
.fp-tabla tbody tr:last-child .fp-td { border-bottom: none; }

.fp-celda-texto { cursor: text; display: block; min-width: 70px; padding: 2px 4px; border-radius: 5px; }
.fp-celda-texto:hover { background: var(--primary-light, #eaf1ff); }
.fp-placeholder { color: var(--text-light, #6b7280); font-style: normal; }

.fp-input {
  font-family: 'Inter', sans-serif; font-size: 0.78rem; padding: 3px 6px;
  border: 1px solid var(--primary, #2563eb); border-radius: 5px; width: 100%; min-width: 130px; box-sizing: border-box;
}

.fp-cargando { text-align: center; color: var(--text-light, #6b7280); padding: 24px; }

@media (max-width: 720px) {
  .fp-wrap { padding: 14px 14px 18px; }
  .fp-panel { width: 96%; }
}
```

En viewports altos (~1440×900+) esto debería caber sin scroll de página; en
laptops más bajas (1366×768 con poco alto útil) es esperable algo de scroll
vertical — aceptado explícitamente por el usuario.

### 4. `src/App.jsx` — dos ediciones puntuales

**Import de icono** (línea 3, añadir `Hash` — no usado en ningún otro lado;
`FileText` ya lo tiene "Documentos de viaje"):
```jsx
import { Home as HomeIcon, CircleDollarSign, UserCircle, Truck, Wallet, Container, Library, FileText, Hash, ChevronRight } from 'lucide-react';
```

**Import de página** (junto a los demás, ~línea 19):
```jsx
import FoliosPage from './pages/FoliosPage';
```

**Entrada en `HOME_MODULES`** (~línea 26, junto a "Movimientos locales"):
```jsx
{ to: 'folios', icon: Hash, title: 'Folios', desc: 'Genera y administra los folios de Manzanillo y Lázaro Cárdenas.' },
```

**Ruta** (~línea 172, junto a `movimientos-locales`, SIN `ProtectedRoute
requireAdmin` — abierta a cualquier usuario autenticado):
```jsx
<Route path="folios" element={<FoliosPage />} />
```

---

## Verificación

**Backend** (`C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras`):
1. `python Manage.py migrate` — confirmar que `0029_folio`, `0030_grant_folio_to_standard_role`,
   `0031_seed_folios` aplican sin error (ninguno tipo "permission denied for sequence").
2. `python Manage.py runserver`; con un JWT de un usuario normal (no staff):
   - `GET /api/folios/?tabla=manzanillo` → 14 filas, `F-2279…R-2292`.
   - `GET /api/folios/?tabla=lazaro` → 14 filas, `F-LCR-323…R-LCR-336`.
   - `POST /api/folios/generar/ {"tabla":"manzanillo"}` → 201, `F-2293…R-2306`.
   - Repetir el mismo POST → `F-2307…R-2320` (confirma que continúa, no repite).
   - Repetir para `tabla=lazaro` → confirma contador independiente.
   - `PATCH /api/folios/{id}/ {"asignacion":"prueba"}` → se guarda; con 41
     caracteres → 400.
   - `DELETE /api/folios/{id}/` con usuario no-staff → 403.
3. Opcional: dos `generar` casi simultáneos sobre la misma tabla → confirmar que
   las 28 filas resultantes tienen `numero` contiguos sin duplicados (valida el
   `select_for_update`).

**Frontend** (`C:\Users\PC\Downloads\PRACTICAS\front\ControlDeManiobras`), con el
backend corriendo:
1. `npm run dev`, entrar, ir a la tarjeta "Folios" (o `/folios`).
2. Confirmar 14 filas por tabla con los códigos semilla correctos.
3. Clic en "AÑADIR FOLIOS" en Manzanillo → aparecen 14 columnas nuevas a la
   derecha (`F-2293…R-2306`), la tabla sigue midiendo 14 filas de alto. Repetir
   → continúa en `2307`. Repetir en Lázaro C → contador independiente.
4. Clic en una celda ASIGNACIÓN, escribir, salir del campo (blur) → PATCH en
   Network tab, valor guardado. Escape en otra celda → no guarda. Recargar
   (F5) → el valor editado persiste.
5. Redimensionar la ventana: en pantallas altas, la página no debería tener
   scroll vertical; el scroll horizontal de cada tabla funciona de forma
   independiente entre ambas.
