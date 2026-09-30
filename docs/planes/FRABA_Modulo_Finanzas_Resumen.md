# Resumen de la conversación — Sistema de Finanzas para FRABA Container

## 1. Objetivo general

FRABA Container está desarrollando un sistema desde cero con el objetivo de **automatizar procesos internos de la organización** y centralizar la información.

Uno de los módulos principales será **Finanzas**, el cual debe estar conectado con **Operaciones y Facturación**, evitando capturas duplicadas y permitiendo que la información generada en una parte del sistema alimente automáticamente las demás.

El objetivo no es crear solamente una pantalla para registrar ingresos y gastos, sino un **módulo financiero integral** que permita controlar:

- Todo lo facturado.
- Todo lo gastado.
- Costos de operación.
- Tabulador de costos.
- Nómina.
- Cuentas por cobrar.
- Cuentas por pagar.
- Estados de cuenta.
- Estado de resultados.
- Balance general.
- Flujo de efectivo.
- Rentabilidad.
- Dashboards comparativos.
- Reportes.

---

# 2. Principio general del módulo

La información debe capturarse **una sola vez** y reutilizarse automáticamente.

Flujo conceptual:

```text
OPERACIÓN
    ↓
COSTEO
    ↓
FACTURACIÓN
    ↓
CUENTA POR COBRAR
    ↓
COBRANZA
    ↓
BANCO
    ↓
ESTADOS FINANCIEROS
    ↓
DASHBOARD
```

Paralelamente:

```text
OPERACIÓN
    ↓
COSTOS / GASTOS
    ↓
RENTABILIDAD
```

---

# 3. Estructura general propuesta

El menú de Finanzas debe contener:

```text
FINANZAS

├── Dashboard
├── Ingresos / Facturación
├── Cuentas por cobrar
├── Gastos
├── Cuentas por pagar
├── Costos
├── Nómina
├── Bancos
├── Estados de cuenta
├── Estados financieros
├── Rentabilidad
├── Reportes
└── Configuración
```

---

# 4. Dashboard financiero

Será la pantalla principal del módulo de Finanzas.

## Filtros

- Periodo.
- Mes.
- Año.
- Rango de fechas.
- Cliente.
- Unidad.
- Operador.
- Servicio.
- Ruta.
- Comparación contra otro periodo.

## Indicadores principales

```text
VENTAS
$____________

COBRADO
$____________

POR COBRAR
$____________

GASTOS
$____________

COSTOS OPERATIVOS
$____________

UTILIDAD
$____________

MARGEN
____ %
```

Cada indicador debe poder mostrar la comparación contra otro periodo.

Ejemplo:

```text
Septiembre 2026
Ventas: $1,500,000
▲ 15.4% vs agosto 2026
```

## Gráficas

El dashboard deberá incluir, como mínimo:

1. Ventas mensuales (las ventas son cada maniobra con su respectivo folio).
2. Gastos mensuales.
3. Utilidad mensual:
para calcular esto se debe seguir una secuencia de pasos que redacto a continuación: 
1-Ventas mensuales - costo de ventas(son los gastos que vienen registrados en la página de gastos)= utilidad bruta,
2-utilidad bruta - gastos operativos[costos fijos de la oficina(luz+renta+comidas+internet)+costo de patio de maniobras+comisiones de ventas(aun no se tiene pero se debe dejar preparado por si en el futuro se añaden)+nómina del personal administrativo(esto se recupera de la página de nómina)]= Utilidad operacional
3- Utilidad operacional - gastos financieros = Utilidad antes de impuestos
4-Utilidad antes de impuestos - impuestos = Utilidad neta 
4. Cobranza semanal (subir un archivo excel y que recupere solo cierta información de dicho archivo, dicha información recuperada se almacena en base de datos y el archivo de excel no se guarda en el sistema, solo la información recuperada se queda guardada).
5. Cuentas por cobrar.
6. Cuentas por pagar (recuperar toda la información de maniobras de terceros.
-Filtro de Fraba y Soluciones, esto será para una tabla de pagos fijos que será independiente a lo que sigue a continuación de este mismo punto, dicha tabla se llamará gastos fijos y tendrá las siguientes columnas: Concepto, día de pago y monto, esto corresponde a la primera parte de la tabla, la segunda parte de la tabla serán los meses del año con el formato mes-año, ejemplo: mayo-26, junio-26, agosto-26, asi sucesivamente, se deberán mostrar de 6 en 6 los meses, es decir, enero a junio y julio a diciembre, estos meses se mostrarán de acuerdo a la fecha actual, como hoy dia estamos a 9 de septiembre, se deben mostrar los meses correspondientes a la segunda mitad del año, debe de haber tambien un botón que te permita cambiar entre cada mitad y tambien te permita cambiar los años. Por ultimo esta tabla tambien debe contener su botón para agregar nuevo gasto fijo.

-(FLETES) Y de las facturas o servicios pendientes por pagar aquí que se jale todo lo que en los folios de maniobras se tenga carta terceros, es decir, que el transportista que se llevó la maniobra es tercero. 
-(LOCALES)Y para los servicios locales que se jale todo lo que en placas PIS tenga una placa de la base de terceros, se agregue el servicio pero aqui solo seria que se jale la siguiente información TERMINAL /FECHA PIS / PLACAS PIS/ tipo de servicio/TIPO DE CARGA/ Peso /Contenedor/ Referencia. Lo manual de esto seria poner N° Factura/  Total/ Concepto/ Fecha / Dias de Credito / Vencimiento
-(FACTURAS MANTENIMIENTO) Aquí si seria un apartado manual para que Mari pueda ingresar Numero de factura / Total / concepto/ fecha de factura/ días de credito / vencimiento 

En los vencimientos me gustaria que se calculara solo con la formula de (días de credito + la fecha = fecha de vencimiento) ).
7. Ventas por cliente (los clientes son los que tenemos registrados en la tabla clientes de catálogos, solo que están desglosados por dirección, se necesitaria crear grupos de clientes donde exista una especie de cliente principal, dicho cliente principal alojaría los debidos "clientes" que están en la tabla de clientes mediante un botón, esto funcionaria similar a como se asignan los coordinadores a los choferes. Se me ocurre que podríamos hacer otra tabla en catálogos llamada "CLIENTES" y renombrar la tabla actual de "CLIENTES" a "DIRECCIONES", hablando de código es muy pesado cambiar esta tabla debido a que se liga a maniobras y a documentos de viaje pero es necesario por fines operativos).

Este punto seria un dashboard y la formula seria del total ingresado dependiento el periodo, ya sea año / mes / día pudieramos ver que % representa cada cliente.
Formula:
porcentaje del cliente = (ventas del cliente/ventas totales del periodo)*100
8. Ventas por servicio (los servicios son en este caso "Carga suelta", "full" y "sencillo", sería contar ventas por cada servicio de estos 3, el sistema ya los identifica mediante un botón, además, segmentar los servicios entre locales y foráneos, locales unicamente son cuando origen y destino son lo mismo, por ejemplo, manzanillo-manzanillo, lazaro cardenas- lazaro cardenas).
9. Costos por unidad (un dashboard con filtros, que te permita seleccionar y filtrar los costos por unidad en base a los siguientes criterios: unidad, viaje, operador, destinos).
10. Rentabilidad por operación (todo lo que se ingresó / lo que se gastó, debe estar en porcentaje (%)).

---

# 5. Conexión con Operaciones
dice
Este es uno de los puntos más importantes.

Cada operación deberá tener un identificador único.

Ejemplo:

```text
OP-2026-00321
```

La operación deberá estar relacionada con:

- Cliente.
- Fecha.
- Servicio.
- Unidad.
- Operador.
- Ruta.
- Origen.
- Destino.
- Kilómetros.
- Tipo de unidad.
- Precio acordado.
- Costos asociados.
- Estatus de operación.

## Flujo

```text
OPERACIÓN
    ↓
OP-2026-00321
    ↓
Cliente: ABC
Unidad: Sencillo 15
Ruta: Manzanillo → Querétaro
    ↓
COSTEO
    ↓
FACTURACIÓN
    ↓
CUENTA POR COBRAR
    ↓
COBRANZA
    ↓
ESTADOS FINANCIEROS
```

Finanzas deberá poder consultar la operación original desde la información financiera relacionada.

---

# 6. Ingresos / Facturación

## Pantalla: Lista de facturas

Debe mostrar todas las facturas de FRABA.

### Información

- Folio.
- Operación.
- Cliente.
- Fecha.
- Fecha de vencimiento.
- Subtotal.
- IVA.
- Total.
- Estatus.

### Estatus posibles

- Borrador.
- Emitida.
- Pagada.
- Parcialmente pagada.
- Vencida.
- Cancelada.

### Acciones

- Ver factura.
- Ver operación.
- Ver cliente.
- Registrar pago.
- Ver estado de cuenta.
- Descargar.
- Cancelar.

---

# 7. Creación de factura

La factura deberá poder originarse desde una operación.

Ejemplo:

```text
Operación: OP-2026-00321

Cliente:
ABC

Servicio:
Arrastre de contenedor

Ruta:
Manzanillo → Querétaro

Importe:
$50,000
```

El sistema deberá reutilizar automáticamente la información existente de la operación.

No se debería volver a capturar manualmente:

- Cliente.
- Operación.
- Unidad.
- Servicio.
- Ruta.
- Importe.

---

# 8. Cuentas por cobrar

La información deberá alimentarse automáticamente desde Facturación.

## Indicadores

```text
TOTAL POR COBRAR
$300,000

POR VENCER
$180,000

VENCIDO
$120,000

CLIENTES CON SALDO
14
```

## Antigüedad de saldos

```text
0–30 días       $100,000
31–60 días       $50,000
61–90 días       $30,000
+90 días         $40,000
```

## Tabla

| Cliente | Factura | Vencimiento | Total | Pagado | Saldo | Días |
|---|---|---|---:|---:|---:|---:|

---

# 9. Registro de cobranza

Al seleccionar una factura se deberá poder registrar un pago.

```text
Factura: F-001

Total: $58,000
Pagado: $20,000
Saldo: $38,000

Monto recibido:
[____________]

Fecha:
[____________]

Banco:
[____________]

Forma de pago:
[____________]

Referencia:
[____________]

[REGISTRAR PAGO]
```

Al guardar:

```text
Factura
    ↓
Cuenta por cobrar disminuye
    ↓
Banco aumenta
    ↓
Estado de cuenta se actualiza
    ↓
Flujo de efectivo se actualiza
    ↓
Dashboard se actualiza
```

---

# 10. Gastos

El sistema debe registrar todos los gastos de FRABA.

## Categorías operativas

- Diesel.
- Casetas.
- Maniobras.
- Pensiones.
- Mantenimiento.
- Refacciones.
- Llantas.
- Seguros.
- Operadores.
- Viáticos.
- Servicios externos.

## Categorías administrativas

- Nómina administrativa.
- Renta.
- Luz.
- Internet.
- Telefonía.
- Software.
- Papelería.
- Servicios profesionales.
- Comisiones bancarias.
- Otros.

---

# 11. Registro de gasto

Campos propuestos:

```text
Fecha
Proveedor
Categoría
Subcategoría
Concepto
Factura
Unidad
Operador
Operación
Subtotal
IVA
Total
Forma de pago
Banco/Caja
```

Los gastos deberán poder asociarse a:

- Una operación.
- Una unidad.
- Un operador.
- Un área.
- Un proveedor.

---

# 12. Conexión de gastos con operaciones

Ejemplo:

```text
Gasto:
Diesel
$8,500

Unidad:
Sencillo 15

Operación:
OP-2026-00321
```

De esta forma, el sistema sabe que los $8,500 pertenecen a esa operación.

Esto permite calcular la rentabilidad real.

Ejemplo:

```text
INGRESO DE OPERACIÓN
$30,000

COSTOS
Diesel             $8,500
Casetas            $3,000
Operador           $4,000
Mantenimiento      $1,500

TOTAL COSTOS      $17,000

UTILIDAD           $13,000

MARGEN              43.3%
```

---

# 13. Cuentas por pagar

Debe funcionar de forma similar a Cuentas por Cobrar.

## Indicadores

```text
TOTAL POR PAGAR
$420,000

VENCIDO
$80,000

POR VENCER
$340,000
```

## Tabla

| Proveedor | Factura | Fecha | Vencimiento | Total | Pagado | Saldo |
|---|---|---|---|---:|---:|---:|

Al registrar un pago:

- Disminuye la cuenta por pagar.
- Disminuye el saldo bancario.
- Actualiza el estado de cuenta.
- Actualiza el flujo de efectivo.

---

# 14. Tabulador de costos

Debe existir un catálogo de costos estándar para FRABA.

## Costos por unidad

Ejemplo:

```text
Unidad:
Sencillo

Costo diesel:
$X / km

Mantenimiento:
$X / km

Seguro:
$X / km

Operador:
$X / viaje

Otros:
$X / viaje
```

También pueden existir costos específicos por operación:

- Casetas.
- Maniobras.
- Pensiones.
- Permisos.
- Viáticos.
- Otros.

---

# 15. Costeo automático de una operación

Cuando se cree una operación, Finanzas deberá poder calcular un costo estimado.

Ejemplo:

```text
OP-2026-00321

Origen:
Manzanillo

Destino:
Querétaro

Kilómetros:
____ km

Unidad:
Sencillo
```

El sistema consulta el tabulador y calcula:

```text
COSTO ESTIMADO

Diesel             $9,000
Casetas            $3,500
Operador           $4,000
Mantenimiento      $1,500
Seguro               $500

COSTO TOTAL       $18,500
```

Después:

```text
PRECIO DE VENTA
$30,000

COSTO
$18,500

UTILIDAD ESTIMADA
$11,500

MARGEN ESTIMADO
38.3%
```

---

# 16. Costo estimado vs costo real

Esta función es especialmente importante.

| Concepto | Estimado | Real | Diferencia |
|---|---:|---:|---:|
| Diesel | $9,000 | $9,800 | +$800 |
| Casetas | $3,500 | $3,400 | -$100 |
| Operador | $4,000 | $4,000 | $0 |
| Mantenimiento | $1,500 | $2,200 | +$700 |
| Total | $18,000 | $19,400 | +$1,400 |

El sistema deberá permitir identificar desviaciones entre el costo planeado y el costo real.

---

# 17. Nómina

## Catálogo de empleados

Cada empleado deberá contar con:

- Nombre.
- Puesto.
- Área.
- Sueldo.
- Periodicidad.
- Fecha de ingreso.
- Bonos.
- Comisiones.
- Deducciones.
- Estatus.

## Historial financiero

El expediente deberá permitir consultar:

- Sueldo.
- Bonos.
- Comisiones.
- Deducciones.
- Pagos.
- Historial de nómina.

---

# 18. Procesamiento de nómina

Ejemplo:

```text
Periodo:

01/09/2026
al
15/09/2026

[CALCULAR]
```

Resultado:

| Empleado | Percepciones | Deducciones | Neto |
|---|---:|---:|---:|

### Resumen

```text
Percepciones     $150,000
Deducciones       $25,000
NETO A PAGAR     $125,000
```

Acciones:

- Revisar.
- Modificar antes de aprobar.
- Aprobar.
- Generar reporte.
- Registrar pago.
- Consultar historial.

La implementación fiscal de la nómina deberá definirse conforme al esquema y proveedor que utilice FRABA para CFDI de nómina y cumplimiento correspondiente.

---

# 19. Bancos

Debe existir un apartado para controlar las cuentas bancarias de FRABA.

Ejemplo:

```text
BANCO 1
Saldo: $650,000

BANCO 2
Saldo: $200,000

CAJA
Saldo: $20,000
```

## Movimientos

| Fecha | Concepto | Entrada | Salida | Saldo |
|---|---|---:|---:|---:|

Los movimientos podrán provenir automáticamente de:

- Cobranza.
- Pago a proveedores.
- Nómina.
- Gastos.
- Otros ingresos.
- Otros egresos.

---

# 20. Estados de cuenta

## Clientes

Seleccionar cliente y periodo.

Ejemplo:

```text
Cliente:
Cliente A

Periodo:
01/01/2026 - 30/09/2026
```

Mostrar:

| Fecha | Documento | Concepto | Cargo | Abono | Saldo |
|---|---|---|---:|---:|---:|

También debe permitir:

- Imprimir.
- Descargar PDF.
- Descargar Excel.

## Proveedores

Misma lógica para proveedores.

---

# 21. Estados financieros

El sistema deberá generar automáticamente:

```text
ESTADOS FINANCIEROS

├── Estado de Resultados
├── Balance General
└── Flujo de Efectivo
```

---

# 22. Estado de resultados

Debe permitir seleccionar un periodo y compararlo con otro.

Ejemplo:

```text
Periodo:
Septiembre 2026

Comparar con:
Agosto 2026
```

Resultado:

| Concepto | Septiembre | Agosto | Variación |
|---|---:|---:|---:|
| Ingresos | $1,500,000 | $1,300,000 | +15.4% |
| Costos | $950,000 | $900,000 | +5.6% |
| Utilidad bruta | $550,000 | $400,000 | +37.5% |
| Gastos | $180,000 | $170,000 | +5.9% |
| Utilidad | $370,000 | $230,000 | +60.9% |

---

# 23. Balance general

## Activo

### Activo circulante

- Caja.
- Bancos.
- Clientes.
- Otros activos circulantes.

### Activo no circulante

- Unidades.
- Equipo.
- Otros activos.

## Pasivo

- Proveedores.
- Cuentas por pagar.
- Impuestos.
- Préstamos.
- Otros pasivos.

## Capital

- Capital.
- Resultados acumulados.
- Resultado del ejercicio.

El sistema deberá validar:

```text
ACTIVO = PASIVO + CAPITAL
```

Y mostrar una alerta si existe alguna diferencia.

---

# 24. Flujo de efectivo

Ejemplo:

```text
SALDO INICIAL

$500,000

ENTRADAS

Cobranza              $1,200,000
Otros ingresos          $50,000

SALIDAS

Proveedores            $350,000
Nómina                 $200,000
Diesel                 $180,000
Gastos                 $120,000

FLUJO NETO             $400,000

SALDO FINAL            $900,000
```

---

# 25. Rentabilidad

Debe permitir analizar la rentabilidad desde diferentes perspectivas.

## Por cliente

```text
Cliente A

Ventas             $400,000
Costos             $260,000
Utilidad           $140,000
Margen                  35%
```

## Por unidad

```text
Unidad 15

Ingresos           $180,000
Costos             $120,000
Utilidad            $60,000
Margen                  33%
```

## Por ruta

```text
Manzanillo → Querétaro

Ingresos           $300,000
Costos             $195,000
Utilidad           $105,000
Margen                  35%
```

## Por servicio

El sistema deberá permitir comparar los servicios de FRABA:

- Unidad 800 KG.
- Unidad 1.5 a 2 Ton.
- Unidad 3.5 Ton.
- Unidad Rabón.
- Unidad Torton.
- Caja seca 53.
- Sencillo.
- Full.

---

# 26. Dashboard comparativo

Debe permitir comparar:

- Mes contra mes.
- Año contra año.
- Mes actual contra el mismo mes del año anterior.
- Cualquier periodo contra otro periodo.

Ejemplo:

```text
PERIODO 1
Septiembre 2026

VS

PERIODO 2
Septiembre 2025
```

## Indicadores

- Ventas.
- Costos.
- Gastos.
- Cobranza.
- Utilidad.
- Margen.
- Cuentas por cobrar.
- Cuentas por pagar.
- Número de operaciones.

Ejemplo:

| Indicador | Sep-25 | Ago-26 | Sep-26 |
|---|---:|---:|---:|
| Ventas | $1.1 M | $1.3 M | $1.5 M |
| Costos | $750 K | $850 K | $950 K |
| Gastos | $150 K | $170 K | $180 K |
| Utilidad | $200 K | $280 K | $370 K |
| Cobranza | $850 K | $950 K | $1.2 M |

---

# 27. Reportes

El sistema deberá permitir generar:

- Facturación.
- Ventas.
- Gastos.
- Costos.
- Cuentas por cobrar.
- Cuentas por pagar.
- Cobranza.
- Pagos.
- Nómina.
- Flujo de efectivo.
- Estado de resultados.
- Balance general.
- Rentabilidad.
- Operaciones.

## Exportación

Los reportes deberán poder:

- Consultarse en pantalla.
- Descargar Excel.
- Descargar PDF.

---

# 28. Trazabilidad

Cada movimiento financiero deberá conservar su origen.

Ejemplo:

```text
Factura:
F-2026-00542

Operación:
OP-2026-00321

Cliente:
ABC

Unidad:
Sencillo 15

Ruta:
Manzanillo → Querétaro

Ingreso:
$30,000

Costos:
$18,500

Utilidad:
$11,500
```

Desde la factura se debería poder navegar a:

- Ver operación.
- Ver costos.
- Ver pagos.
- Ver estado de cuenta.
- Ver rentabilidad.

---

# 29. ID único

Cada operación, factura y movimiento debe tener un identificador único.

Ejemplo:

```text
Operación: OP-2026-00321
Factura: F-2026-00542
```

La relación debe permitir rastrear:

```text
Cliente
   ↓
Operación
   ↓
Factura
   ↓
Cuenta por cobrar
   ↓
Pago
   ↓
Banco
```

Y:

```text
Operación
   ↓
Costos
   ↓
Gastos
   ↓
Rentabilidad
```

---

# 30. Alertas automáticas

## Cobranza

- Factura próxima a vencer.
- Factura vencida.
- Cliente con saldo vencido.
- Cliente con aumento de deuda.

## Gastos

- Gasto superior al presupuesto.
- Incremento inusual de combustible.
- Mantenimiento elevado de una unidad.

## Rentabilidad

- Operación debajo del margen objetivo.
- Ruta con pérdida.
- Cliente con baja rentabilidad.

## Pagos

- Proveedor próximo a vencimiento.
- Pago vencido.

---

# 31. Permisos de usuario

## Administrador

Acceso completo.

## Finanzas

Acceso a:

- Ingresos.
- Gastos.
- Cobranza.
- Pagos.
- Bancos.
- Nómina.
- Estados financieros.
- Reportes.

## Operaciones

Podrá consultar información financiera relacionada con sus operaciones, pero no modificar información financiera restringida.

## Dirección

Acceso principalmente a:

- Dashboard.
- Rentabilidad.
- Estados financieros.
- Reportes.
- Comparativos.

---

# 32. Bitácora de auditoría

El sistema deberá conservar historial de cambios.

Cada modificación deberá guardar:

- Usuario.
- Fecha.
- Hora.
- Acción realizada.
- Registro anterior.
- Registro nuevo.

Los movimientos financieros no deberían eliminarse físicamente una vez registrados; deberán manejarse mediante cancelación, reversa o mecanismo equivalente con historial.

---

# 33. Catálogos / base de datos principales

Antes de construir las pantallas, se deben definir las entidades principales.

```text
CLIENTES
PROVEEDORES
EMPLEADOS
OPERADORES
UNIDADES
OPERACIONES
SERVICIOS
RUTAS
FACTURAS
PAGOS
GASTOS
COSTOS
CUENTAS POR COBRAR
CUENTAS POR PAGAR
BANCOS
MOVIMIENTOS BANCARIOS
NÓMINA
CUENTAS CONTABLES
MOVIMIENTOS CONTABLES
ESTADOS FINANCIEROS
```

---

# 34. Flujo completo de una operación FRABA

## Paso 1 — Operaciones

Se crea:

```text
OP-2026-00321

Cliente: ABC
Servicio: Sencillo
Origen: Manzanillo
Destino: Querétaro
Unidad: S-15
Operador: Juan
```

## Paso 2 — Costeo

```text
Costo estimado: $18,500
```

## Paso 3 — Facturación

```text
Factura: F-2026-00542
Importe: $30,000
```

## Paso 4 — Cuenta por cobrar

```text
Saldo:
$30,000
```

## Paso 5 — Realización del viaje

Se registran los costos reales:

```text
Diesel       $9,500
Casetas      $3,400
Operador     $4,000
Otros        $2,000

Costo real   $18,900
```

## Paso 6 — Rentabilidad

```text
Ingreso       $30,000
Costo         $18,900

UTILIDAD      $11,100

MARGEN          37%
```

## Paso 7 — Cobranza

El cliente realiza el pago:

```text
Pago:
$30,000
```

La cuenta por cobrar queda:

```text
$0
```

El banco aumenta:

```text
+$30,000
```

## Paso 8 — Estados financieros

La información alimenta automáticamente:

- Estado de resultados.
- Balance.
- Flujo de efectivo.
- Dashboard.
- Rentabilidad.

---

# 35. Dashboard de dirección

La dirección de FRABA debería poder consultar una pantalla resumida como:

```text
==================================================
                 FRABA CONTAINER
              DASHBOARD FINANCIERO
==================================================

VENTAS             $1,500,000       ▲ 15.4%

COBRADO            $1,200,000       ▲ 26.3%

POR COBRAR           $300,000       ▼ 8.2%

GASTOS                $950,000       ▲ 5.6%

UTILIDAD              $370,000       ▲ 32.1%

MARGEN                   24.7%       ▲ 3.1 pts
==================================================

VENTAS VS GASTOS POR MES

   Ene Feb Mar Abr May Jun Jul Ago Sep

==================================================

TOP CLIENTES

1. Cliente A          $400,000
2. Cliente B          $280,000
3. Cliente C          $210,000

==================================================

RENTABILIDAD

Ruta más rentable:
Manzanillo → Querétaro

Servicio más rentable:
Sencillo

Unidad con mayor rentabilidad:
S-15

==================================================

CUENTAS POR COBRAR

Vencido               $120,000
Por vencer            $180,000

==================================================
```

---

# 36. Orden recomendado de desarrollo

Para desarrollar el módulo de manera progresiva:

## FASE 1 — Base financiera

1. Catálogos.
2. Clientes.
3. Proveedores.
4. Unidades.
5. Operaciones.
6. Facturación.
7. Gastos.

## FASE 2 — Control financiero

8. Cuentas por cobrar.
9. Cuentas por pagar.
10. Bancos.
11. Estados de cuenta.

## FASE 3 — Costos

12. Tabulador.
13. Costeo de operaciones.
14. Costo estimado vs real.
15. Rentabilidad.

## FASE 4 — Nómina

16. Empleados.
17. Nómina.
18. Pagos.
19. Históricos.

## FASE 5 — Contabilidad y dirección

20. Estado de resultados.
21. Balance general.
22. Flujo de efectivo.
23. Dashboards.
24. Comparativos.
25. Reportes.
26. Alertas.

---

# 37. Resultado final esperado

El sistema debe transformar el flujo actual de trabajo:

```text
Operaciones
→ Excel
→ Facturación
→ Excel
→ Cobranza
→ Excel
→ Gastos
→ Excel
→ Estados financieros
```

en un flujo integrado:

```text
OPERACIÓN
      ↓
COSTEO AUTOMÁTICO
      ↓
FACTURACIÓN
      ↓
CUENTA POR COBRAR
      ↓
COBRANZA
      ↓
BANCO
      ↓
RENTABILIDAD
      ↓
ESTADOS FINANCIEROS
      ↓
DASHBOARD DE DIRECCIÓN
```

El objetivo final es que Finanzas sea la **fuente central de información financiera de FRABA**, conectada con Operaciones y Facturación, y que permita conocer no solamente cuánto se vendió, sino también:

- Cuánto se cobró.
- Cuánto está pendiente.
- Cuánto se gastó.
- Cuánto costó cada operación.
- Cuánto ganó FRABA.
- Qué clientes son más rentables.
- Qué rutas son más rentables.
- Qué unidades son más rentables.
- Qué servicios generan mayor margen.
- Cómo se comportan las ventas frente a otros meses o años.
- Cuál es la situación financiera de la empresa.
