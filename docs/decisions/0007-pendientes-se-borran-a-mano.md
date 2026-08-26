# ADR-0007: Los pendientes se borran a mano y no caducan

## Estado

Aceptada. Sustituye a [ADR-0004](0004-pendientes-sin-ruta-de-borrado.md).

## Fecha

2026-08-25

## Contexto

El ADR-0004 dejó los pendientes sin ruta de borrado para nadie, y con caducidad
automática a las 28 horas. Era un requisito explícito del usuario.

El uso lo desmintió: *"se decidió que no se borren solos ya y que se añada el botón
de borrar, usuarios estándar también pueden borrar"*. Un pendiente que sigue vivo a
las 30 horas desaparecía solo, y no había forma de quitar uno ya resuelto salvo
esperar.

## Decisión

- **Se retira la caducidad entera**: la constante, la property `expira_en`, el filtro
  del `get_queryset`, el barrido perezoso del listado y el reloj del navegador.
- `PendienteViewSet` monta `DestroyModelMixin`. El `DELETE` lo puede usar
  **cualquier usuario autenticado**, sin candado de admin.
- La interfaz pregunta antes de borrar.

Sigue sin montar `retrieve`: nadie pide un pendiente suelto, la página los trae todos.

## Por qué sin candado de admin

Un pendiente es una nota de una lista compartida, no un registro de negocio con
historia que perder. Es el mismo criterio que ya se aplicó a `TorreControl`: soltar
una unidad en UNIDADES LIBRES es un `DELETE` y no lleva candado, porque ahí borrar no
destruye información sino que devuelve algo a disponible.

Esto **matiza el ADR-0003**, que justificaba el `GRANT DELETE` sobre `api_pendiente`
diciendo que "el borrado no es una acción de usuario: el permiso solo lo usa el
barrido automático". Ahora sí lo es. El permiso ya estaba concedido (migración
`0040`), así que este cambio **no necesitó migración** — el criterio de aquel ADR
("datos efímeros o de enlace, nunca registro de negocio") sigue valiendo y es
justamente el que autoriza esto.

## Consecuencias

- **El borrado es definitivo y esta tabla no lleva auditoría**: no queda rastro de
  quién borró qué. Queda anotado en el ViewSet; si algún día importa, es el mismo
  bloque `created_by`/`updated_by` que ya llevan Maniobra, Gasto y Vacío.
- Por eso la interfaz confirma antes, y el borrado **no es optimista** al revés que
  marcar la casilla: una fila que desaparece y reaparece porque falló el servidor se
  lee peor que medio segundo de espera.
- Los tableros ya no se vacían solos. Si crecen sin control es un problema de uso, no
  del sistema.
- La prueba clave usa un **usuario estándar**, no un admin: si alguien toca los
  permisos de Postgres, el fallo saldría solo en producción y solo para quien no es
  admin.

## Referencias

- `api/test_pendientes.py` (`BorradoTests`, `NoCaducanTests`).
- Commits `b6571ec8` (backend) y `fc707e3` (frontend).
