import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0060_reporteviaje_diesel_volcado'),
    ]

    # A que maniobra pertenece cada vacio. Hasta ahora NO habia ninguna columna
    # que lo dijera: el enlace se adivinaba por el contenedor (_vacio_pendiente
    # en views.py, que lo dice en su propio docstring) y esa via no distingue el
    # viaje de hoy del de hace meses, porque el mismo contenedor vuelve a pasar.
    # Con la columna, las tres celdas de Vacios que enseña la tabla de Maniobras
    # (fecha de maniobra, fecha de entrega y patio) se leen del vacio de verdad.
    #
    # 'vacios' es managed=False: un AddField no genera DDL, asi que la columna
    # real va en RunSQL y el AddField solo mantiene el estado en sync. Mismo
    # patron que la 0028, que hizo esto mismo con maniobras.cliente_id.
    #
    # integer y no bigint: `maniobras.id` es integer, y una FK tiene que ser del
    # tipo de la columna a la que apunta. El indice va aparte porque Postgres NO
    # lo crea solo con la FK (Django si lo crea para toda ForeignKey, y esta
    # columna se consulta en cada pagina de Maniobras con maniobra_id IN (...)).
    #
    # Los GRANT del rol estandar sobre 'vacios' son a nivel de tabla (SELECT,
    # INSERT, UPDATE), asi que la columna nueva queda cubierta sin GRANT extra.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='vacio',
                    name='maniobra',
                    field=models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to='api.maniobra', db_column='maniobra_id',
                        related_name='vacios',
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE vacios "
                        "ADD COLUMN IF NOT EXISTS maniobra_id integer "
                        "REFERENCES maniobras(id) ON DELETE SET NULL;"
                        "CREATE INDEX IF NOT EXISTS vacios_maniobra_id_idx "
                        "ON vacios (maniobra_id);"
                    ),
                    reverse_sql=(
                        "DROP INDEX IF EXISTS vacios_maniobra_id_idx;"
                        "ALTER TABLE vacios DROP COLUMN IF EXISTS maniobra_id;"
                    ),
                ),
            ],
        ),
        # Enlace de una sola vez para los vacios que ya existen. Solo los
        # PENDIENTES: un vacio ya entregado no va a cambiar de fechas ni de
        # patio, asi que enlazarlo no aporta nada y multiplicaria por veinte las
        # filas donde arriesgarse a acertar mal.
        #
        # La regla es la misma que ya usa el sistema para no duplicar vacios
        # (_vacio_pendiente): coincidencia por contenedor. Se toma el PRIMER
        # contenedor del vacio —la fila combinada de un Full guarda los dos como
        # "A - B", y el primero es siempre el del operador 1— y se busca en las
        # dos columnas de contenedor de la maniobra. Gana la MAS RECIENTE: el
        # vacio se creo al asignar el folio, asi que su maniobra es la ultima que
        # llevo ese contenedor.
        #
        # Lo que no case se queda en NULL y sus celdas salen vacias, que es la
        # verdad: no se sabe de que viaje salio.
        migrations.RunSQL(
            sql="""
            UPDATE vacios v SET maniobra_id = (
                SELECT m.id FROM maniobras m
                WHERE position(upper(split_part(v.contenedor, ' - ', 1))
                               in upper(coalesce(m.contenedor, ''))) > 0
                   OR position(upper(split_part(v.contenedor, ' - ', 1))
                               in upper(coalesce(m.contenedor_2, ''))) > 0
                ORDER BY m.id DESC LIMIT 1
            )
            WHERE v.status = 'pendiente'
              AND v.maniobra_id IS NULL
              AND coalesce(v.contenedor, '') <> '';
            """,
            # El reverse de la operacion de arriba tira la columna entera, asi
            # que deshacer el relleno por separado no tiene sentido.
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
