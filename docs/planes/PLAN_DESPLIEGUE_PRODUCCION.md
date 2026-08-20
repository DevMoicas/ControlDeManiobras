# Plan de despliegue a producción — Control de Maniobras (FRABA)

> Documento vivo, **comprimido** el 2026-07-28 para uso diario. El día a día completo, cada decisión con su razonamiento y el detalle de las fases 1-8 (todas cerradas) vive en **`PLAN_DESPLIEGUE_HISTORIAL.md`** — nada se borró, solo se archivó. Si algo cambia, se edita aquí.
>
> **Fecha de creación:** 2026-07-20 · **Regla base (CLAUDE.md):** modificar solo lo estrictamente necesario. Nada especulativo.

---

## ⏸️ Punto de continuación — última sesión: 2026-07-27

### 🚀 EN PRODUCCIÓN — https://happy-wave-025ee9c10.7.azurestaticapps.net

**Fases 1–8: CERRADAS POR COMPLETO.** 9.1 (MFA) fases 1+2+3 (dispositivo de confianza) en producción y verificadas de punta a punta. Despliegue continuo en las dos mitades, ambas con OIDC y sin credenciales de larga vida.

| | Commit en producción | Sobre |
|---|---|---|
| **Backend** | `87472437` — origen/destino a 30 caracteres | `da433cce` (7.3: pip-audit + parches) → `01e9dc2e` (Vacíos) → `50fc5d41` (drift) → `f8890152` (Fase 3) |
| **Frontend** | `165a752` — Empate en Bitácora de Sueño | `b10e464` (Empate Gastos + separación Carta Porte) → `8de3e9a` (overflow, 6 selectores) → `9ac993a` (7.3: npm audit + axios) → `8701420` (Vacíos) |

**Aceptado y fuera del cierre de Fase 8** (documentado, no descuidado): rollback de imagen sin ensayar; el agujero de la ruta directa (lo tapan las fases 4/5 del MFA, ver abajo).

### 🎯 Siguiente paso — máxima prioridad

🚩 **9.1 fase 4** — alta de los ~20 usuarios, en persona (QR por videollamada, decisión 7). Es lo que de verdad tapa el agujero de la ruta directa: mientras haya cuentas sin segundo factor, la IP que ven `axes` y el throttle es falsificable y permite intentos de contraseña ilimitados contra ellas.

Luego **fase 5** (interruptor: MFA obligatorio para todos). **Antes de la fase 5**, ensayar la recuperación de una cuenta que pierde el móvil (el panel `/admin` ya lo permite — revocar equipos + cerrar sesiones — falta el ensayo real).

Detalle de las 18 decisiones de diseño del MFA/dispositivo de confianza, las dos "minas" resueltas antes de construirlo, y las dos lecciones de despliegue (secuenciación de migración, mock de `match_token`): **historial, sección FASE 9 → 9.1**.

### ⚠️ Cabos sueltos conocidos — decisión, no olvido

- **Agujero de la ruta directa** (medido 2026-07-27): por `app-cdm-fraba.azurewebsites.net` directo (Easy Auth desactivado a propósito desde el 2026-07-21), la IP que usan `django-axes` y el throttle de DRF es la que el cliente escriba en `X-Forwarded-For`. Por la SWA el diseño es correcto. Se evaluaron 4 parches (discriminar por Host, contar entradas XFF, techo alto por usuario, tarpit) y se descartaron todos — el último, tarpit, **reabre el DoS de workers de gunicorn** que ya mordió en 3.1.5. Se tapa con MFA fases 4/5, no con un parche aquí. Medición completa y la única vía que queda en pie (leer la última entrada del XFF, bloqueada por no tener el conjunto de IPs de salida de la SWA): **historial**.
- **`CargoSelector` y `FolioSelector`** — únicos 2 de 14 selectores sin el patrón portal/`position:fixed` contra el recorte por `overflow`. A propósito: no confirmado que el overflow los recorte ahí. Auditar con `grep -rn "top: calc(100% + 4px)" src/components/*/*.css`.
- **`origen`/`destino` de Maniobra subidos a 30 caracteres** (antes 20, causaba un fallo real). Los catálogos `Origen`/`Destino.ciudad` permiten 255 → falta medir el máximo real en prod: `SELECT MAX(LENGTH(ciudad)) FROM api_destino;` (y `api_origen`).
- **Refresh token: 12 h absolutas, no desliza.** Quien entra a las 07:00 se desconecta a las 19:00 aunque siga trabajando. Solución (`ROTATE_REFRESH_TOKENS`) diferida a propósito por el coste en el front.
- **5.4 (respaldos) replanteada, no la letra original.** PITR 35 días, probado restaurable, cubre la intención mejor que "7 días + export semanal". Backup Vault analizado a fondo y **aparcado** ($8.25/mes fijos, todos sus argumentos se cayeron salvo la inmutabilidad `Locked`). Reabrir si: aparece un requisito de retención >35 días, o preocupa el ransomware/un admin comprometido. Precios y verificaciones completas: **historial**, no repetir la investigación.
- **9.2** monitoreo (5xx, salud del contenedor) · **9.3** tokens a cookies httpOnly (subió de prioridad: la cookie de confianza de la fase 3 salta el MFA) · **C3** dominio propio.

---

## 0. Decisiones congeladas

| # | Decisión | Valor |
|---|----------|-------|
| A1 | Modelo de acceso | Equipo pequeño: todos ven/agregan/editan; **solo admin borra** |
| A2 | Escala | 10–20 usuarios, ~6 concurrentes |
| A3 | Red | Internet abierto |
| A4 | MFA | Sí, para cuentas admin (`is_staff`) — y ampliado a **todos** en 9.1 |
| B1 | Residencia de datos | **México** (Mexico Central / Querétaro) |
| B2 | Auditoría | Sí: quién creó/modificó cada registro — hecho (Fase 3.4) |
| B3 | Respaldos | **Replanteada 2026-07-24**: PITR 35 días verificado restaurable (antes: 7 días + export semanal) |
| C1 | Base de datos | Postgres gestionado en la nube |
| C4 | Operación | Sin equipo DevOps → todo gestionado / mínimo mantenimiento |
| C5 | Presupuesto | ~$45–60 USD/mes — real: ~$48–53 |
| D1 | PDFs | LibreOffice, 1 réplica encendida (~9 s/doc, aceptado) |
| E1 | Build frontend | Vite — hecho (Fase 2) |
| E2 | Dominios | Mismo origen (SWA con backend enlazado) |
| F2 | Entornos | Solo producción + checklist robusto pre-deploy |
| F3 | CI/CD | GitHub Actions, OIDC, sin credenciales de larga vida |
| F4 | Secretos | Secretos de plataforma + rotados |

**Pendiente externo:** dominio propio (C3).

## 1. Arquitectura real (cambió del diseño original)

**Container Apps no existe en ninguna región de México** → sustituido por **App Service B1** (mismo Dockerfile). SWA Free no permite backend enlazado → **Standard** ($9.90/mes). Resultado: más barato que el estimado original.

```
Internet → Azure Static Web Apps (SWA Standard, Central US — solo estáticos)
              │ /api/* enlazado, mismo origen
              ▼
           App Service B1 Linux (Querétaro) — Django+DRF+LibreOffice, Gunicorn+WhiteNoise
              │ TLS
              ▼
           PostgreSQL Flexible B1ms v18 (Querétaro) — RLS (migración 0005), PITR 35d
```

| Recurso | Nombre | Región |
|---|---|---|
| Resource Group | `rg-cdm-prod` | Mexico Central |
| App Service Plan / Web App | `plan-cdm-prod` / `app-cdm-fraba` | Querétaro |
| PostgreSQL Flexible | `psql-cdm-fraba` | Querétaro |
| Container Registry | `acrcdmfraba` (Basic) | Querétaro |
| Static Web App | `swa-cdm-fraba` → `happy-wave-025ee9c10.7.azurestaticapps.net` | Central US* |

\* Solo aloja JS/CSS compilado, ningún dato fiscal — B1 (residencia MX) se cumple sin asteriscos.

**Mapa OWASP y arquitectura objetivo original completos: historial, secciones 1-2.**

---

## Trampas operativas activas (para no perder tiempo retomando)

- **La consola SSH del portal de Azure NO funciona y nunca ha funcionado** — el Dockerfile no instala `openssh-server`. Cualquier nota sobre "migrar por SSH" es falsa.
- **Cómo se aplica una migración de verdad** (probado con `0022`–`0027`):
  1. `az postgres flexible-server firewall-rule create -g rg-cdm-prod -s psql-cdm-fraba -n temporal --start-ip-address <IP> --end-ip-address <IP>` (`-n`=nombre regla, `-s`=servidor; `--rule-name` no existe)
  2. Volcar los *app settings* del App Service a variables de entorno, correr `manage.py migrate api` **en local contra la BD de producción**.
  3. `showmigrations api` antes, para confirmar que lo pendiente es solo lo que se quiere aplicar.
  4. **Borrar la regla** (`firewall-rule delete ... --yes`) y confirmar que solo quedan las 19 `webapp-*`.
- **Escribir DATOS en prod** (no migraciones): `psql -f fichero.sql` con credenciales de los app settings (`$env:PGPASSWORD`, nunca imprimirla). El clasificador de permisos **bloquea** `manage.py shell < script.py` pero **deja pasar `psql`** con SQL explícito y acotado.
- **Tras desplegar el backend, `/api/*` da 500 ~1 minuto** mientras reinicia el contenedor. No es una caída.
- **TOTP**: no bajar `tolerance` de 2 (±60s, piso desde 2026-07-24); `OTP_TOTP_SYNC=False` evita que django-otp persista el `drift` (causa del incidente del 2026-07-23). El anti-reuso lo da `last_t`, no la tolerancia.
- **`az.cmd` es un batch de Windows**: `%`, `&`, `^`, `!` truncan el comando sin error; `?`, `(`, `)` rompen `--query`. Pasar config por `@archivo.json`, pedir `-o json` sin `--query` y filtrar con PowerShell.
- **Logs del contenedor**: `az webapp log download` + descomprimir con `[System.IO.Compression.ZipFile]` (`Expand-Archive`/`ExtractToDirectory` revientan con esas rutas).
- **PowerShell a un ejecutable mete BOM**: `python manage.py shell` falla con `U+FEFF` — redirigir con `cmd /c "python ... < fichero.py"`.
- **Herramientas fuera del PATH**: `gh` en `C:\Program Files\GitHub CLI\gh.exe`, `az` en `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` — usar rutas completas.
- **ACR Tasks bloqueado** en esta suscripción — construir en el runner de CI. **`Microsoft.Network` no registrado** — no se pueden consultar etiquetas de servicio.
- Más trampas (PowerShell/curl, `az webapp log tail`, pruebas con BD y sus límites, procesos huérfanos en Windows): **historial**, sección "Detalles operativos".

---

## Estado general

- [x] Fase 1 — Preparación ✅
- [x] Fase 2 — Frontend/Vite ✅
- [x] Fase 3 — Backend endurecido ✅
- [x] Fase 4 — Contenerización ✅
- [x] Fase 5 — Azure aprovisionado ✅ (5.4 resuelta por otra vía: PITR 35 días)
- [x] Fase 6 — Secretos rotados ✅
- [x] Fase 7 — CI/CD ✅ (7.3 auditoría de dependencias cerrada)
- [x] Fase 8 — Checklist pre-deploy ✅ **CERRADA 2026-07-27**
- [x] 🚀 Go-live ✅ — sistema en producción, humo completo desde 2026-07-22
- [ ] Fase 9 — Post-deploy (9.1 fases 1-3 hechas; **fase 4 es el siguiente paso**; 9.2/9.3 pendientes)

**Detalle punto por punto de cada fase (checklists 1.1–8, con qué se verificó y cómo): historial.**

---

## Notas de riesgo / rollback

- **Migración RLS `0005`:** lo más frágil del arranque. Probar contra BD limpia antes de prod.
- **LibreOffice:** un deploy que falla en PDF casi siempre es `libreoffice-calc` faltante o RAM <2 GB.
- **Generar un documento tarda ~9 s, aceptado** — no es la conversión, es que LibreOffice reconstruye su perfil de usuario en cada petición (`views.py:95`). Mejora futura si el volumen sube: borrar esa línea (el Dockerfile ya define `HOME` reutilizable) — contrapartida: perfil compartido entre los 3 workers de gunicorn.
- **Rollback de código:** imágenes/commits etiquetados por SHA. Puntos de retorno exactos (backend y frontend, con qué se pierde en cada uno): **historial**, sección "Puntos de retorno".
- **Escalar:** RAM del contenedor, tier de Postgres, tier de SWA — las 3 suben con deslizador, sin re-arquitectura.

---

**Para cualquier cosa que no esté aquí** — el razonamiento completo detrás de una decisión, un incidente resuelto paso a paso, el detalle línea por línea de una fase, un comando de rollback exacto, o el diseño completo del MFA — está en **`PLAN_DESPLIEGUE_HISTORIAL.md`**. No se perdió nada al comprimir este documento.
