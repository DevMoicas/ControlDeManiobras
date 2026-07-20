from django.db import migrations


# La columna 'peso' se creó fuera de las migraciones como numeric(10,2), por lo
# que el AlterField de 0012 quedó como no-op y el tipo físico nunca cambió.
# Aquí se altera el tipo real de la columna a varchar para permitir dos pesos
# ("23412 - 22000"). state_operations vacío: el estado ya quedó correcto en 0012.
class Migration(migrations.Migration):

    dependencies = [
        ('api', '0012_maniobra_peso_charfield'),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER TABLE maniobras ALTER COLUMN peso TYPE varchar(50) USING peso::varchar;',
            reverse_sql='ALTER TABLE maniobras ALTER COLUMN peso TYPE numeric(10,2) USING peso::numeric(10,2);',
            state_operations=[],
        ),
    ]
