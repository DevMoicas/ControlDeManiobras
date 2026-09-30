import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


# Fase 0 de PLAN_MODULO_FINANZAS.md: ligar cada usuario a su empleado.
#
# ── GRANT: solo SELECT ───────────────────────────────────────────────────────
# El rol estándar tiene que LEER su perfil: el acceso a Finanzas por cargo se
# decidirá en peticiones de usuarios no-admin, que van por el alias 'standard'.
# ESCRIBIR perfiles solo lo hace el admin de Django, que va por 'default'
# (superusuario, ver middleware.py): el rol estándar no necesita INSERT ni
# UPDATE, y no se le dan — si pudiera escribir aquí, podría ligarse a un
# empleado con otro cargo. Sin secuencia que otorgar, por lo mismo.
#
# RLS como en la 0050: USING (true), porque se gatea por rol, no por dueño.
TABLA = 'api_perfilusuario'


def grant(apps, schema_editor):
    schema_editor.execute(f"GRANT SELECT ON TABLE {TABLA} TO django_standard_role;")
    schema_editor.execute(f"ALTER TABLE {TABLA} ENABLE ROW LEVEL SECURITY;")
    schema_editor.execute(
        f"CREATE POLICY std_select_{TABLA} ON {TABLA} FOR SELECT "
        f"TO django_standard_role USING (true);"
    )


def revoke(apps, schema_editor):
    schema_editor.execute(f"DROP POLICY IF EXISTS std_select_{TABLA} ON {TABLA};")
    schema_editor.execute(f"ALTER TABLE {TABLA} DISABLE ROW LEVEL SECURITY;")
    schema_editor.execute(f"REVOKE ALL PRIVILEGES ON TABLE {TABLA} FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0068_km_decimales'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PerfilUsuario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('empleado', models.OneToOneField(blank=True, db_column='empleado_id', db_constraint=False, null=True, on_delete=django.db.models.deletion.DO_NOTHING, related_name='perfil', to='api.empleado')),
                ('usuario', models.OneToOneField(db_constraint=False, on_delete=django.db.models.deletion.CASCADE, related_name='perfil', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'perfil de usuario',
                'verbose_name_plural': 'perfiles de usuario',
                'managed': True,
            },
        ),
        migrations.RunPython(grant, reverse_code=revoke),
    ]
