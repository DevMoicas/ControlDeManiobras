# Preguntas abiertas — Módulo Finanzas

Fecha: 2026-09-09
Plan de referencia: `FRABA_Modulo_Finanzas_Resumen.md`
Alcance: sección **Gráficas** del plan, líneas 142 a 169, más la página de Facturación
con la lectura del Excel `FORMATO_LECTURA_FACTURACION.xlsx`.

Responde debajo de cada **Respuesta:**. Deja en blanco lo que no aplique o no tengas claro
todavía y lo hablamos.

---

## Decisiones ya cerradas

No hace falta volver sobre estas, quedan aquí como registro.

| # | Decisión | Elegido |
|---|---|---|
| D1 | Origen del importe de una venta | Dos dashboards. Uno cuenta servicios vendidos por tipo y total. Otro cuenta dinero de la factura por tipo y total. El enlace entre maniobra y factura es el campo No. Factura de Maniobras contra serie más folio del Excel. |
| D2 | IVA en las ventas | Con IVA. Se usa la columna Total del Excel. |
| D3 | Clave de duplicados de factura | UUID fiscal, columna M del Excel. Se guarda en la base y no se muestra. |
| D4 | Agrupación de clientes | Tabla nueva de grupos. No se renombra la tabla actual. En pantalla el catálogo pasa a llamarse Direcciones. |

## Hallazgos de la base local

Conteos tomados de la base de datos local, que puede ir por detrás de producción.

| Dato | Valor |
|---|---|
| Maniobras | 415 |
| Con número de factura | 358 |
| Formato serie espacio folio | 319 |
| Con dos folios separados por diagonal | 32 |
| Números de factura repetidos en varias maniobras | 3, que cubren 8 maniobras |
| Maniobras con tipo de servicio capturado | 12 |
| Series encontradas | I con 43, S con 311 |

Otros dos hallazgos, sin conteo:

- El archivo `Frontend Sistema de Finanzas.html` es la página del visor de Canva guardada
  desde el navegador. No trae CSS ni maquetación reutilizable. Del JSON incrustado sí se
  recuperan los textos y la paleta: `#17212b`, `#087e8b`, `#dbeafe`, `#f5f7f8`, `#687782`,
  `#102a43`, `#28678e`.
- Ninguna tabla del sistema guarda el importe de venta de una maniobra. El costo sí está,
  en la página de Gastos.

---

## Ventas y facturación

### 1. Tipo de servicio vacío

Está sin capturar en 403 de 415 maniobras. ¿Clasifico con la heurística que el backend ya
usa para los documentos, donde el texto carga suelta manda, más de doce caracteres de
contenedor es full y el resto sencillo? ¿O prefieres que alguien rellene el campo a mano?

**Respuesta:**
el campo hoy por hoy ya se llena siempre, pero no está de más utilzar esto por cualquier cosa.

### 2. Dos folios en una maniobra

Hay 32 registros escritos como `I 154/ 153`. ¿Significa que dos facturas cubren esa
maniobra y su venta es la suma de ambas?

**Respuesta:**
Correcto, cuando en un num de factura salen escritos como `I 154/ 153` o escritos como `I 154 // 153` significa que ambas facturas corresponden a la misma maniobra y se suman ambas, ojo, la division pueden ser tanto 1 diagonal como 2 diagonales '/' o '//'

### 3. Una factura con varias maniobras

Si esa factura cubre maniobras de distinto tipo de servicio, ¿reparto su total a partes
iguales entre los tipos o lo asigno completo al tipo de la primera maniobra?

**Respuesta:**
Este caso fue aislado y viejo, hoy en día, las facturas son unicas, cada servicio tiene su factura, lo que si puede pasar es que un mismo servicio tenga varias facturas, como lo vimos anteriormente, pero esto de que una factura pertenezca a varias maniobras ya no va a pasar.

### 4. Series viejas

En el sistema aparecen las series I y S, y el Excel de ejemplo trae SEF. ¿Cargamos el
histórico de las series viejas o la facturación arranca desde SEF?

**Respuesta:**
La facturacion arranca desde lo nuevo, es decir, lo correspondiente al mes de agosto en adelante

### 5. Valores que no son factura

Tres maniobras dicen EFECTIVO y una trae un 201 sin serie. ¿Los dejo fuera del dinero y
los marco como no ligados?

**Respuesta:**
Dejalos fuera porque ya no se utiliza este medio de pago, y si se llegara a utilizar, no cuenta porque no es deducible de impuestos por lo que no se necesita aqui.

### 6. Normalización del enlace

¿Comparo ignorando mayúsculas, espacios y guiones, de forma que `SEF 456`, `sef456` y
`SEF-456` casen todos con serie SEF y folio 456?

**Respuesta:**
es correcto.

### 7. Facturas sin maniobra

¿Cuentan como venta igual y se listan aparte como pendientes de ligar, o no cuentan hasta
que se liguen?

**Respuesta:**
pocas veces va a pasar esto porque primero se registra la maniobra y después se hace la factura, pero en caso de que se tenga una factura y no se haya asignado a la maniobra, se marca como pendiente de ligar y muestra un pequeño aviso en esa factura.

### 8. Maniobras sin factura

Son 57 de 415. ¿Aparecen en el dashboard de servicios vendidos aunque no tengan dinero, o
quedan fuera de los dos dashboards?

**Respuesta:**
las maniobras sin factura puesta caen en lo mismo que la pregunta 7, es algo que no deberia de pasar por como fluye la operacion, pero en caso de que pase, si aparecen en el dashboard pero debe haber una pequeña nota que diga que ciertas maniobras no tienen numero de factura.

### 9. Mes al que pertenece la venta

¿Por fecha de emisión de la factura o por fecha PIS de la maniobra?

**Respuesta:**
Por fecha de emision de la factura

### 10. Filas que no son ingreso

El Excel trae tipo de comprobante y estatus de validación. ¿Filtro las que no sean de tipo
ingreso y las canceladas, o entra todo?

**Respuesta:**
todo

### 11. Aviso de duplicados

¿Un resumen al terminar con el detalle de lo omitido, o un aviso por cada duplicado?
¿La carga continúa con el resto de las filas?

**Respuesta:**
un resumen al final con el detalle de lo omitido, la carga no se omite, al final se muestra el resumen con lo que se omitió por duplicado.

### 12. Formatos aceptados

¿Solo xlsx, o también xls y csv? ¿Pongo un tamaño máximo de archivo?

**Respuesta:**
los 3 por cualquier cosa y no pongas tamaño maximo de archivo, este apartado no lo podrá ver cualquiera porque implementaremos el control por cargos y roles, por lo que existe mejor control.

### 13. Quién sube el Excel

¿Qué cargos tienen permiso para cargar facturación?

**Respuesta:**
Todos los que sean de directores(as), comercial y cuentas admin.

### 14. Edición posterior

¿Se pueden corregir o borrar facturas ya cargadas? ¿Quién puede?

**Respuesta:**
La informacion es no editable pero si borrable.

### 15. Columnas de la tabla

¿Exactamente las seis que pediste, o añado una columna que indique si la factura quedó
ligada a su maniobra?

**Respuesta:**
Si, añade la columna para saber si quedo ligada, esta deberia mostrar el folio de la maniobra ligada.

### 16. UUID

¿Confirmas que se guarda en la base pero no se muestra nunca en pantalla?

**Respuesta:**
Confirmo

### 17. Moneda

El Excel trae moneda y tipo de cambio. ¿Doy por hecho que todo es peso mexicano y rechazo
cualquier otra moneda?

**Respuesta:**
si
---

## Costos, utilidad y cuentas por pagar

### 18. Costo de ventas

¿Es el total de gastos de la maniobra que ya guarda la página de Gastos? ¿Se agrupa por
fecha PIS o por fecha de entrega de mercancía?

**Respuesta:**
Si y se agrupa por fecha de entrega de mercancía.

### 19. Gastos fijos de oficina

¿La tabla de gastos fijos que pides en Cuentas por pagar es la misma fuente de luz, renta,
comidas e internet para la fórmula de utilidad?

**Respuesta:**
Si

### 20. Costo de patio de maniobras

No existe importe en ningún lado. ¿De dónde sale, es un gasto fijo más?

**Respuesta:**
Si

### 21. Nómina administrativa

El empleado tiene cargo pero no área. ¿Qué cargos cuentan como administrativos?

**Respuesta:**
Los que tienen usuario admin.

### 22. Sueldo semanal a mensual

El sueldo está guardado por semana. ¿Multiplico por 4.33 o cuento las semanas reales de
cada mes?

**Respuesta:**
cuenta las semanas de cada mes, existen en internet calendarios con el numero de semana ya puesto, esto con el fin de facilitar este tipo de cosas, si existe una manera sencilla de basarnos en este calendario estaria mejor, si no lo dejo a tu criterio o me haces mas preguntas.

### 23. Gastos financieros

¿Captura manual por mes en una tabla nueva? ¿Qué conceptos entran?

Aclaración pedida en la sesión del 2026-09-09. Los gastos financieros son el costo del
dinero, no el de operar: intereses de un crédito, intereses de un arrendamiento
financiero, comisiones bancarias por manejo de cuenta, comisiones de terminal de cobro,
intereses moratorios y pérdida por tipo de cambio. Hoy no viven en ningún lado del
sistema. Gastos guarda el costo del viaje y Nómina los sueldos, y no hay módulo de bancos.
Lo más simple es una tabla de captura manual con mes, concepto y monto, y que el término
valga cero el mes que nadie capture nada. Hace falta la lista de conceptos para que un
mismo peso no se cuente dos veces: las comisiones bancarias también aparecen entre las
categorías administrativas del plan, línea 412.

**Respuesta:**
Sí, captura manual en una tabla nueva y por mes, de conceptos entrarían los sig: 
- los impuestos (IVA y retenciones) 
- gastos de créditos que tenemos

### 24. Impuestos

¿Captura manual por mes, o un porcentaje fijo sobre la utilidad antes de impuestos?

**Respuesta:**
Captura manual por mes, esto lo incluiriamos en gastos financieros

### 25. Comisiones de ventas

¿Lo dejo como término en cero dentro de la fórmula, sin tabla ni pantalla, hasta que exista
el dato?

**Respuesta:**
dejemos el espacio para su captura preparado y dentro de la formula pero en ceros, asi, mientras no exista dato cpaturado se suma 0 y no afecta la formula pero se deja preparado para cuando esté capturado

### 26. Excel de cobranza semanal

¿Qué archivo es y qué columnas hay que recuperar? ¿Puedes dejar un ejemplo en esta misma
carpeta de planes?

**Respuesta:**
Si, ya está y se llama FORMATO_LECTURA_FACTURACION, las columnas son Nombre, RFC, SERIE, FOLIO, FECHA EMISIÓN y TOTAL

### 27. Marcar una factura como cobrada

¿Sale de ese Excel de cobranza o se marca a mano?

**Respuesta:**
Se marca a mano

### 28. Antigüedad de saldos

¿Los días se cuentan desde la fecha de emisión más los días de crédito? ¿Cuántos días de
crédito se aplican por defecto?

**Respuesta:**
Si, los días de crédito se cuentan de la fecha de emisión de la factura + los días de credito. Para cada cliente son diferentes días, dichos días irán registrados en una tabla de clientes nueva que se añadirá en catálogos, actualmente existe una pero dicha tabla se va a renombrar a direcciones.
### 29. Fraba y Soluciones

¿Son dos empresas distintas? ¿Cómo distingo una de otra con los datos que ya existen?

**Respuesta:**
las facturas SEF corresponden a "Soluciones" y las facturas S corresponden a "Fraba"

### 30. Rejilla de meses de gastos fijos

¿Cada celda guarda una marca de pagado o el monto pagado ese mes?

**Respuesta:**
haremos lo siguiente acá, la tabla se divide en 2, en la parte izq se guarda el concepto, el día y el monto, eso no se mueve, lo que se mueve es la parte derecha de la tabla que es donde contiene los meses, en cada casilla del mes se escribirá el monto pagado ese mes, esto debido a que hay varios gastos que son variables en costo, si no se escribe nada en la casilla es porque no se ha pagado

### 31. Monto variable

¿El monto de un gasto fijo puede cambiar de un mes a otro, o es el mismo todo el año?

**Respuesta:**
hay varios que cambian de un mes/bimestre a otro

### 32. Fletes de terceros

¿La regla es transportista distinto de FRABA CONTAINER, que es la que ya usa el código para
decidir si una unidad es de tercero?

**Respuesta:**
si

### 33. Servicios locales

Los ocho campos que listaste son todos de Maniobras. ¿Confirmas que la fuente son maniobras
cuyas placas PIS estén en el catálogo de unidades de terceros?

**Respuesta:**
Si  

### 34. Lo manual de cuentas por pagar

Número de factura, total, concepto, fecha, días de crédito. ¿Se puede editar y borrar
después? ¿Vive en una tabla nueva ligada a la maniobra?

**Respuesta:**
Tabla nueva CuentaPorPagar, FK nullable a Maniobra, campo origen para distinguir flete / local / mantenimiento, editable y borrable con el rastro de auditoría que ya existe, vencimiento calculado y no guardado, será editable y borrable solo para los admins, en el plan se menciona "para que Mari pueda ingresar", esto se refiere a una persona a la cual se le asignará un cargo específico, en este caso el de comercial
### 35. Facturas de mantenimiento

¿Es una tabla independiente que no se liga a ninguna maniobra?

**Respuesta:**
Correcto

### 36. Cálculo del vencimiento

Fecha más días de crédito. ¿Días naturales o días hábiles?

**Respuesta:**
naturales.

### 37. Rentabilidad por operación

Escribiste lo ingresado entre lo gastado en porcentaje. Esa división da 300 por ciento
cuando se gana el triple. ¿Es esa la cifra que quieres ver, o prefieres margen, que es
utilidad entre ingreso?

**Respuesta:**
Si, esa cifra, si por ejemplo la division da 50 entonces veria una rentabilidad de 50% y si da 200 la division serian 200%
### 38. Costos por unidad

¿La unidad es el tracto de la maniobra? ¿El costo es el total de gastos? ¿Qué quiere decir
filtrar por viaje, es una maniobra concreta?

**Respuesta:**
Si la unidad es el tracto.
Si, el costo es el total de gastos registrados de esa maniobra en la pagina de gastos y si llega a haber reparaciones y cargas de urea en los reportes de viaje, tambien contemplar eso.
Filtrar por viaje es por maniobra exacto.
### 39. Local contra foráneo

Un servicio es local si origen y destino coinciden. ¿Comparo el texto tal cual, o normalizo
acentos y mayúsculas antes de comparar?

**Respuesta:**
Tecnicamente seria comparar el texto tal cual pero por cualquier cosa normaliza acentos y mayusculas tambien
---

## Páginas, permisos y diseño

### 40. Lista de páginas

¿Son estas nueve más la de DASHBOARDS? Ventas mensuales, Gastos mensuales, Utilidad
mensual, Cuentas por cobrar junto con Cobranza semanal, Cuentas por pagar, Ventas por
cliente, Ventas por servicio, Costos por unidad y Rentabilidad por operación.

**Respuesta:**
Mi propuesta es agruparlas por páginas y añadir un botón con vistas para dicha página, debería ser un botón que se comporte como las vistas que ya existen en las demas tablas con sus filtros pero aqui para cada una de las agrupadas, por ejemplo, ventas mensuales, gastos mensuales y utilidad mensual agrupadas en una página, dicha página tendrá un botón centrado en la parte superior pero con margenes para no pegar hasta arriba, dicho botón tendrá de opciones las 3 agrupadas, 1 opcion por cada una y cada vista te mostrará lo correspondiente

### 41. Repetición del dashboard

¿La página individual lleva exactamente el mismo dashboard que aparece en DASHBOARDS, o una
versión reducida?

**Respuesta:**
que sea la misma, el punto de la pagina de dashboards es tenerlos agrupados todos en uno solo para cuando se necesite ver mas de uno y hacer comparativas, las paginas deben tener el mismo grafico que la de dashboards.
### 42. Filtros

El plan lista periodo, mes, año, rango de fechas, cliente, unidad, operador, servicio y
ruta. ¿Van todos en todos los dashboards, o me dices cuáles en cada uno?

**Respuesta:**
┌────────────────────────────┬───────────────────────────────────────────────────────────────────────┐
│         Dashboard          │                                Filtros                                │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Ventas mensuales           │ periodo, cliente, servicio, unidad, operador, ruta (los cuatro        │
│                            │ últimos solo alcanzan a las facturas ligadas, cuando no se tiene factura ligada,      debe                           clasificar aparte como no asignado.)                                  │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Gastos mensuales           │ los seis                                                              │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Utilidad mensual           │ solo periodo                                                          │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Cuentas por cobrar /       │ periodo, cliente                                                      │
│ Cobranza semanal           │                                                                       │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Cuentas por pagar          │ periodo, Fraba/Soluciones                                             │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Ventas por cliente         │ periodo, cliente                                                      │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Ventas por servicio        │ periodo, servicio, local/foráneo                                      │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Costos por unidad          │ periodo, unidad, maniobra, operador, destino (los de la línea 168)    │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Rentabilidad por operación │ los seis                                                              │
└────────────────────────────┴───────────────────────────────────────────────────────────────────────┘

el filtro de ruta se refiere a origen->destino
### 43. Comparación contra otro periodo

¿Entra en esta etapa o la dejamos para después?

**Respuesta:**
Si entra

### 44. Hub de Finanzas

Pasa de cuatro tarjetas a doce. ¿Las agrupo en secciones o dejo la rejilla plana?

**Respuesta:**
como lo dicta la pregunta 40, se agruparan, la agrupación de momento será la siguiente:
1- ventas mensuales, gastos mensuales, utilidad mensual.
2- Cuentas por cobrar/cobranza semanal, cuentas por pagar.
3- ventas por cliente, ventas por servicio.
4- Costos por unidad, rentabilidad por operacion.

### 45. Permisos

¿Finanzas queda restringido por cargo, como ya lo está Ingresos? ¿Dirección ve solo
DASHBOARDS?

**Respuesta:**
Finanzas queda restringido su acceso por cargo, solo pueden acceder de cargos: comercial, todos los cargos que contengan director(a) y cuentas admin.
los cargos de director tienen permisos para ver todo.

### 46. Grupos de clientes

¿Hago una pantalla nueva en Catálogos para asignar direcciones a un cliente principal, con
el mismo patrón que coordinadores y choferes?

**Respuesta:**
Si, se deben poder asignar varias direcciones a un mismo cliente principal

### 47. Agrupación de ventas por cliente

¿Agrupo por el cliente del catálogo ligado a la maniobra, por el texto de cliente de la
maniobra, o por el nombre y RFC que trae la factura?

**Respuesta:**
Por el cliente del catálogo ligado a la maniobra, es lo que menos margen de erro tiene ya que el texto de cliente a veces varia porque el capturador lo captura como quiere pero se refiere al cliente del catálogo ligado a la maniobra.

### 48. Direcciones sin grupo

¿Las que nadie asigne se muestran juntas como sin asignar, o se ocultan del dashboard?

**Respuesta:**
se muestran juntas como sin asignar, aunque esto no debería pasar, pero por si acaso mostremosla como "sin cliente asignado"

### 49. Diseño de referencia

¿Puedes exportar el diseño de Canva a PDF o PNG y dejarlo en esta carpeta? El HTML que
pegaste es solo la página del visor y no trae maquetación.

**Respuesta:**
Si puedo, ahí te lo dejo adjuntado en est a carpeta, recuerda usar la paleta de colores que ya tenemos y no la del diseño nuevo, el diseño nuevo es la base para la distribución, no para los colores ni tipografía.

### 50. Paleta

¿Los dashboards usan los colores del Canva o los del sistema actual?

**Respuesta:**
del sistema actual

### 51. Librería de gráficas

Uso recharts, que ya está instalada y ya se usa en Administración de gastos. ¿De acuerdo?

**Respuesta:**
si es la más adecuada sí, de acuerdo, si hay una mejor opción, podemos probarla

### 52. Orden de entrega

¿Por dónde quieres que empiece, por Facturación con la carga del Excel o por la página de
DASHBOARDS?

**Respuesta:**
por la facturacion, los dashboards dejemoslos al ultimo porque sin datos no sirven los dashboards

---

## Preguntas nuevas — sesión del 2026-09-25

Salieron al revisar las respuestas de arriba. Se numeran a partir del 53 para no
renumerar nada de lo ya contestado.

### 53. Dónde se restan los impuestos

Viene de las respuestas 23 y 24. Metiste IVA y retenciones dentro de gastos financieros,
y confirmaste que los impuestos se capturan ahí mismo. Pero la fórmula del plan los tiene
como paso aparte: el paso 3 resta gastos financieros y da *utilidad antes de impuestos*,
y el paso 4 resta impuestos y da *utilidad neta*. Si los impuestos ya van dentro del paso
3, o se restan dos veces o el paso 4 queda en cero y el nombre "antes de impuestos" deja
de ser cierto.

¿Los impuestos se restan en el paso 3 junto con los intereses de créditos, y entonces el
paso 4 desaparece de la fórmula? ¿O gastos financieros se queda solo con el costo del
dinero (intereses y comisiones) y los impuestos van en su propia captura para el paso 4?

**Respuesta:**
los impuestos deben ir en su propia captura pero dicha captura debe hacerse en el apartado de gastos financieros, no importa que no se tome en cuenta, a lo que me refiero es que ese es el lugar tangible donde se van a capturar y de ahí mismo se va a recuperar esa información para restarlos en el paso correspondiente, si aun quedan dudas me sigues preguntando

### 54. El mes sin capturar infla la utilidad

Viene de la respuesta 30. Quedó que la celda vacía de la rejilla significa "no pagado",
así que el costo fijo de un mes es la suma de su columna. Mientras nadie capture los pagos
de un mes, ese término vale cero y la utilidad de ese mes sale más alta de lo real.

¿El mes en curso se muestra igual, con un aviso de que faltan pagos por capturar? ¿O la
utilidad solo se calcula sobre meses ya cerrados?

**Respuesta:**
se muestra igual con el aviso de que faltan pagos por capturar, asi se tienen en cuenta y no se afecta la demás utilidad.

### 55. Borrar una cuenta por pagar de un mes cerrado

Viene de la respuesta 34. Si alguien borra en noviembre una cuenta por pagar de agosto, la
utilidad de agosto cambia sola y un número que ya se reportó deja de coincidir.

¿Te importa que eso pase? Si sí, el borrado tendría que ser una marca de cancelada en lugar
de un borrado real, para que los meses ya cerrados no se muevan.

**Respuesta:**
manejemoslo como cancelada para que los meses cerrados no se muevan

### 56. El cargo exacto que puede editar y borrar

Viene de las respuestas 21, 34 y 45. En la 34 dices "solo para los admins", en la 21 "los
que tienen usuario admin", y en la 45 los cargos con acceso son comercial, los que
contengan director(a) y cuentas admin. Como esto es permisos, necesito el nombre exacto tal
como está en el catálogo de cargos, no la palabra admin.

¿Qué cargos concretos pueden editar y borrar en cuentas por pagar y en la rejilla de gastos
fijos?

**Respuesta:**
borrar solo las cuentas admin, editar pueden cuentas admin y cargos: comercial, director general, director operativo, directora comercial.

### 57. La semana partida entre dos meses

Viene de la respuesta 22. Contar las semanas reales de cada mes deja un caso sin resolver:
una semana que empieza en un mes y termina en el siguiente, por ejemplo lunes 29 de
septiembre a domingo 5 de octubre.

¿Ese sueldo cuenta completo en septiembre, completo en octubre, o partido a proporción de
los días que caen en cada mes?

**Respuesta:**
El sueldo que nosotros manejamos no es por mes, es por semana, por eso te decía que te basaras en las semanas del año y esas no importa si cae a media semana de un mes y media de otro mes porque lo que nosotros estamos pagando es el trabajo de la semana número X como ejemplo semana 39 del año.
---

## Preguntas nuevas — sesión del 2026-09-29

Salieron al contrastar las respuestas con el código y la base. Siguen la numeración.

**Corrección a los hallazgos de arriba.** "Ninguna tabla guarda el importe de venta" era
falso: `Gasto.facturado` existe y es la columna **Ingresos** de la página de Gastos (solo
staff), de la que sale la utilidad bruta de cada fila. Es texto capturado a mano.

### 58. Qué pasa con la columna Ingresos de Gastos

Cuando exista Facturación habrá dos fuentes del ingreso de una maniobra: la columna
Ingresos (a mano) y las facturas ligadas del Excel. Si conviven, un día dirán cosas
distintas.

Propuesta: el ingreso de una maniobra es la suma de sus facturas ligadas; si no tiene
ninguna (todo lo anterior a agosto), se usa la columna Ingresos. La columna sigue
editable solo para esas maniobras viejas. ¿De acuerdo, o prefieres otra regla?

**Respuesta:**
hoy en día la columna ingresos no se está llenando, sigamos adelante con el plan y si hay manera viable de ligar el ingreso desde facturacion hacia la columna de ingresos para que se llene automaticamente estaría excelente.

### 59. Costos extra en el costo de venta

Los costos extra que se eligen en cada maniobra (catálogo Finanzas → Costos extra: grúa,
etc.) **no** entran hoy en el total de la página de Gastos. ¿Cuentan como costo de ventas
en la utilidad, los costos por unidad y la rentabilidad?

**Respuesta:**
No, costos extra se usará solo informativamente en otra tabla que se hará después.
### 60. Reparaciones contadas dos veces

La respuesta 38 pide sumar reparaciones y urea de los reportes de viaje. Pero Gastos ya
tiene su propia columna **Reparaciones**. Si la misma reparación se escribe en los dos
sitios, se cuenta doble.

Propuesta: urea siempre del reporte de viaje (Gastos no tiene dónde ponerla). Reparación:
la de Gastos; la del reporte solo si Gastos la tiene vacía. ¿Así?

Y lo mismo aplica fuera de Costos por unidad: ¿el costo de ventas de la utilidad mensual y
de la rentabilidad también suma urea y reparaciones del reporte? Recomiendo que sí, que el
costo de una maniobra sea el mismo número en todos los dashboards.

**Respuesta:**
haremos lo mismo que con el diesel, se registran en ambos lados y si no coinciden se debe dar un aviso, si el espacio de reparaciones en gastos está vacío al momento de que se llena un reporte de viaje, se debe llenar en gastos la cantidad puesta en reportes de viaje, si llegara a estar con informacion en gastos, se hace lo mismo que en diesel, se pone un aviso de que las cantidades no coinciden asi se pueden revisar para ver que está mal.

con respecto a la suma de urea y reparaciones, vamos con tu recomendación.

### 61. Fraba o Soluciones en cada cosa

La 29 dice SEF = Soluciones y S = Fraba, y la 42 filtra Cuentas por pagar por empresa.

1. El Excel de ejemplo es solo de Soluciones (la hoja se llama `Ingresos_SEF230905CP5`).
   ¿Fraba sigue facturando con serie S desde agosto y también se subirá su Excel?
2. Los gastos fijos y las facturas de mantenimiento no traen serie. Propuesta: una columna
   Empresa (Fraba / Soluciones) que se elige al capturar.
3. Fletes y locales de terceros: propuesta, la empresa sale de la serie de la factura de
   venta de esa maniobra; si no tiene factura ligada, se elige a mano.

**Respuesta:**
1.    Correcto, serie S es para fraba y tambien se sube su excel.
2. vamos con la propuesta.
3. vamos con la propuesta.

### 62. A qué mes va cada semana de nómina

Entendido que se paga la semana número X. Pero la utilidad es mensual, así que la semana
tiene que caer en un mes y solo uno. Propuesta: la regla del calendario ISO (el de los
calendarios con número de semana): la semana pertenece al mes en que cae su **jueves**.
Así un mes tiene 4 o 5 semanas y el año suma 52 o 53. Ejemplo: la semana 40 (29 sep – 5
oct 2026) tiene el jueves 1 de octubre → cuenta en octubre. ¿De acuerdo, o la semana va al
mes del día en que se paga?

Segundo punto: el sueldo se guarda sin historial. Si en noviembre alguien sube un sueldo,
la nómina de agosto recalculada sale con el sueldo nuevo, y un mes cerrado se mueve (lo
que la 55 quiso evitar). ¿Guardamos el sueldo de cada semana al cerrarla, o se acepta?

**Respuesta:**
PENDIENTE!!!!!!

### 63. Nómina administrativa = usuarios staff

"Los que tienen usuario admin" lo leo como: empleados cuyo usuario del sistema es staff
(el mismo "admin" que ve Ingresos y Nómina hoy). Un empleado sin usuario no cuenta.
¿Confirmas?

**Respuesta:**
confirmo

### 64. Nombres exactos de los cargos y acceso cerrado

La base local solo tiene los cargos Capturista, Coordinador, Operador y Pagos, así que no
puedo comprobar los nombres de producción. Necesito los nombres exactos, tal cual están en
Catálogos → Cargos, de: comercial, director general, director operativo, directora
comercial, y cualquier otro director(a).

Además: el sistema actual de secciones por cargo **deja pasar** a quien no tiene empleado
o tiene un cargo que no está en el catálogo. Para Finanzas propongo lo contrario: entra
**solo** staff o esos cargos exactos, y cualquier otro caso se queda fuera. ¿De acuerdo?

**Respuesta:**
de acuerdo con lo de staff y los cargos exactos son estos: comercial, director general, director operativo, directora comercial

### 65. Borrar una factura cargada

La 14 dice "borrable", pero la 55 decidió cancelar en vez de borrar para que los meses
cerrados no se muevan. Borrar una factura de agosto baja las ventas de agosto igual.
¿Las facturas también se cancelan en lugar de borrarse? ¿Y quién puede, solo staff como en
la 56?

**Respuesta:**
haremos lo siguiente, las facturas ya no serán borrables, solo tendrán estados, activo y cancelado con su respectivo filtro, cuando una factura se cancele esta no contará para las ventas del mes. Con respecto a los permisos solo staff.

### 66. "Entra todo" y las canceladas

La 10 dice que entran todas las filas. Consecuencias concretas:

- Una factura **cancelada ante el SAT** contaría como venta.
- Una **nota de crédito** (tipo de comprobante E) trae su total en positivo: sumaría a la
  venta en lugar de restar.
- Un **complemento de pago** (tipo P) trae total cero: no mueve nada.

Propuesta: se guardan todas, pero las canceladas no suman y las E restan. ¿Así, o de
verdad todo suma?

**Respuesta:**
así, las canceladas no suman, de momento el unico tipo de comprobante que se cargaría con el excel es el I de ingreso.

### 67. Marcar como cobrada

Para el dashboard de cobranza **semanal** hace falta saber en qué semana se cobró.
Propuesta: al marcar una factura como cobrada se pone la fecha de cobro (por defecto hoy),
sin pagos parciales. ¿Basta con eso, o hay facturas que se cobran en varios pagos?

**Respuesta:**
haremos lo siguiente, para dicho dashboard lo que mostraremos es la cantidad, esta viene del total

### 68. Gastos fijos bimestrales y el aviso

Con la 54, el mes que tiene celdas vacías muestra "faltan pagos por capturar". Un gasto
bimestral tiene la celda vacía un mes sí y otro no, así que el aviso saldría siempre.
Propuesta: una columna Periodicidad (mensual / bimestral / otro) en la parte fija, y el
aviso solo cuenta los conceptos que tocan ese mes. ¿De acuerdo?

**Respuesta:**
vamos con tu propuesta de la columna periodicidad.

### 69. Diseño de Canva

La 49 dice que dejaste el PDF/PNG en la carpeta, pero en `docs/planes/` no hay ningún PDF
ni imagen nuevos. ¿Puedes volver a dejarlo?

**Respuesta:**
Te deje un codigo html que descargué del canva en esta ruta C:\Users\PC\Downloads\PRACTICAS\ControlDeManiobras-docs\docs\planes\Frontend Sistema de Finanzas_files 
el archivo se llama "codigo.html" 
---

## Aclaraciones — 2026-09-29 (segunda ronda)

**Siguen sin respuesta:** la **59** (costos extra en el costo de venta) y los **nombres
exactos** que pedía la 64 (aceptaste el acceso cerrado, pero sin los nombres no se puede
programar). La **62** queda **PENDIENTE a propósito**, anotada en `docs/PENDIENTE.md`.

### 70. Cobranza semanal (viene de la 67)

Entiendo que el dashboard muestra la **cantidad**, sacada de la columna Total. Lo que me
falta es a qué **semana** va cada factura. Mi lectura:

- Cobranza semanal = suma del Total de las facturas agrupadas por la **semana de su fecha
  de emisión**. No depende de si están cobradas.
- Marcar como cobrada (27) solo afecta a Cuentas por cobrar y la antigüedad de saldos.

¿Es así? Si en cambio la semana es la del **cobro**, al marcar cobrada hay que poner la
fecha, que es lo que proponía la 67.

**Respuesta:**
si esta información viene de lo que se carga del excel, que la semana corresponda a la fecha de emisión

### 71. Periodicidades (viene de la 68)

¿Qué valores lleva la columna Periodicidad: mensual, bimestral, trimestral, anual…? Para
saber en qué meses toca un bimestral, propongo contar desde el último mes con monto
capturado (pagaste en julio → toca septiembre). ¿Vale?

**Respuesta:**
asi como propones, en periodicidad va eso, mensual, bimestral, etc. y para contar me parece bien que sea desde el ultimo mes con monto