from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0054_maniobra_status_piso'),
    ]

    # HORA_ENTREGA: la hora de la entrega de mercancia, como TEXTO 'HH:mm'.
    #
    # Aparte de fecha_entrega_mercancia y no dentro de ella. Es el mismo par que
    # fecha_pis + horario, separado por el mismo motivo (ver views.py:876): la
    # fecha viaja como 'YYYY-MM-DD' al autollenado de la Carta Porte
    # (folios_recientes), se copia al gasto automatico y el dashboard de Gastos
    # agrupa importes por ella. Convertirla a timestamp con USE_TZ=True y
    # TIME_ZONE='UTC' haria que una entrega de las 18:00 se registrara como del
    # dia siguiente en los tres sitios. Como texto local no hay conversion que
    # pueda desplazarla.
    #
    # 'maniobras' es managed=False: un AddField no genera DDL, asi que la columna
    # real va en RunSQL y el AddField solo mantiene el estado en sync. ADD COLUMN
    # nullable sin default es metadata-only en Postgres (no reescribe las 412
    # filas). IF NOT EXISTS / IF EXISTS lo hacen idempotente y reversible. Mismo
    # patron que la 0034, la 0035 y la 0054.
    #
    # Los GRANT del rol estandar sobre 'maniobras' son a nivel de tabla (0005),
    # asi que la columna nueva queda cubierta sin GRANT adicional.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='hora_entrega',
                    field=models.CharField(blank=True, max_length=50, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS hora_entrega varchar(50);",
                    reverse_sql="ALTER TABLE maniobras DROP COLUMN IF EXISTS hora_entrega;",
                ),
            ],
        ),
    ]
