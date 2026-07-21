from django.db import migrations


# Tablas de django-otp (managed=True, sin RLS), igual que las de axes/blacklist.
OTP_TABLES = [
    'otp_totp_totpdevice',
    'otp_static_staticdevice',
    'otp_static_statictoken',
]


def grant_otp(apps, schema_editor):
    """Otorga SELECT en las tablas de django-otp al rol estándar.

    OTPMiddleware corre en TODAS las peticiones, no solo en /admin/. En producción
    el frontend y la API comparten origen (decisión E2), así que la cookie de sesión
    de /admin viaja también a /api/*, que va contra django_standard_role. Cuando la
    sesión trae un device verificado, is_verified() consulta estas tablas bajo ese
    rol: sin GRANT eso revienta con 'permission denied'.

    Solo SELECT: la verificación que ESCRIBE (consumir un token estático, actualizar
    el contador antirrepetición del TOTP) ocurre en el login de /admin, que
    RoleRoutingMiddleware enruta siempre al alias 'default'. Mismo criterio de
    mínimo privilegio de 0005_setup_rls_and_roles.
    """
    for table in OTP_TABLES:
        schema_editor.execute(
            f"GRANT SELECT ON TABLE {table} TO django_standard_role;"
        )


def revoke_otp(apps, schema_editor):
    for table in OTP_TABLES:
        schema_editor.execute(
            f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM django_standard_role;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_maniobra_tipo_servicio'),
        # Las tablas tienen que existir antes de poder otorgar permisos sobre ellas.
        ('otp_totp', '__first__'),
        ('otp_static', '__first__'),
    ]

    operations = [
        migrations.RunPython(grant_otp, reverse_code=revoke_otp),
    ]
