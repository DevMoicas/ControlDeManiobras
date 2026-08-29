# PLAN — Visibilidad de secciones por cargo

Fecha: 2026-08-28 · Estado: **planificado, sin implementar.**

Un tercer eje de permisos, encima de los dos que ya hay y sin tocarlos: qué **secciones**
de la app ve cada usuario, según el **cargo** del empleado que tiene asignado.

| Eje | Qué decide | Dónde vive | Cambia con esto |
|---|---|---|---|
| Rol de BD (`django_standard_role` / superuser) | Qué puede leer y escribir la conexión | `RoleBasedRouter`, RLS y GRANTs en migraciones | **No** |
| `is_staff` | Borrar, ver INGRESOS, entrar a `/admin` y a las rutas `admin-*` | `ProtectedRoute requireAdmin`, serializers | **No** |
| **Cargo** | Qué pantallas salen y qué endpoints responden | Este plan | Nuevo |

La regla que ordena todo lo demás: **este eje solo resta, nunca suma.** Un usuario con cargo
no gana ni un permiso que no tuviera antes.

## Decisiones cerradas con el usuario (2026-08-28)

| Pregunta | Respuesta |
|---|---|
| ¿Usuario sin empleado, o con un cargo que no está en el catálogo? | **Ve todo**, como hoy. Migración suave: nadie se queda fuera el día del despliegue |
| ¿Un cargo con la lista de secciones vacía? | **Ve todo.** El sistema solo restringe donde alguien lo configuró a propósito |
| ¿Dónde se administra? | **Django admin** ahora. Pantalla en la app después, solo si administrarlo desde ahí resulta incómodo |
| ¿Solo ocultar, o bloquear también la API? | **Las dos cosas.** Ocultar sin bloquear es cosmético: la URL a mano sigue entrando |
| ¿A qué nivel se corta? | **Página del inicio + las cuatro sub-páginas de Finanzas.** No se baja a botones ni columnas |
| Endpoints que sirven a varias pantallas | **Basta con tener una** de las secciones que lo usan |
| Vínculo cargo ↔ catálogo | **Por nombre**, y al renombrar un cargo se arrastra el texto en `empleados` en la misma transacción |
| Inicio y Perfil | **Siempre visibles.** Son el destino del redirect y donde está el cierre de sesión |

## Por qué "ve todo" por defecto, y qué obliga a hacer

Es la decisión que hace el despliegue inocuo —nadie pierde acceso hasta que se configure un
cargo a propósito—, y a cambio deja el fallo **a favor del acceso**: si alguien queda mal
enganchado, ve de más y nadie se entera. De ahí salen dos obligaciones del plan:

1. **El renombrado de un cargo tiene que arrastrar `empleados.cargo`.** Sin eso, renombrar
   "COORDINADOR" desengancha a todos sus empleados y los abre a la app entera en silencio.
2. **La comparación se normaliza** (`strip()` y mayúsculas). `empleados.cargo` es texto libre
   editable a mano desde pgAdmin: un espacio de más no puede significar acceso total.

## Las claves de sección

La clave **es la ruta del front**. Sin tabla de traducción que mantener sincronizada.

```
maniobras · gastos-efectivo · vacios · movimientos-locales · folios · catalogos
documentos-viaje · pendientes · torre-control · reportes-viaje
finanzas · finanzas/costos-extra · finanzas/nomina · finanzas/facturacion
finanzas/estados-cuenta
```

Fuera del sistema: `/` y `perfil` (siempre visibles) y `admin-no-eco`, `admin-gastos`,
`admin-vacios` (siguen siendo solo `is_staff`, sin cambio).

Herencia de Finanzas: la tarjeta padre sale si el cargo tiene `finanzas` **o cualquiera de
sus cuatro hijos**. Así conceder "solo Costos extra" no obliga a conceder también el índice.

## Modelo de datos

**`Cargo.secciones`** — `JSONField(default=list, blank=True)`, migración `0061`.

Una columna en una tabla que ya existe. Sin tabla intermedia `CargoSeccion`: serían una tabla,
su secuencia, su GRANT y su política RLS para 15 secciones y una decena de cargos. `[]` significa
"ve todo", así que los cargos que ya hay nacen sin efecto.

Al ser un GRANT de tabla, el permiso del rol estándar sobre `api_cargo` ya cubre la columna nueva.
No hace falta migración de permisos para esta.

**`PerfilUsuario`** — tabla nueva, `managed=True`, migración `0062`.

```python
usuario  = OneToOneField(AUTH_USER_MODEL, on_delete=CASCADE,
                         db_constraint=False, related_name='perfil')
empleado = OneToOneField(Empleado, on_delete=DO_NOTHING,
                         db_constraint=False, null=True, blank=True)
```

`db_constraint=False` en las dos, por dos motivos distintos y ambos ya conocidos en este repo:
hacia `auth_user`, el mismo de `DispositivoConfianza` (el orden de creación de tablas en la base
de test); hacia `empleados`, que es `managed=False` y no existe en esa base.

El cargo **no se copia aquí**: se lee del empleado. Cambiar el cargo de alguien en Catálogos
cambia su acceso, que es justo lo pedido. Un empleado borrado a mano en pgAdmin deja el perfil
huérfano; `perfil.empleado` lanza `DoesNotExist` y la resolución lo trata como "sin empleado",
o sea ve todo.

La `0062` lleva además **GRANT de solo `SELECT`** para `django_standard_role` y su política RLS,
copiando la `0050`. Escribir perfiles lo hace el admin, que va por la conexión de superuser: el
rol estándar no necesita INSERT ni UPDATE aquí, y no se le da.

## La resolución, en un solo sitio

`api/secciones.py` (archivo nuevo) con el catálogo, el mapa de endpoints y **una** función:

```python
def secciones_de(usuario):
    """Las secciones que ve `usuario`. None = las ve todas."""
```

En este orden, y el primero que acierta manda:

| Caso | Resultado |
|---|---|
| `is_staff` | `None` — un admin no se restringe nunca |
| Sin `PerfilUsuario` | `None` |
| Perfil sin empleado, o empleado que ya no existe | `None` |
| El cargo del empleado no casa con ningún `Cargo` | `None` |
| `Cargo.secciones == []` | `None` |
| Resto | `set(Cargo.secciones)` |

Un único sitio donde vive el "ve todo", compartido por el endpoint y por el permiso de DRF. Si
algún día se cambia a deny-by-default, se cambia aquí y en ningún otro lado.

## Endpoint

`GET /api/me/` → `{username, role, empleado, cargo, secciones}`, con `secciones: null` para
"todas".

**No va en el JWT**, y es a propósito: el front filtra los claims con una whitelist
(`AuthContext.jsx:8`) que habría que ampliar, el token engorda con una lista de quince cadenas, y
—lo que de verdad importa— un cambio de cargo no aplicaría hasta el siguiente login. Un endpoint
se vuelve a leer cuando haga falta.

## El permiso de DRF

Una clase `PuedeVerSeccion` y un mapa `ENDPOINTS = {basename: {secciones…}}`. Con tener **una**
de las secciones anotadas, pasa; con `secciones_de()` a `None`, pasa siempre.

Se aplica **por viewset**, no en `DEFAULT_PERMISSION_CLASSES`: login, refresh, logout y `/me/`
tienen que seguir respondiendo a cualquiera con credenciales.

El mapa no es uno a uno, y ese es su motivo de existir. Borrador a verificar al implementar:

| Endpoint | Secciones que lo usan | Por qué más de una |
|---|---|---|
| `maniobras` | maniobras, torre-control, pendientes, reportes-viaje, gastos-efectivo | `FolioSelector` pide `/maniobras/folios-recientes/` desde Gastos, Reportes y Torre |
| `folios` | folios, maniobras, torre-control, reportes-viaje, gastos-efectivo | `FolioDisponibleSelector` vive en varias pantallas |
| `clientes`, `choferes`, `tractos`, `remolques`, `patios` | catalogos, maniobras, documentos-viaje, vacios | Los desplegables de captura (`ClienteSelector`, `OperadorSelector`, `PlacasSelector`) |
| `gastos` | gastos-efectivo, finanzas | |
| `costos-extra` | finanzas/costos-extra | Exclusivo |
| `vacios`, `movimientos-locales`, `pendientes`, `reportes-viaje` | su propia sección | Exclusivos |
| `torre-control`, `torre-folios` | torre-control | |
| `cargos`, `empleados` | catalogos | |
| `dispositivos-confianza` | — | Es el Perfil: siempre |

## Frontend

Tres cambios, ninguno estructural:

1. `AuthContext` pide `/api/me/` al autenticar y al rehidratar, y expone `secciones` y un
   `puedeVer(clave)`. Es el sitio natural: ya es el nodo del que cuelgan todas las páginas.
2. `App.jsx` filtra `HOME_MODULES` al pintar, y `FinanzasPage` filtra sus cuatro tarjetas.
3. `ProtectedRoute` acepta `seccion="finanzas"` junto al `requireAdmin` que ya tiene, y redirige
   al inicio igual que hace hoy con el admin.

`ALLOWED_CLAIMS` y el JWT no se tocan.

## Fases y orden de despliegue

| Fase | Qué entra | Efecto visible |
|---|---|---|
| 1 | Migraciones `0061`/`0062`, `secciones.py`, `/api/me/`, admin de Django, arrastre del renombrado | Ninguno: todos siguen viendo todo |
| 2 | Permiso `PuedeVerSeccion` en los viewsets | Ninguno hasta que un cargo tenga secciones |
| 3 | Front: filtro de tarjetas y gate de rutas | Ninguno hasta que un cargo tenga secciones |
| 4 | Llenar el primer cargo desde `/admin` | **Aquí empieza a restringir** |

Las tres primeras son inertes por diseño, así que el orden entre ellas no puede romper nada.
El de siempre para cada una: `migrar_prod.sh` → backend en verde → frontend.

La fase 4 no es un despliegue, es un cambio de datos, y es la única que puede dejar a alguien
fuera. Se prueba antes con un cargo y un usuario de prueba.

## Pruebas

`Cargo` y `PerfilUsuario` son `managed=True` y existen en la base de test. `empleados` no, pero
para eso está el patrón que ya usa `test_asignacion_folio.py`: crear la tabla en `setUpClass` con
`schema_editor().create_model(Empleado)`.

Lo que hay que cubrir, que es lo que decidiría mal en silencio:

- Los cinco caminos que devuelven `None`, uno por uno. Son la puerta abierta: si uno se cuela por
  error, ese usuario ve la app entera.
- Un cargo con secciones: ve las suyas y no las demás.
- Renombrar un cargo mantiene enganchados a sus empleados.
- Un endpoint compartido responde a quien tiene **una** de sus secciones.
- Un `is_staff` no se restringe ni con el cargo más pobre.

## Riesgos anotados

- **Falla a favor del acceso.** Cualquier desenganche —cargo renombrado a mano, espacio de más,
  empleado borrado— abre en vez de cerrar. Es la contrapartida aceptada del "ve todo por defecto".
- **El front se entera al cargar.** Quitarle una sección a alguien con la app abierta no le cierra
  la pantalla hasta que recargue; el bloqueo del backend sí es inmediato. Aceptable: el dato queda
  protegido, solo la pantalla se queda pintada.
- **El mapa de endpoints se desactualiza solo.** Cada pantalla nueva que reutilice datos de otra
  tiene que pasar por ahí. Es el mantenimiento que compra el criterio de "basta con una".
