from django.db import migrations


# Tabla managed=True nueva (0049). Su secuencia se crea AHORA, después del GRANT
# único sobre "ALL SEQUENCES" de la 0005, así que aquella concesión no la alcanza:
# hay que otorgarla aquí o el primer INSERT revienta con "permission denied for
# sequence". Mismo caso que 0024, 0030, 0038, 0040 y 0046.
TABLA     = 'api_torrefolio'
SECUENCIA = 'api_torrefolio_id_seq'


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre la asignación de folios de la torre.

    Las cuatro operaciones. DELETE está aquí por el mismo criterio que en la
    0046: quitarle el folio a una unidad —para liberarla de ese viaje— ES borrar
    la fila. No se pierde nada de negocio: el folio y la maniobra siguen intactos
    en su tabla; lo que desaparece es la asignación, que es estado del tablero.

    RLS igual que en 0005/0024/0030/0038/0040/0046: se habilita por coherencia
    con el resto del esquema. Las políticas son USING (true) porque gatean por
    ROL, no por dueño de la fila — la torre la maneja quien opera.
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
        ('api', '0049_torrefolio'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
