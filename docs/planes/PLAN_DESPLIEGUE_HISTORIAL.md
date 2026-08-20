# Historial completo del despliegue — Control de Maniobras (FRABA)

> **Archivo histórico, congelado el 2026-07-28.** Es el plan completo día a día: cada decisión con su razonamiento, cada incidente con su diagnóstico y arreglo, el detalle línea por línea de las fases 1-8 (todas cerradas). Nada de esto se borró al comprimir — se movió aquí.
>
> **El documento vivo y corto es `PLAN_DESPLIEGUE_PRODUCCION.md`.** Léelo primero. Ven aquí solo cuando necesites el porqué completo de algo, o una receta operativa exacta (un comando de `az`, un commit de rollback, el razonamiento detrás de una decisión descartada).
>
> **Fecha de creación:** 2026-07-20 · **Ventana objetivo de deploy:** 1–2 semanas
> **Regla base (CLAUDE.md):** modificar solo lo estrictamente necesario. Nada especulativo.

---

## ⏸️ Punto de continuación — última sesión: 2026-07-27

## 🚀 EL SISTEMA ESTÁ EN PRODUCCIÓN — https://happy-wave-025ee9c10.7.azurestaticapps.net

**Dónde vamos:** **FASES 3, 4, 5, 6, 7 y 8 CERRADAS POR COMPLETO** (5.4 y 7.3 desde el 2026-07-24; la **8 el 2026-07-27**), **9.1 fases 1+2 EN PRODUCCIÓN Y VERIFICADAS**, y **9.1 fase 3 (dispositivo de confianza) DESPLEGADA Y VERIFICADA de punta a punta**. El sistema corre con **despliegue continuo en las dos mitades**, ambos con OIDC y **sin una sola credencial de larga vida**.

> ### ✅ TODO DESPLEGADO Y VERIFICADO
> Las **32 vulnerabilidades están parcheadas EN PRODUCCIÓN** (backend `da433cce`) y los dos gates de dependencias corrieron por primera vez y pasaron. Además, **6 selectores con el desplegable recortado por el `overflow` de la tabla, arreglados** (frontend `8de3e9a`). SPA `200` · `/api/*` `401` · `/api/login/` `400` · `/admin/login/` `200`, y el bundle servido coincide con el hash del build local.

**Hoy (2026-07-27) — 🔒 FASE 8 CERRADA.** Verificadas contra producción la de *rol estándar no borra* (en las **dos** capas: 403 de Django y `permission denied` de Postgres con `psql` como el rol), la de *foto a `registro_id` inexistente* (`404` con su mensaje propio) y, al final de la sesión, **el último punto que quedaba: logout / F5 / timer de inactividad**. El logout **invalida el refresh en el servidor** (`401 Token is blacklisted`), F5 rehidrata por las dos ramas y el timer corta de verdad a los 20 min. Además: el **rate limiter resultó estar hecho desde el 2026-07-22** —el checklist llevaba tres días diciendo lo contrario— y al comprobarlo apareció y se **midió** el **agujero de la ruta directa** (la IP que ven `axes` y el throttle es falsificable). Decisión: documentarlo y **empujar las fases 4 y 5 del MFA**, que es lo que de verdad lo tapa. Y ya al final de la sesión, **desplegada la funcionalidad de Empate** en la Bitácora de Gastos (frontend `b10e464`), que además la separa de la Carta Porte — **sin tocar el backend**. Ver su sección.

**También el 2026-07-27, ya cerrada la fase, dos entregas más:** el **Empate en la Bitácora de Sueño** (frontend `165a752`) — mismo botón, pero en vez de sumar pesos **une los dos folios en la casilla U9**: `{folio 1}, {folio 2}`, p. ej. `C-2242-2, O-2243`, sin tocar el backend. Y un **fallo real de producción**: el selector de destino de Maniobras rechazaba cualquier ciudad de más de 20 caracteres. El tope no estaba en la base ni en el front, sino en una línea de validación del `ManiobraSerializer` (`serializers.py:80`); **`origen` y `destino` subidos a 30** (backend `87472437`), **sin migración** — las columnas ya eran `max_length=100`. ⚠️ Los catálogos `Origen`/`Destino.ciudad` permiten **255**, así que un nombre de más de 30 volvería a fallar: queda por medir el máximo real en producción con `SELECT MAX(LENGTH(ciudad)) FROM api_destino;` (y `api_origen`).

**El 2026-07-24:** cerrado el **`drift`** del TOTP (arreglo de fondo `OTP_TOTP_SYNC=False`), desplegada la nueva funcionalidad de **Vacíos** (filtros Pendientes/Todos/Entregados + Transportista + operador de entrega "Entregó" + fix de overflow) con migraciones `0025`–`0027` en prod, **ensayada la restauración del PITR** (el hueco más grave de la Fase 8), **ampliada la ventana PITR de 7 a 35 días por $0**, **cerrada la 7.3** — que destapó y parcheó **32 vulnerabilidades reales** — y hecho un **barrido del overflow de los desplegables** (6 selectores arreglados, 12 de 14 ya con el patrón de portal). **Todo desplegado y verificado en producción.** Detalle en *"Lo que se hizo el 2026-07-24"*.

---

### 📌 LO QUE CORRE AHORA MISMO (para retomar)

| | Commit | Contenido |
|---|---|---|
| **Backend** | `87472437` | **origen/destino a 30 caracteres** (arreglo del fallo del selector de destino, sin migración) → sobre **7.3** (`da433cce`: `pip-audit` en el CI + django `6.0.7`, pillow `12.3.0`, pyjwt `2.13.0`), **Vacíos** (`01e9dc2e`), el arreglo del **`drift`** (`50fc5d41`) y la Fase 3 (`f8890152`) |
| **Frontend** | `165a752` | **Empate en la Bitácora de Sueño** (une los dos folios) → sobre el **Empate en la Bitácora de Gastos** + separación de la Carta Porte (`b10e464`), el **barrido del overflow** (`8de3e9a`, 6 selectores: `77a8052` + `fbc653a` + `8de3e9a`), **7.3** (`9ac993a`: `npm audit` + axios `1.18.1`) y **Vacíos** (`8701420`) |

**Estado: sano y verificado.** API 401 sin token, SPA 200, `/admin` 200. **Circuito de confianza probado en producción**: alta marcando la casilla, salto del código al reentrar, revocación desde el perfil, y vuelta a exigir código tras revocar. 64 pruebas de backend con BD real + **16 de frontend** (5 inactividad + 4 MFA + 7 suma de pesos, todas con `node --test`). Ambos repos limpios y pusheados.

**✅ El incidente de TOTP (`drift`) del 2026-07-23 quedó RESUELTO Y VERIFICADO EN PRODUCCIÓN (2026-07-24): `OTP_TOTP_SYNC=False` + piso de `tolerance=2` desplegados, `UPDATE` aplicado y login TOTP real verificado (`drift` siguió en 0). Ver la sección "El incidente del `drift`".**

### ⚠️ Lo primero que hay que saber mañana

**La consola SSH del portal de Azure NO funciona con esta imagen, y nunca ha funcionado.** El `Dockerfile` no instala `openssh-server`: no hay nada escuchando en el 2222, así que la consola se queda en negro para siempre. Todo lo que este plan decía sobre "aplicar migraciones por SSH" era una suposición no verificada.

**Cómo se aplica una migración de verdad** (probado el 2026-07-23 con la `0022`):

1. `az postgres flexible-server firewall-rule create -g rg-cdm-prod -s psql-cdm-fraba -n temporal --start-ip-address <IP> --end-ip-address <IP>`
2. Volcar los *app settings* del App Service a variables de entorno y correr `Manage.py migrate api` **en local contra la BD de producción**. Django ya lee la base de `DB_*`, y `DB_ADMIN_USER` tiene los permisos.
3. Comprobar antes con `showmigrations api` que lo pendiente es **solo** lo que se quiere aplicar.
4. **Borrar la regla** (`firewall-rule delete ... --yes`) y confirmar que solo quedan las 19 `webapp-*`.

Ojo: el parámetro del nombre de la regla es `-n`, y el del servidor `-s`. `--rule-name` no existe en esta versión del CLI. **Este mismo método se usó para la `0022`, la `0023` y la `0024`** — es la vía oficial de migraciones en este proyecto.

**Para escribir datos (no migraciones) contra la BD de producción** —p. ej. arreglar el `drift` de un dispositivo— la vía es `psql -f fichero.sql` con las credenciales sacadas de los *app settings* en el momento (`$env:PGPASSWORD` para no imprimirla). El clasificador de permisos **bloquea** el atajo `manage.py shell < script.py` (ejecución de código arbitrario contra prod), pero **deja pasar `psql`** con SQL explícito y acotado — que además es más auditable.

### 🔨 Lo que se hizo el 2026-07-23, en orden

1. **MFA fases 1+2 cerradas y verificadas** — campo del código en el login (`594339a`, `src/Login/mfa.mjs` con 4 pruebas), migración `0022` aplicada y permisos verificados contra la base real, y el arreglo del 500 (`907f7970`, ver abajo). **En producción funcionando.**
2. **Infra de pruebas con BD (`0ae874f1`)** — `config/settings_test.py` con `MIGRATION_MODULES = {'api': None}` para poder probar contra Postgres real saltando las migraciones que tocan tablas `managed=False`. **Postgres 18 añadido al CI** (no SQLite: no implementa `select_for_update`, el fallo que se quería cazar).
3. **Fase 3 completa** — modelo `DispositivoConfianza` + `0023`/`0024` (`17631e40`, aplicadas y verificadas en prod), lógica de cookie en el login + endpoint de revocación + panel `/admin` (`14623e70`), y frontend con casilla + lista en el perfil (`c2ba1a0`). Desplegada de punta a punta.
4. **Arreglo del CI (`f8890152`)** — las pruebas nuevas hacían peticiones HTTP reales y en CI (`DEBUG=False`) `SECURE_SSL_REDIRECT` las mandaba a un 301. Apagado en `settings_test`. Fallo que **solo aparece con `DEBUG=False`** — invisible en local, cazado por el CI.
5. **Incidente del `drift`** (ver sección propia) — tras el deploy, el login con TOTP rechazaba códigos válidos. Resuelto a mano. **Punto de fondo sin cerrar.**

### 🔨 Lo que se hizo el 2026-07-24, en orden

1. **Cierre del `drift` (9.1) — desplegado y verificado en producción** (`50fc5d41`, ver su sección). Diagnóstico primero (D1: reloj del contenedor exacto contra Google; D2: un solo dispositivo, `drift=0`), y el arreglo de fondo: **`OTP_TOTP_SYNC=False`** en `config/settings.py` (django-otp deja de **persistir** el `drift`) + **piso de `tolerance=2`** vía `pre_save` en `api/Apps.py` (los dispositivos nuevos nacen con ±60 s) + **regresión con BD** (`api/test_otp_drift.py`, 2 pruebas). `UPDATE` de tolerance al dispositivo existente. **Sin migración** (la `0022` ya concedía el `UPDATE`). **Suite con BD: 64/64** (drift +2). Login TOTP real verificado (`drift` siguió en 0).

2. **Vacíos — nueva funcionalidad, desplegada y verificada en producción** (backend `01e9dc2e`, frontend `8701420`). Se usa el status del vacío de verdad y se añaden dos campos nuevos:
   - **Filtro por status en la página**: botones **Pendientes** (por defecto, primero) / **Todos** / **Entregados**, resueltos en el **backend** (`?status=`; `VacioViewSet` con `DjangoFilterBackend` + `filterset_fields=['status']`), que es lo correcto con el scroll infinito paginado (en cliente solo filtraría lo ya cargado).
   - **Columna "Operador" → "OP del Viaje"**: sigue mostrando los choferes de Fraba Container (`/choferes/`) y gana una **opción fija extra "Tercero"** (prop `opcionesExtra` en `OperadorSelector`, sin afectar a Maniobras).
   - **Nueva columna "Transportista"** (tras OP del Viaje) — `TransportistaSelector`, como en Maniobras.
   - **Nueva columna "Entregó"** (segundo operador, tras Transportista) — `OperadorSelector` filtrado por el transportista elegido del propio vacío (FRABA CONTAINER o vacío → `/choferes/`; tercero → `/operadores-terceros/`), mismo patrón que Maniobras.
   - **Modelo `Vacio`** (managed=False): +`transportista`, +`operador_entrega`. Columnas reales por **migración `0025`** (`SeparateDatabaseAndState` + `RunSQL ALTER TABLE … IF NOT EXISTS`, patrón de 0017/0019; GRANTs a nivel de tabla → sin GRANT nuevo). Serializer `__all__` → los campos se exponen solos. La validación `_validar_operador_vigente` no bloquea "Tercero" (solo bloquea a un chofer real con licencia vencida).
   - **CSS (punto 10)**: los botones nuevos con el look de "OP del Viaje". Y **fix de overflow**: `VacioStatusSelector` y `TransportistaSelector` pasan a **portal `position:fixed`** (mismo patrón que `OperadorSelector`) para que el desplegable no lo recorte el `overflow` de la tabla — también arregla el mismo bug latente en **Maniobras**.
   - **Datos**: **migración `0026`** (los vacíos sin status → `entregado`, petición del usuario) y **`0027`** (normaliza el status a minúsculas: había **200 filas `ENTREGADO` en MAYÚSCULAS** heredadas que no casaban con el filtro/selector; tras ambas: **224 `entregado` + 2 `pendiente`**).

3. **Migraciones `0025`/`0026`/`0027` aplicadas a producción** por la vía oficial (firewall + `migrate api` contra la BD de prod) y **antes** de desplegar el backend, para que las columnas existieran cuando arrancara el código nuevo — misma lección de secuenciación del `drift`. Firewall cerrado y verificado (solo 19 `webapp-*`), ambos CI en verde, `/api/vacios/` en **401**.

   ⚠️ **Corrección (2026-08-10, al desplegar la `0032`):** este punto decía que ese 401 confirmaba que las columnas estaban y que un 500 delataría que faltaban. **Es falso.** DRF resuelve `IsAuthenticated` *antes* de evaluar el queryset, así que una petición sin token nunca llega a tocar la tabla: un 401 solo prueba que la app arranca. Verificar una columna exige una petición **autenticada** (abrir la página con sesión) o mirar la BD. Y un 500 en los segundos siguientes al paso *Desplegar en la Web App* es el contenedor reiniciando — esperar y repetir antes de sospechar del esquema.

4. **Ensayo de restauración del PITR — el hueco más grave de la Fase 8, CERRADO.** Ver su sección propia abajo. Producción no se tocó en ningún momento.

5. **Ventana PITR ampliada de 7 a 35 días, por $0** (aplicado en producción). Ver *"Por qué 35 días salen gratis"*.

6. **7.3 CERRADA — auditoría de dependencias en los dos pipelines, y 32 vulnerabilidades reales parcheadas.** ✅ **Desplegado y verificado** (backend `da433cce`, frontend `9ac993a`). Ver *"7.3 y lo que destapó"*.

7. **Barrido completo del overflow de los desplegables — 6 selectores arreglados** (frontend `77a8052`, `fbc653a`, `8de3e9a`). Todos desplegados y verificados.

### 🧹 El barrido del overflow de los selectores (2026-07-24)

**El bug, uno solo repetido en varios sitios:** el desplegable se renderizaba con `position: absolute` **dentro** de la tabla, así que el `overflow` de esta lo recortaba. En las últimas filas —o cuando quedaban pocos registros de un status— la lista se cortaba y no se podía elegir.

**El arreglo, el mismo patrón en todos:** portal a `document.body` + `position: fixed` con coordenadas de `getBoundingClientRect()`, más reposicionado en `scroll` y `resize`. Es el patrón que ya usaban `OperadorSelector`, `TransportistaSelector` y `VacioStatusSelector` desde el fix del 2026-07-24. **No se inventó nada.**

| Commit | Selectores | Dónde |
|---|---|---|
| `77a8052` | `StatusSelector` | Tabla de Maniobras |
| `fbc653a` | `PatioSelector` | Vacíos ×3, Maniobras ×2 |
| `8de3e9a` | `CiudadSelector`, `RemolqueSelector`, `TerceroSelector`, `ClienteSelector`, `TipoServicioSelector` | Tabla de Maniobras |

⚠️ **El detalle que habría fallado EN SILENCIO, y que hay que recordar si algún día se porta otro selector:** con el portal, la lista deja de estar dentro de `containerRef`, así que **el handler de click-fuera tiene que excluirla explícitamente**. Sin eso, el `mousedown` sobre una opción cierra el desplegable **antes** de que llegue el `click`, y la selección se pierde sin ningún error visible — el clásico "le doy y no hace nada". En `StatusSelector` pesa el doble, porque **por diseño no se cierra al seleccionar** (hay que poder elegir el segundo status del máximo de 2).

`useDropdownNav` **no hubo que tocarlo**: ya estaba pensado para portales (su `dropdownRef` va separado del wrapper justo por esto). `TerceroSelector`, `ClienteSelector` y `TipoServicioSelector` tenían `z-index` 100/200 → suben a 9999 como el resto.

**Estado: 12 de los 14 selectores usan el patrón.** Quedan **`CargoSelector`** (CatalogosPage) y **`FolioSelector`** (GastosPage + 3 modales), **deliberadamente sin tocar**: viven donde no está confirmado que el overflow los recorte, y no se cambian sin comprobarlo. Comando para volver a auditarlos:

```bash
grep -rn "top: calc(100% + 4px)" src/components/*/*.css   # los que aún se recortan
```

8. **Ambos push desplegados y verificados (00:19 UTC).** Los dos gates corrieron por primera vez: `pip-audit` → *"No known vulnerabilities found"*; `npm audit` → *"nada alto/critico fuera de la lista de excepciones"* (detectó react-router y lo dejó pasar por la excepción documentada). Salud: SPA `200` · `/api/*` sin token `401` · `/api/login/` `400` · `/admin/login/` `200`. **El bundle servido (`index-CxHlow1h.js`) coincide con el hash del build local** → lo publicado es el artefacto correcto.

### ✅ Ensayo de restauración del PITR (2026-07-24) — el respaldo SÍ es restaurable

El plan llevaba desde el arranque con el mismo aviso: *"un respaldo sin probar no es un respaldo"*. Probado.

**Cómo se hizo** (receta reutilizable, ~35 min de reloj y **coste ~$0.05**):

1. `az postgres flexible-server restore -g rg-cdm-prod -n psql-cdm-restore-test --source-server psql-cdm-fraba --restore-time "<ISO8601 UTC>" --no-wait -y`
2. Esperar a `state = Ready` — **tardó 5 minutos**, mucho menos de lo temido.
3. Abrir el firewall **solo en el servidor de prueba** para la IP del operador y consultar con `psql`. Las credenciales (`cdmadmin`) y las **19 reglas `webapp-*` se heredan del original**.
4. `az postgres flexible-server delete -g rg-cdm-prod -n psql-cdm-restore-test --yes`.

**Lo importante: un restore PITR crea un servidor NUEVO y no toca el original.** Es una prueba sin riesgo para producción — no había motivo para haberla pospuesto tanto.

**Las 9 comprobaciones, todas en verde:**

| # | Comprueba | Resultado |
|---|---|---|
| 1 | Tablas base | **37** (las 36 documentadas + `api_dispositivoconfianza` de la `0023`) ✅ |
| 2 | Políticas RLS | **42** = las 39 documentadas + **3 de `api_dispositivoconfianza`** ✅ |
| 3 | Rol `django_standard_role` | existe y con login ✅ |
| 4 | Migraciones | **73** (67 + `0022`…`0027`), con fechas correctas ✅ |
| 5 | Datos | **412 maniobras** (crecieron desde las 405: uso real) · **226 vacíos** ✅ |
| 6 | Columnas de la `0025` | `vacios.transportista` + `vacios.operador_entrega` ✅ |
| 7 | Dispositivo TOTP | 1 fila, **`drift = 0`, `tolerance = 2`** ✅ |
| 8 | Auditoría `0019` | 4 columnas en `maniobras`, `vacios`, `gastos`, `api_movimientolocal` ✅ |
| 9 | `DispositivoConfianza` | 2 equipos de confianza reales ✅ |

**Y el efecto de las migraciones de DATOS**, que es la prueba más fina: `224 entregado + 2 pendiente`, **exactamente** el resultado de las `0026`/`0027`. No basta con que la migración figure como aplicada; las 200 filas que reescribió también viajaron en el respaldo.

El punto 7 cierra un círculo: **el arreglo del `drift` de esta misma mañana ya está dentro del respaldo**.

**Los dos "descuadres" NO eran descuadres** (37 vs 36 tablas, 42 vs 39 políticas): ambos se explican por la tabla que creó la `0023`, posterior a cuando se escribieron esas cifras en este documento. Se verificaron uno por uno en vez de darlos por buenos.

**Estado tras el ensayo:** `rg-cdm-prod` de vuelta a sus **5 recursos**, firewall de producción con las **19 `webapp-*`** intactas (nunca se tocó), servidor de producción `Ready`.

⚠️ **Lo que este ensayo NO prueba:** que el rol estándar siga sin poder borrar (las políticas RLS *existen*, pero no se ejercitaron con ese rol) y que la app arranque contra el servidor restaurado. Para un desastre real quedaría además repuntar `DB_HOST` en los *app settings*, que es un paso de un minuto pero tampoco se ensayó.

### 💰 Por qué 35 días de PITR salen gratis (2026-07-24) — APLICADO

**Aplicado en producción:** `az postgres flexible-server update -g rg-cdm-prod -n psql-cdm-fraba --backup-retention 35`. Operación **online**, sin reinicio ni corte. Servidor `Ready` después.

**Los números, medidos con `az monitor metrics list` (no estimados):**

```
Almacenamiento aprovisionado ......... 32 GB
Respaldo GRATIS incluido (100% de él)  32 GB
Respaldo usado con 7 días ............  1.88 GB   ← el 6% de la cuota
Datos del servidor ...................  4.12 GB
Precio si te pasaras ................. $0.1045/GB/mes
Rango permitido por Azure ............ 7 a 35 días
```

Tendría que crecer **17 veces** antes de costar un céntimo. Por eso se fue directo al máximo (35) en vez de a un valor intermedio: no hay ninguna razón de coste para quedarse corto.

⚠️ **Dos matices que hay que recordar:**

1. **No recibes 35 días de historia hoy — recibes 35 días dentro de 35 días.** `earliestRestoreDate` siguió en `2026-07-21` tras el cambio. La ventana crece desde ahora en vez de podarse a los 7.
2. El 5–10 GB que se estimó para 35 días es **razonamiento, no medición**. La comprobación es gratis: vigilar `backup_storage_used` unas semanas. Y si algo saliera mal, se vuelve a 7 con el mismo comando.

**Para qué sirve, en una frase:** tu ventana de recuperación tiene que ser **más larga que tu ciclo de detección**. Con 7 días, un cierre mensual que descubre un descuadre llega tarde por definición. Precedente real en este mismo sistema: las **200 filas `ENTREGADO` en MAYÚSCULAS** llevaban meses ahí sin que nadie lo notara (se descubrieron de casualidad, al construir el filtro de Vacíos). Fueron cosméticas; una corrupción destructiva con 7 días de ventana habría sido irrecuperable.

### 💸 Backup Vault: analizado a fondo y APARCADO (decisión del 2026-07-24)

Se investigó a fondo la vía nativa para 5.4 y **se decidió no contratarla**. Queda escrito con los datos para que nadie repita la investigación.

**Precios reales (API de precios de Azure, Mexico Central):**

```
PostgreSQL Protected Instance ...... $8.25 / mes  ← cuota FIJA por instancia
Standard LRS Data Stored ........... $0.02464 / GB / mes
```

Son **~$99/año**, y la cuota es fija: la pagas igual con 3 MB que con 300 GB. Con C5 en $60 de techo y ~$48–53 de gasto, dejaba el presupuesto rozando o pasado.

**Lo que sí se verificó (y salió bien, para cuando se retome):**

| Verificación | Resultado |
|---|---|
| ¿Existe en Mexico Central? | ✅ Sí — **B1 se cumple** |
| ¿A dónde restaura? | ✅ Tres modos, **no solo ficheros**: `data-recovery`, `data-recovery-as-files`, `item-recovery` |
| ¿Hace falta un Key Vault? | ✅ **No.** `--secret-store-*` son opcionales; el camino es `--use-system-identity` (identidad administrada, como `AcrPull`) |
| ¿Inmutabilidad y borrado suave? | ✅ Los dos: `--immutability-state Disabled\|Unlocked\|Locked` y `--soft-delete-state` (por defecto On, 14 días) |
| ¿Soporta Flexible Server? | ✅ Tipo de origen `AzureDatabaseForPostgreSQLFlexibleServer` |
| ¿Política por defecto? | ✅ `BackupWeekly` (`P1W`) con retención 3 meses (`P3M`) — **justo lo que pide B3, sin tocar nada** |

**Por qué se aparcó de todas formas.** Durante el análisis se cayeron, uno a uno, los argumentos que lo justificaban:

- ~~"Protege del borrado del servidor"~~ → **`az postgres flexible-server revive-dropped` ya revive un servidor borrado** dentro de la retención. Cubierto sin pagar.
- ~~"Da retención más larga"~~ → **ampliar el PITR a 35 días sale gratis** (sección de arriba).
- ~~"Es el respaldo semanal que pide B3"~~ → la *intención* de B3 (no perder datos) queda mejor cubierta con 35 días de PITR **probado restaurable** que con 7 días sin probar, que es de donde veníamos.

**Lo único que quedaba en pie eran dos cosas**, y no se consideraron suficientes hoy:

1. **Inmutabilidad `Locked`** — respaldos que nadie puede borrar ni acortar, ni con permisos totales sobre la suscripción. El PITR no tiene nada equivalente. **Es el argumento serio**, y el que habría que reevaluar si alguna vez preocupa el ransomware o un administrador comprometido.
2. **Retención por encima de 35 días** — el PITR tope es 35. Si aparece un requisito fiscal en años, el vault es la única vía.

⚠️ **B3 queda formalmente replanteada:** decía "PITR 7 días + export semanal". Hoy es **"PITR 35 días, verificado restaurable"**. Se cumple la intención, no la letra. **Revisar si:** aparece un requisito de retención en años, o si la inmutabilidad pasa a ser una preocupación real.

*(La extensión `dataprotection` del CLI quedó instalada; se quita con `az extension remove --name dataprotection`.)*

### 🔒 7.3 CERRADA y lo que destapó (2026-07-24) — ✅ DESPLEGADA Y VERIFICADA

**Lo importante primero: había 32 vulnerabilidades reales en producción**, y ya están parcheadas (desplegadas el 2026-07-25 00:19 UTC, ver el final de la sección). El gate era la mitad menos urgente del trabajo.

Se corrieron los audits **en local antes** de cablear nada — decisión deliberada, y acertada: **un gate que rompiera en HIGH habría roto el pipeline en el primer push.**

**Backend — 29 avisos distintos en 3 paquetes, todos con arreglo de parche:**

| Paquete | De | A | Avisos |
|---|---|---|---|
| `django` | 6.0.4 | **6.0.7** | 11 |
| `pillow` | 12.2.0 | **12.3.0** | 13 |
| `pyjwt` | 2.12.1 | **2.13.0** | 5 |

Dos importan de verdad: **django sirve los datos fiscales y pyjwt firma los tokens de sesión.** Tras subirlos: `pip-audit` → **"No known vulnerabilities found"**, y la suite sigue en **64/64** contra Postgres real.

**Frontend — 3 hallazgos altos:**

- **`axios` 1.16.0 → 1.18.1** — 10 avisos (prototype pollution, DoS). Es el cliente de API entero. El arreglo cae dentro de `^1`, sin romper nada. Build limpio y **9/9** pruebas en verde después.
- **`react-router` 7.18.1 — EXCEPCIONADO** (`GHSA-qwww-vcr4-c8h2`, *"RSC Mode CSRF Bypass"*). **No hay arreglo hacia adelante**: el rango vulnerable es `7.12.0–8.2.0` y lo único que propone npm es **bajar a 7.11.0**, que rompe. Y se **verificó sobre el código** que el modo RSC no existe aquí: cero usos de `RSC`, `createStaticHandler`, `StaticRouterProvider`, `ServerRouter`, `unstable_*` ni APIs de render de servidor; todo el enrutado entra por `BrowserRouter` y hooks de cliente. La excepción está en `audit-excepciones.txt` **con su motivo y su condición de retirada escritos**.

**Cómo quedó el gate:**

| | Herramienta | Dónde | Umbral | Excepciones |
|---|---|---|---|---|
| Backend | `pip-audit` | **al final** del job `tests` | cualquier aviso conocido | `--ignore-vuln` (hoy ninguna) |
| Frontend | `npm audit` + `jq` | **antes** del build | `high` y `critical` | `audit-excepciones.txt` |

- El backend va **al final** a propósito: `pip install pip-audit` arrastra sus dependencias y podría alterar el entorno con el que acaban de correr las pruebas.
- El frontend va **antes** del build: si una dependencia está comprometida, no interesa ni compilarla.
- `npm audit` solo tiene `--audit-level` (todo o nada), así que el filtrado por aviso se hace con `jq` + `comm` contra el fichero de excepciones. **La lógica se probó en los dos sentidos**: pasa con la excepción puesta y **bloquea** sin ella.
- **Dato medido:** `--omit=dev` y el audit completo dan **los mismos 3 hallazgos** — las devDependencies están limpias. Por eso se auditan todas: no cuesta ruido.

✅ **DESPLEGADO Y VERIFICADO EN PRODUCCIÓN (2026-07-25 00:19 UTC).** Backend `da433cce` (3 jobs en verde, 1m2s + 39s + 1m28s) y frontend `77a8052` (1m17s).

**Los dos gates corrieron por primera vez y se comportaron como debían:**
- `pip-audit` → **"No known vulnerabilities found"**
- `npm audit` → **"nada alto/critico fuera de la lista de excepciones"** — detectó `GHSA-qwww-vcr4-c8h2` de react-router y lo dejó pasar por la excepción documentada. O sea: **el filtro con `jq` funciona en el runner real**, no solo en la prueba local.

Salud tras el despliegue: SPA `200` · `/api/*` sin token `401` · `/api/login/` POST vacío `400` · `/admin/login/` `200`. Y **el bundle servido (`index-CxHlow1h.js`) coincide con el hash del build local**, así que lo publicado es exactamente el artefacto verificado.

### 🧨 El fallo del `match_token`: necesita una transacción

Con la fase 1 desplegada, meter el código devolvía **500**:

```
django_otp/__init__.py line 97, in match_token
  for device in devices_for_user(user, for_verify=True)
TransactionManagementError: select_for_update cannot be used outside of a transaction.
```

`match_token` bloquea las filas del dispositivo con `select_for_update` para que dos peticiones no gasten el mismo código. Ese bloqueo **exige una transacción abierta** y Django corre en autocommit. Arreglado envolviéndolo en `transaction.atomic(using=get_db_alias())` — **el alias importa**: `/api/login/` lo enruta `RoleBasedRouter` a `standard`, y un `atomic` sobre `default` no habría abierto nada.

**La lección, que es la importante:** las 8 pruebas de la fase 1 estaban en verde **porque `match_token` estaba simulado**, y un mock no hace `select_for_update`. La prueba nueva comprueba la **envoltura** en vez del mock: que el `atomic` existe, que envuelve a `match_token` y que va sobre el alias del router. Es la segunda vez en dos días que 9.1 cae por algo que las pruebas no podían ver — la primera fue la secuenciación, esta el mock.

**Síntoma engañoso:** el front pintaba *"usuario o contraseña incorrectos"*. No era un fallo del front: un 500 no trae el campo `codigo`, y ante un error desconocido lo correcto es volver al primer paso.

### 🧨🧨 El incidente del `drift` (2026-07-23, tras el deploy de la fase 3) — ✅ RESUELTO Y VERIFICADO EN PRODUCCIÓN (2026-07-24)

Tras desplegar la fase 3, el login con TOTP empezó a **rechazar códigos válidos**: contraseña correcta → pide código → código correcto → *"código inválido"* → tras 5 intentos, axes bloquea la cuenta.

**No era el código nuevo.** El log no mostraba ninguna excepción: `match_token` devolvía `None` limpiamente. El diagnóstico contra la BD reveló la causa:

- El dispositivo TOTP del admin tenía **`drift = -2`** con `tolerance = 1`. Eso hace que el servidor solo acepte códigos para la ventana `[ahora−90 s, ahora−30 s]`. Un teléfono **en hora** genera el código para `ahora`, que cae **fuera** → rechazado.
- El reloj del contenedor **nuevo** se verificó **correcto** (cabecera `Date` del backend = hora real al segundo).
- **Causa raíz:** django-otp *reaprende* el `drift` en cada verificación para seguir el desfase del móvil. Ese `−2` se aprendió contra el reloj del contenedor **anterior** (que iba ~60 s adelantado). El redeploy levantó un contenedor con el reloj correcto, y el `−2` que antes compensaba pasó a descentrar la ventana.

**El arreglo (a mano):** `UPDATE otp_totp_totpdevice SET drift = 0 WHERE user_id = (admin)` + `DELETE FROM axes_accessattempt WHERE username = 'admin'` (levantar el bloqueo). Vía `psql -f` con el firewall abierto a la IP del operador. Con el reloj del contenedor verificado correcto, `drift = 0` centra la ventana en la hora real y el teléfono vuelve a entrar. **Verificado: el admin entra.**

**✅ RESOLUCIÓN (2026-07-24) — desplegado y verificado en producción.**

**Diagnóstico primero (regla "no suponer"):**
- **D1 — reloj del contenedor actual:** exacto. La cabecera `Date` del App Service coincide con la de Google al segundo en 4 muestras (`app_vs_ref = 0.0s`). El `-2` vino de un contenedor **histórico** con reloj malo, no del actual.
- **D2 — estado en la BD:** un solo dispositivo (`user_id 6`), `drift = 0` (el arreglo a mano aguantó), `tolerance = 1`.

Conclusión: el reloj actual está bien; la **acumulación del `drift`** es lo que convirtió un desfase transitorio en bloqueo permanente. Como con n=1–2 no se puede probar que ningún contenedor futuro venga bien, se ataca la **causa**, no el síntoma:

- **`OTP_TOTP_SYNC = False`** (`config/settings.py`) — django-otp deja de **persistir** el `drift`. Un contenedor con reloj torcido, si acaso, causa un fallo **temporal que se auto-cura** al redesplegar, sin tocar la BD. El anti-reuso lo sigue dando `last_t`.
- **`tolerance` piso de 2 (±60 s)** — un `pre_save` en `api/Apps.py` lo fija al crear cada dispositivo (cubre los ~20 de la fase 4 **sin paso manual**). No afecta el anti-reuso (lo da `last_t`); solo tolera más desfase de reloj.
- **Regresión con BD** (`api/test_otp_drift.py`, 2 pruebas): que el `drift` no se persiste y que un dispositivo nuevo nace con `tolerance = 2`. **Suite completa: 64/64 en verde** (antes 62).

**No necesita migración** (la `0022` ya concede `UPDATE` sobre `otp_totp_totpdevice`). **Los tests de MFA mockean `match_token`, así que no se rompió ninguno.**

**✅ Desplegado y verificado en producción (2026-07-24):**
1. Push a `backend/api` desplegado — CI en verde (corrida *"9.1 drift…"*, que ejecutó `test_otp_drift.py`), API `401` sana tras el reinicio.
2. `UPDATE otp_totp_totpdevice SET tolerance = 2` aplicado — el dispositivo existente (`user_id 6`) quedó en `tolerance = 2`.
3. Login TOTP real verificado: entró con el código de 6 dígitos (`last_t` avanzó → pasó por `match_token`, no por la cookie de confianza) y el `drift` **siguió en 0** tras el login (confirma `OTP_TOTP_SYNC=False` activo).

Con esto, la **fase 5** deja de tener el riesgo de dejar gente fuera.

**Lección:** el TOTP no es solo código; es estado (`drift`, `last_t`) que vive en la BD y depende del reloj del servidor. Un cambio de infraestructura (redeploy → contenedor nuevo) puede invalidar ese estado sin tocar una línea. Es la hermana operativa de las otras dos lecciones de 9.1 (secuenciación, mock).

### 🔗 Empate en la Bitácora de Gastos (2026-07-27) — ✅ DESPLEGADO Y VERIFICADO

**Qué hace:** en la Bitácora de Gastos se pueden **empatar dos folios** y el peso que va al documento (celda `I3`) es la **suma** de ambos. El resto de los datos salen siempre del primero.

**Y de paso, la Bitácora se separó de la Carta Porte.** No existía como documento propio: vivía dentro de `CtaPortModal`, que disparaba los dos endpoints en secuencia con un único payload compartido. Eso arrastraba dos defectos:

- `total_gastos` **bloqueaba también a la Carta Porte** — era imposible generarla sola sin teclear un total de gastos.
- Las descargas no eran atómicas: si fallaba la segunda, se marcaba error y nunca se llegaba a `setExito`, pese a que el primer PDF ya había bajado.

Ahora cada documento tiene su tarjeta y su modal, y **los dos defectos quedan cerrados de rebote**.

**Cómo se declara el empate:** un botón **"Empate"** pegado al selector de folio; al activarlo aparece un segundo selector. Se puso ahí, y no como un campo más del formulario, para que se lea como una propiedad de la elección de folio.

**Si los dos folios difieren** en algo que se imprime (destino, operador, placas, remolques) sale un aviso diciendo qué campo y con qué valores. **Informa, no bloquea**: hay empates legítimos entre viajes con distinto operador.

**El backend NO se tocó**, y esa es la parte que abarató todo el trabajo: `DocumentoBitacoraGastosView` **ni siquiera lee el `folio`** — recibe 7 campos ya resueltos por el cliente, y el peso pasa por `_sumar_peso` (`views.py:226-243`), que acepta sin cambios un total ya sumado. **Cero migraciones, cero cambios de API, cero despliegue de backend.**

⚠️ **Por qué la suma se replica en el cliente** (`src/utils/sumarPeso.mjs`): el total hay que **pintarlo** en el modal antes de generar, y lo que se pinta es exactamente lo que se manda — así no hay dos fuentes de verdad. Devuelve **cadena vacía y no `0`** cuando no hay nada numérico: un cero se escribiría en la celda como un peso real de 0 KG. Módulo suelto y sin React, mismo criterio que `inactividad.mjs`, para probarlo con `node --test` sin arrastrar un framework. **7 pruebas**; suite del frontend: **16/16**.

⚠️ **Prefijo CSS `bgm-`, no `cpm-`**, a propósito: `CtaPortModal.css` y `CtaPorteTercerosModal.css` ya declaran las mismas clases globales y se pisan entre ellas según el orden del bundle. El modal nuevo no hereda ese lío.

⚠️ **Cabo suelto conocido:** `FolioSelector` sigue siendo uno de los **2 selectores sin el patrón de portal** (`position: absolute` + `top: calc(100% + 4px)`), y el cuerpo del modal lleva `overflow-y: auto`. Los dos selectores de folio se pusieron **arriba del todo** para que el desplegable abra hacia espacio libre, pero **no se ha auditado expresamente** que no se recorte en pantallas bajas. Si algún día se mueven de sitio, portarlo siguiendo *"El barrido del overflow de los selectores"* — recordando el detalle que falla en silencio: con portal **hay que excluir la lista del handler de click-fuera**.

**Verificado en producción (2026-07-27):** documentos generados correctamente por el usuario. SPA `200` · `/api/*` sin token `401` · `/api/login/` `400` · `/admin/login/` `200`, y **el bundle servido (`index-cR21fXzf.js`) coincide con el hash del build local** → lo publicado es el artefacto verificado.

### 🕳️ El agujero de la ruta directa (medido el 2026-07-27) — DOCUMENTADO, SIN PARCHEAR

**Qué pasa:** por la ruta directa a `app-cdm-fraba.azurewebsites.net`, la IP que usan `django-axes` y el throttle de DRF **es la que el atacante escriba en `X-Forwarded-For`**. No es una sospecha: está medido.

**Cómo se midió, sin desplegar nada** (receta reutilizable). `custom_exception_handler` (`api/utils.py:80-96`) registra **cada 401/403** con `client_ip(request)`, el método y la ruta. Basta pedir endpoints protegidos **sin token** —inerte: no toca `axes` y no hace falta ni un intento de login— usando una ruta distinta por caso para distinguirlos en el log:

| Petición | Cómo se envió | `ip=` registrado |
|---|---|---|
| `GET /api/maniobras/` | por la SWA, sin inyectar | `187.192.223.29` (la real) ✅ |
| `GET /api/vacios/` | **ruta directa + `X-Forwarded-For: 9.9.9.9`** | **`9.9.9.9`** ⚠️ |
| `GET /api/gastos/` | por la SWA + `X-Forwarded-For: 9.9.9.9` | `187.192.223.29` (la real) ✅ |
| `GET /api/maniobras/` | ruta directa, **sin** inyectar | `169.254.129.3` (respaldo `REMOTE_ADDR`) |

Los logs se bajan con `az webapp log download` y se leen **sin extraer el zip**: `ExtractToDirectory` revienta con estas rutas (igual que `Expand-Archive`), pero `[System.IO.Compression.ZipFile]::OpenRead` + `StreamReader` sobre la entrada `*_default_docker.log` funciona.

**Qué confirma cada línea:** por la SWA el diseño es correcto — la inyección queda fuera del alcance de la posición −2, tal y como se midió el 2026-07-22. Por la ruta directa hay un salto menos, así que **una sola** entrada inyectada cae justo en −2. Y sin inyectar, `169.254.129.3` (link-local, el front-end interno del App Service) confirma que el módulo degrada al respaldo como promete su cabecera.

**Consecuencia real:** `AXES_LOCKOUT_PARAMETERS = [['username','ip_address']]` y el throttle anónimo cuentan por IP. Rotando la cabecera en cada petición **ninguno de los dos contadores se llena nunca** → intentos de contraseña ilimitados contra una cuenta concreta. Muerde en las ~20 cuentas sin segundo factor; el admin está cubierto por TOTP desde 3.3.5.

⚠️ **La nota histórica de _"Por qué NO se cierra la ruta directa"_ no está equivocada, está incompleta.** Dice que por esa vía las peticiones *"caen al respaldo `REMOTE_ADDR` (seguro, pero compartido)"*, y es exacto — `169.254.129.3` lo prueba, y es compartido. Lo que le falta es que **basta inyectar una entrada para elegir el valor**. La cabecera de `api/client_ip.py:16-19` sí lo decía desde el principio.

**Por qué NO se parchea hoy.** Se evaluaron cuatro vías y se cayeron todas menos una:

- ~~**Discriminar por `Host`**~~ (no fiarse del XFF si entró por el hostname directo) → **refutado con datos**: solo `app-cdm-fraba.azurewebsites.net` está vinculado al App Service, y Azure devuelve `404 Site Not Found` a cualquier `Host` no vinculado **antes** de llegar a Django. La SWA solo puede estar enviando ese mismo host, así que Django ve lo mismo por las dos rutas.
- ~~**Contar entradas del XFF**~~ → la aritmética no distingue: a partir de 2 entradas, "SWA limpia" y "directa con una inyección" son idénticas.
- ~~**Techo alto por usuario en `axes`**~~ → **reintroduce el DoS descartado el 2026-07-22**: cualquiera podría dejar fuera a un operador una hora gastando N peticiones. Sube el coste del ataque ~10x pero no elimina la propiedad, y choca con el criterio ya congelado de no dejar fuera a los operadores. *(Además django-axes **no** admite dos umbrales por configuración: `handlers/database.py:110-121` colapsa los grupos con `max()` y `handlers/base.py:130-134` compara contra un único límite; el callable de `AXES_FAILURE_LIMIT` no sabe qué grupo produjo la cuenta. Y `AXES_ACCESS_FAILURE_LOG_PER_USER_LIMIT`, que por el nombre lo prometía, es retención de la tabla de log.)*
- ~~**Retardo progresivo (*tarpit*)**~~ → con 3 workers de gunicorn, mantener peticiones dormidas **es** el agotamiento de workers. Misma lección que dejó 3.1.5: *"el middleware anti-DoS era el vector de DoS más practicable"*.

**La única que sigue en pie, para cuando se retome:** que `client_ip` use la **última** entrada del XFF, que añade siempre el proxy inmediato y el cliente nunca controla. Por la ruta directa esa entrada es la IP real (mejor que hoy, que colapsa todo en una compartida); por la SWA es la IP de salida de la SWA, así que hay que reconocerla para saber que toca leer −2. **Bloqueante: no se tiene el conjunto de IPs de salida de la SWA** — el mismo cabo suelto del 2026-07-22. Cerrarlo exige redesplegar la sonda de `7fd084b5` (14 líneas en `api/utils.py`, ya escrita, ya filtra cabeceras con pinta de credencial) para capturarlas.

**Decisión (2026-07-27): documentar y empujar las fases 4 y 5 del MFA.** Es el arreglo de fondo y no cuesta ningún intercambio: con segundo factor obligatorio, acertar la contraseña deja de servir y el agujero pierde casi todo su valor. Lo que lo tiene parado no es técnico, es coordinar ~20 videollamadas.

**Revisar si:** las fases 4/5 se alargan, aparece un intento real de *spraying* en el log de seguridad, o se consigue el conjunto de IPs de salida de la SWA por otra vía.

### 🎯 Siguiente paso recomendado

🚩 **9.1 fase 4 — alta de los ~20 usuarios. Es la prioridad desde el 2026-07-27.**

Estuvo aplazada desde el 2026-07-24 por decisión del usuario, nunca por riesgo técnico: el arreglo del `drift` quedó cerrado y verificado. Lo que la sube de prioridad es el hallazgo de esta sesión — **mientras haya cuentas sin segundo factor, el agujero de la ruta directa permite intentos de contraseña ilimitados contra ellas**. El MFA ya no es solo una mejora pendiente: hoy es lo que tapa un agujero medido.

Sigue dependiendo de coordinar videollamadas con ~20 personas (decisión 7: QR por pantalla compartida). Y **antes de la fase 5**, ensayar la recuperación de una cuenta que pierde el móvil.

### ⚠️ Lo que hay que saber del nuevo gate de dependencias

A partir de ahora, si `pip-audit` o `npm audit` encuentran una vulnerabilidad publicada después del 2026-07-24, **el pipeline fallará a propósito y el despliegue se parará**. **No es una regresión: es el gate trabajando.** Se resuelve de una de dos formas:

- **Actualizar** el paquete (lo normal).
- **Documentar la excepción** si no hay arreglo o no aplica: frontend en `audit-excepciones.txt`, backend con `--ignore-vuln <ID>` en el workflow. **Siempre con el motivo y la condición de retirada escritos.**

**5.4 y 7.3 quedaron cerradas el 2026-07-24.** Estado tras la sesión del **2026-07-27**:
- ✅ **Rol estándar no borra — CERRADA**, en las dos capas: 403 de Django (probado desde la app) y `permission denied` de Postgres con `psql` como `django_standard_role`.
- ✅ **Foto a `registro_id` inexistente — CERRADA**: `404 {"detail":"El registro indicado no existe."}` contra producción.
- ✅ **Logout / refresh en F5 / timer de inactividad — CERRADA (2026-07-27)**, las tres en verde contra producción: logout con **refresh blacklisted** (`401`), F5 rehidratando por las dos ramas, y el timer cortando de verdad a los 20 min. **Con esto la FASE 8 queda CERRADA.**
- ✅ **Rate limiter (3.1.5/3.1.6) — ya estaba hecho** desde el 2026-07-22; el checklist llevaba tres días diciendo lo contrario. Ver el punto de la Fase 8.
- ⚠️ **NUEVO — agujero de la ruta directa, medido el 2026-07-27**: la IP que usan `axes` y el throttle **es falsificable** por la ruta directa al App Service. **Decidido: documentar y empujar las fases 4/5 del MFA**, no parchear. Ver *"El agujero de la ruta directa"*.
- **9.2** monitoreo · **9.3** tokens a cookies httpOnly (subió de prioridad con la fase 3 del MFA).

**9.1 fase 4** — alta de los ~20 usuarios (QR por videollamada, decisión 7), cuando se retome.

Después, la **fase 5**, el interruptor que hace el MFA obligatorio para todos. **Antes de la fase 5: ensayar la recuperación** de una cuenta que pierde el móvil (revocar equipos + cerrar sesiones desde `/admin`).

**Antes de la fase 5, ensayar la recuperación**: alguien pierde el móvil sin códigos de respaldo y el administrador debe poder rehabilitarlo desde `/admin`. El panel de la fase 3 ya lo permite (revocar equipos de confianza + la acción de cerrar sesiones); falta el ensayo real. Probarlo cuando ya haya pasado es tarde.

### 🧰 Detalles operativos que ahorran tiempo

- **La ventana de validez de un código TOTP es ~90 s, no 30**, y el `drift` la puede *descentrar*. `tolerance` (por defecto `1`) da ±30 s alrededor de `ahora + drift`. El `drift` lo reaprende django-otp del desfase del móvil **y del reloj del servidor** — y ahí está la trampa que estalló el 2026-07-23 (ver "El incidente del `drift`"): un `drift` heredado de un contenedor con otro reloj deja la ventana fuera de la hora real. El reuso sí está cerrado (`last_t`), verificado. **No bajar `tolerance` a 0** (dejaría fuera a cualquier reloj con 3 s de desfase); si acaso, **subirlo**.
- **Tras cada despliegue del backend, `/api/*` devuelve 500 durante ~1 minuto** mientras el contenedor reinicia. **No es una caída** — confirmado varias veces. Esperar y reintentar antes de diagnosticar nada.
- **Para leer los logs del contenedor**: `az webapp log download` y descomprimir con `[System.IO.Compression.ZipFile]` — `Expand-Archive` revienta con estas rutas. El fichero útil es `LogFiles/<fecha>_<host>_default_docker.log`.
- **Piping de PowerShell a un ejecutable mete un BOM** al principio: `python Manage.py shell` lo rechaza con `invalid non-printable character U+FEFF`. Redirigir desde fichero con `cmd /c "python Manage.py shell < fichero.py"`.
- **`az.cmd` rompe con `?`, `(`, `)` en `--query`** además de con `%`, `&`, `^`, `!`. Solución: pedir `-o json` sin `--query` y filtrar fuera.
- **PowerShell 5.1 se come las comillas dobles al pasar JSON a un `.exe`.** `curl.exe ... -d '{"refresh":"..."}'` llega al servidor como `{refresh:...}` y responde `400 JSON parse error ... char 1` — parece un fallo del endpoint y es del shell. Escapar: `-d "{\"refresh\":\"...\"}"`. Y usar **`curl.exe`**, no `curl`: en PS 5.1 `curl` es alias de `Invoke-WebRequest`, que además lanza excepción con un `401` y oculta el cuerpo que justamente se quiere leer.
- **`az webapp log tail | grep` no vuelca nada** por el buffering del pipe. Volcar a fichero y filtrar después.
- **`az webapp log tail` NO termina solo** y `kill %<id>` desde otra llamada de shell **no lo mata** (cada llamada corre en un shell nuevo, ese identificador no existe allí — el comando no falla, simplemente no hace nada). Cada uno deja 3 procesos vivos. Cerrarlos buscándolos por línea de comandos: `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'webapp log tail' } | Stop-Process -Force`.
- **El proyecto YA tiene infraestructura de pruebas con BD** (desde `0ae874f1`): `Manage.py test api --settings=config.settings_test`. Usa `MIGRATION_MODULES = {'api': None}` para crear las tablas desde los modelos y saltar las migraciones de `api` (que tocan tablas `managed=False` inexistentes en una base vacía, y la `0019` reventaría). El CI lo corre con Postgres 18 real. **Límite grabado en el propio fichero:** en la base de test NO existe `django_standard_role` ni la RLS/GRANTs, así que los dos alias usan el usuario admin — **sirve para lógica y escrituras, NO para dar por buenos los permisos de un rol** (eso se verifica contra la base real, como con la `0022`/`0024`). Toda prueba con BD debe declarar `databases = {'default', 'standard'}`.
- **Fallo que solo aparece con `DEBUG=False`:** `SECURE_SSL_REDIRECT` manda a un 301 cualquier petición HTTP del test client. `settings_test` lo apaga. Reproducir en local forzando `DJANGO_DEBUG=False` antes de asumir que el CI miente.
- **Migraciones `managed=False` en la BD de test:** aunque `api` se salta, una FK cross-app (p. ej. `DispositivoConfianza.usuario → auth_user`) rompe la creación de la BD porque syncdb crea las tablas de `api` ANTES que las migraciones de `auth`. Solución usada: `db_constraint=False` en esa FK (el cascade del ORM sigue actuando; un huérfano solo por SQL crudo).
- Servidores de desarrollo **parados** al cerrar la sesión. Postgres 18 sigue corriendo como servicio de Windows.

### Cambio de arquitectura respecto al plan original

**Container Apps NO existe en ninguna región de México** (verificado contra la API: 38 regiones soportadas, ninguna en MX). Era incompatible con la decisión **B1**. Se sustituyó por **App Service (Web App for Containers) B1 en Mexico Central**, que corre el mismo Dockerfile sin cambios.

Además, **el plan Free de Static Web Apps no permite enlazar un backend propio** (requiere Standard, $9.90/mes), así que la decisión E2 tenía un coste no contemplado.

Resultado: **más barato que el plan original** (~$48–53 vs $51–70 estimados) y cumpliendo B1 sin excepciones. Lo que se "pierde" de Container Apps (escala a cero, escalado agresivo) son cosas que el plan explícitamente no quería — D1 exige réplica siempre encendida. Se ganan *deployment slots*.

### Recursos desplegados

| Recurso | Nombre | Región | Coste/mes |
|---|---|---|---|
| Resource Group | `rg-cdm-prod` | Mexico Central | $0 |
| App Service Plan | `plan-cdm-prod` (B1 Linux) | **Querétaro** | $13.65 |
| Web App | `app-cdm-fraba` | **Querétaro** | — |
| PostgreSQL Flexible | `psql-cdm-fraba` (B1ms, v18, 32 GB, PITR 7d) | **Querétaro** | $13.65 + ~$5 |
| Container Registry | `acrcdmfraba` (Basic) | **Querétaro** | $5.07 |
| Static Web App | `swa-cdm-fraba` (Standard) | Central US* | $9.90 |

\* SWA no existe en México, pero solo aloja el JS/CSS compilado — **ni un dato fiscal**. Postgres y el App Service, donde vive y se procesa todo, están en Querétaro. **B1 se cumple sin asteriscos.**

### Verificado en producción

- **Login real** → HTTP 200, JWT emitido
- **405 maniobras** leídas desde Postgres en Querétaro
- **Catálogos y `folios-recientes`** con `tipo_servicio` incluido
- Un registro antiguo con `tipo_servicio=None` funciona vía *fallback* — como se diseñó
- Cabeceras reales: CSP, HSTS (2 años), `X-Frame-Options: DENY`, `nosniff`
- `manage.py check --deploy` **sin advertencias contra la base real**

### ⚠️ Easy Auth desactivado para poder usar `/admin` (2026-07-21)

Al enlazar el backend, Azure activó **Easy Auth** exigiendo identidad para todo, con la SWA como único emisor de confianza. Efecto colateral: **`/admin` quedó inalcanzable** — la SWA solo proxya `/api/*` (el prefijo no se puede cambiar) y el acceso directo daba 401. Sin panel no hay forma de dar de alta usuarios ni cambiar contraseñas.

Se intentó primero lo más quirúrgico: `globalValidation.excludedPaths` con `/admin` y `/static`. **No funciona.** Con rutas exactas sí pasa (`/admin` dio 301) pero no sirve, porque el panel tiene rutas dinámicas (`/admin/auth/user/7/change/`). Con comodines (`/admin*`) hubo un falso positivo — devolvió 200 durante la propagación y volvió a 401 al estabilizarse; 6 pasadas tras reiniciar lo confirmaron.

**Decisión: desactivar Easy Auth** (`requireAuthentication: false`). El backend pasa a estar protegido solo por Django, que es quien de verdad protege:

| Capa | Dónde |
|---|---|
| **JWT obligatorio en todos los endpoints** (`IsAuthenticated` por defecto) | `settings.py:167` |
| Throttling 30/min anónimo · 200/min autenticado | DRF |
| ~~Bloqueo por IP con 503~~ **(`IPRateLimitMiddleware` se eliminó en 3.1.5, 2026-07-22)** | — |
| django-axes: 5 fallos → 1 hora bloqueado | `AXES_FAILURE_LIMIT` |
| RLS: el rol estándar no puede borrar ni con SQL | migración 0005 |
| **MFA TOTP obligatorio** en `/admin` | Fase 3.3.5 |

**Verificado tras el cambio** (5 pasadas estables + login real): `/admin/login/` 200 · CSS del panel 200 · `/api/*` sin JWT **401** · SPA intacto. Login completo con usuario + contraseña + TOTP funcionando, y **rechazo confirmado con TOTP inválido** — el MFA no es decorativo.

**Reversible:** volver a poner `requireAuthentication: true`.

> **Deuda para Fase 9 — gestión de usuarios en la app.** La solución ideal es un `/api/usuarios/` con pantalla propia en el SPA: daría autonomía **con el backend cerrado**. Cuando esté hecha, se puede volver a activar Easy Auth y quedarse con lo mejor de ambas. Ojo: aun así haría falta `/admin` para registrar los TOTP de nuevos administradores.

### 🔒 Timer de inactividad — la sesión ahora caduca de verdad (2026-07-22)

Auditando la duración real de las sesiones aparecieron **dos huecos con el mismo síntoma: la sesión parecía cerrarse y no se cerraba.**

1. **A los 20 min solo se pintaba un modal.** El `logout()` —el que invalida el refresh en el servidor vía blacklist— ocurría **únicamente si alguien pulsaba "Aceptar"**. Si el usuario se levantaba y se iba, la pantalla decía "expirada" mientras los tokens seguían vivos en `sessionStorage` y el refresh seguía siendo válido hasta 12 h. Ahora expira de verdad: `logout()` + salida al login, que muestra el aviso. No se espera al logout antes de redirigir, para no dejar al usuario dentro si la red va lenta; los tokens se limpian igual, falle o no la petición.
2. **El aviso de los 10 min se cancelaba solo con mover el ratón.** `mousemove` contaba como actividad, así que acercarse al botón "Aceptar" ya reiniciaba el contador **antes** de pulsarlo: el botón nunca llegaba a significar nada, pese a que el código decía haber excluido `click` justo para eso. Ahora, con el aviso en pantalla la actividad se ignora; "Aceptar" levanta el bloqueo pero **tampoco reinicia por sí solo** — hace falta interactuar después.

La lógica se extrajo a `src/hooks/inactividad.mjs`: pura, sin React y con **5 pruebas** que corren con `node --test` (stdlib, cero dependencias nuevas). Son cuatro estados en una ruta de seguridad y una regresión aquí significa sesiones que no caducan. El hook quedó **más corto** que antes.

```bash
node --test src/hooks/inactividad.test.mjs   # 5 pass
```

**Duraciones vigentes** (todas verificadas en código, ninguna se lee de entorno):

| Capa | Valor | Dónde |
|---|---|---|
| Access token | 60 min, se renueva solo en cada 401 (single-flight) | `config/settings.py:190` |
| Refresh token | **12 h absolutas desde el login** — `ROTATE_REFRESH_TOKENS` está en `False`, así que **no desliza** | `config/settings.py:191` |
| Aviso de inactividad | 10 min | `src/hooks/inactividad.mjs` |
| Cierre por inactividad | 20 min | `src/hooks/inactividad.mjs` |
| Cierre de pestaña | inmediato (`sessionStorage`, sobrevive a F5) | `AuthContext.jsx` |

⚠️ **Pendiente de decidir:** el techo de **12 h no desliza**. Quien entre a las 07:00 queda desconectado a las 19:00 aunque esté trabajando. Con turnos largos esto se va a notar; la solución sería activar `ROTATE_REFRESH_TOKENS`, que el punto 3.3.2 difirió a propósito por el coste en el front.

### Seguridad de la cadena de despliegue

- **El backend NO es accesible directamente**: al enlazarlo con la SWA, Azure activa Easy Auth y solo responde a través de ella. Un 401 en `app-cdm-fraba.azurewebsites.net` significa *vivo y protegido*.
- **CI sin contraseñas**: OIDC federado en **las dos ramas de despliegue**, cada una con su credencial atada a un subject exacto — `backend/api` (backend) y `feature/inicio-botones` (frontend). Los tres secretos de GitHub son identificadores, no credenciales. **En GitHub no vive ni un solo secreto de larga vida.**
- **Permisos mínimos** del service principal, uno por recurso y ninguno de más: `AcrPush` solo en el registry, `Website Contributor` solo en la Web App, `SWA Deploy Token Reader` (rol **personalizado**: leer y listar el token, nada más) solo en la Static Web App. No puede tocar la BD, ni borrar la SWA.
- **Identidad administrada** para bajar imágenes (`AcrPull`): sin credenciales de registry.
- **Firewall de BD**: solo las 19 IPs de salida de la Web App. La IP del desarrollador se retiró tras migrar.
- **Credenciales rotadas** (F4): ninguna reutiliza las de desarrollo.

### Datos migrados

Copia completa de dev verificada: 36 tablas, **39 políticas RLS**, 67 migraciones, 405 maniobras, 226 vacíos, catálogos completos. **Cero errores** en la restauración. Sin usuarios, sesiones ni dispositivos OTP de dev (decisión del usuario).

✅ **Equipo dado de alta** (2026-07-22): usuarios admin y estándar creados desde `/admin` sin incidencias. Producción ya no depende de una sola cuenta.

**Git — todo commiteado y pusheado** (GitHub `DevMoicas/ControlDeManiobras`):

| Rama | Commit | Contenido |
|---|---|---|
| `backend/api` | `8f28f2f8` | Fases 3.1 + 3.2 + 3.3 |
| `backend/api` | `f5054e6b` | **Fase 3.4** — logging a stdout + auditoría (migración `0019`) |
| `backend/api` | `a5c41718` | Tipo de servicio explícito en Maniobra (migración `0020`) — *funcionalidad* |
| `backend/api` | `0cd69747` | **Fase 3.4.2** — logging de eventos de seguridad |
| `backend/api` | `9050f38c` | Arregla el test obsoleto de `codigo_pis` → suite en verde |
| `backend/api` | `55291a34` | **Bug CSP**: `default-src 'none'` rompía `/admin` (sin estilos, QR bloqueado) |
| `backend/api` | `77542ae7` | **Fase 3.3.5** paso 1 — instala `django-otp` (migración `0021`) |
| `backend/api` | `12a07b7a` | **Fase 3.3.5** paso 2 — activa el MFA en `/admin` |
| `backend/api` | `8602a73` → `29c83ee` | **Fases 4 y 7.2** — contenerización, nombres de archivo para Linux y el pipeline del backend (8 commits) |
| `feature/inicio-botones` | `239d327` | Fase 3.3 front |
| `feature/inicio-botones` | `40ba468` | Tipo de servicio en el front |
| `feature/inicio-botones` | `dd8f302` | **Fase 7.1** — pipeline del frontend con OIDC |
| `feature/inicio-botones` | `e6f93cc` | **Timer de inactividad** — la sesión caduca de verdad a los 20 min (+5 pruebas) |
| `feature/inicio-botones` | `5ac0aa1` | **Arreglos de UI en móvil** — scroll al navegar, tablas de Catálogos y campo de fecha de Mov. Locales (merge `--no-ff`, 3 commits) |
| `backend/api` | `1e5647ec` | **3.1.5/3.1.6** — IP real tras el proxy, fuera el rate limiter casero, +4x concurrencia |
| `backend/api` | `dc67b336` → `16600ffc` | MFA fase 1 **desplegado y revertido** el mismo día (ver 9.1) |
| `mfa/fase-1-exigir-totp` | `c2179db9` | **Fase 1 del MFA, lista y sin fusionar.** Empujada a GitHub para que no dependa de una sola máquina |
| `backend/api` | `50fc5d41` | **Cierre del `drift` (9.1)** — `OTP_TOTP_SYNC=False` + piso de `tolerance=2` (signal) + regresión con BD `test_otp_drift.py` (2026-07-24) |
| `backend/api` | `01e9dc2e` | **Vacíos** — `transportista` + `operador_entrega`, filtro `?status=`, migraciones `0025`/`0026`/`0027` (2026-07-24) — *funcionalidad* |
| `feature/inicio-botones` | `8701420` | **Vacíos** — filtros de status, "OP del Viaje" + Tercero, Transportista/Entregó, fix de overflow en dropdowns (2026-07-24) — *funcionalidad* |
| `backend/api` | `da433cce` | ✅ **EN PRODUCCIÓN** — **7.3**: `pip-audit` en el CI + django `6.0.7`, pillow `12.3.0`, pyjwt `2.13.0` (29 avisos cerrados) (2026-07-24) |
| `feature/inicio-botones` | `9ac993a` | ✅ **EN PRODUCCIÓN** — **7.3**: `npm audit` en el CI con `audit-excepciones.txt` + axios `1.18.1` (2026-07-24) |
| `feature/inicio-botones` | `77a8052` | ✅ **EN PRODUCCIÓN** — fix de overflow del `StatusSelector` (portal + `position: fixed`) (2026-07-24) |
| `feature/inicio-botones` | `fbc653a` | ✅ **EN PRODUCCIÓN** — overflow del `PatioSelector` (Vacíos y Maniobras) (2026-07-24) |
| `feature/inicio-botones` | `8de3e9a` | ✅ **EN PRODUCCIÓN** — overflow de los 5 selectores restantes de la tabla de Maniobras (2026-07-24) |
| `feature/inicio-botones` | `b10e464` | ✅ **EN PRODUCCIÓN** — **Empate** en la Bitácora de Gastos + separación de la Carta Porte (2026-07-27) — *funcionalidad, solo frontend* |

El trabajo de despliegue y el de funcionalidad van en commits separados a propósito: se puede revertir `a5c41718`/`40ba468` sin tocar el hardening.

**Suite de tests: 19/19 en verde** (`Manage.py test api`). Cubre el llenado de la Carta Porte por tipo de servicio, el logging de seguridad, las dos ramas de la CSP y el enforce del MFA.

**Estado del entorno de dev:**
- Migraciones `0019`, `0020` y `0021` **aplicadas**. `manage.py check` limpio.
- **`/admin` ya pide MFA.** Para entrar: usuario + contraseña + código TOTP. Códigos de respaldo guardados por el usuario (un solo uso cada uno).
- Frontend Vite en `:3000`, backend en `:8000`. ⚠️ En Windows quedan procesos `runserver` huérfanos escuchando en 8000 **a la vez** (SO_REUSEADDR): si un cambio "no se aplica", comprobar que solo hay **un** listener antes de sacar conclusiones. Pasó dos veces en la sesión y despistó el diagnóstico.
- Lockouts de axes de las pruebas limpiados con `manage.py axes_reset`.

**Pruebas pendientes de confirmar en el navegador** (código listo, falta validación en vivo):
- **3.3 (auth):** login OK, logout invalida el refresh (da 401 al reusarlo), auto-refresh en 401.
- **3.4 (auditoría):** crear/editar un registro y ver `created_by`/`updated_by`/`created_at`/`updated_at` en la respuesta (pestaña Network).
- **Tipo de servicio:** alta en Full con 2 pares, y generar la CTA PORTE en Excel para revisar A17/A18/A19/C17.

**Siguientes acciones, en orden:**
1. ~~Dar de alta al equipo~~ ✅ **hecho el 2026-07-22** — usuarios admin y estándar creados en `/admin` de producción.
2. ~~Probar el circuito completo a mano~~ ✅ **hecho el 2026-07-22** — alta de un Full y documentos generados en producción, sin incidencias.
3. ~~**Probar una restauración**~~ ✅ **hecho el 2026-07-24** — restore PITR verificado con 9 comprobaciones, servidor temporal borrado. Queda **5.4** (export semanal a blob), con la vía nativa ya identificada: Backup Vault, disponible en Mexico Central.
4. ~~3.1.5 / 3.1.6 — rate limiter e IP real~~ ✅ **hecho el 2026-07-22** (`1e5647ec`), con la topología medida y verificado en producción.
5. ❌ **Cerrar la ruta directa al App Service — DESCARTADO el 2026-07-22.** Ver el bloque *"Por qué no se cierra la ruta directa"* más abajo.
6. **9.1 — MFA en el login** (3.3.6). **Fase 0 ✅** (las dos minas resueltas) y **fase 1 escrita** en `mfa/fase-1-exigir-totp`. ⚠️ **Se intentó desplegar sola y hubo que revertir**: sin el campo del código en el frontend, deja fuera del SPA a la cuenta de administrador. Retomar con **las fases 1 y 2 juntas** y la migración `0022` aplicada **antes**.
7. **Fase 6** — export semanal a blob (5.4) y **probar una restauración**.
8. **7.3** — `pip-audit` y `npm audit` en los dos pipelines (A06).
9. **Fase 8** — checklist pre-deploy · **C3** — dominio propio.

**Herramientas disponibles:** `gh` CLI 2.96.0 y `az` CLI 2.88.0, ambos autenticados. `gh` en `C:\Program Files\GitHub CLI\gh.exe`, `az` en `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` — ninguno en el PATH de sesiones nuevas, usar ruta completa.

⚠️ **`az.cmd` es un batch de Windows:** valores con `%`, `&`, `^` o `!` truncan la línea de comandos **sin dar error**. Pasar la configuración por archivo JSON (`--settings @archivo.json`) o generar secretos con alfabeto seguro. Costó un rato de depuración.

⚠️ **Lo mismo aplica a `--query`** (visto el 2026-07-22): un JMESPath con `?`, `(` o `)` — p. ej. `[?contains(roleName,'X')]` — revienta el batch con *"No se esperaba ] en este momento"* o *"C:\Program no se reconoce"*. **Solución:** pedir `-o json` sin `--query` y filtrar fuera (PowerShell con `ConvertFrom-Json`). Los `--parameters @archivo.json` y `--role-definition @archivo.json` sí funcionan bien.

⚠️ **ACR Tasks (`az acr build`) está bloqueado en esta suscripción** — Microsoft lo restringe en suscripciones nuevas. Las imágenes se construyen en el runner de GitHub Actions.

### ❌ Por qué NO se cierra la ruta directa al App Service (decidido 2026-07-22)

Se preparó, se investigó a fondo y **se descartó**. Queda escrito para que nadie lo reintente sin conocer el motivo.

**La idea era:** restricciones de IP que solo dejaran entrar a la SWA, cerrando el acceso directo a `app-cdm-fraba.azurewebsites.net`. Habría cerrado el bloqueo de cuentas de `/admin` y eliminado la ambigüedad de las dos profundidades de proxy.

**Por qué no se puede, en orden de importancia:**

1. **Los administradores casi nunca trabajan desde la oficina.** El uso normal del panel es *desde fuera*. Una restricción por IP no sería un inconveniente ocasional: rompería el flujo de trabajo habitual.
2. **La IP de la oficina es dinámica y cambia con los cortes de luz.** La regla se rompería sola, en momentos impredecibles, y el síntoma sería confuso: la app funcionando y `/admin` sin cargar, sin motivo aparente.
3. **`/admin` solo es alcanzable por la ruta directa.** La SWA únicamente proxya `/api/*` y el prefijo no se puede cambiar.
4. **No hay forma limpia de identificar a la SWA.** No manda `X-Azure-FDID` (verificado sobre los volcados de la sonda: llegan 13 cabeceras y ninguna identifica Front Door), y la suscripción no tiene registrado `Microsoft.Network`, así que tampoco se pueden consultar las etiquetas de servicio.

**El riesgo que queda abierto, y por qué se acepta:** alguien puede bloquear la cuenta de administrador fallando 5 veces con su nombre. Pero **no consigue entrar** — `/admin` exige TOTP desde la Fase 3.3.5. Es un ataque contra la *disponibilidad*, temporal (1 hora) y recuperable con `axes_reset` desde la consola del contenedor. Cambiarlo por quedarse sin panel cada corte de luz sería mal negocio.

**La salida buena, para más adelante:** construir la gestión de usuarios dentro de la app (`/api/usuarios/`, la deuda ya anotada de la Fase 9). Si las altas y los cambios de contraseña se hacen desde el SPA —que va por la SWA, con las IPs bien resueltas—, `/admin` pasa a tocarse casi nunca y ahí sí tiene sentido cerrarlo o reactivar Easy Auth. Script preparado por si algún día cambian las condiciones: `scratchpad/cerrar-ruta-directa.sh`.

**Nota histórica —** `ipSecurityRestrictions` está en **"Allow all"**: cualquiera en internet llega a `app-cdm-fraba.azurewebsites.net` saltándose la SWA. La afirmación de más arriba de que *"el backend no es accesible directamente"* **quedó caduca al desactivar Easy Auth** el 2026-07-21. Mientras siga abierta, las peticiones por esa vía caen al respaldo `REMOTE_ADDR` (seguro, pero compartido) ⚠️ **— pero solo si el cliente NO inyecta `X-Forwarded-For`; si la inyecta, elige él la IP que ven `axes` y el throttle. Medido el 2026-07-27, ver *"El agujero de la ruta directa"*.** Y **`/admin` sigue expuesto al bloqueo de cuentas** porque solo se llega por ahí. Script preparado y sin ejecutar en `scratchpad/cerrar-ruta-directa.sh`; requiere confirmar antes el origen exacto de la SWA (una observación de `13.69.116.11` no es el conjunto).

**Puntos de retorno (rollback)** _(actualizado 2026-07-27)_**:** backend `git reset --hard da433cce` (**lo que corre hoy en producción** = 7.3 + parches) · `01e9dc2e` (antes de 7.3 = Vacíos, ⚠️ vuelve a las dependencias vulnerables) · `50fc5d41` (antes de Vacíos = solo el arreglo del `drift`) · `f8890152` (antes del `drift` = Fase 3 completa + arreglo de CI) · `14623e70` / `17631e40` (Fase 3 sin el arreglo de CI) · `12a07b7a` (Fase 3.3.5, anterior a la contenerización) · `55291a34` (antes del MFA) · `8f28f2f8` (antes de 3.4) · frontend `git reset --hard b10e464` (**lo que corre hoy en producción** = Empate en la Bitácora de Gastos) · `8de3e9a` (antes del Empate = barrido del overflow; ⚠️ vuelve a juntar la Bitácora dentro de la Carta Porte) · `77a8052` (solo `StatusSelector` arreglado) · `9ac993a` (7.3 front, antes de los fixes de overflow) · `8701420` (antes de 7.3 = Vacíos, ⚠️ vuelve a axios vulnerable) · `c2ba1a0` (antes de Vacíos = Fase 3 front) · `594339a` (MFA fase 2, antes de la Fase 3 front) · `5ac0aa1` (antes del MFA en el login — arreglos de UI móvil) · `e6f93cc` (antes de los arreglos de UI móvil) · `dd8f302` (antes del cambio del timer) · `40ba468` (antes del pipeline). ⚠️ Un rollback de código que quite las columnas de Vacíos NO deshace las migraciones `0025`–`0027` en la BD (son nullable e inocuas para el código viejo; el reverse de `0026`/`0027` es no-op).

**Deshacer la Fase 7.1 por completo**, si hiciera falta (3 comandos, sin residuo — no se modificó ningún recurso existente, solo se añadieron entradas):
```bash
az role assignment delete --assignee 9ad730d0-715f-4858-ba37-3961e8d63c00 \
  --role "SWA Deploy Token Reader" \
  --scope /subscriptions/9fe3f7ed-6b0c-48f0-b666-3478c2c568bd/resourceGroups/rg-cdm-prod/providers/Microsoft.Web/staticSites/swa-cdm-fraba
az ad app federated-credential delete --id 9ad730d0-715f-4858-ba37-3961e8d63c00 \
  --federated-credential-id github-frontend-inicio-botones
az role definition delete --name "SWA Deploy Token Reader"
```

---

## 0. Registro de decisiones (congeladas)

| # | Decisión | Valor |
|---|----------|-------|
| A1 | Modelo de acceso | Equipo pequeño: todos ven/agregan/editan; **solo admin borra** |
| A2 | Escala | 10–20 usuarios, ~6 concurrentes |
| A3 | Red | Internet abierto |
| A4 | MFA | Sí, para cuentas admin (`is_staff`) |
| B1 | Residencia de datos | **México** (datos fiscales: Carta Porte, pedimento, clave SAT) |
| B2 | Auditoría | Sí: registrar quién creó/modificó cada registro |
| B3 | Respaldos | PITR 7 días (gestionado) + export semanal |
| C1 | Base de datos | Nueva, gestionada en la nube |
| C4 | Operación | Sin equipo DevOps → todo gestionado / mínimo mantenimiento |
| C5 | Presupuesto | ~$45–60 USD/mes (contenedor encendido) |
| D1 | PDFs | **Mantener LibreOffice** (0–9 docs/día, no reescribir) |
| E1 | Build frontend | Migrar a **Vite** |
| E2 | Dominios | **Mismo origen** (Static Web Apps con backend enlazado, `/api` proxied) |
| F2 | Entornos | Solo producción + checklist robusto pre-deploy |
| F3 | CI/CD | GitHub Actions |
| F4 | Secretos | Secretos de plataforma + rotar credenciales |

**Pendiente externo:** dominio propio (C3) — se integra cuando exista.

---

## 1. Arquitectura objetivo

```
                    Internet (usuarios)
                          │  HTTPS
                          ▼
        ┌─────────────────────────────────────┐
        │   Azure Static Web Apps (Free)       │  ← SPA React (Vite)
        │   - CDN + TLS automático             │     Región: Mexico Central
        │   - Cabeceras CSP/HSTS               │
        │   - Backend enlazado: /api/* ────────┼──┐  (mismo origen, sin CORS)
        └─────────────────────────────────────┘  │
                                                  ▼
        ┌─────────────────────────────────────┐
        │   Azure Container Apps                │  ← Django + DRF + LibreOffice
        │   1 vCPU / 2 GB · 1 réplica siempre   │     (imagen Docker propia)
        │   encendida · Región Mexico Central   │     Gunicorn + WhiteNoise
        │   Secretos de plataforma             │
        └───────────────┬─────────────────────┘
                        │  TLS
                        ▼
        ┌─────────────────────────────────────┐
        │   PostgreSQL Flexible Server          │  ← Burstable B1ms
        │   RLS + roles (migración 0005)        │     PITR 7 días
        │   Región Mexico Central               │     Export semanal
        └─────────────────────────────────────┘

CI/CD: push a GitHub → GitHub Actions → build SPA + build/push imagen
       + migrate + deploy (Container Apps y SWA).
```

**Costo estimado:** contenedor $30–40 · Postgres $15–20 · SWA $0 · red ~$1 → **~$45–60/mes**
(Crédito gratuito de Azure ~$200 cubre el arranque inicial.)

---

## 2. Mapa OWASP Top 10 → dónde se atiende

| OWASP 2021 | Riesgo detectado | Fase que lo cierra |
|---|---|---|
| A01 Broken Access Control | IDOR en fotos; modelo abierto (aceptado) | 3.2 |
| A02 Cryptographic Failures | HTTPS off, tokens en sessionStorage, secretos en claro | 3.1 · 6 |
| A03 Injection | Inyección de fórmulas en Excel | 3.2 |
| A04 Insecure Design | Rate limiter por XFF spoofeable | 3.1 |
| A05 Security Misconfiguration | DEBUG=True, sin CSP en prod, fuga de `str(exc)` | 3.1 · 5 |
| A06 Vulnerable Components | `react-scripts` sin soporte | 4 (Vite) · 7 |
| A07 Auth Failures | Logout no invalida, sin rotación, sin MFA | 3.3 · 9 |
| A08 Integrity Failures | Mass assignment `__all__`; validación imagen por MIME | 3.2 |
| A09 Logging/Monitoring | Logs a archivo local, sin auditoría | 3.4 · 6 |
| A10 SSRF | Sin superficie | — |

---

## FASE 1 — Preparación (Día 1)

- [x] **1.1** ~~Rama `deploy/produccion`~~ — **no se hizo así.** Se trabajó sobre las ramas ya existentes: `backend/api` (backend) y `feature/inicio-botones` (frontend), ambas en el repo `DevMoicas/ControlDeManiobras`. Funcionó bien y evitó una migración de ramas innecesaria.
- [x] **1.2** Respaldo: `pg_dump` completo de la BD de dev antes de migrar a Azure (36 tablas, 39 políticas RLS, 1.1 MB).
- [x] **1.3** Suscripción Azure activa: `Azure subscription 1` (`9fe3f7ed-…`), tenant `frabasistemasoutlook.onmicrosoft.com`. Los 6 proveedores de recursos quedaron registrados.
- [x] **1.4** ⚠️ **Verificado, y cambió el plan.** **Container Apps NO existe en México** (38 regiones, ninguna MX) → se sustituyó por **App Service**. PostgreSQL Flexible con `Standard_B1ms` ✅ y Container Registry ✅ sí están en Mexico Central. Static Web Apps no, pero solo aloja estáticos. Ver el bloque de cambio de arquitectura arriba.
- [x] **1.5** El RLS llegó a producción **vía `pg_dump`/restore**, no re-ejecutando la `0005`: las 39 políticas y los 102 GRANT al rol estándar viajaron en el volcado. El rol `django_standard_role` se creó a mano en Azure **antes** de restaurar, porque las políticas lo referencian por nombre. Restauración con **cero errores**.

**Criterio de salida:** ✅ cuenta Azure lista, disponibilidad verificada (con hallazgo), RLS en producción confirmado.

---

## FASE 2 — Frontend: migración a Vite + config (Días 1–2)

> El build actual está roto: usa sintaxis Vite (`import.meta.env`) pero compila con
> CRA/webpack → hornea `localhost` en silencio. `vite.config.js` existe pero está muerto.

- [x] **2.1** Instalar Vite (`^6`) y `@vitejs/plugin-react`; quitar `react-scripts` (–1136 paquetes).
- [x] **2.2** Mover `public/index.html` a la raíz; `%PUBLIC_URL%/` → `/`; agregar `<script type="module" src="/src/index.jsx">`. Eliminado `public/index.html` viejo.
- [x] **2.3** Reactivar `vite.config.js`. **Añadido:** Google Fonts al CSP dev (`style-src`+`font-src`), que si no rompía el estilo al activar Vite.
- [x] **2.4** `.env.development` (`http://127.0.0.1:8000/api`) y `.env.production` (`/api`) **dentro** de `ControlDeManiobras/`.
- [x] **2.5** Scripts `dev`/`build`/`preview`; eliminados `start`/`test`/`eject` y `eslintConfig` (preset `react-app` ya no existe).
- [x] **2.6** Bloque `overrides` eliminado de `package.json`.
- [ ] **2.7** `apiClient.js`: reintento con refresh en **401**. → **MOVIDA a Fase 3.3.2**: solo tiene sentido cuando el access token dure 60 min (hoy dura 12 h, el interceptor no se dispararía). Se hace junto con el acortamiento del token.
- [x] **2.8** Build limpio verificado: **cero URLs de la app a `localhost`** (el único `localhost` residual es de una librería que usa `location.origin` en navegador).

**Extra (no planeado, necesario):** `AdministracionGastos.jsx` y `AdministracionNoEco.jsx` llamaban al backend **directo con `localhost`, sin token** (roto en prod por URL y por 401). Ruteados por `apiClient` → ahora usan `/api` y mandan el JWT.

**Ajustes surgidos al probar en dev (en `vite.config.js`):**
- CSP `connect-src`: usar el **origen** (`http://127.0.0.1:8000`), no la ruta `/api` — con ruta, el navegador exige match exacto y bloqueaba `/api/login/`.
- Dev server fijado en **puerto 3000** (`strictPort: true`) porque el backend solo permite CORS desde `:3000`. En prod es mismo origen, no aplica.
- ✅ **Verificado end-to-end:** login + interacción con la app funcionan con Vite.

**Notas para fases siguientes:**
- Renombrados `src/App.js`→`.jsx` y `src/index.js`→`.jsx` (Rollup no parsea JSX en `.js`).
- El `build/` viejo (salida de CRA, versionado) quedó obsoleto → Vite ahora genera `dist/`. Quitar `build/` del tracking y añadir `dist/` a `.gitignore` en Fase 7 (CI).
- Aviso de chunk >500 kB (recharts+chart.js+motion). No bloqueante; evaluar `manualChunks`/lazy-load en Fase 9 si importa el tiempo de carga.

**Criterio de salida:** ✅ `npm run build` produce bundle que apunta a `/api`, sin `localhost` horneado, y compila sin errores.

---

## FASE 3 — Backend: endurecimiento de código (Días 2–4)

### 3.1 Configuración y bloqueantes (A02, A04, A05)

- [x] **3.1.1** `settings.py`: bloque de producción **env-gated** con `if not DEBUG:` (SSL redirect, HSTS 1 año, cookies `Secure`, `SECURE_PROXY_SSL_HEADER`). Se activa solo en prod; en dev (`DEBUG=True`) queda inactivo → no rompe `http://localhost`.
- [x] **3.1.2** HSTS → lo emite `django.middleware.security.SecurityMiddleware` al fijar `SECURE_HSTS_SECONDS` (3.1.1). El header comentado del `SecurityHeadersMiddleware` se deja comentado a propósito para **no duplicarlo**.
- [ ] **3.1.3** `DJANGO_DEBUG=False` en el entorno de producción → **se hace en Fase 6** (variable de plataforma).
- [ ] **3.1.4** `ALLOWED_HOSTS` y `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` = dominio real → **se hace en Fase 6** (ya se leen de env; solo falta el valor de prod).
- [x] **3.1.5 / 3.1.6** ✅ **CERRADAS el 2026-07-22** (commit `1e5647ec`). Se resolvieron juntas y con la topología **medida en producción**, no supuesta — una sonda temporal (`7fd084b5`, ya retirada) volcó las cabeceras reales. Lo que apareció cambió el plan tres veces:
    - **La cadena real es** `[lo que inyecte el cliente...], <cliente>:puerto, <salida SWA>:puerto` → el cliente está en la posición **-2**. Los proxies añaden por la derecha, así que lo falsificado queda a la izquierda, fuera de alcance.
    - ⚠️ **El índice depende del camino**: por la ruta directa al App Service hay un salto menos y el cliente está en **-1**. Configurar para uno abre el agujero en el otro → de ahí que cerrar la ruta directa sea parte del mismo trabajo (pendiente, ver abajo).
    - ⚠️ **Azure incluye el PUERTO de origen**, que cambia en cada conexión TCP. Consecuencia demoledora: `IPRateLimitMiddleware` y el throttle de DRF usaban claves que contenían ese puerto, así que **abrían un contador nuevo en cada petición y contaban hasta 1**. Ambos límites llevaban todo este tiempo **inertes**, sin que nadie los atacara.
    - ⚠️ **`ipware` NO está instalado**, así que axes caía a `REMOTE_ADDR` **siempre** y cualquier `AXES_IPWARE_*` habría quedado inerte. Verificado en vivo. Por eso se usa `AXES_CLIENT_IP_CALLABLE`.
    - **`api/client_ip.py`** — una sola función para axes, el throttle y el log de seguridad, con **8 pruebas** que usan las cadenas XFF reales capturadas. Si llegan menos saltos de los esperados **no adivina**: cae a `REMOTE_ADDR`, que no es falsificable. Degrada sin abrir agujeros.
    - **`IPRateLimitMiddleware` ELIMINADO**: leía `XFF[0]` (la posición del atacante) y su diccionario no borraba entradas nunca — con el límite de cabecera de gunicorn en 8 KB, ~130.000 peticiones agotaban 1 GB en una máquina de 1,75 GB. **El middleware anti-DoS era el vector de DoS más practicable.**
    - **Verificado en producción**: 3 peticiones limpias + 3 con `X-Forwarded-For` falsificado → las 12 líneas del log registran la IP real `187.192.198.73`. La falsificación no funciona.
- [x] **3.1.7** Eliminadas las **3** fugas `str(exc)` en `views.py` (CTA PORT, Bitácora de Sueño, Bitácora de Gastos) — incluían el `stderr` de LibreOffice. Ahora `logger.exception(...)` interno + mensaje genérico. Verificado con `manage.py check` (0 issues).

### 3.2 Autorización, injection e integridad (A01, A03, A08)

- [x] **3.2.1** **IDOR en fotos**: `subir` ahora verifica con el ORM que la maniobra/vacío exista antes de crear la foto; si no, devuelve 404. Evita filas `FotoRegistro` huérfanas.
- [x] **3.2.2** **Inyección de fórmulas Excel** (A03): helper `_sin_formula()` (antepone `'` si el texto empieza por `= + - @`) aplicado con una línea `map()` a los valores de usuario en las 3 funciones (CTA PORT + Terceros vía `_generar_pdf_cta_port`, Bitácora Sueño, Bitácora Gastos). **No-op en datos legítimos** → documentos normales idénticos. Verificado con self-check. _Gap residual conocido y aceptado (modelo interno de confianza): inyección vía el campo `tipo` a través de `_parsear_tipo` no está cubierta — vector muy estrecho._
- [x] **3.2.3** **Validación real de imagen** (A08): `subir` valida los *magic bytes* con Pillow (`Image.verify()`) y **deriva el MIME del formato real**; se eliminó el chequeo por `content_type` (lo fija el cliente, superado por magic bytes).
- [x] **3.2.4** **Mass assignment** (A08) — **fix dirigido aplicado.** Análisis del inventario de modelos: **ninguno tiene campos de privilegio** (el rol vive en `auth_user.is_staff`, no en estas tablas) → el mass-assignment clásico (escalar privilegios) **no aplica aquí**. Único campo sensible: `Gasto.gastos_totales` (calculado en `save()`) → ahora `read_only`. **Decisión: NO se hace el refactor `__all__`→listas explícitas** en los 16 serializers: alto riesgo de romper el frontend, valor casi nulo con este modelo de datos plano. La protección de mass-assignment que sí importa son los campos de auditoría → se marcarán `read_only` en la Fase 3.4.
- [x] **3.2.5** Verificado: `destroy` restringido a `is_staff` sigue en su lugar en los ViewSets (modelo A1a). Sin cambios.

### 3.3 Autenticación (A07)

- [x] **3.3.1** `rest_framework_simplejwt.token_blacklist` en `INSTALLED_APPS`; migraciones aplicadas.
- [x] **3.3.2** `SIMPLE_JWT`: `ACCESS_TOKEN_LIFETIME = 60 min`, `REFRESH_TOKEN_LIFETIME = 12h`. **Rotación (`ROTATE_REFRESH_TOKENS`) diferida a propósito**: obliga a re-guardar el nuevo refresh en 2 sitios del front + casos borde multi-pestaña. Se añade después si se justifica. **+ Tarea 2.7 hecha:** `apiClient` renueva el access en **401** (single-flight) y reintenta la petición; también en `download`. `AuthContext.refreshOnMount` guarda el nuevo refresh si llega (a prueba de rotación futura).
- [x] **3.3.3** **Grants RLS** para las tablas de blacklist → nueva migración `0018_grant_blacklist_to_standard_role` (SELECT+INSERT + USAGE en secuencias para `django_standard_role`). **Verificado en Postgres**: los 6 privilegios sobreviven a las migraciones posteriores de `token_blacklist`.
- [x] **3.3.4** Logout server-side: ruta `/api/logout/` (`TokenBlacklistView`) invalida el refresh; `AuthContext.logout` la llama (best-effort) antes de limpiar `sessionStorage`.
- [x] **3.3.5** **MFA admin — `django-otp` + TOTP sobre `/admin`.** Se hizo en dos commits a propósito, para no quedarse fuera del panel: la página donde se registra el dispositivo vive *dentro* de `/admin`, así que activar el enforce antes de tener un dispositivo confirmado deja al admin sin forma de entrar a crearlo.
    - **Paso 1** (`77542ae7`): `django_otp` + `otp_totp` + `otp_static` en `INSTALLED_APPS`, `OTPMiddleware` tras `AuthenticationMiddleware`, tablas migradas. `/admin` seguía sin pedir código.
    - **Migración `0021`** — `GRANT SELECT` de las 3 tablas de OTP a `django_standard_role`. `OTPMiddleware` corre en **todas** las peticiones, no solo en `/admin/`: en producción, con mismo origen (E2), la cookie de sesión de `/admin` viaja también a `/api/*`, que va como rol estándar, y `is_verified()` reventaría con *permission denied*. Solo SELECT: lo que escribe ocurre en el login de `/admin`, que el `RoleRoutingMiddleware` enruta siempre a `default`. Mismo criterio que la `0018`.
    - **Códigos de respaldo** (`StaticToken`) generados para `admin` antes de activar nada.
    - **Paso 2** (`12a07b7a`): `admin.site.__class__ = OTPAdminSite` en `config/urls.py` — se intercambia la clase del sitio existente en lugar de instanciar uno nuevo, así se conservan los modelos registrados y el namespace `admin:`. Verificado sin usar la contraseña (sesión sin OTP → 302; con dispositivo verificado → 200; el login pide `otp_token`) y **confirmado en navegador por el usuario**.
    - ⚠️ **Gotcha del formulario:** el campo *User* de TOTP devices es `raw_id_fields`, o sea espera el **ID numérico** del usuario, no el username. Escribir el nombre falla la validación y no guarda nada. `admin` es el **ID 1**.
- [ ] **3.3.6** **MFA en el login de la app.** → **Planificado en detalle en la Fase 9.1.** ⚠️ El alcance cambió el 2026-07-22: era *"solo cuando el usuario es `is_staff`"* y pasa a ser **para todos los usuarios**. Motivo: el ataque del que protege —*password spraying*— va contra los usuarios normales, que son ~20; los `is_staff` son uno o dos y ya están cubiertos por la parte 1 en `/admin`. Limitarlo a admins no habría resuelto nada.

### 3.4 Logging y auditoría (A09, B2)

- [x] **3.4.1** `LOGGING`: `FileHandler` → **stdout** (`StreamHandler`). En contenedor lo captura la plataforma; en dev se ve en la consola de runserver. Verificado con `check`.
- [x] **3.4.2** **Logging de eventos de seguridad.** Canal propio `api.security` (handler a INFO; `api` y `django` se quedan en ERROR) con `propagate=False` para no duplicar. Se engancha a puntos que ya existían, sin middleware nuevo:
    - **Login OK** → `CustomTokenObtainPairSerializer.validate()`. El login JWT no llama a `django.contrib.auth.login()`, así que la señal `user_logged_in` nunca se dispara; este es el único punto que corre solo con credenciales correctas.
    - **Login fallido** → señal `user_login_failed` · **Lockout** → señal `axes.signals.user_locked_out`. Receptores a nivel de módulo en `api/Apps.py` (dentro de `ready()` el weakref de Django se los llevaría) con `dispatch_uid` para no duplicar.
    - **Accesos denegados 401/403** → `custom_exception_handler` en `api/utils.py`, único punto por el que pasan todas las excepciones de DRF. Se excluye la ruta de login (`url_name='login'`), que ya tiene su propia línea con el usuario intentado.
    - IP vía `axes.helpers.get_client_ip_address` para que log y lockout hablen de la misma IP. **Ojo:** hereda la confianza en XFF de axes; endurecerla depende del nº de proxies de Azure → tareas **3.1.5/3.1.6 en Fase 5**.
    - **Verificado en vivo** (`runserver` + curl): las 3 líneas salen — `login FALLIDO`, `LOCKOUT axes` (saltó de verdad al pasar los 5 intentos) y `acceso denegado 401 ... DELETE /api/maniobras/…`. **+ 4 tests** en `api/Tests.py` (`LoggingSeguridadTests`).
- [x] **3.4.3** **Auditoría (B2):** `created_by`/`updated_by` (username) + `created_at`/`updated_at` (auto) en **Maniobra, Gasto, Vacío y MovimientoLocal**. Migración `0019` (`SeparateDatabaseAndState`+`RunSQL` para las managed=False; `AddField` para MovimientoLocal). Se rellenan vía `AuditoriaMixin` en `perform_create/update` (Gasto lo hace en sus métodos propios). `editable=False`/auto → **read_only en el serializer** (cierra el mass-assignment de estos campos, A08). **Verificado**: 4/4 columnas en las 4 tablas + acceso del rol estándar. Historial completo de cambios (django-simple-history) queda opcional para después.

**Criterio de salida:** `python manage.py check --deploy` sin advertencias críticas; migraciones aplican limpio; suite manual de auth pasa.

---

## FASE 4 — Contenerización + artefactos de infra (Día 4)

- [x] **4.1** **`requirements.txt` completo.** Faltaban 4 que el código ya importaba o que hacen falta para servir en producción: `openpyxl==3.1.5`, `pillow==12.2.0`, `gunicorn==26.0.0`, `whitenoise==6.12.0` (+ `et-xmlfile`, `packaging` como transitivas fijadas). Ya estaban `django-otp` y `qrcode` de la Fase 3.3.5. **Comprobado** contra los imports reales del código: no queda ninguno sin declarar.
- [x] **4.2** **`Dockerfile`** (`ControlDeManiobras/Dockerfile`), base `python:3.14-slim` — misma versión menor que el entorno de dev.
    - `libreoffice-calc` + `fonts-dejavu-core` (sin fuentes el PDF sale con cuadros). **Sin `default-jre`** a propósito: la conversión xlsx→pdf no lo necesita y añade ~180 MB.
    - Dependencias en capa propia (solo se reinstalan si cambia `requirements.txt`), luego la app.
    - `collectstatic` **en el build**, no en el arranque. Necesita que carguen los settings y `settings.py` aborta sin `DJANGO_SECRET_KEY`, así que se le pasa una de usar y tirar solo para ese paso; la real llega por variable de entorno en ejecución (F4).
    - Usuario **no-root** `app` con `HOME=/home/app` — LibreOffice necesita un HOME escribible para su perfil.
    - **Gunicorn**, 3 workers, timeout 120 s (una conversión puede tardar; la app ya corta a 60 s por su cuenta), logs a stdout (encaja con 3.4.1).
- [x] **4.3** **`.dockerignore`.** Excluye `.env*`, `.venv`, `.git`, `node_modules`, `src/` (vacío, el SPA lo sirve SWA), `staticfiles/` (se regenera en el build), logs, `*.sql` y `*.md`. Además de tamaño, evita que credenciales locales queden horneadas en una capa (las capas sobreviven en el registro aunque un paso posterior borre el archivo). **Verificado** que los templates Excel (`api/documentos/templates/*.xlsx`) NO quedan excluidos — son imprescindibles.
- [x] **4.4** **Imagen validada en Linux, vía GitHub Actions.** Docker Desktop se instaló pero no arranca en esta máquina: el Ryzen 7 5700X tiene la virtualización **desactivada en la BIOS** (`VirtualizationFirmwareEnabled: False`) y además falta WSL. En vez de pelear con el hardware se validó en un runner de CI — **mejor**, porque prueba en el mismo Linux que Azure en vez de en WSL2 sobre Windows.
    - **`OK: Carta Porte generada — 113 438 bytes, cabecera %PDF-1.7`**, generada **dentro del contenedor**. LibreOffice headless convierte correctamente: el punto más frágil del despliegue, confirmado. El smoke test usa un full con dos contenedores, así que ejercita también el llenado de A17/A18/A19.
    - Gunicorn arranca con 3 workers; WhiteNoise sirve los estáticos del admin (200) mandando `X-Forwarded-Proto: https`, y sin esa cabecera responde 301 — o sea que `SECURE_SSL_REDIRECT` y `SECURE_PROXY_SSL_HEADER` quedan validados igual que se comportarán tras el ingress de Azure.
    - Si algún día se quiere Docker local: activar **SVM Mode** en la UEFI + `wsl --install` como administrador.
- [x] **4.5** **`staticwebapp.config.json`** en `front/ControlDeManiobras/public/` (Vite lo copia a `dist/`; **verificado** tras `vite build`).
    - **CSP de producción** más estricta que la de dev: `script-src 'self'` **sin** `unsafe-inline` ni `unsafe-eval` — se comprobó en `dist/index.html` que Vite no genera scripts inline (`unsafe-eval` solo lo pedía el HMR de dev). `style-src` conserva `'unsafe-inline'` porque la app usa atributos `style={{…}}`, y permite `fonts.googleapis.com`; `font-src` permite `fonts.gstatic.com` (las fuentes que precarga `index.html`). `connect-src 'self'` basta gracias al mismo origen (E2).
    - **HSTS** `max-age=63072000; includeSubDomains` — **sin `preload`** a propósito: entrar en la lista de preload es muy difícil de revertir.
    - `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
    - Fallback SPA a `index.html` excluyendo `/api/*` (si no, una llamada a la API que dé 404 devolvería el HTML del SPA), `/assets/*` y los archivos estáticos. **Verificado** que los `exclude` cubren todo lo que hay en `dist/`.

**Criterio de salida:** imagen Docker genera PDF ✅; SWA config lista con CSP/HSTS ✅. **FASE 4 CERRADA.**

> **Lección de esta fase:** los cuatro fallos al contenerizar eran **invisibles en Windows** — 8 archivos con mayúsculas en el índice de git, `DB_NAME` que en local venía del `.env`, y la redirección a HTTPS que en dev está desactivada. Ninguno se habría detectado sin ejecutar en Linux. Justifica no haberse saltado la 4.4.

> ⚠️ **Nota para la Fase 5:** los `globalHeaders` de SWA se aplican también a las respuestas del backend enlazado, así que la CSP de arriba puede sustituir a la `default-src 'none'` que el backend pone en `/api/*`. Es inocuo (son respuestas JSON, no cargan recursos), pero conviene confirmarlo con `curl -I` tras el despliegue.

---

## FASE 5 — Aprovisionamiento en Azure (Día 5)

- [x] **5.1** Grupo de recursos `rg-cdm-prod` en **Mexico Central** (Querétaro).
- [x] **5.2** **PostgreSQL Flexible `psql-cdm-fraba`** — Burstable **B1ms**, **v18** (igual que dev, 18.3), 32 GB, PITR **7 días**, TLS obligatorio. **Firewall cerrado**: solo las **19 IPs de salida** de la Web App. La IP del desarrollador se añadió para migrar y **se retiró** al terminar.
- [x] **5.3** BD `fraba_erp` creada y **poblada desde dev**. Verificado contra dev: 36 tablas, 39 políticas RLS, 67 migraciones, 405 maniobras, 226 vacíos, 9 gastos, catálogos completos. **Sin usuarios, sesiones ni dispositivos OTP de dev** (decisión del usuario). Superusuario nuevo creado **junto con su TOTP y códigos de respaldo** — el MFA ya estaba activo y su página de registro vive dentro de `/admin`.
- [x] **5.4** ✅ **RESUELTA POR OTRA VÍA el 2026-07-24 — B3 replanteada.** En vez del export semanal se amplió el **PITR de 7 a 35 días por $0**, sobre un respaldo **ya verificado restaurable** ese mismo día. Se cumple la intención de B3 (no perder datos), no su letra.
    - ✅ **Backup Vault analizado a fondo y APARCADO** — cuesta **$8.25/mes fijos** y sus tres argumentos se cayeron durante el análisis (`revive-dropped` cubre el borrado del servidor; los 35 días salen gratis; el PITR quedó probado). Lo único que quedaba en pie era la **inmutabilidad `Locked`**. Todo el detalle, precios y verificaciones en *"Backup Vault: analizado a fondo y APARCADO"* — **no hace falta repetir la investigación** si se retoma.
    - ❌ **Descartado: cron en GitHub Actions con `pg_dump` + blob.** Exigiría dar al service principal del CI permiso de firewall sobre Postgres, y eso **rompe una propiedad de seguridad ya documentada y verificada** ("el service principal no puede tocar la BD"). Más código y menos seguro.
- [x] **5.5** ~~Container App~~ → **App Service `app-cdm-fraba`** (Plan `plan-cdm-prod`, **B1 Linux**). `WEBSITES_PORT=8000`, **Always On** (sin arranque en frío por LibreOffice), `https-only`, **TLS mínimo 1.2**, FTP deshabilitado. Baja la imagen del registry con **identidad administrada** (`AcrPull`), sin contraseñas.
- [x] **5.6** **Static Web App `swa-cdm-fraba`** — plan **Standard** (el Free no permite backend enlazado), con el App Service enlazado en `/api/*`. SPA desplegado con `@azure/static-web-apps-cli`.
- [x] **5.7** **Mismo origen verificado extremo a extremo**: login real con JWT, 405 maniobras leídas desde Querétaro, catálogos y `folios-recientes` con `tipo_servicio`. El bundle no lleva `localhost` horneado y usa `/api` relativo. Cabeceras confirmadas: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`.

**Criterio de salida:** ✅ todo en Mexico Central salvo la SWA (solo estáticos), SPA y API por mismo origen. **FASE 5 CERRADA** salvo 5.4.

**Registro de recursos** (para `az` o el portal):

| Recurso | Nombre |
|---|---|
| Resource group | `rg-cdm-prod` |
| App Service Plan / Web App | `plan-cdm-prod` / `app-cdm-fraba` |
| PostgreSQL | `psql-cdm-fraba.postgres.database.azure.com` |
| Container Registry | `acrcdmfraba.azurecr.io` |
| Static Web App | `swa-cdm-fraba` → `happy-wave-025ee9c10.7.azurestaticapps.net` |

---

## FASE 6 — Secretos y rotación de credenciales (Día 5)

> Los secretos actuales (contraseñas de BD y `DJANGO_SECRET_KEY`) han vivido en `.env`
> en texto plano y con `DEBUG=True`. Se consideran **quemados**: no se reutilizan en prod.

- [x] **6.1** `DJANGO_SECRET_KEY` nuevo, 50 caracteres. ⚠️ **Se generó dos veces**: la primera contenía `%`, `&`, `^` y `!`, que `cmd.exe` interpreta como operadores y **truncaban el comando de `az` sin dar error** — la configuración parecía cargarse y no se cargaba. La definitiva usa alfabeto seguro para shells (~302 bits, misma fuerza).
- [x] **6.2** Contraseñas nuevas de 36 caracteres para `cdmadmin` (admin de BD) y `django_standard_role`. Ninguna reutiliza las de dev.
- [x] **6.3** Los 13 ajustes cargados como **app settings de la Web App** (cifrados en reposo, fuera de git). Se pasaron **por archivo JSON** (`--settings @archivo.json`), no por línea de comandos, justo por el problema del punto 6.1.
- [x] **6.4** `.env` está en `.gitignore` y **no aparece en el historial** — verificado con `git ls-files`. Los secretos de producción solo existen en Azure y en el gestor de contraseñas del usuario.
- [x] **6.5** *(añadido)* **Credenciales del CI sin secretos de larga vida**: OIDC federado contra `DevMoicas/ControlDeManiobras` rama `backend/api`. Los tres valores en GitHub Secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) son **identificadores, no credenciales**. Permisos mínimos: `AcrPush` solo en el registry, `Website Contributor` solo en la Web App — no puede tocar la BD.

**Criterio de salida:** ✅ cero secretos en el código; credenciales de prod nuevas. **FASE 6 CERRADA** salvo el export semanal (5.4).

---

## FASE 7 — CI/CD con GitHub Actions (Día 6)

- [x] **7.1** **Workflow del frontend** (`.github/workflows/frontend-ci.yml`, rama `feature/inicio-botones`). Sustituye al despliegue manual con `@azure/static-web-apps-cli`. Un solo job: `npm ci` → `vite build` → verificación → publicar a la SWA.
    - **Sin secretos de larga vida, igual que el backend (6.5).** El token de despliegue de la SWA se pide **en caliente** con `az staticwebapp secrets list`, se enmascara (`::add-mask::`) y muere con el job. Nunca se guarda en GitHub Secrets. Se descartó el camino habitual (token permanente como secreto) porque **backend y frontend comparten repositorio** y los secretos de repo son legibles por workflows de *cualquier* rama.
    - ⚠️ **No existe rol integrado de Azure para Static Web Apps** — verificado contra los 914 roles: `Website Contributor` cubre `Microsoft.Web/sites/*` (App Services), **no** `staticSites`. Solo `Contributor`/`Owner` llegan, vía comodín. Se creó un **rol personalizado `SWA Deploy Token Reader`** con exactamente dos acciones (`staticSites/read` + `staticSites/listSecrets/action`), asignado **solo** al recurso `swa-cdm-fraba`. Así el CI puede leer su token pero **no borrar ni reenlazar** la SWA, que es lo que `Contributor` habría permitido.
    - **Credencial federada** `github-frontend-inicio-botones` atada a `repo:DevMoicas/ControlDeManiobras:ref:refs/heads/feature/inicio-botones`. El subject es una cadena exacta, sin comodines: la credencial del backend **no sirve** para esta rama y viceversa. ⚠️ Si se renombra la rama, hay que registrar la credencial nueva o el deploy falla.
    - **Dos comprobaciones antes de publicar**, por los fallos que ya mordieron en la Fase 2: que el bundle no lleve el backend de dev horneado (`localhost:8000`/`127.0.0.1:8000` — se busca **con puerto** a propósito, porque hay un `localhost` legítimo de una librería) y que `staticwebapp.config.json` llegue a `dist/` (si falta, se pierden CSP, HSTS y el fallback SPA **sin que nada falle de forma visible**).
    - **Verificado en producción:** run verde en 1m24s y el bundle servido (`index-DhTVUIwD.js`) coincide con el del build local → lo publicado es el artefacto del pipeline. Cabeceras intactas y `/api/*` sin JWT sigue dando 401. El primer despliegue se hizo con la rama **sincronizada con origin**, así que publicó contenido idéntico al que ya estaba en vivo: estrenar el pipeline sin cambiar lo que ven los usuarios.
    - Anotación residual sin acción: `actions/checkout`, `setup-node` y `azure/login` declaran Node 20 y GitHub los fuerza a Node 24. Es de las propias actions, no del build (que va en Node 22). Se va sola cuando las actualicen.
- [x] **7.2** **Workflow del backend** (`.github/workflows/backend-ci.yml`), tres jobs encadenados:
    1. **`tests`** — `check` + las 19 pruebas en Linux. Se invoca sin módulo a propósito, para que el descubrimiento tenga que encontrarlas solo (en Linux el patrón `test*.py` distingue mayúsculas: protege contra un *"Ran 0 tests"* en falso).
    2. **`imagen`** — construye la imagen y **genera una Carta Porte real en PDF dentro del contenedor** (LibreOffice headless, el punto más frágil). Luego arranca gunicorn y comprueba que WhiteNoise sirve los estáticos, mandando `X-Forwarded-Proto: https` como hará el proxy — lo que de paso valida `SECURE_PROXY_SSL_HEADER`.
    3. **`desplegar`** — publica al registry y despliega. Imágenes etiquetadas con el **SHA del commit** además de `latest`, para poder volver a una versión concreta. **No corre en pull requests ni desde otras ramas**: un PR de un fork no debe poder desplegar.
    - ⚠️ **`manage.py migrate` NO está en el pipeline** a propósito: hoy las migraciones se aplican a mano. Automatizarlo requiere decidir qué pasa si una migración falla a mitad del despliegue. Pendiente de decidir.
- [x] **7.3** ✅ **CERRADA Y DESPLEGADA el 2026-07-24** — `pip-audit` en el backend y `npm audit` en el frontend, ambos rompiendo el build (A06), con lista de excepciones documentadas. Backend `da433cce`, frontend `9ac993a`. Destapó y parcheó **32 vulnerabilidades reales**. Los dos gates verificados corriendo en CI. Detalle en *"7.3 CERRADA y lo que destapó"*.
- [x] **7.4** Secretos del pipeline en GitHub Secrets — ver **6.5**: son identificadores OIDC, no credenciales.

**Criterio de salida:** ✅ un push a `backend/api` despliega el backend y uno a `feature/inicio-botones` despliega el frontend, ambos de forma reproducible y **sin credenciales de larga vida**. **Falta solo la auditoría de dependencias (7.3).**

⚠️ **`az acr build` no sirve aquí:** ACR Tasks está bloqueado en esta suscripción (Microsoft lo restringe en suscripciones nuevas). Las imágenes se construyen en el runner de GitHub Actions.

---

## FASE 8 — Checklist robusto PRE-DEPLOY (Día 7) 🔒 ✅ CERRADA (2026-07-27)

> Se ejecuta **completo** antes de cada publicación a producción (acuerdo F2, sin staging).

**✅ FASE 8 CERRADA el 2026-07-27.** El último punto (logout / F5 / timer en vivo) quedó verificado contra producción — ver abajo en *Funcional*. Dos cosas siguen abiertas y **no bloquean el cierre**, están aceptadas y documentadas:
> - **Rollback de imagen sin ensayar** (las imágenes están etiquetadas por SHA en el registry, pero nunca se ha vuelto a una anterior).
> - **El agujero de la ruta directa** (la IP que ven `axes` y el throttle es falsificable). Lo tapan las **fases 4 y 5 del MFA**, no la Fase 8. Ver su sección.

**Configuración**
- [x] `DJANGO_DEBUG=False` confirmado en el entorno de prod.
- [x] `check --deploy` **sin advertencias, ejecutado contra la BD real de Azure**.
- [x] `SECRET_KEY` de prod es nuevo y distinto al de dev.
- [x] `ALLOWED_HOSTS` = `app-cdm-fraba.azurewebsites.net,happy-wave-025ee9c10.7.azurestaticapps.net`.
- [x] HTTPS forzado (`https-only`, TLS mín. 1.2) + HSTS + cookies `Secure`.
- [x] `SECURE_PROXY_SSL_HEADER` configurado y **verificado en CI**: con `X-Forwarded-Proto: https` responde 200, sin la cabecera responde 301. Sin bucle de redirección.

**Seguridad**
- [x] CSP y HSTS respondiendo en el SPA — confirmado con `curl -D`.
- [x] Ningún endpoint devuelve `str(exc)` ni traceback (Fase 3.1).
- [x] Rate limiter — ⚠️ **este punto llevaba desde el 2026-07-22 diciendo lo contrario de lo que hace el código.** Decía que `IPRateLimitMiddleware` "sigue activo" y que 3.1.5/3.1.6 estaban pendientes; en realidad se cerraron ese mismo día (`1e5647ec`). Verificado contra el código el 2026-07-27: el middleware **no existe** (`api/middleware.py:1`, con el hueco comentado en `config/settings.py:69`), `AXES_CLIENT_IP_CALLABLE = 'api.client_ip.client_ip'` está puesto (`settings.py:319`) y los throttles de DRF son `AnonIpRealThrottle` / `UserIpRealThrottle` (`settings.py:174-177`). **Queda un riesgo residual real por la ruta directa** — ver *"El agujero de la ruta directa"*.
- [x] `django-axes` bloquea tras 5 intentos — **verificado en vivo** durante las pruebas. ⚠️ Lee la IP vía `axes.helpers`, que hereda la confianza en XFF; endurecerlo es parte de 3.1.6.
- [x] **MFA activo en `/admin`** — verificado con login real **y con rechazo confirmado de un TOTP inválido**.
- [x] Blacklist de JWT funcionando (Fase 3.3.4).
- [x] Fotos: no se puede subir a un `registro_id` inexistente — **VERIFICADO en producción (2026-07-27)**. `POST /api/fotos/subir/` con `registro_id=999999999` responde `404 {"detail":"El registro indicado no existe."}`. El mensaje identifica la rama exacta de `views.py:1010`, así que **no** es un 404 de enrutado de la SWA (ese vendría en HTML, no en JSON). El guard va **antes** de la comprobación del fichero, así que la prueba no escribe nada: es inocua y repetible. De paso quedaron verificados los demás validadores del endpoint: `tipo` inválido → `400`, `slot` fuera de {1,2} → `400`, sin token → `401`.
  - ⚠️ Al leer el resultado, no fiarse del código solo: un `404` con cuerpo vacío sería indistinguible del de enrutado. **Lo que cierra la prueba es el cuerpo JSON con el mensaje propio.**
- [x] ~~Serializers sin `__all__`~~ — **decisión 3.2.4: no se refactorizan**. El mass-assignment se cerró de forma dirigida con `read_only` en los campos sensibles. *(Este punto contradecía la decisión; queda resuelto.)*

**Datos e infra**
- [x] Migraciones aplicadas: 67, incluida la RLS `0005`. Rol `django_standard_role` creado.
- [x] Grants RLS incluyen blacklist (`0018`) **y las tablas de OTP** (`0021`, añadida esta sesión).
- [x] PITR **35 días** activo (ampliado el 2026-07-24 por $0). ~~Primer export semanal~~ — **5.4 quedó resuelta por otra vía ese mismo día**: PITR a 35 días sobre un respaldo ya verificado restaurable, B3 replanteada. ⚠️ Esta línea llevaba desde el 2026-07-24 diciendo "7 días" y el export como pendiente, cuando la Fase 5 ya lo daba por cerrado. Corregida el 2026-07-27.
- [x] ✅ **Restauración de respaldo PROBADA Y VERIFICADA (2026-07-24).** Restore PITR a un servidor temporal (`psql-cdm-restore-test`), 9 comprobaciones en verde, servidor borrado. **El respaldo es restaurable.** Ver *"Ensayo de restauración del PITR"*.

**Funcional**
- [x] Login OK (verificado con JWT real).
- [x] ✅ **Logout, refresh en F5 y timer de inactividad — VERIFICADOS EN PRODUCCIÓN (2026-07-27).** Las tres pruebas en verde:
  - **Logout** — desde `/home/perfil`: las dos claves desaparecen de `sessionStorage` **y el refresh queda invalidado en el servidor**. Lo que cierra la prueba no es el borrado local sino el `POST /api/token/refresh/` con el refresh copiado *antes* de salir: responde **`401 {"detail":"Token is blacklisted"}`**. ⚠️ Un `401 "Token is invalid or expired"` **no** habría probado nada (sería el techo de 12 h); el mensaje es lo que distingue la blacklist. `/api/logout/` es el `TokenBlacklistView` de simplejwt (`urls.py:72`).
  - **F5, las dos ramas** — con access válido sigue dentro sin parpadeo; y **borrando solo `accessToken` y dejando el refresh**, F5 rehidrata vía `POST /api/token/refresh/` → `200` y no echa al login. Esa segunda rama es la que ejercita `rehidratando` (`AuthContext.jsx:71` → `ProtectedRoute.jsx:24`), y es la única forma de probarla sin esperar los 60 min del access. Además: cerrar la pestaña → login (`sessionStorage` muere con ella), y F5 tras el logout → se queda en el login.
  - **Timer de inactividad** — aviso a los 10 min; **mover el ratón con el aviso en pantalla NO reinició el contador** (el agujero que se cerró el 2026-07-22, `conActividad` en `inactividad.mjs`); a los 20 min salida al login con el modal de sesión caducada. **La sesión se cierra de verdad**: `handleExpire` (`App.jsx:129`) no espera al logout antes de navegar, así que la prueba de que el servidor invalidó es el mismo `401 blacklisted` con el refresh de esa sesión.
  - Los 10/20 min están horneados en el bundle (`inactividad.mjs:6-7`), no se leen de entorno: la prueba cuesta 20 min de espera real y no hay forma de acortarla sin desplegar.
- [x] **Generación de PDF en producción verificada** (2026-07-22): alta de una maniobra Full y generación de documentos desde la app, sin incidencias. Tarda ~9 s por documento — normal y aceptado, ver *Notas de riesgo*.
- [x] El SPA carga y llama a `/api` sin errores de CORS/CSP.
- [x] Rol estándar no puede borrar / admin sí — **capa de aplicación VERIFICADA en producción (2026-07-27)**: probado desde la app con una cuenta de rol estándar, no puede borrar. Es el guard `is_staff` en `destroy()`, replicado en los 16 ViewSets (`ManiobraViewSet` → `views.py:586`, `VacioViewSet` → `728`, … `OperadorTerceroViewSet` → `905`) y en el borrado de fotos (`views.py:1075`). Cubre la **decisión A1**.
  - [x] ✅ **Capa de BASE DE DATOS VERIFICADA en producción (2026-07-27)**, conectando con `psql` **como `django_standard_role`** (no como admin), con el `DELETE` envuelto en `BEGIN … ROLLBACK` por si acaso:

    | Comprobación | Resultado |
    |---|---|
    | Rol conectado | `django_standard_role` ✅ |
    | ¿superuser? ¿`BYPASSRLS`? | `f` / `f` — la RLS **sí** le aplica ✅ |
    | GRANTs sobre `maniobras` | `SELECT, INSERT, UPDATE` — **sin `DELETE`** ✅ |
    | RLS activa | `t`, con solo `std_select`/`std_insert`/`std_update` — **sin política de DELETE** ✅ |
    | `DELETE` sobre una fila real | `ERROR: permission denied for table maniobras` ✅ |
    | Recuento antes / después | 411 / 411 — sin cambios ✅ |

    ⚠️ **El matiz que evita la conclusión equivocada:** Postgres comprueba los privilegios de tabla **antes** de aplicar la RLS. Como el rol no tiene `GRANT DELETE`, el borrado muere ahí y **la política de DELETE que falta nunca llega a evaluarse**. Son dos cinturones reales, pero el segundo es *inalcanzable* mientras exista el primero: no se puede "ejercitar la RLS con un DELETE" sin conceder antes el GRANT, que es justo lo que no se quiere hacer. Lo que queda probado —y es lo que pedía **A1**— es que **el borrado se bloquea en la base de datos, no solo en Django**. Con esto se cierra también el punto que el ensayo PITR dejó abierto.

    `relforcerowsecurity = f` es **correcto y deliberado**: sin `FORCE`, el propietario de la tabla se salta la RLS, que es precisamente como el admin conserva su capacidad de borrar. No es un hueco — no "arreglarlo".

    Dato de paso: 411 maniobras hoy frente a las **412** que contó el ensayo PITR del 2026-07-24. La diferencia es un borrado real hecho por un admin en estos tres días, que es la otra mitad de este mismo punto ("admin sí").

**Go-live**
- [x] Deploy vía pipeline — funcionando.
- [x] **Humo en producción completo** (2026-07-22): login ✅, lectura ✅, **1 alta (Full) ✅ y generación de documentos ✅**. El circuito entero —tipo de servicio, LibreOffice y PDF sobre Azure— queda validado de punta a punta.
- [x] Rollback: imágenes etiquetadas por SHA en el registry + PITR 7 días. **El de imagen no se ha ensayado.**

---

## FASE 9 — Post-deploy (Semana siguiente)

### 9.1 — MFA en el login de la app, con dispositivo de confianza

> **Por qué:** es la única medida que hace **irrelevante** el *password spraying* en vez de solo más lento. Un límite por IP se esquiva con paciencia o con más IPs; un segundo factor elimina el premio: adivinar la contraseña deja de servir de nada. Y no puede dejar fuera a nadie legítimo, al contrario que el bloqueo por IP (que con el CGNAT de los operadores móviles podría echar a los propios operadores).

**Decisiones tomadas (2026-07-22):**

| # | Decisión | Valor |
|---|---|---|
| 1 | Alcance | **Todos los usuarios**, no solo `is_staff` |
| 2 | Ventana del dispositivo de confianza | **14 días** |
| 3 | Alta de dispositivos | **Manual**, por el administrador desde `/admin` ⚠️ ver la nota de abajo |

⚠️ **La premisa del alta manual cambió (2026-07-22).** Se decidió *"con el usuario delante"*, pero después se supo que **los administradores rara vez trabajan desde la oficina**. Si no coinciden físicamente, el QR del TOTP tendría que viajar — y mandarlo por WhatsApp o correo es **entregar el secreto compartido**: quien lo intercepte genera códigos válidos para siempre. Opciones a decidir antes de la **Fase 4** (no bloquea las fases 1-3):
- **Videollamada con pantalla compartida**: el administrador muestra el QR, el usuario lo escanea. Cero desarrollo, el secreto no queda escrito en ningún chat. Suficiente para ~20 personas.
- **Enlace de alta de un solo uso**: el administrador genera un enlace corto y caducable, el usuario registra su propio dispositivo. Más limpio y auditable, y **no reabre la Mina 2** porque el alta la autoriza el enlace, no la contraseña. Coste: un modelo, un endpoint y una pantalla.

**Efecto secundario valioso:** si un atacante acierta una contraseña, choca con la pantalla del código y el log registra *"contraseña correcta, MFA fallido"*. Eso identifica **exactamente qué cuenta tiene la contraseña comprometida**, mientras el atacante sigue fuera. Sin MFA ese mismo evento sería un login exitoso silencioso.

#### ✅ Fase 0 — Verificación previa (hecha el 2026-07-22, no tocó nada)

Se buscaron los obstáculos antes de escribir código. Aparecieron dos.

**⚠️ Mina 1 — El rol de BD no puede escribir en las tablas de OTP.** Verificar un TOTP **escribe**: actualiza el contador anti-repetición (`last_t`) para que el mismo código no valga dos veces. Y `/api/login/` corre como `django_standard_role`, que según la migración `0021` **solo tiene SELECT** sobre las tablas de OTP. El primer intento de validar un código reventaría con `permission denied`. Peor: `throttle_increment(commit=True)` hace que **incluso un código equivocado escriba**, así que ni siquiera fallaría limpiamente.

*Permisos comprobados en la BD:*

| Tablas | Permisos de `django_standard_role` |
|---|---|
| `axes_*` (4) | DELETE, INSERT, SELECT, UPDATE ✅ |
| `otp_*` (3) | **solo SELECT** ⚠️ |
| `token_blacklist_*` (2) | INSERT, SELECT ✅ |

**Buena noticia colateral:** se sospechaba que `django-axes` pudiera estar fallando en silencio en producción por lo mismo. **No es el caso**: tiene permisos completos y funciona.

*Resolución:* migración nueva con los permisos **mínimos exactos** — `UPDATE` en `otp_totp_totpdevice`, `UPDATE` en `otp_static_staticdevice` y `DELETE` en `otp_static_statictoken` (los códigos de respaldo se consumen borrándolos). Mismo criterio dirigido que las migraciones `0018` y `0021`. Se descartó el permiso a nivel de columna —que habría sido más fino— porque django-otp llama a `save()` sin `update_fields` y el UPDATE incluye todas las columnas. Se descartó también enrutar el login al alias `default`: elevaría toda la petición a superusuario cuando basta con tres permisos.

**⚠️ Mina 2 — El auto-alta de dispositivos anularía el MFA.** Si un usuario sin dispositivo pudiera entrar solo con contraseña para registrarlo, **un atacante que adivinara esa contraseña por spraying registraría su propio TOTP**. El MFA quedaría anulado justo contra el ataque que lo motiva.

*Resolución:* **no se construye auto-alta** (decisión 3). Con ~20 personas, el administrador da de alta cada dispositivo desde `/admin` y el usuario escanea el QR delante. Cinco minutos por persona, una sola vez, y sin agujero. Si algún día son 200, se revisa.

#### ⚠️ Lección del intento fallido del 2026-07-22 — LEER ANTES DE RETOMAR

La fase 1 se desplegó sola (`dc67b336`) y **hubo que revertirla en el acto** (`16600ffc`). El fallo fue de secuenciación, no de código:

> La fase 1 exige el código a quien tenga dispositivo. **La cuenta de administrador lo tiene** desde la fase 3.3.5. Pero el campo para escribirlo vive en la fase 2, que no existía. El frontend mandaba usuario y contraseña, el backend pedía el código, y la pantalla mostraba *"usuario o contraseña incorrectos"*: **la cuenta de administrador quedó sin acceso al SPA**, sin ninguna forma de entrar.

El resto del equipo no se vio afectado (nadie más tiene dispositivo) y `/admin` siguió funcionando, porque tiene su propio formulario con campo de código.

**Dos reglas que salen de aquí:**

1. **Las fases 1 y 2 salen JUNTAS.** La 1 sola es desplegable *en teoría* —solo afecta a quien tenga dispositivo— pero en la práctica hoy eso es justamente la cuenta que administra el sistema.
2. **La migración `0022` se aplica ANTES de desplegar el código, no después.** No está en el pipeline (decisión de la Fase 7.2). Sin ella, verificar un código falla con `permission denied` **incluso cuando el código es incorrecto**.

   ⚠️ **La vía que decía esta línea —SSH del portal— no existe:** la imagen no lleva `sshd`. Se aplicó abriendo el cortafuegos de Postgres a la IP del operador y corriendo `migrate` en local; receta completa en el punto de continuación. Y como el fichero de la migración **solo existe dentro de la imagen desplegada**, hubo que partir el trabajo en dos commits: primero la migración sola (que no cambia comportamiento), se despliega, se aplica, y solo entonces el código que la necesita. Con un único push habría una ventana de 500 garantizada.

**El trabajo no se perdió:** sigue completo en la rama `mfa/fase-1-exigir-totp` (`c2179db9`), con la migración `0022` y 8 pruebas. Al retomar, fusionarla junto con la fase 2.

#### ⚠️ Segunda lección (2026-07-23): un mock de `match_token` no prueba `match_token`

Las fases 1+2 salieron juntas y **el login con código devolvía 500**: `match_token` usa `select_for_update` y eso exige una transacción abierta, que Django no abre en autocommit. Arreglado en `907f7970` con `transaction.atomic(using=get_db_alias())` — sobre el alias del router (`standard`), no sobre `default`.

Las 8 pruebas estaban en verde porque **`match_token` estaba simulado**. La regla que sale de aquí: cuando se simula la pieza que toca la BD, hay que probar **la envoltura** — que la transacción existe, que envuelve la llamada y que va sobre el alias correcto. Es lo que hace `test_el_codigo_se_verifica_dentro_de_una_transaccion`.

#### Fases de ejecución

| Fase | Trabajo | Reversible |
|---|---|---|
| ~~**1+2**~~ | ✅ **HECHO Y VERIFICADO EN PRODUCCIÓN (2026-07-23).** Migración `0022` aplicada antes + exigir TOTP a quien ya tenga dispositivo + campo de 6 dígitos en el login. Backend `907f7970`, frontend `594339a` | ✅ |
| ~~**3**~~ | ✅ **HECHO Y VERIFICADO EN PRODUCCIÓN (2026-07-23).** Modelo `DispositivoConfianza` + `0023`/`0024`, cookie `httpOnly` en el login, endpoint de revocación (cierra todas las sesiones), panel `/admin`, casilla en el login y lista en el perfil. Backend `f8890152`, frontend `c2ba1a0`. **Ojo: el incidente del `drift` salió aquí — ver su sección; queda un punto sin cerrar.** | ✅ |
| **4** | Alta de los ~20 usuarios, en persona (QR por videollamada, decisión 7) | — |
| **5** | **Interruptor final**: exigir dispositivo a todos. **Cerrar antes el punto del `drift`**: en la fase 5 dejaría fuera a gente real | ⚠️ **el único paso con riesgo de dejar gente fuera** |

La clave está en la fase 1: **exigir el código solo a quien ya tenga dispositivo** permite desplegar sin romper nada y dar de alta al equipo poco a poco. La fase 5 solo se acciona cuando los 20 estén dentro.

**Verificado en producción el 2026-07-23:** login real con TOTP ✅, código inválido rechazado con su mensaje propio ✅, **el mismo código no se puede usar dos veces** ✅ (`last_t`, que es justo lo que la `0022` vino a permitir). Un código de uno o dos pasos atrás sí entra: es `tolerance`, ver la nota en los detalles operativos del punto de continuación.

#### Diseño del dispositivo de confianza

**Decisiones tomadas (2026-07-23), antes de escribir una línea:**

| # | Decisión | Valor | Por qué |
|---|---|---|---|
| 4 | Activación | **Casilla, desmarcada por defecto** | Los operadores entran desde equipos compartidos del patio. Confiar automáticamente le regala el segundo factor al siguiente que se siente; desmarcada por defecto, el caso peligroso exige un acto consciente |
| 5 | Caducidad | **14 días absolutos, no deslizan** | Garantiza que el segundo factor se vuelve a comprobar al menos cada 14 días. Mismo criterio que el refresh token (12 h absolutas): una sola regla en el sistema, no dos |
| 6 | Cuántos a la vez | **Varios, con lista en el perfil** | Móvil y PC del patio conviven. Con uno solo, entrar desde el móvil tiraría la confianza del PC y la gente lo vive como un fallo. Es el mismo modelo sin restricción de unicidad |
| 7 | Entrega del QR (fase 4) | **Videollamada con pantalla compartida** | Cero desarrollo y el secreto no queda escrito en ningún chat. Para ~20 personas y una sola vez, basta. El enlace de un solo uso queda como mejora si algún día duele |
| 8 | Al cerrar sesión | **La confianza sobrevive** | Si no sobreviviera, la función no serviría de nada: la gente cierra sesión a diario y volvería a teclear el código cada vez. Solo se quita revocándola o al caducar |
| 9 | Qué hace revocar | **Quita la confianza Y cierra las sesiones activas** | El caso real es "perdí el móvil". Revocando solo la confianza, quien lo tenga sigue dentro hasta 12 h más con el refresh que ya tenía — justo las horas que importan. La blacklist ya existe y ya funciona |
| 10 | Pruebas | **Con BD, solo para lo nuevo** | `MIGRATION_MODULES = {'api': None}` en los ajustes de prueba: Django crea las tablas desde los modelos, ignora los `managed=False` heredados —que es lo que hoy rompe la suite— y sí crea el modelo nuevo. ⚠️ **Confirmar con un spike antes de darlo por bueno**; si no sale, se cae a módulo puro + `SimpleTestCase` |
| 11 | Orden respecto a 9.3 | **Fase 3 primero, 9.3 justo después** | Mezclarlos haría un despliegue grande y difícil de revertir en la parte más delicada del sistema, después de dos caídas en tres días. Pero 9.3 **sube de prioridad**: la cookie de confianza salta el MFA, así que un XSS vale más a partir de la fase 3 que ahora |
| 12 | Admin y equipo de confianza | **Todos por igual, el admin también puede saltar el código** | Coherente con el alcance (MFA para todos, sin casos especiales) y cómodo para el admin, que trabaja en remoto. ⚠️ Se señaló el riesgo —la cuenta de más privilegio queda con un salto de MFA de 14 días en cookie— y se reafirmó la decisión. Si algún día se endurece, es un `if not user.is_staff` |
| 13 | Qué hace el botón de revocar | **Revocar = meter en la blacklist TODOS los refresh del usuario** | No se puede cerrar solo la sesión del equipo perdido (los refresh no están ligados al dispositivo). Cerrarlas todas es lo correcto para "perdí el móvil": el ladrón sale ya. Efecto: el usuario también sale en sus otros equipos y vuelve a entrar (sin código en los de confianza) |
| 14 | Recuperación desde /admin | **El admin ve y revoca los equipos de CUALQUIER usuario** | Es lo que hace posible el ensayo de recuperación antes de la fase 5. Modelo registrado en el panel con lista (usuario, etiqueta, alta, caducidad) y acción de revocar. El panel corre como superusuario |
| 15 | Alcance de la cookie | **`path=/api/login/`** | httpOnly+Secure+SameSite=Strict y además marcada solo para el login, el único sitio que la lee. No acompaña a las cientos de llamadas normales del API: menos superficie donde una credencial que salta el MFA pueda filtrarse |
| 16 | Corte al revocar | **Se acepta un residual de ≤60 min** | Revocar mete el refresh en la blacklist, pero el access token es JWT sin estado y no se puede invalidar: sigue vivo hasta su caducidad (60 min). El corte "de inmediato" real exigiría comprobar un sello por-usuario en CADA petición (ruta caliente + migración). Para "perdí el móvil" (no un ataque en vivo) el residual acotado a 60 min basta, y es coherente con el modelo de sesión ya congelado |
| 17 | Tras revocar (frontend) | **Cerrar sesión y volver al login** | Revocar cierra las sesiones del usuario en el servidor, la actual incluida. Quedarse en la app con un token que morirá en un rato y expulsa de golpe es engañoso; sacarlo al login con aviso es lo honesto |
| 18 | Confirmación al revocar | **Diálogo de confirmación** | Revocar cierra todas las sesiones; un clic accidental no debería desloguear de todo. `window.confirm` nativo, cero dependencias |

**Defaults que no se preguntaron, por ser reversibles y de bajo coste:**

- **Etiqueta del dispositivo derivada del user-agent**, no la escribe el usuario. Un campo menos en una pantalla que se usa una vez al año.
- **Sin límite de dispositivos por usuario** y **sin tarea de limpieza**: los caducados se filtran por fecha y se borran cuando el usuario revoca. Un cron para borrar filas de una tabla de ~40 registros es infraestructura que no se paga sola.
- **La cookie se valida contra el usuario**, no solo contra el hash: en un equipo compartido, la confianza de uno nunca sirve para la cuenta de otro.

La pantalla de revocación va en **`PerfilPage` (`/perfil`), que ya existe** — no hace falta ruta nueva.

- Modelo con `usuario`, **hash** del token (nunca el token), caducidad a 14 días, IP y user-agent del alta, y etiqueta.
- Se entrega en **cookie `httpOnly` + `Secure` + `SameSite=Strict`**. **No** en `localStorage`: esa cookie **salta el MFA**, así que no puede quedar al alcance de un XSS. Es posible gracias al mismo origen (decisión **E2**) y encaja con la tarea **9.3**.
- Nunca sustituye a la contraseña: contraseña **+** dispositivo de confianza. Solo ahorra el segundo factor.
- Pantalla de revocación en el perfil. Sin ella, un móvil perdido conserva el acceso 14 días sin forma de cortarlo.

#### Riesgos aceptados, dichos sin maquillar

- **El TOTP no protege del phishing en tiempo real.** Una página falsa puede pedir usuario, contraseña y código y usarlos al instante. Sube muchísimo el listón; no cierra la puerta.
- **El MFA protege el login, no la sesión.** Si roban el token después de entrar (XSS), no ayuda → refuerza la prioridad de **9.3**.
- **La cookie de confianza es, por diseño, una credencial que salta el MFA.** Es el precio de que la gente lo tolere a diario. Mitigado con `httpOnly`, 14 días y revocación.
- **Esfuerzo real: 2-3 sesiones de trabajo**, no "un campo en el login".
- **Ensayar la recuperación ANTES de la fase 5**: si alguien pierde el móvil sin códigos de respaldo, el administrador debe poder rehabilitarlo desde `/admin`. Probarlo cuando ya haya pasado es tarde.

#### Por qué NO se hace bloqueo por IP (Opción B descartada)

Se evaluó añadir un contador de fallos por IP (`AXES_LOCKOUT_PARAMETERS = [['username','ip_address'], 'ip_address']`) para cortar el spraying. **Descartado:** los operadores usan la app desde el móvil en el patio, y los operadores móviles meten cientos de clientes tras una misma IP pública (CGNAT). Un desconocido que ni trabaja en la empresa podría agotar el contador de esa IP y **dejar sin acceso a los operadores**. Se cambiaría un riesgo por otro. El MFA resuelve lo mismo sin ese efecto colateral.

#### Complemento barato, independiente de todo lo anterior

Validador de contraseñas por reglas para el vocabulario en español y de la empresa (`fraba`, `maniobra`, `contenedor`, `queretaro`, `bienvenido`, meses…). El `CommonPasswordValidator` de Django compara **exacto** y su lista es **en inglés**: bloquea `welcome` pero no `bienvenido`, y bloquear `fraba2026` deja pasar `Fraba2027`. Un validador que normalice (acentos, *leetspeak*, separadores) y rechace por **contención** cubre infinitas variantes en lugar de una lista finita. ~15 líneas. El momento natural para forzar el cambio de contraseñas de todo el equipo es **junto con el despliegue del MFA**: una sola molestia para el usuario en vez de dos.
- [ ] **9.2** Monitoreo: alertas de Azure sobre errores 5xx y salud del contenedor.
- [ ] **9.3** Evaluar mover tokens de `sessionStorage` a **cookies httpOnly** (ahora es posible por el mismo origen) — mejora fuerte contra XSS.
- [ ] **9.4** Registro completo de cambios (django-simple-history) si la auditoría fiscal lo exige.
- [ ] **9.5** Evaluar staging barato (contenedor a cero + BD mínima) cuando los cambios empiecen a dar miedo.
- [ ] **9.6** Restringir/endurecer acceso a `/admin` (ruta, monitoreo de accesos).

---

## Notas de riesgo / rollback

- **Migración RLS `0005`:** es lo más frágil del arranque. Siempre probar contra BD limpia antes de prod (Fase 1.5).
- **LibreOffice en contenedor:** si un deploy falla en PDF, casi siempre es falta de `libreoffice-calc` o RAM insuficiente (<2 GB). Subir la perilla de RAM del contenedor.
- **Generar un documento tarda ~9 s. Es normal y está aceptado** (medido en producción el 2026-07-22). El coste no es la conversión, que es casi instantánea, sino que `views.py:95` hace `env['HOME'] = output_dir` sobre un `TemporaryDirectory()` nuevo por petición: **LibreOffice reconstruye su perfil de usuario en cada documento**. La CPU del plan lo confirma — picos aislados del 32-34% sobre un fondo del 6-8%, o sea ~19 s de CPU en ese minuto ≈ dos documentos; la máquina **no se satura**, así que subir de B1 no arreglaría nada. **Si algún día el volumen sube**, la mejora es *borrar* esa línea: el `Dockerfile:41` ya define `ENV HOME=/home/app` con permisos, y el perfil se reutilizaría entre peticiones. Contrapartida a valorar entonces: el perfil pasaría a ser compartido por los 3 workers de gunicorn y dos conversiones simultáneas podrían chocar por el bloqueo de LibreOffice (con 0-9 docs/día, decisión D1, es despreciable). Alternativa con cinturón: un perfil por worker vía `-env:UserInstallation`.
- **Rollback:** Container Apps guarda revisiones → volver a la anterior es 1 clic. La BD se rebobina con PITR. No hay pérdida si el checklist se respetó.
- **Escalar:** las 3 perillas (RAM contenedor, tier Postgres, tier SWA) suben con deslizador, sin re-arquitectura. Empezar económico y subir cuando duela.

---

## Estado general

> Sincronizado el 2026-07-22. Este tablero se había quedado atrás respecto a las fases detalladas de arriba.

- [x] Fase 1 — Preparación ✅ (1.5 RLS confirmado en producción)
- [x] Fase 2 — Frontend/Vite ✅ (2.7 movida a 3.3.2)
- [x] Fase 3 — Backend endurecido ✅ — 3.1 · 3.2 · 3.3 · 3.4 _(3.1.5/3.1.6 **cerradas el 2026-07-22**, `1e5647ec`; 3.3.6 movida a Fase 9)_
- [x] Fase 4 — Contenerización ✅
- [x] Fase 5 — Azure aprovisionado ✅ **completa** (5.4 resuelta por otra vía el 2026-07-24: PITR a 35 días, B3 replanteada)
- [x] Fase 6 — Secretos rotados ✅
- [x] Fase 7 — CI/CD ✅ **completa** (7.3 cerrada y desplegada el 2026-07-24)
- [x] Fase 8 — Checklist pre-deploy ✅ **CERRADA el 2026-07-27**. ~~Restauración de respaldo sin probar~~ ✅ 2026-07-24. ~~PDF sin generar en producción~~ ✅ 2026-07-22. ~~Rate limiter~~ ✅ ya estaba hecho desde el 2026-07-22 (este tablero y el checklist decían lo contrario). ~~Rol estándar no borra~~ ✅ 2026-07-27, en app **y** en base de datos. ~~Fotos a `registro_id` inexistente~~ ✅ 2026-07-27. ~~Logout / F5 / timer de inactividad~~ ✅ 2026-07-27, con el refresh **blacklisted** verificado. _Aceptados y fuera del cierre: rollback de imagen sin ensayar, y el agujero de la ruta directa (lo tapan las fases 4/5 del MFA)._
- [x] 🚀 Go-live ✅ **el sistema está en producción** — humo **completo** desde el 2026-07-22 (login, lectura, 1 alta Full y generación de documentos). _Esta línea decía "falta 1 alta y 1 PDF" contradiciendo al propio punto de la Fase 8; corregida el 2026-07-27._
- [ ] Fase 9 — Post-deploy
