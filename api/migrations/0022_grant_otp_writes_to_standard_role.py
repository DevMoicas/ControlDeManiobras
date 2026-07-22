from django.db import migrations


# Permisos de ESCRITURA mínimos para que el login por JWT pueda verificar un TOTP.
# La 0021 dio solo SELECT porque entonces la única verificación ocurría en el login
# de /admin, que RoleRoutingMiddleware enruta siempre al alias 'default'. Con el MFA
# en el login de la app (9.1) la verificación pasa a ocurrir en /api/login/, que va
# contra django_standard_role.
#
# Por qué escribe una verificación que "solo comprueba":
#   - TOTPDevice.verify_token() guarda `last_t` = contador anti-repetición. Sin él,
#     un código interceptado se podría reutilizar dentro de su ventana de 30 s.
#   - StaticDevice.verify_token() BORRA el código de respaldo usado: son de un solo uso.
#   - throttle_increment(commit=True) escribe también cuando el código es INCORRECTO,
#     así que sin estos permisos ni siquiera fallaría limpiamente.
#
# Se descartó el permiso por COLUMNA (más fino: solo `last_t`) porque django-otp llama
# a save() sin update_fields y el UPDATE incluye todas las columnas.
# Se descartó enrutar /api/login/ al alias 'default': elevaría toda la petición a
# superusuario cuando bastan estos tres permisos. Mismo criterio dirigido que la 0018.
GRANTS = [
    # last_t (anti-repetición), drift y contadores de throttling
    ('UPDATE', 'otp_totp_totpdevice'),
    # contadores de throttling del dispositivo de códigos de respaldo
    ('UPDATE', 'otp_static_staticdevice'),
    # consumir un código de respaldo = borrarlo
    ('DELETE', 'otp_static_statictoken'),
]


def grant(apps, schema_editor):
    for privilegio, tabla in GRANTS:
        schema_editor.execute(
            f"GRANT {privilegio} ON TABLE {tabla} TO django_standard_role;"
        )


def revoke(apps, schema_editor):
    for privilegio, tabla in GRANTS:
        schema_editor.execute(
            f"REVOKE {privilegio} ON TABLE {tabla} FROM django_standard_role;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0021_grant_otp_to_standard_role'),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
