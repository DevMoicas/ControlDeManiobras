from django.db import migrations


# Tablas managed=True nuevas (0051). Sus secuencias se crean AHORA, después del
# GRANT único sobre "ALL SEQUENCES" de la 0005, así que aquella concesión no las
# alcanza: hay que otorgarlas aquí o el primer INSERT revienta con "permission
# denied for sequence". Mismo caso que 0024, 0030, 0038, 0040, 0046 y 0050.
TABLAS = {
    'api_reporteviaje':     'api_reporteviaje_id_seq',
    'api_cargacombustible': 'api_cargacombustible_id_seq',
}


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre los reportes de viaje.

    SELECT, INSERT y UPDATE, pero **no DELETE**: borrar un reporte se reserva a
    admin (ReporteViajeViewSet.destroy). Dejarlo fuera aquí es el segundo candado
    —el mismo criterio de la 0038 con los costos extra—: aunque alguien saltara
    el 403 del ViewSet, el rol de Postgres con el que corre un usuario estándar
    no puede borrar la fila. Un reporte es un documento que se firma.

    Las cargas de combustible tampoco necesitan DELETE: vaciar un renglón es
    ponerle los campos a NULL (el upsert por `orden` del serializer), y cuando se
    borra el reporte entero se van por CASCADE, que corre con el alias de admin.

    RLS igual que en 0005/0024/0030/0038/0040/0046/0050: se habilita por
    coherencia con el resto del esquema. Las políticas son USING (true) porque
    gatean por ROL, no por dueño de la fila — el reporte lo llena quien opera.
    """
    for tabla, secuencia in TABLAS.items():
        schema_editor.execute(
            f"GRANT SELECT, INSERT, UPDATE ON TABLE {tabla} TO django_standard_role;"
        )
        schema_editor.execute(
            f"GRANT USAGE, SELECT ON SEQUENCE {secuencia} TO django_standard_role;"
        )

        schema_editor.execute(f"ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;")
        for op, clausula in (('select', 'USING (true)'),
                             ('insert', 'WITH CHECK (true)'),
                             ('update', 'USING (true) WITH CHECK (true)')):
            schema_editor.execute(
                f"CREATE POLICY std_{op}_{tabla} ON {tabla} FOR {op.upper()} "
                f"TO django_standard_role {clausula};"
            )


def revoke(apps, schema_editor):
    for tabla, secuencia in TABLAS.items():
        for op in ('std_select', 'std_insert', 'std_update'):
            schema_editor.execute(f"DROP POLICY IF EXISTS {op}_{tabla} ON {tabla};")
        schema_editor.execute(f"ALTER TABLE {tabla} DISABLE ROW LEVEL SECURITY;")
        schema_editor.execute(
            f"REVOKE ALL PRIVILEGES ON TABLE {tabla} FROM django_standard_role;"
        )
        schema_editor.execute(
            f"REVOKE ALL PRIVILEGES ON SEQUENCE {secuencia} FROM django_standard_role;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0051_reporteviaje_cargacombustible'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
