# ADR-0011: Los contenedores nacen en Vacíos al asignar el folio

## Estado

Aceptada

## Fecha

2026-08-26

## Contexto

Al asignar folio a una maniobra ya se creaba su gasto solo (ADR-0005 y el plan del
gasto automático). El contenedor que trae ese viaje hay que devolverlo, y esa fila se
capturaba a mano en la página de Vacíos — con el mismo hueco que tenía el gasto: se
olvida.

El folio se asigna desde cuatro sitios de la pantalla de Maniobras, así que el
automatismo va en el backend, donde hay un punto solo.

## Decisión

`_crear_vacios_del_folio` en el mismo enganche que el gasto: la transición del folio de
vacío a lleno, dentro de la misma transacción.

Las reglas se decidieron con el usuario:

- **Carga suelta no da de alta nada.** No lleva contenedor. Se reconoce por
  `tipo_servicio` y también por el texto `"CARGA SUELTA"` de los registros anteriores a
  ese campo.
- **Un Full con un solo operador ocupa UNA fila** con los dos contenedores separados
  por `" - "`. Cuando más tarde se le asigna el segundo operador, **esa fila pasa a ser
  la del primero y se crea la del segundo** con lo suyo.
- **El tipo son solo los números y sin repetirlos**: un Full de dos 40HC es `"40"`, uno
  mixto `"20 - 40"`. En Vacíos interesa el tamaño, no `"40 / HC"`.
- **Nace en `pendiente`** y con el operador del viaje ya puesto en OP DEL VIAJE.
- **Aplica a todos los viajes, terceros incluidos.** A diferencia del gasto: el
  contenedor se devuelve lo mueva quien lo mueva.

Los vacíos que se agregan a mano también nacen en `pendiente` (`VACIO_VACIO`).

## Alternativas descartadas

### Disparar el automatismo en cada guardado de la maniobra

Sería idempotente, pero editar cualquier cosa de una maniobra vieja **resucitaría
vacíos ya entregados**. Por eso se acota a dos transiciones: el folio pasando de vacío
a lleno, y la aparición del segundo operador sobre una maniobra que ya tiene folio.

### Una columna `maniobra_id` en `vacios` con UNIQUE, como en gastos

Es la protección más fuerte contra duplicados y la que usa el gasto. Cuesta una
migración sobre una tabla `managed=False` y migrar producción antes de pushear. Se
ofreció; el usuario eligió el filtro por pendientes.

### Una fila por contenedor siempre, también en el Full de un operador

Se ofreció y el usuario lo corrigió: mientras haya un solo operador y un solo folio,
los dos contenedores van juntos en la misma fila. Solo se separan al repartirse.

### Copiar también patio, fechas y coordinador

Se ofreció; el usuario eligió que solo se copien contenedor, tipo y operador. Lo demás
se captura en Vacíos como hasta ahora.

## Consecuencias

- **Lo único que impide duplicar es que no se crea si ese contenedor ya está
  PENDIENTE.** `vacios` no tiene ninguna columna que apunte a la maniobra. El mismo
  contenedor vuelve a pasar meses después y ese viaje sí necesita su fila: para
  entonces el anterior ya está entregado.
- **Separar solo toca la fila que de verdad lleva los dos contenedores dentro.** Una
  que alguien ya haya separado o editado a mano se queda como está.
- **No se vuelven a juntar** si se quita el segundo operador: se ajusta a mano.
- El tipo sale de la carga de la maniobra, que **en la práctica se captura siempre
  antes que el folio**. Si en una prueba sale vacío, mirar primero si la maniobra tenía
  TIPO DE CARGA — ya pasó una vez que parecía un fallo de copia y era eso.
- **Sin migración**: no hay columnas nuevas.

## Referencias

- `api/views.py`: `_filas_de_vacios`, `_vacio_pendiente`, `_separar_full_repartido`,
  `_crear_vacios_del_folio`.
- `api/test_vacio_automatico.py`: 22 pruebas.
- `src/hooks/useVacios.js`: `VACIO_VACIO.status`.
- Commits `0931987d` (backend) y `8fd38e5` (frontend).
