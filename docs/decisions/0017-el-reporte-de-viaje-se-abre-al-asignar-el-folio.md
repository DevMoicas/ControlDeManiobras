# ADR-0017: El reporte de viaje se abre solo al asignar el folio

## Estado

Aceptada

## Fecha

2026-09-03

## Contexto

El reporte de viaje del coordinador se abría a mano, folio a folio, desde la pantalla de
Reportes de viaje: elegir el folio en un desplegable y guardar. Pero casi todo lo que
lleva la cabecera del reporte —servicio, cliente, origen, destino, operador, unidad,
remolques, cita— **ya lo sabía la maniobra**, y el modal lo precargaba en cuanto se elegía
el folio. O sea: el sistema ya tenía los datos y aun así alguien tenía que acordarse de
abrir el papel.

El proyecto ya tenía dos automatismos con ese mismo disparo: el gasto (ADR-0005) y los
vacíos (ADR-0011) nacen al asignar el folio. El reporte es el tercero del mismo tipo.

## Decisión

**Al asignar un folio a una maniobra, su reporte de viaje se abre solo**, con la misma
precarga que hacía el modal. Va en `perform_create`/`perform_update` del
`ManiobraViewSet`, al lado del gasto y los vacíos: es el único punto por el que pasan las
cuatro vías de la pantalla de Maniobras.

**Un reporte por folio.** Un Full repartido gasta un folio por operador y abre **dos**
reportes, cada uno con SU operador, SU tracto, SUS remolques y SU coordinador. El del
segundo operador nace el día que aparece su folio, no antes.

### Los dos criterios, y por qué hacen falta los dos

Solo se abre si el viaje cumple **ambas**:

1. El transportista es FRABA CONTAINER —o está **vacío**, que es como lo lee ya todo el
   sistema y lo que tiene la mayoría de las maniobras (ver `_es_de_fraba`, ADR-0005)—.
2. La casilla TERCERO está **desmarcada**.

El usuario lo pidió así explícitamente (2026-09-03) y dio el caso que lo motiva: *"podría
un servicio tener al transportista BSH y que no tenga marcado tercero, esto igual es un
servicio de tercero aunque no esté marcado"*. Con un solo criterio se colaría la mitad de
los casos — la marca se le puede pasar al capturista, y el transportista es el dato duro.

Es el filtro **más estrecho** de los tres automatismos: el gasto mira solo el
transportista y los vacíos no filtran nada (el contenedor se devuelve lo mueva quien lo
mueva).

### Solo de aquí en adelante

Sin backfill del histórico (decisión del usuario). Los folios ya asignados que no tengan
reporte se siguen abriendo a mano.

## Alternativas descartadas

### Rellenar también el histórico con una migración de datos

Habría creado cientos de reportes vacíos de viajes ya cerrados, y borrarlos es admin-only:
un papel de más cuesta más que uno de menos.

### Dispararlo desde el frontend, al elegir el folio

El folio se asigna desde cuatro sitios de la pantalla de Maniobras. Cada uno tendría que
acordarse, y cualquier vía futura nacería sin el automatismo. Es el mismo razonamiento del
ADR-0005.

## Consecuencias

- **Sin migración**: es lógica de vistas.
- Los huecos que la maniobra suele saber **después** del folio (el operador, las placas del
  puerto, la fecha de ruta) se rematan cuando el dato llega, pero **solo si siguen
  vacíos**: el reporte se firma, así que lo que un coordinador escribió ahí manda sobre lo
  que diga la maniobra más tarde.
- El reporte que se sigue abriendo a mano precarga **lo mismo**: `folios-recientes` manda
  el coordinador, la recolección y la fecha ya resueltos, para que la regla viva en un
  sitio y no en dos.
- Las pruebas del diésel (`test_gasto_automatico.py`) dejaron de crear el reporte con un
  POST: se lo encuentran creado y lo rellenan. Un POST ahí chocaría contra el UNIQUE de
  `folio`.

## Referencias

- `api/views.py`: `_es_viaje_propio`, `_reportes_del_viaje`, `_crear_reportes_del_folio`,
  `_completar_reportes_del_folio`, `ManiobraViewSet.perform_create/perform_update`.
- `api/test_reporte_automatico.py`: 46 pruebas.
- ADR-0005 (gasto automático), ADR-0011 (vacíos automáticos), ADR-0018 (recolección).
- Commits `9f7a1a1a` (backend), `26e773a` (frontend).
