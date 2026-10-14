# ADR-0025: Varios empleados pueden compartir día de vacaciones y "Días Tomados" se calcula del calendario

## Estado

Aceptada. Sustituye a [ADR-0021](0021-un-dia-por-fila-en-el-calendario-de-vacaciones.md)
en cuanto al candado de un evento por día; el modelo de un día por fila se mantiene.

## Fecha

2026-10-14

## Contexto

ADR-0021 hizo del calendario un candado: `VacacionDia.fecha` era `unique` para que dos
empleados no salieran a la vez. El usuario cambió la regla:

> *"hay momentos del año donde se les da la opción de tener vacaciones a varios"*

Además, "Días Tomados" de Nómina se escribía a mano y no miraba el calendario. El usuario
pidió automatizarlo con una regla nueva: los feriados de ley que caen dentro de unas
vacaciones **no gastan días** (p. ej. Semana Santa alargada alrededor de un feriado).

## Decisión

**Compartir día (migración 0080).** `fecha` deja de ser `unique` y pasa a
`UniqueConstraint(fecha, empleado)` (`vacacion_un_dia_por_empleado`). La base sigue
impidiendo lo único que no tiene sentido: el mismo empleado dos veces el mismo día.
Juntar empleados ya no es un error sino un aviso: antes de guardar, el calendario pregunta
*"Ya existen vacaciones asignadas para otro empleado en estas fechas, ¿Seguro que quieres
continuar?"* (Sí / Cancelar) y nombra a quién ya las tiene.

**Días Tomados calculado** (`api/models.py`: `feriados_de_ley`, `periodo_vacacional`,
`contar_dias_tomados`). Cuenta los días del calendario del empleado:

- dentro del **año de aniversario** en curso (desde su último aniversario de ingreso; sin
  fecha de ingreso, el año natural), incluidos los ya programados que aún no llegan;
- **sin** los feriados del **art. 74 de la LFT**: 1 ene, primer lunes de feb, tercer lunes
  de mar, 1 may, 16 sep, tercer lunes de nov, 25 dic y el 1 oct de cambio de sexenio.

El serializer de Nómina lo expone como campo de solo lectura. La columna vieja
`dias_tomados` sigue en la base con lo capturado a mano, pero ya no se muestra.

## Alternativas descartadas

- **Quitar el candado sin aviso.** Se perdería la señal de que alguien más ya sale esos días.
- **Incluir Semana Santa o jornadas electorales.** Semana Santa no es de ley; las jornadas
  electorales (art. 74 fracc. IX) no tienen fecha fija. Si caen en unas vacaciones,
  **se descuentan**. Añadirlas exige una tabla de fechas que alguien mantenga.

## Consecuencias

- Lo capturado a mano en "Días Tomados" hasta el 2026-10-14 deja de verse.
- El cálculo usa el año de aniversario: un empleado cuyo aniversario cae a mitad de unas
  vacaciones verá esas vacaciones repartidas entre dos periodos.
