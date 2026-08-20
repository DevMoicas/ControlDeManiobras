from django.db import migrations


# Tabla managed=True nueva (0039). Su secuencia se crea AHORA, después del GRANT
# único sobre "ALL SEQUENCES" de la 0005, así que aquella concesión no la alcanza:
# hay que otorgarla aquí o el primer INSERT revienta con "permission denied for
# sequence". Mismo caso que 0024, 0030 y 0038.
TABLA     = 'api_pendiente'
SECUENCIA = 'api_pendiente_id_seq'


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre los pendientes.

    SELECT/INSERT/UPDATE es lo que hace la página: listar, agregar y marcar o
    reescribir una línea.

    Y DELETE, que aquí no contradice la decisión A1 (borrado reservado al admin):
    el borrado NO es una acción de usuario. La API no expone ruta de borrado a
    nadie —el ViewSet no monta `destroy`, ni para admins—, así que este permiso
    solo lo usa el barrido automático de los pendientes caducados a las 28 horas,
    que corre dentro del listado y por tanto con el rol de quien mire la página.
    Sin él, el barrido fallaría para todo el mundo salvo un admin y las listas se
    llenarían de pendientes muertos.

    Segundo caso de DELETE para el rol estándar, tras api_maniobracostoextra
    (0038), y por el mismo criterio: se concede sobre datos efímeros que no son
    registro de negocio, nunca sobre maniobras, folios ni catálogos.

    RLS igual que en 0005/0024/0030/0038: se habilita por coherencia con el resto
    del esquema. Las políticas son USING(true) porque gatean por ROL, no por
    dueño de la fila — los cinco tableros son compartidos por toda la empresa.
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
        ('api', '0039_pendiente'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
