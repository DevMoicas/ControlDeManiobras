from django.db import migrations


# Tabla managed=True → Django la nombra {app_label}_{model} y su secuencia
# {tabla}_{col}_seq. La secuencia se crea AHORA (0023), después de que la 0005
# hiciera su GRANT único sobre "ALL SEQUENCES": aquella concesión no la alcanza,
# así que hay que otorgarla aquí o el primer INSERT revienta con
# "permission denied for sequence". El test con BD lo caza de inmediato.
TABLA     = 'api_dispositivoconfianza'
SECUENCIA = 'api_dispositivoconfianza_id_seq'


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre el dispositivo de confianza.

    Por qué corre como django_standard_role: /api/login/ y el endpoint de
    revocación van por el alias 'standard'. El login lee (SELECT) para saber si
    la cookie salta el MFA y escribe (INSERT) al crear la confianza; revocar es
    un UPDATE de `revocado_en`.

    SIN DELETE, a propósito: el proyecto reserva el borrado al admin (decisión
    A1) y revocar es un soft-delete. Mismo criterio dirigido que 0018/0021/0022.

    RLS igual que en 0005: se habilita por coherencia con el resto del esquema
    (todas las tablas de la app la tienen; una sin ella sería el agujero que un
    auditor busca). Las políticas son USING(true): gatean por ROL, no por dueño
    de la fila — la restricción "solo tus dispositivos" la pone el endpoint al
    filtrar por request.user, igual que todo lo demás en esta app (A1).
    """
    schema_editor.execute(
        f"GRANT SELECT, INSERT, UPDATE ON TABLE {TABLA} TO django_standard_role;"
    )
    schema_editor.execute(
        f"GRANT USAGE, SELECT ON SEQUENCE {SECUENCIA} TO django_standard_role;"
    )

    schema_editor.execute(f"ALTER TABLE {TABLA} ENABLE ROW LEVEL SECURITY;")
    schema_editor.execute(
        f"CREATE POLICY std_select_{TABLA} ON {TABLA} FOR SELECT "
        f"TO django_standard_role USING (true);"
    )
    schema_editor.execute(
        f"CREATE POLICY std_insert_{TABLA} ON {TABLA} FOR INSERT "
        f"TO django_standard_role WITH CHECK (true);"
    )
    schema_editor.execute(
        f"CREATE POLICY std_update_{TABLA} ON {TABLA} FOR UPDATE "
        f"TO django_standard_role USING (true) WITH CHECK (true);"
    )


def revoke(apps, schema_editor):
    for op in ('std_select', 'std_insert', 'std_update'):
        schema_editor.execute(f"DROP POLICY IF EXISTS {op}_{TABLA} ON {TABLA};")
    schema_editor.execute(f"ALTER TABLE {TABLA} DISABLE ROW LEVEL SECURITY;")
    schema_editor.execute(
        f"REVOKE ALL PRIVILEGES ON TABLE {TABLA} FROM django_standard_role;"
    )
    schema_editor.execute(
        f"REVOKE ALL PRIVILEGES ON SEQUENCE {SECUENCIA} FROM django_standard_role;"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0023_dispositivoconfianza'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
