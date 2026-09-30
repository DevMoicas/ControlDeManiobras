# PLAN — Módulo Finanzas (Gráficas + Facturación)

Fecha: 2026-09-29. Fuentes: `FRABA_Modulo_Finanzas_Resumen.md` (líneas 142–169) y las
respuestas 1–71 de `PREGUNTAS_MODULO_FINANZAS.md`. El número entre paréntesis, p. ej.
(P34), remite a la pregunta que lo decidió.

**Estado (2026-09-30):** fases **0 a 6 implementadas**. La 0 está en producción; de la 1 a
la 6 **solo en local, sin desplegar** (migraciones 0070–0074 pendientes a propósito). Lo
que se decidió por el camino y no está escrito abajo —casilla Pagada en cuentas por pagar,
fletes y locales desde agosto de 2026, un solo DASHBOARDS en vez de páginas por grupo,
días de crédito opcionales, etc.— está en `docs/PENDIENTE.md`, sección 11. Este plan
describe lo que se pensó; el código manda.

**Fuera de alcance:** el resto del resumen (bancos, estados financieros, balance, flujo de
efectivo, tabulador, costeo estimado, alertas, reportes PDF/Excel). Costos extra solo
informativos, en otra tabla futura (P59).

**Bloqueado:** P62 (semana de nómina → mes, y sueldo sin historial). Solo afecta al término
*nómina administrativa* de la utilidad; lo demás avanza. Ver `docs/PENDIENTE.md`.

---

## Fase 0 — Saber quién es quién (prerrequisito)

Hoy **ningún usuario está ligado a un empleado**: el sistema no puede saber el cargo de
quien inicia sesión. `PLAN_ROLES_POR_CARGO.md` lo preveía (perfil usuario → empleado),
pero no se implementó. Sin esto no existen P45, P56 ni P63.

- Tabla `Perfil`: `user` 1:1, `empleado` FK nullable. Se asigna en el admin de Django.
- Helper único en el backend `cargo_finanzas(user)`: compara `strip().upper()` del cargo.
- **Acceso a Finanzas (P45, P64), cerrado por defecto:** entra `is_staff` o cargo ∈
  {`COMERCIAL`, `DIRECTOR GENERAL`, `DIRECTOR OPERATIVO`, `DIRECTORA COMERCIAL`}. Sin
  perfil, sin empleado o con otro cargo → 403. Al revés que el plan de roles, que deja
  pasar: aquí se trata de dinero.
- El frontend esconde la tarjeta y la ruta, pero **quien decide es el backend**.
- Nómina y Costos extra siguen siendo solo staff, como hoy.

| Acción | Quién |
|---|---|
| Ver Finanzas, subir Excel (P13), capturar/editar CxP, gastos fijos, capturas mensuales (P56), marcar cobrada | staff + los 4 cargos |
| Cancelar factura (P65), cancelar CxP, borrar gasto fijo (P56) | solo staff |

*Marcar cobrada* no se preguntó; va con el grupo que edita. Cambiarlo es una línea.

## Fase 1 — Facturación (primero, P52)

### Modelo `Factura` (tabla nueva, managed)

`empresa` (derivada de la serie: `SEF`→Soluciones, `S`→Fraba; P29, P61), `serie`,
`folio`, `uuid` **unique** (P3, no se muestra nunca, P16), `nombre`, `rfc`,
`fecha_emision`, `subtotal`, `iva`, `total`, `moneda`, `estado` activa/cancelada (P65),
`cobrada` bool (P27), `maniobra` FK nullable, `created_by/at`, `updated_by/at`.

Sin borrado (P65). Una cancelada no suma en ningún sitio (P65, P66).

### Carga del Excel

- Backend con `openpyxl` (ya instalado). `.csv` con la stdlib. **`.xls` necesita `xlrd`,
  que es una dependencia nueva** y pasa por el gate de `pip-audit`. Se añade porque se pidió
  (P12); es el único coste de aceptar `.xls`.
- Sin tamaño máximo (P12). El archivo no se guarda: solo las filas leídas.
- Columnas por **nombre de cabecera** tras `strip()`, no por posición: el ejemplo trae
  `' Serie'` y `' Folio'` con espacio delante.
- Se sube un Excel por empresa; los dos tienen el mismo formato (P61).
- Fila a fila, la carga **no se detiene** (P11). Al final, un resumen de lo omitido:
  UUID repetido (P11), moneda distinta de MXN (P17) y tipo de comprobante distinto de `I`
  (P66). Todo en una transacción por archivo.

### Enlace factura ↔ maniobra (D1)

- Se lee `maniobras.no_factura` y se parte por `/` o `//` (P2). Cada trozo se normaliza
  (mayúsculas, sin espacios ni guiones, P6). Si el segundo trozo no trae serie, hereda la
  del primero: `I 154/ 153` → `I154`, `I153`.
- Lo que no casa con serie+folio (`EFECTIVO`, `201`) se ignora (P5).
- Varias facturas → una maniobra (P2). Una factura → varias maniobras ya no ocurre (P3).
- El enlace se **guarda** en `Factura.maniobra` y se recalcula en dos momentos: al
  cargar, y al guardar `no_factura` en una maniobra. Así los dashboards no reparsean texto.
- Facturación arranca en agosto de 2026 (P4): no se carga histórico.

### Ingresos en Gastos (P58)

`Gasto.facturado` se **rellena solo** con la suma de las facturas activas ligadas cada vez
que cambia el enlace o se cancela una factura. Hoy nadie la llena, así que no pisa nada.

### Pantalla

Tabla con Nombre, RFC, Serie, Folio, Fecha emisión, Total (P26), más **Maniobra ligada**,
que muestra su folio (P15), o el aviso *pendiente de ligar* (P7). Filtro activa/cancelada
(P65). Botón de carga visible solo para quien puede usarlo.

## Fase 2 — Clientes principales (P28, P46–48)

- Tabla nueva `ClientePrincipal`: `nombre`, `dias_credito`.
- `Cliente.cliente_principal` FK nullable. La tabla `api_cliente` **no se renombra** (D4);
  en pantalla, Catálogos → Clientes pasa a llamarse **Direcciones**.
- Pantalla en Catálogos para asignar varias direcciones a un principal, con el patrón de
  coordinador ↔ choferes (migración 0066).
- Ventas por cliente agrupa por `maniobra.cliente_fk → cliente_principal` (P47). Las
  direcciones sin principal salen como **"sin cliente asignado"** (P48).

## Fase 3 — Cuentas por cobrar

- Facturas activas con `cobrada = false`.
- Vencimiento = `fecha_emision + dias_credito` del principal, en días naturales (P28,
  P36). Calculado, no guardado.
- **Por defecto (validar):** una factura sin maniobra ligada no tiene cliente principal ni
  días de crédito. Se lista con el aviso *pendiente de ligar* y queda fuera de la
  antigüedad de saldos hasta que se ligue.
- Antigüedad: 0–30, 31–60, 61–90, +90 días vencidos.
- Cobranza semanal = suma del Total por **semana de la fecha de emisión** (P67, P70).

## Fase 4 — Cuentas por pagar y capturas manuales

### `CuentaPorPagar` (P34, P35, P55)

`origen` flete / local / mantenimiento, `maniobra` FK nullable (null en mantenimiento),
`empresa`, `no_factura`, `total`, `concepto`, `fecha`, `dias_credito`, `estado`
activa/cancelada (se cancela, no se borra, para que los meses cerrados no se muevan: P55),
más `created_by/updated_by`. Vencimiento calculado (P36).

- **Fletes:** maniobras con `transportista` ≠ FRABA CONTAINER (P32), la misma regla que ya
  usa el código.
- **Locales:** maniobras con `placas_pis` en `UnidadTercero` (P33). Se muestran Terminal,
  Fecha PIS, Placas PIS, tipo de servicio, tipo de carga, peso, contenedor y referencia.
- **Empresa:** en fletes y locales sale de la serie de la factura de venta ligada; sin
  factura, se elige a mano. En mantenimiento se elige siempre (P61).

### `GastoFijo` + `GastoFijoPago` (P30, P31, P68, P71)

- `GastoFijo`: `empresa`, `concepto`, `dia_pago`, `monto` (referencia), `periodicidad`
  en meses: 1 mensual, 2 bimestral, 3 trimestral, 6 semestral, 12 anual.
- `GastoFijoPago`: (`gasto_fijo`, `mes`) unique, `monto`. Celda vacía = no pagado.
- La rejilla muestra 6 meses (ene–jun / jul–dic) según la fecha de hoy, con cambio de
  mitad y de año, y un botón de nuevo gasto fijo.
- **Aviso "faltan pagos por capturar" (P54):** en un mes solo cuentan los conceptos que
  tocan. Tocan si ese mes es el último con monto + k × periodicidad; un concepto sin
  ningún pago toca todos los meses. El costo de patio es un gasto fijo más (P20).

### `CapturaMensual` (P23–P25, P53)

Una sola tabla: `mes`, `tipo` ∈ {financiero, impuesto, comision}, `concepto`, `monto`.
Se captura en la pantalla de *Gastos financieros* (P53). Cada tipo se resta en su paso de
la fórmula. Las comisiones empiezan vacías, así que valen 0 (P25).

## Fase 5 — Reparaciones del reporte de viaje (P60)

Como era el diésel **antes** del 2026-09-29. Desde esa fecha el diésel es de solo
lectura en Gastos y el reporte siempre lo pisa; Reparaciones sigue editable, así que
conserva la regla vieja (P60):

- El reporte escribe `reparacion_costo` en `Gasto.reparaciones` si esa celda está vacía.
  Nunca pisa lo capturado a mano (hace falta un `reparacion_volcado`, como el antiguo
  `diesel_volcado`, para poder llenarse por etapas).
- Si las dos cifras no coinciden, aparece un aviso en la tabla de reportes.

Si Reparaciones también debe ser de solo lectura, se copia el diésel actual y esta fase se
simplifica.

## Fase 6 — Dashboards (al final, P52)

**Costo de una maniobra**, el mismo en todos los dashboards (P38, P60):
`gastos_totales` + total de urea del reporte de viaje. Las reparaciones ya están dentro de
`gastos_totales` gracias a la fase 5. Los costos extra quedan fuera (P59).

**Fórmulas**

- **Ventas del mes:** Total de las facturas activas, con IVA, por mes de emisión (D2, P9).
- **Costo de ventas:** costo de las maniobras por mes de **entrega de mercancía** (P18).
  Antes de escribir esa consulta, comprobar el tipo real de `gastos.fecha_entrega_mercancia`
  en `information_schema`: el modelo dice CharField y la columna es de una tabla
  `managed=False`.
- **Utilidad bruta** = ventas − costo de ventas.
- **Utilidad operacional** = bruta − (gastos fijos del mes + comisiones + nómina
  administrativa). La nómina administrativa son los empleados cuyo usuario es staff (P63),
  y su conversión semana → mes **depende de P62**: hasta entonces se muestra como
  pendiente.
- **Antes de impuestos** = operacional − financieros.
- **Neta** = antes de impuestos − impuestos.
- **Rentabilidad** = ingreso / costo × 100 (P37).
- **% por cliente** = ventas del cliente / ventas del periodo × 100.
- **Local** = origen y destino iguales, comparados sin acentos ni mayúsculas (P39).
- **Servicio:** `tipo_servicio`, con la heurística `_es_carga_suelta` de respaldo (P1).

**Por defecto (validar):** en el dashboard de *servicios vendidos*, una maniobra sin factura
cae en el mes de su `fecha_pis` y se marca con la nota "sin número de factura" (P8).

**Páginas (P40, P41, P44).** Cuatro páginas, cada una con un selector de vista centrado
arriba:

1. Ventas / Gastos / Utilidad mensual.
2. Cuentas por cobrar + Cobranza semanal / Cuentas por pagar.
3. Ventas por cliente / Ventas por servicio.
4. Costos por unidad / Rentabilidad por operación.

Además, una página **DASHBOARDS** con los mismos componentes juntos: se reutilizan, no se
duplican (P41).

**Filtros:** los de la tabla de la P42. Ruta = origen → destino. En Ventas mensuales, los
filtros de servicio, unidad, operador y ruta solo alcanzan a las facturas ligadas; el resto
va como *no asignado*.

**Comparación contra otro periodo:** entra en esta etapa (P43).

**Gráficas y diseño:** `recharts`, que ya está instalada (P51). La distribución sale de
`Frontend Sistema de Finanzas_files/codigo.html`; los colores y la tipografía son los del
sistema actual (P49, P50).

---

## Despliegue

Cada fase que añade tablas lleva su migración. El orden es siempre el mismo:

1. `migrar_prod.sh`
2. Backend en verde
3. Frontend

Las fases 0–5 migran; la 6 no.
