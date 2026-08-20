from django.db import migrations


# Dos tablas managed=True nuevas (0037). Sus secuencias se crean AHORA, después
# del GRANT único sobre "ALL SEQUENCES" de la 0005, así que aquella concesión no
# las alcanza: hay que otorgarlas aquí o el primer INSERT revienta con
# "permission denied for sequence". Mismo caso que 0024 y 0030.
CATALOGO = 'api_costoextra'
ENLACE   = 'api_maniobracostoextra'
SECUENCIAS = {
    CATALOGO: 'api_costoextra_id_seq',
    ENLACE:   'api_maniobracostoextra_id_seq',
}


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre los costos extra.

    Dos tablas con permisos DISTINTOS a propósito:

    · `api_costoextra` (el catálogo) — SELECT/INSERT/UPDATE, sin DELETE. Es un
      registro de negocio y el proyecto reserva el borrado al admin (decisión
      A1), que corre con el alias `default`. Mismo criterio que 0018/0021/0022/
      0024/0030.

    · `api_maniobracostoextra` (el enlace) — SELECT/INSERT/UPDATE **y DELETE**.
      Aquí sí, y es la primera vez en el esquema. No es un registro de negocio
      sino la marca de "este concepto está seleccionado en esta maniobra":
      desmarcarlo es una edición corriente que cualquier usuario hace desde la
      tabla de Maniobras, y sin DELETE quedaría media función (marcar sí,
      desmarcar no). El permiso está acotado a esta tabla: no abre el borrado de
      maniobras, folios ni catálogos, que siguen siendo solo del admin.
      Decisión del usuario, 2026-08-20.

    RLS igual que en 0005/0024/0030: se habilita por coherencia con el resto del
    esquema (una tabla sin ella es el agujero que un auditor busca). Las
    políticas son USING(true) porque gatean por ROL, no por dueño de la fila —
    los costos extra son un recurso compartido de la empresa.
    """
    schema_editor.execute(
        f"GRANT SELECT, INSERT, UPDATE ON TABLE {CATALOGO} TO django_standard_role;"
    )
    schema_editor.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {ENLACE} TO django_standard_role;"
    )
    for secuencia in SECUENCIAS.values():
        schema_editor.execute(
            f"GRANT USAGE, SELECT ON SEQUENCE {secuencia} TO django_standard_role;"
        )

    for tabla, operaciones in ((CATALOGO, ('select', 'insert', 'update')),
                               (ENLACE,   ('select', 'insert', 'update', 'delete'))):
        schema_editor.execute(f"ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;")
        for op in operaciones:
            # DELETE no admite WITH CHECK; UPDATE necesita las dos cláusulas.
            if op == 'insert':
                clausula = "WITH CHECK (true)"
            elif op == 'update':
                clausula = "USING (true) WITH CHECK (true)"
            else:
                clausula = "USING (true)"
            schema_editor.execute(
                f"CREATE POLICY std_{op}_{tabla} ON {tabla} FOR {op.upper()} "
                f"TO django_standard_role {clausula};"
            )


def revoke(apps, schema_editor):
    for tabla in (ENLACE, CATALOGO):
        for op in ('std_select', 'std_insert', 'std_update', 'std_delete'):
            schema_editor.execute(f"DROP POLICY IF EXISTS {op}_{tabla} ON {tabla};")
        schema_editor.execute(f"ALTER TABLE {tabla} DISABLE ROW LEVEL SECURITY;")
        schema_editor.execute(
            f"REVOKE ALL PRIVILEGES ON TABLE {tabla} FROM django_standard_role;"
        )
    for secuencia in SECUENCIAS.values():
        schema_editor.execute(
            f"REVOKE ALL PRIVILEGES ON SEQUENCE {secuencia} FROM django_standard_role;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0037_costoextra_maniobracostoextra'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
