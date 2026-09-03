# ADR-0021: El calendario de vacaciones guarda un día por fila, no un rango

## Estado

Aceptada

## Fecha

2026-09-03

## Contexto

La nómina lleva un calendario anual donde se registra qué días toma de vacaciones cada
empleado, al estilo de Google o Apple Calendar: clic en un día, se elige empleado, nota y
color, y el evento sale como un rectángulo bajo la fecha.

La regla que lo justifica la dio el usuario y es la parte importante:

> *"no debe de haber más de 1 evento por día, esto con el fin de que dos empleados no
> salgan de vacaciones los mismos días."*

O sea: el calendario no es un adorno, es un **candado de negocio**.

## Decisión

`VacacionDia` guarda **una fila por día**, con `fecha` marcada `unique`.

La regla la impone entonces la **base**, no el código. Con un rango (`inicio`/`fin`)
habría que buscar solapes a mano en cada escritura, y dos peticiones simultáneas podrían
colar dos: exactamente el fallo que un `unique` hace imposible.

Que el modelo sea por día no obliga a capturar día por día. El modal pide un **rango**
(*Del … Al*) y el endpoint crea todos sus días de una vez, **atómicamente**: si cualquier
día del rango ya está ocupado no se crea **ninguno** y el error dice de quién es. Media
semana registrada y media no es peor que no registrar nada, porque nadie se entera.

El mensaje del choque nombra al empleado (*"El 04/03/2099 ya lo tiene ANA LÓPEZ"*). Un
"ya está ocupado" a secas obliga a ir a buscar quién es para poder reprogramar.

El evento guarda el `empleado` por **id** y no por nombre (decisión del usuario frente a
un texto libre): con dos homónimos, cruzar por nombre elegiría al equivocado.

## Alternativas descartadas

### Un rango por fila, con validación de solapes

Más natural de leer y más barato de borrar, pero la regla dejaría de vivir en el esquema.
El día que dos coordinadores registren a la vez, el solape entra.

### Texto libre en vez de empleado del catálogo

Más simple, pero el sistema nunca sabría de quién son unas vacaciones, y el único freno al
solape sería visual.

## Consecuencias

- **Quitar unas vacaciones de una semana son cinco clics.** El borrado es por día. Está
  marcado con un comentario `ponytail:` en el componente: si molesta, el sitio de
  arreglarlo es un borrado por rango en el ViewSet, igual que el alta.
- El calendario pide el año entero de una vez y navega en memoria: son 365 filas como
  mucho, y una petición por mes haría parpadear la rejilla en cada flecha. Por eso el
  ViewSet va **sin paginar** — una página de 60 dejaría los meses del final en blanco.
- El filtro `?anio` acota **solo la lista**. Aplicarlo también al detalle sacaba del
  queryset cualquier día de otro año, y borrarlo devolvía un 404 **en silencio**: el día se
  quedaba y nadie podía quitarlo. Se descubrió probando contra la base local, no con las
  pruebas. Hay una prueba que lo fija.
- La rejilla reutiliza `celdasDelMes()` de la Torre de Control, que ya calcula los huecos
  de la primera semana empezando en lunes.

## Referencias

- `api/models.py`: `VacacionDia`.
- `api/views.py`: `VacacionDiaViewSet.create` (alta por rango), `get_queryset`.
- `api/Serializers.py`: `VacacionDiaSerializer.validate`.
- `src/components/CalendarioVacaciones/`.
- `api/test_nomina.py`: `CalendarioDeVacacionesTests`.
- ADR-0020 (la nómina es admin-only, y el calendario va dentro).
- Commit `e6646a21` (backend), `2099e96` (frontend).
