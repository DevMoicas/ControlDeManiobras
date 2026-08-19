from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0035_maniobra_segundo_operador'),
    ]

    # CCP del segundo operador. La remisión que se imprime en el documento es
    # "folio / ccp" (ver _generar_pdf_cta_port), así que con un solo CCP la carta
    # porte del operador 2 saldría con la remisión del 1.
    #
    # Mismo patrón que la 0035 y la 0034: 'maniobras' es managed=False, el
    # AddField solo mantiene el estado y el DDL real va en RunSQL. Columna
    # nullable sin default = metadata-only en Postgres. Los GRANT del rol
    # estándar son a nivel de tabla (0005), así que queda cubierta sola.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='maniobra',
                    name='ccp_2',
                    field=models.CharField(blank=True, max_length=100, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE maniobras ADD COLUMN IF NOT EXISTS ccp_2 varchar(100);",
                    reverse_sql="ALTER TABLE maniobras DROP COLUMN IF EXISTS ccp_2;",
                ),
            ],
        ),
    ]
