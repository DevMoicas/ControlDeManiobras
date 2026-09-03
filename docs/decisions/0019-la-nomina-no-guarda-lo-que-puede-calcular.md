# ADR-0019: La nómina no guarda la antigüedad, los días ni la prima

## Estado

Aceptada

## Fecha

2026-09-03

## Contexto

La pantalla de Finanzas > Nómina tiene siete columnas: NOMBRE, PUESTO, SUELDO, PRIMA
VACACIONAL, DÍAS DE VACACIONES, DÍAS TOMADOS y FINIQUITO. Tres de ellas son **derivadas**:

- la **antigüedad** sale de `empleados.fecha_ingreso`;
- los **días de vacaciones** salen de la antigüedad, por la escalera de la LFT reformada
  (1 año → 12 días, 2 → 14 … 26-30 → 30);
- la **prima vacacional** es `salario diario × días × 0.25`, y el salario diario es el
  sueldo **semanal** entre 7 (confirmado con el usuario: el sueldo que se captura es
  semanal).

## Decisión

**No se guardan.** Se calculan en cada lectura, en el serializer. `NominaEmpleado` solo
tiene columnas para lo que escribe una persona: `sueldo`, `dias_tomados`, `finiquito` y el
jsonb `formulas`.

El motivo es el que el usuario describió sin nombrarlo:

> *"dicha prima vacacional se actualiza cada vez que el empleado cumpla 1 año trabajando
> [...] si un empleado ingresó el 30/01/2022, a día de hoy tendría 4 años, el 30/01/2027
> se actualizaría la prima vacacional."*

Eso **solo puede pasar solo si el valor no está guardado**. Una columna con la prima se
quedaría con la cifra del año pasado el día del aniversario, y nadie se enteraría hasta
que alguien comparara. Es la misma regla que ya sigue el reporte de viaje con KM TOTALES y
el total de cada carga.

Los años son **cumplidos**, no empezados: quien entró el 30/01/2022 lleva 4 años hasta el
29/01/2027 y 5 a partir del 30. Ese borde es lo que mueve la prima de toda la plantilla, y
tiene pruebas a los dos lados.

De 31 años en adelante la escalera **se queda en 30 días**: es el último tramo que se
dictó. La ley suma dos días por cada cinco años; si algún día hay que seguir subiendo, el
sitio está marcado en `dias_de_vacaciones()`.

## La excepción que conviene recordar

`ReporteViaje.rendimiento` **sí** se guarda, y es deliberado (2026-08-24): los informes
agregan rendimientos de muchos viajes y recalcularlos obligaría a arrastrar las cargas de
combustible de cada uno. La nómina no tiene esa presión: son decenas de empleados, no
miles de viajes.

## Alternativas descartadas

### Guardar la prima y recalcularla en cada escritura

Es lo que hace `rendimiento`, y ahí funciona porque **nadie más** puede cambiar sus
operandos. Aquí el operando es *el paso del tiempo*: no hay escritura que disparar el día
del aniversario. Habría que meter un trabajo programado para algo que una división
resuelve al leer.

### Guardar la antigüedad en años

El mismo problema, un año antes.

## Consecuencias

- Cambiar el sueldo devuelve la prima ya recalculada en la respuesta del PATCH: la celda
  se actualiza sin recargar, como `gastos_totales` en Gastos.
- La tabla lista el **catálogo de empleados**, no `NominaEmpleado`: quien no tiene sueldo
  capturado tiene que salir igual, o no habría dónde escribírselo. Su fila nace en la
  primera escritura (`get_or_create`), y se direcciona por el id del **empleado**, que es
  el único que la pantalla conoce siempre.
- `empleados.fecha_ingreso` es texto en el modelo pero **`date` en la base** (ver
  `PENDIENTE.md`). Un registro sin fecha legible sale con 0 días, y la celda lo marca en
  rojo: es un aviso de que falta el dato, no un dato.
- Columna nueva `empleados.fecha_salida` (migración 0067): con ella puesta el empleado
  sigue saliendo en la nómina, atenuado, para poder cerrarle el finiquito tras la baja
  (decisión del usuario, frente a desaparecerlo de la lista).

## Referencias

- `api/models.py`: `dias_de_vacaciones`, `anios_cumplidos`, `fecha_de_ingreso`,
  `NominaEmpleado`.
- `api/Serializers.py`: `NominaEmpleadoSerializer`.
- `api/test_nomina.py`: `EscaleraDeVacacionesTests`, `AntiguedadTests`,
  `CalculosDeLaFilaTests`.
- ADR-0020 (permisos de la nómina), ADR-0021 (calendario).
- Commit `e6646a21` (backend), `2099e96` (frontend).
