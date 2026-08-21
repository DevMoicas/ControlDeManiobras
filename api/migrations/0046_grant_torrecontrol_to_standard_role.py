from django.db import migrations


# Tabla managed=True nueva (0045). Su secuencia se crea AHORA, después del GRANT
# único sobre "ALL SEQUENCES" de la 0005, así que aquella concesión no la alcanza:
# hay que otorgarla aquí o el primer INSERT revienta con "permission denied for
# sequence". Mismo caso que 0024, 0030, 0038 y 0040.
TABLA     = 'api_torrecontrol'
SECUENCIA = 'api_torrecontrol_id_seq'


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre la torre de control.

    Las cuatro operaciones, y aquí DELETE no necesita la justificación fina de
    la 0038 y la 0040: en este tablero borrar la fila ES la acción de liberar la
    unidad. Un rol sin DELETE no podría devolver una bolita a UNIDADES LIBRES, y
    la torre quedaría en modo solo-ocupar para todo el que no sea admin. El
    usuario decidió (2026-08-21) que la maneja cualquiera que entre al sistema.

    Sigue sin contradecir la decisión A1 (borrado reservado al admin): eso
    protege registros de negocio —maniobras, folios, catálogos—, y aquí no hay
    historia que perder. Una fila de esta tabla es el estado presente de un
    tablero, no un asiento: al liberar la unidad, ese estado deja de existir.

    RLS igual que en 0005/0024/0030/0038/0040: se habilita por coherencia con el
    resto del esquema. Las políticas son USING(true) porque gatean por ROL, no
    por dueño de la fila — la torre es un tablero compartido por toda la empresa.
    """
    schema_editor.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {TABLA} TO django_standard_role;"
    )
    schema_editor.execute(
        f"GRANT USAGE, SELECT ON SEQUENCE {SECUENCIA} TO django_standard_role;"
    )

    schema_editor.execute(f"ALTER TABLE {TABLA} ENABLE ROW LEVEL SECURITY;")
    for op, clausula in (('select', 'USING (true)'),
                         ('insert', 'WITH CHECK (true)'),
                         ('update', 'USING (true) WITH CHECK (true)'),
                         ('delete', 'USING (true)')):
        schema_editor.execute(
            f"CREATE POLICY std_{op}_{TABLA} ON {TABLA} FOR {op.upper()} "
            f"TO django_standard_role {clausula};"
        )


def revoke(apps, schema_editor):
    for op in ('std_select', 'std_insert', 'std_update', 'std_delete'):
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
        ('api', '0045_torrecontrol'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
