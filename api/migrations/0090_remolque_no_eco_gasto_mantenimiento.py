from django.db import migrations, models
import django.core.validators

TABLAS = ('api_mantenimiento', 'api_gastomantenimiento')


# Rol estandar: leer, registrar y editar. Sin DELETE: borrar es solo de admin,
# que va por el alias 'default' (middleware). Mismo montaje que la 0087: GRANT +
# RLS con una politica por operacion.
def grant(apps, schema_editor):
    ex = schema_editor.execute
    for tabla in TABLAS:
        ex(f"GRANT SELECT, INSERT, UPDATE ON TABLE {tabla} TO django_standard_role;")
        ex(f"GRANT USAGE, SELECT ON SEQUENCE {tabla}_id_seq TO django_standard_role;")
        ex(f"ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;")
        ex(f"CREATE POLICY std_select_{tabla} ON {tabla} FOR SELECT TO django_standard_role USING (true);")
        ex(f"CREATE POLICY std_insert_{tabla} ON {tabla} FOR INSERT TO django_standard_role WITH CHECK (true);")
        ex(f"CREATE POLICY std_update_{tabla} ON {tabla} FOR UPDATE TO django_standard_role "
           f"USING (true) WITH CHECK (true);")


def revoke(apps, schema_editor):
    ex = schema_editor.execute
    for tabla in TABLAS:
        for op in ('select', 'insert', 'update'):
            ex(f"DROP POLICY IF EXISTS std_{op}_{tabla} ON {tabla};")
        ex(f"ALTER TABLE {tabla} DISABLE ROW LEVEL SECURITY;")
        ex(f"REVOKE ALL PRIVILEGES ON TABLE {tabla} FROM django_standard_role;")
        ex(f"REVOKE ALL PRIVILEGES ON SEQUENCE {tabla}_id_seq FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0089_tracto_tag_anam'),
    ]

    # 1) No. Eco del remolque (usuario, 2026-11-25). Mismo patron que la 0089:
    #    `remolques` es managed=False, la columna va en RunSQL y el AddField solo
    #    mantiene el estado. Nullable + UNIQUE: los remolques existentes quedan en
    #    NULL y Postgres admite varios NULL bajo un UNIQUE.
    # 2) Tablas nuevas Mantenimiento y GastoMantenimiento (managed=True), con su GRANT.
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
            name='Mantenimiento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('unidad', models.CharField(blank=True, default='', max_length=100)),
                ('remolque', models.CharField(blank=True, default='', max_length=255)),
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
        migrations.CreateModel(
            name='GastoMantenimiento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('unidad', models.CharField(blank=True, default='', max_length=100)),
                ('remolque', models.CharField(blank=True, default='', max_length=255)),
                ('descripcion', models.TextField()),
                ('proveedor', models.CharField(blank=True, default='', max_length=255)),
                ('no_factura', models.CharField(blank=True, default='', max_length=100)),
                ('monto', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(0)])),
                ('metodo_pago', models.CharField(choices=[('efectivo', 'Efectivo'), ('tdc', 'TDC'), ('tdd', 'TDD')], max_length=10)),
                ('fecha', models.DateField()),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-fecha', '-id'],
                'managed': True,
            },
        ),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
