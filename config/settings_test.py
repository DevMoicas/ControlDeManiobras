"""Ajustes SOLO para correr pruebas CON base de datos.

Por qué hacen falta: las migraciones de `api` no se pueden aplicar sobre una BD
de test. Los modelos heredados son `managed=False` —sus tablas las creó pgAdmin,
no Django— así que en una base vacía no existen, y la 0019 revienta al intentar
alterar lo que no está.

`MIGRATION_MODULES = {'api': None}` hace que Django cree las tablas de `api`
directamente desde los modelos y se salte sus migraciones: los `managed=False`
quedan fuera (no hacen falta para probar lógica nueva) y los `managed=True` sí
se crean. Las migraciones del resto de apps (auth, otp, blacklist) siguen
corriendo con normalidad.

⚠️ LO QUE ESTO NO CUBRE, y no hay que olvidarlo: la RLS y los GRANT de rol viven
en migraciones de `api` (0005, 0018, 0021, 0022), así que en la BD de test **no
existen**, y `django_standard_role` ni siquiera está creado. Por eso aquí los dos
alias conectan con el mismo usuario administrador: **en pruebas NO hay separación
de roles**. Los permisos de PostgreSQL se siguen verificando únicamente contra la
base real, consultando `information_schema.role_table_grants` tras migrar.

O sea: esto sirve para probar lógica, escrituras y consultas. No sirve —y no debe
usarse— para dar por buenos los permisos de un rol.

Uso:  Manage.py test api --settings=config.settings_test
"""
from .settings import *  # noqa: F401,F403

MIGRATION_MODULES = {'api': None}

# El test client habla http; con DEBUG=False el proyecto activa SECURE_SSL_REDIRECT
# y toda petición se va en un 301 a https antes de llegar a la vista (rompe
# cualquier prueba con APIClient contra un endpoint). Aquí no se prueba el
# redirect, así que se apaga. En CI DJANGO_DEBUG=False, de ahí que solo salte allí.
SECURE_SSL_REDIRECT = False

# 'standard' es el MISMO servidor y la misma base que 'default'. Sin MIRROR,
# Django intentaría crear dos bases de test con el mismo nombre.
DATABASES['standard']['TEST'] = {'MIRROR': 'default'}  # noqa: F405

# Y con las credenciales del administrador, porque django_standard_role no existe
# en la base de test (lo crea la 0005, que aquí se salta). Ver el aviso de arriba.
DATABASES['standard']['USER'] = DATABASES['default']['USER']          # noqa: F405
DATABASES['standard']['PASSWORD'] = DATABASES['default']['PASSWORD']  # noqa: F405
