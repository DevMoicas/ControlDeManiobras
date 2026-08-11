from django.db import migrations


# La 0005 concedió una LISTA FIJA de tablas (maniobras, vacios, tractos…). Estas
# dos nacieron después, en la 0014, y nadie las añadió: con un usuario estándar
# cualquier lectura revienta con
#     psycopg2.errors.InsufficientPrivilege: permission denied for table api_unidadtercero
# que es lo que rompe el selector de Placas PIS en Maniobras (pide /tractos/ y
# /unidades-terceros/ con Promise.all, así que al fallar uno se pierden los dos)
# y el de Operador cuando el transportista es un tercero. Con un admin no se nota:
# es superusuario y ni pasa por este rol.
#
# Ambos modelos son managed=True → Django nombra la tabla {app_label}_{model} y su
# secuencia {tabla}_{col}_seq. Esas secuencias también son posteriores al GRANT
# único sobre "ALL SEQUENCES" de la 0005, así que hay que otorgarlas aquí o el
# primer INSERT revienta con "permission denied for sequence". Mismo caso que
# 0024 y 0030.
TABLAS = {
    'api_unidadtercero':   'api_unidadtercero_id_seq',
    'api_operadortercero': 'api_operadortercero_id_seq',
}


def grant(apps, schema_editor):
    """Permisos del rol estándar sobre las unidades y operadores de terceros.

    Por qué SELECT/INSERT/UPDATE: los desplegables de Maniobras los leen (SELECT)
    y la página CATÁLOGOS los da de alta y los edita (INSERT/UPDATE). Los dos
    ViewSets abren todo eso a cualquier usuario autenticado.

    SIN DELETE, a propósito: UnidadTerceroViewSet.destroy y
    OperadorTerceroViewSet.destroy ya exigen is_staff, y el proyecto reserva el
    borrado al admin (decisión A1). El admin borra por su propia conexión de
    superusuario, que bypasea RLS de forma nativa. Mismo criterio dirigido que
    0018/0021/0022/0024/0030.

    RLS igual que en 0005/0024/0030: se habilita por coherencia con el resto del
    esquema — todas las tablas de la app la tienen, y una sin ella es justo el
    agujero que un auditor busca. Las políticas son USING(true): gatean por ROL,
    no por dueño de la fila. Un catálogo de unidades es un recurso compartido de
    la empresa, no hay noción de dueño.
    """
    for tabla, secuencia in TABLAS.items():
        schema_editor.execute(
            f"GRANT SELECT, INSERT, UPDATE ON TABLE {tabla} TO django_standard_role;"
        )
        schema_editor.execute(
            f"GRANT USAGE, SELECT ON SEQUENCE {secuencia} TO django_standard_role;"
        )

        schema_editor.execute(f"ALTER TABLE {tabla} ENABLE ROW LEVEL SECURITY;")
        # DROP IF EXISTS antes de crear: CREATE POLICY no es idempotente y aborta
        # la migración entera si la política ya estuviera puesta a mano. Es la
        # única desviación respecto a la 0030, y no cambia el resultado.
        for op in ('std_select', 'std_insert', 'std_update'):
            schema_editor.execute(f"DROP POLICY IF EXISTS {op}_{tabla} ON {tabla};")

        schema_editor.execute(
            f"CREATE POLICY std_select_{tabla} ON {tabla} FOR SELECT "
            f"TO django_standard_role USING (true);"
        )
        schema_editor.execute(
            f"CREATE POLICY std_insert_{tabla} ON {tabla} FOR INSERT "
            f"TO django_standard_role WITH CHECK (true);"
        )
        schema_editor.execute(
            f"CREATE POLICY std_update_{tabla} ON {tabla} FOR UPDATE "
            f"TO django_standard_role USING (true) WITH CHECK (true);"
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
        ('api', '0032_vacio_status_eir'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
