from django.db import migrations


# Tabla managed=True → Django la nombra {app_label}_{model} y su secuencia
# {tabla}_{col}_seq. La secuencia se crea AHORA (0029), después de que la 0005
# hiciera su GRANT único sobre "ALL SEQUENCES": aquella concesión no la alcanza,
# así que hay que otorgarla aquí o el primer INSERT revienta con
# "permission denied for sequence". Mismo caso que 0024.
TABLA     = 'api_folio'
SECUENCIA = 'api_folio_id_seq'


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre los folios.

    Por qué SELECT/INSERT/UPDATE: la página FOLIOS lista (SELECT), genera lotes
    de 14 con /api/folios/generar/ (INSERT) y edita la columna ASIGNACIÓN
    (UPDATE). Cualquier usuario autenticado puede hacer las tres.

    SIN DELETE, a propósito: el proyecto reserva el borrado al admin (decisión
    A1) y la UI de folios no expone borrado. Mismo criterio dirigido que
    0018/0021/0022/0024.

    RLS igual que en 0005/0024: se habilita por coherencia con el resto del
    esquema (todas las tablas de la app la tienen; una sin ella sería el agujero
    que un auditor busca). Las políticas son USING(true): gatean por ROL, no por
    dueño de la fila — los folios son un recurso compartido de la empresa, no
    hay noción de dueño.
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
        ('api', '0029_folio'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
