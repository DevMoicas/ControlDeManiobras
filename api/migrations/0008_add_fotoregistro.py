from django.db import migrations, models


TABLA = 'api_fotoregistro'


def setup_rls_fotos(apps, schema_editor):
    """
    Otorga SELECT, INSERT, UPDATE (sin DELETE) a django_standard_role
    en la tabla api_fotoregistro, y habilita RLS con sus políticas.
    Solo se ejecuta si el rol existe (plan de seguridad ya aplicado).
    """
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'django_standard_role';"
        )
        rol_existe = cursor.fetchone() is not None

    if not rol_existe:
        return

    schema_editor.execute(
        f"GRANT SELECT, INSERT, UPDATE ON TABLE {TABLA} TO django_standard_role;"
    )
    schema_editor.execute(
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO django_standard_role;"
    )
    schema_editor.execute(f"ALTER TABLE {TABLA} ENABLE ROW LEVEL SECURITY;")
    schema_editor.execute(
        f"CREATE POLICY std_select_fotoregistro ON {TABLA} "
        f"FOR SELECT TO django_standard_role USING (true);"
    )
    schema_editor.execute(
        f"CREATE POLICY std_insert_fotoregistro ON {TABLA} "
        f"FOR INSERT TO django_standard_role WITH CHECK (true);"
    )
    schema_editor.execute(
        f"CREATE POLICY std_update_fotoregistro ON {TABLA} "
        f"FOR UPDATE TO django_standard_role USING (true) WITH CHECK (true);"
    )


def revertir_rls_fotos(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'django_standard_role';"
        )
        rol_existe = cursor.fetchone() is not None

    if not rol_existe:
        return

    for policy in ['std_select_fotoregistro', 'std_insert_fotoregistro', 'std_update_fotoregistro']:
        schema_editor.execute(f"DROP POLICY IF EXISTS {policy} ON {TABLA};")
    schema_editor.execute(f"ALTER TABLE {TABLA} DISABLE ROW LEVEL SECURITY;")
    schema_editor.execute(
        f"REVOKE ALL PRIVILEGES ON TABLE {TABLA} FROM django_standard_role;"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_add_remolque_2_to_maniobra'),
    ]

    operations = [
        migrations.CreateModel(
            name='FotoRegistro',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(
                    max_length=20,
                    choices=[('maniobra', 'Maniobra'), ('vacio', 'Vacío')]
                )),
                ('registro_id', models.IntegerField()),
                ('foto_1', models.BinaryField(null=True, blank=True)),
                ('foto_1_mime', models.CharField(max_length=30, null=True, blank=True)),
                ('foto_2', models.BinaryField(null=True, blank=True)),
                ('foto_2_mime', models.CharField(max_length=30, null=True, blank=True)),
            ],
            options={
                'unique_together': {('tipo', 'registro_id')},
            },
        ),
        migrations.RunPython(setup_rls_fotos, reverse_code=revertir_rls_fotos),
    ]
