import os
from django.db import migrations, models


# Nombres de tabla que Django genera para managed=True en el app 'api'
NUEVAS_TABLAS_MANAGED = [
    'api_cliente',
    'api_origen',
    'api_destino',
]


def setup_rls_nuevas_tablas_y_datos_iniciales(apps, schema_editor):
    """
    1. Aplica GRANT y RLS para django_standard_role en las nuevas tablas.
       Solo se ejecuta si el rol existe (es decir, si el plan de seguridad
       ya fue aplicado). Si el rol no existe, omite silenciosamente el RLS.
    2. Inserta los datos iniciales en la tabla Origen.
    """
    # ── Verificar si django_standard_role existe ─────────────────────────────
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'django_standard_role';"
        )
        rol_existe = cursor.fetchone() is not None

    if rol_existe:
        for tabla in NUEVAS_TABLAS_MANAGED:
            schema_editor.execute(
                f"GRANT SELECT, INSERT, UPDATE ON TABLE {tabla} TO django_standard_role;"
            )
            schema_editor.execute(
                f"ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;"
            )
            schema_editor.execute(
                f"CREATE POLICY std_select_{tabla.replace('api_', '')} "
                f"ON {tabla} FOR SELECT "
                f"TO django_standard_role "
                f"USING (true);"
            )
            schema_editor.execute(
                f"CREATE POLICY std_insert_{tabla.replace('api_', '')} "
                f"ON {tabla} FOR INSERT "
                f"TO django_standard_role "
                f"WITH CHECK (true);"
            )
            schema_editor.execute(
                f"CREATE POLICY std_update_{tabla.replace('api_', '')} "
                f"ON {tabla} FOR UPDATE "
                f"TO django_standard_role "
                f"USING (true) WITH CHECK (true);"
            )
        schema_editor.execute(
            "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO django_standard_role;"
        )

    # ── Datos iniciales para Origen ─────────────────────────────────────────
    Origen = apps.get_model('api', 'Origen')
    db_alias = schema_editor.connection.alias
    Origen.objects.using(db_alias).create(ciudad='Manzanillo')
    Origen.objects.using(db_alias).create(ciudad='Lázaro Cárdenas')


def revertir_rls_nuevas_tablas_y_datos_iniciales(apps, schema_editor):
    """Revierte RLS y elimina datos iniciales."""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'django_standard_role';"
        )
        rol_existe = cursor.fetchone() is not None

    if rol_existe:
        for tabla in NUEVAS_TABLAS_MANAGED:
            nombre_corto = tabla.replace('api_', '')
            for op in ['std_select', 'std_insert', 'std_update']:
                schema_editor.execute(
                    f"DROP POLICY IF EXISTS {op}_{nombre_corto} ON {tabla};"
                )
            schema_editor.execute(
                f"ALTER TABLE {tabla} DISABLE ROW LEVEL SECURITY;"
            )
            schema_editor.execute(
                f"REVOKE ALL PRIVILEGES ON TABLE {tabla} FROM django_standard_role;"
            )

    Origen = apps.get_model('api', 'Origen')
    db_alias = schema_editor.connection.alias
    Origen.objects.using(db_alias).filter(ciudad__in=['Manzanillo', 'Lázaro Cárdenas']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_setup_rls_and_roles'),
    ]

    operations = [
        migrations.CreateModel(
            name='Cliente',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre_cliente', models.CharField(max_length=255)),
                ('domicilio', models.TextField(blank=True, default='')),
            ],
            options={
                'ordering': ['nombre_cliente'],
            },
        ),
        migrations.CreateModel(
            name='Origen',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ciudad', models.CharField(max_length=255)),
            ],
            options={
                'ordering': ['ciudad'],
            },
        ),
        migrations.CreateModel(
            name='Destino',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ciudad', models.CharField(max_length=255)),
            ],
            options={
                'ordering': ['ciudad'],
            },
        ),
        migrations.RunPython(
            setup_rls_nuevas_tablas_y_datos_iniciales,
            reverse_code=revertir_rls_nuevas_tablas_y_datos_iniciales,
        ),
    ]
