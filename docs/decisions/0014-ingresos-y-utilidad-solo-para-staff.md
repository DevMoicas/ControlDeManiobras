# ADR-0014: INGRESOS y UTILIDAD BRUTA solo para usuarios staff

## Estado

Aceptada

## Fecha

2026-08-27

## Contexto

La tabla de Gastos enseñaba a todo el mundo las columnas **Ingresos** (`facturado`) y
**Utilidad Bruta**. Son el margen del viaje, y el usuario pidió que solo las vieran los
administradores —**rol staff según Django**, que es exactamente lo que ya distingue el
claim `role` del JWT (`"admin" if user.is_staff else "standard"`).

**Gastos Totales sí se queda para todos**: el coste del viaje lo capturan y lo consultan
los capturistas; lo que no les corresponde es cuánto se facturó.

## Decisión

El campo `facturado` **deja de existir en el serializer** para quien no es staff
(`GastoSerializer.get_fields`). La tabla, la fila nueva y el modal de Gastos filtran
además las dos columnas por rol.

Utilidad Bruta no necesita nada: **no es una columna de la base**, la calcula el frontend
restando `gastos_totales` a `facturado`, así que desaparece con ella.

## Alternativas descartadas

### Ocultar solo las columnas en el frontend

Es teatro. El endpoint seguiría mandando el importe en cada respuesta y cualquiera con
la consola del navegador abierta lo leería. La interfaz no es una defensa — el mismo
criterio que ya se aplicó al color de fila y al borrado.

### Un permiso a nivel de endpoint

Bloquearía la página entera de Gastos a los usuarios estándar, que es justo lo que no se
quiere: ellos capturan casetas, diésel y comisiones.

### Mover el importe a otra tabla o a otro modelo

Una migración de datos y un endpoint más para un campo que ya está donde toca. El
problema era de visibilidad, no de modelo.

## Consecuencias

- **Quitarlo del serializer lo quita también de la ESCRITURA, y eso es lo que protege el
  dato.** La página guarda con `PUT` mandando la fila entera: como el campo no existe
  para un usuario estándar, DRF lo ignora y el importe guardado **se queda como estaba**
  en vez de borrarse. Hay una prueba que fija exactamente eso.
- Un usuario estándar que mande `facturado` a propósito por PATCH no escribe nada.
- Sin `request` en el contexto (usos internos, pruebas del serializer suelto) se
  devuelven todos los campos: ahí no hay usuario al que ocultar nada.
- No hace falta migración: el cambio es de serialización.
- Comprobado contra la base local con los usuarios reales: los cuatro estándar no reciben
  el campo, el admin sí, y `gastos_totales` viaja para los cinco.

## Referencias

- `api/Serializers.py`: `GastoSerializer.get_fields`.
- `api/test_ingresos_solo_admin.py`: 7 pruebas.
- `src/pages/GastosPage.jsx`: `SOLO_ADMIN`, `columnasVisibles`.
- Commits `38ccdbe8` (backend), `e28bb14` (frontend).
