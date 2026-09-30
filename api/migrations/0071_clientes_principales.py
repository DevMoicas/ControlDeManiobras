import django.db.models.deletion
from django.db import migrations, models


# Fase 2 de PLAN_MODULO_FINANZAS.md: clientes principales que agrupan
# direcciones (D4). `api_cliente` NO se renombra: solo gana una columna, y sus
# GRANT son de tabla (0005), así que la columna nueva ya queda cubierta.
#
# La tabla nueva es un catálogo más: la edita cualquiera desde Catálogos, así que
# el rol estándar recibe SELECT, INSERT y UPDATE (y su secuencia, que nace
# después del GRANT sobre ALL SEQUENCES de la 0005). Sin DELETE: borrar es solo
# del admin (decisión A1), que va como superusuario.
TABLA     = 'api_clienteprincipal'
SECUENCIA = 'api_clienteprincipal_id_seq'


def grant(apps, schema_editor):
    schema_editor.execute(f"GRANT SELECT, INSERT, UPDATE ON TABLE {TABLA} TO django_standard_role;")
    schema_editor.execute(f"GRANT USAGE, SELECT ON SEQUENCE {SECUENCIA} TO django_standard_role;")
    schema_editor.execute(f"ALTER TABLE {TABLA} ENABLE ROW LEVEL SECURITY;")
    for op, clausula in (('select', 'USING (true)'),
                         ('insert', 'WITH CHECK (true)'),
                         ('update', 'USING (true) WITH CHECK (true)')):
        schema_editor.execute(
            f"CREATE POLICY std_{op}_{TABLA} ON {TABLA} FOR {op.upper()} "
            f"TO django_standard_role {clausula};"
        )


def revoke(apps, schema_editor):
    for op in ('select', 'insert', 'update'):
        schema_editor.execute(f"DROP POLICY IF EXISTS std_{op}_{TABLA} ON {TABLA};")
    schema_editor.execute(f"ALTER TABLE {TABLA} DISABLE ROW LEVEL SECURITY;")
    schema_editor.execute(f"REVOKE ALL PRIVILEGES ON TABLE {TABLA} FROM django_standard_role;")
    schema_editor.execute(f"REVOKE ALL PRIVILEGES ON SEQUENCE {SECUENCIA} FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0070_facturas'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientePrincipal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=255, unique=True)),
                ('dias_credito', models.PositiveIntegerField(default=0)),
            ],
            options={
                'ordering': ['nombre'],
                'managed': True,
            },
        ),
        migrations.AddField(
            model_name='cliente',
            name='cliente_principal',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='direcciones', to='api.clienteprincipal'),
        ),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
