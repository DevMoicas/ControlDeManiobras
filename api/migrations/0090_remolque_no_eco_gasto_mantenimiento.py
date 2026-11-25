from django.db import migrations, models
import django.core.validators

TABLA = 'api_gastomantenimiento'


# Rol estandar: leer y registrar, nada mas (la pantalla no edita ni borra).
# Mismo montaje que la 0087: GRANT + RLS con una politica por operacion.
def grant(apps, schema_editor):
    ex = schema_editor.execute
    ex(f"GRANT SELECT, INSERT ON TABLE {TABLA} TO django_standard_role;")
    ex(f"GRANT USAGE, SELECT ON SEQUENCE {TABLA}_id_seq TO django_standard_role;")
    ex(f"ALTER TABLE {TABLA} ENABLE ROW LEVEL SECURITY;")
    ex(f"CREATE POLICY std_select_{TABLA} ON {TABLA} FOR SELECT TO django_standard_role USING (true);")
    ex(f"CREATE POLICY std_insert_{TABLA} ON {TABLA} FOR INSERT TO django_standard_role WITH CHECK (true);")


def revoke(apps, schema_editor):
    ex = schema_editor.execute
    for op in ('select', 'insert'):
        ex(f"DROP POLICY IF EXISTS std_{op}_{TABLA} ON {TABLA};")
    ex(f"ALTER TABLE {TABLA} DISABLE ROW LEVEL SECURITY;")
    ex(f"REVOKE ALL PRIVILEGES ON TABLE {TABLA} FROM django_standard_role;")
    ex(f"REVOKE ALL PRIVILEGES ON SEQUENCE {TABLA}_id_seq FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0089_tracto_tag_anam'),
    ]

    # 1) No. Eco del remolque (usuario, 2026-11-25). Mismo patron que la 0089:
    #    `remolques` es managed=False, la columna va en RunSQL y el AddField solo
    #    mantiene el estado. Nullable + UNIQUE: los remolques existentes quedan en
    #    NULL y Postgres admite varios NULL bajo un UNIQUE.
    # 2) Tabla nueva de gastos de mantenimiento (managed=True), con su GRANT.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='remolque',
                    name='no_eco',
                    field=models.CharField(blank=True, max_length=255, null=True, unique=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE remolques ADD COLUMN IF NOT EXISTS no_eco varchar(255);"
                        "CREATE UNIQUE INDEX IF NOT EXISTS remolques_no_eco_uniq ON remolques (no_eco);"
                    ),
                    reverse_sql=(
                        "DROP INDEX IF EXISTS remolques_no_eco_uniq;"
                        "ALTER TABLE remolques DROP COLUMN IF EXISTS no_eco;"
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name='GastoMantenimiento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('unidad', models.CharField(max_length=100)),
                ('remolque', models.CharField(max_length=255)),
                ('que_cambio', models.TextField()),
                ('fecha', models.DateField()),
                ('kilometraje', models.DecimalField(decimal_places=10, max_digits=20, validators=[django.core.validators.MinValueValidator(0)])),
                ('descripcion_pieza', models.TextField()),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-fecha', '-id'],
                'managed': True,
            },
        ),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
