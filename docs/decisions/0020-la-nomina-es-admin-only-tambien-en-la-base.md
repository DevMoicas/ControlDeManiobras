# ADR-0020: La nómina es admin-only también en la base de datos

## Estado

Aceptada

## Fecha

2026-09-03

## Contexto

`api_nominaempleado` y `api_vacaciondia` guardan **sueldos, primas vacacionales y
finiquitos** de toda la plantilla. Es el dato más sensible que ha entrado al sistema.

El proyecto ya tenía una línea trazada en esa dirección: el ADR-0014 reservó **ingresos y
utilidad** a los usuarios `staff`, y la decisión A1 reservó los **borrados** al admin. Un
sueldo es al menos tan sensible como el margen de un viaje.

Toda tabla `managed` nueva del proyecto venía otorgando `SELECT, INSERT, UPDATE` a
`django_standard_role` (migraciones 0008, 0018, 0021, 0024…). Seguir ese patrón aquí
habría dejado la nómina legible para cualquier usuario con sesión **a nivel de base**,
apoyándose solo en el candado de la vista.

## Decisión

Dos candados, no uno:

1. **En la API**: `NominaViewSet` y `VacacionDiaViewSet` heredan un `SoloAdminMixin` que
   devuelve 403 a quien no sea `staff` **en cualquier método**. Va en `initial()` y no
   como un `if` por acción: una vista con seis métodos y el candado en cinco es
   exactamente el agujero que nadie ve al revisarla.

2. **En la base**: la migración 0067 **NO otorga ningún permiso** al rol estándar sobre
   esas dos tablas. Es una omisión deliberada, no un olvido, y está escrita como tal en la
   cabecera de la migración.

Funciona porque los administradores no usan el rol estándar: el middleware enruta por el
`role` del JWT, y `role == 'admin'` conecta con el alias `default` (superusuario). Un
usuario normal va por `standard` y ahí la nómina **no existe**.

La ruta del frontend va envuelta en `ProtectedRoute requireAdmin`: sin eso, un usuario no
admin vería la pantalla romperse con un 403 en vez de no ver la tarjeta.

## Cómo se comprobó

No con un 401 —eso no prueba nada, ver `PENDIENTE.md`— sino leyendo:

- `test_nomina.py::SoloAdminTests` cubre los cuatro casos (leer y escribir la nómina, el
  calendario, y sin sesión).
- `migrar_prod.sh migrar` consulta `information_schema.role_table_grants` y **falla** si
  el rol estándar tiene algún permiso sobre esas dos tablas.
- Durante las pruebas locales, un script que tocaba `VacacionDia` por el ORM fuera de una
  petición HTTP se estrelló con `permission denied for table api_vacaciondia`. El candado
  se demostró solo.

## Alternativas descartadas

### Solo el candado de la vista

Es lo que hace el resto del sistema y para el resto del sistema está bien. Aquí no: si un
día alguien añade un endpoint nuevo sobre estas tablas y olvida el mixin, con GRANT el dato
sale; sin GRANT, la petición se estrella y el fallo es ruidoso.

### RLS con políticas, como `api_fotoregistro` (0008)

RLS sirve para dar acceso **parcial** — filas sí, filas no. Aquí el acceso es *ninguno*, y
no otorgar es más simple y más difícil de deshacer por accidente que una política.

## Consecuencias

- **Si algún día la nómina la lleva alguien que no es admin, no basta con abrir el permiso
  en la vista**: hay que otorgar en la base con una migración. Está avisado en la cabecera
  de la 0067 y en el propio ViewSet.
- Cualquier script o comando de mantenimiento que toque estas tablas por el ORM tiene que
  pedir el alias `default` explícitamente (`.using('default')`).
- Borrar un empleado desde Catálogos es admin-only, así que el `CASCADE` del ORM sobre su
  fila de nómina corre por el alias de superusuario y no necesita GRANT.

## Referencias

- `api/views.py`: `SoloAdminMixin`, `NominaViewSet`, `VacacionDiaViewSet`.
- `api/migrations/0067_nomina_y_fecha_salida.py`: la cabecera explica la omisión.
- `api/middleware.py`: elección del alias por el `role` del JWT.
- `api/test_nomina.py`: `SoloAdminTests`.
- ADR-0014 (ingresos y utilidad solo para staff), ADR-0003 (GRANT DELETE acotado).
- Commit `e6646a21` (backend), `2099e96` (frontend).
