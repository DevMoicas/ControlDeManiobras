from django.db import migrations


# Tablas de rest_framework_simplejwt.token_blacklist (managed=True, sin RLS).
BLACKLIST_TABLES = [
    'token_blacklist_outstandingtoken',
    'token_blacklist_blacklistedtoken',
]


def grant_blacklist(apps, schema_editor):
    """Otorga SELECT + INSERT en las tablas de token_blacklist al rol estándar.

    Login, refresh y logout corren bajo django_standard_role (sin JWT de admin) y
    necesitan escribir OutstandingToken / BlacklistedToken. Sin estos GRANT el login
    fallaría con 'permission denied'. Ver la NOTA en 0005_setup_rls_and_roles.

    Estas tablas NO llevan RLS (igual que las de django-axes): solo GRANT.
    """
    for table in BLACKLIST_TABLES:
        schema_editor.execute(
            f"GRANT SELECT, INSERT ON TABLE {table} TO django_standard_role;"
        )
    # Las secuencias de PK ya existen → re-otorgar sobre todas (idempotente, evita
    # adivinar nombres). Sin USAGE en la secuencia, el INSERT con PK auto falla.
    schema_editor.execute(
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO django_standard_role;"
    )


def revoke_blacklist(apps, schema_editor):
    for table in BLACKLIST_TABLES:
        schema_editor.execute(
            f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM django_standard_role;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_maniobra_tercero'),
        # token_blacklist crea sus tablas antes para poder otorgar permisos.
        ('token_blacklist', '__first__'),
    ]

    operations = [
        migrations.RunPython(grant_blacklist, reverse_code=revoke_blacklist),
    ]
