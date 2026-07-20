import os
from django.db import migrations


# Tablas con managed=False (nombres exactos de db_table en models.py)
APP_TABLES = [
    'maniobras',
    'vacios',
    'tractos',
    'remolques',
    'choferes',
    'gastos',
    'empleados',
]

# Tabla managed=True — Django la nombra {app_label}_{model_name_lower}
MANAGED_TABLES = [
    'api_patio',
]

ALL_TABLES = APP_TABLES + MANAGED_TABLES

# Tablas de Django auth que standard_role necesita leer para autenticar JWT
AUTH_READ_TABLES = [
    'auth_user',
    'auth_user_groups',
    'auth_user_user_permissions',
    'auth_group',
    'auth_group_permissions',
    'auth_permission',
    'django_content_type',
]

# NOTA: Si el proyecto usa rest_framework_simplejwt.token_blacklist en INSTALLED_APPS,
# agregar también estas tablas a AUTH_READ_TABLES y considerar permisos de INSERT:
# 'token_blacklist_outstandingtoken', 'token_blacklist_blacklistedtoken'

# Las tablas de django-axes se otorgan dinámicamente en setup_roles_and_rls:
# el login corre bajo el rol estándar (todavía sin JWT) y axes necesita escribir
# los intentos. Sin esos GRANT el login fallaría con "permission denied".
# No se habilita RLS sobre ellas.


def setup_roles_and_rls(apps, schema_editor):
    """
    1. Crea el rol django_standard_role con LOGIN
    2. Otorga privilegios granulares (sin DELETE en tablas de app)
    3. Habilita RLS en todas las tablas de la app
    4. Crea políticas RLS para django_standard_role (SELECT, INSERT, UPDATE)
    El superuser 'admin' bypasea RLS de forma nativa en PostgreSQL.
    """
    standard_password = os.environ.get('DB_STANDARD_PASSWORD', '')
    if not standard_password:
        raise ValueError(
            "La variable de entorno DB_STANDARD_PASSWORD debe estar definida "
            "antes de ejecutar esta migración."
        )

    # Leer nombre de BD desde la conexión activa (más seguro que os.environ)
    db_name = schema_editor.connection.settings_dict['NAME']

    # ── Paso A: Crear rol si no existe ──────────────────────────────────────
    schema_editor.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT FROM pg_catalog.pg_roles WHERE rolname = 'django_standard_role'
            ) THEN
                CREATE ROLE django_standard_role WITH LOGIN PASSWORD %s;
            END IF;
        END
        $$;
        """,
        [standard_password],
    )

    # ── Paso B: Privilegios de conexión y esquema ───────────────────────────
    # Nota: f-string solo para db_name/table names que vienen de código controlado
    schema_editor.execute(
        f"GRANT CONNECT ON DATABASE {db_name} TO django_standard_role;"
    )
    schema_editor.execute(
        "GRANT USAGE ON SCHEMA public TO django_standard_role;"
    )

    # ── Paso C: SELECT, INSERT, UPDATE en tablas de la app (SIN DELETE) ─────
    for table in ALL_TABLES:
        schema_editor.execute(
            f"GRANT SELECT, INSERT, UPDATE ON TABLE {table} TO django_standard_role;"
        )

    # ── Paso D: Acceso a sequences (necesario para INSERT con PKs auto) ─────
    schema_editor.execute(
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO django_standard_role;"
    )

    # ── Paso E: Solo lectura en tablas de auth de Django ────────────────────
    for table in AUTH_READ_TABLES:
        schema_editor.execute(
            f"GRANT SELECT ON TABLE {table} TO django_standard_role;"
        )

    # ── Paso E2: Lectura/escritura en TODAS las tablas de django-axes ───────
    # El login corre bajo el rol estándar y axes escribe los intentos. Se otorga
    # sobre cualquier tabla axes_* existente (robusto entre versiones de axes).
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name ~ '^axes_'"
        )
        axes_tables = [row[0] for row in cursor.fetchall()]
    for table in axes_tables:
        schema_editor.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {table} TO django_standard_role;"
        )

    # ── Paso F: Habilitar RLS en todas las tablas de la app ─────────────────
    for table in ALL_TABLES:
        schema_editor.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")

    # ── Paso G: Crear políticas RLS para django_standard_role ───────────────
    # SELECT: puede ver todos los registros
    # INSERT: puede insertar cualquier registro
    # UPDATE: puede modificar cualquier registro
    # DELETE: sin política → bloqueado (además de falta de GRANT)
    for table in ALL_TABLES:
        schema_editor.execute(
            f"CREATE POLICY std_select_{table} "
            f"ON {table} FOR SELECT "
            f"TO django_standard_role "
            f"USING (true);"
        )
        schema_editor.execute(
            f"CREATE POLICY std_insert_{table} "
            f"ON {table} FOR INSERT "
            f"TO django_standard_role "
            f"WITH CHECK (true);"
        )
        schema_editor.execute(
            f"CREATE POLICY std_update_{table} "
            f"ON {table} FOR UPDATE "
            f"TO django_standard_role "
            f"USING (true) WITH CHECK (true);"
        )


def teardown_roles_and_rls(apps, schema_editor):
    """Revierte la migración: elimina políticas, deshabilita RLS, elimina rol."""
    for table in ALL_TABLES:
        for op in ['std_select', 'std_insert', 'std_update']:
            schema_editor.execute(
                f"DROP POLICY IF EXISTS {op}_{table} ON {table};"
            )
        schema_editor.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    schema_editor.execute(
        "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM django_standard_role;"
    )
    schema_editor.execute(
        "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM django_standard_role;"
    )
    schema_editor.execute(
        "REVOKE USAGE ON SCHEMA public FROM django_standard_role;"
    )
    schema_editor.execute(
        "DROP ROLE IF EXISTS django_standard_role;"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_remove_patio_direccion'),
        # django-axes crea sus tablas antes para poder otorgar permisos al rol estándar
        ('axes', '__first__'),
    ]

    operations = [
        migrations.RunPython(
            setup_roles_and_rls,
            reverse_code=teardown_roles_and_rls,
        ),
    ]
