from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_operadortercero_unidadtercero'),
    ]

    # La tabla 'choferes' es managed=False: un AlterField no genera DDL, así que el
    # cambio real de nullabilidad va en RunSQL. AlterField solo mantiene el estado de
    # migraciones en sync (para que makemigrations no vuelva a detectar el cambio).
    # DROP NOT NULL es idempotente: no falla si la columna ya admite NULL.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='chofer',
                    name='rfc',
                    field=models.CharField(blank=True, max_length=13, null=True, unique=True, validators=[django.core.validators.MinLengthValidator(13)]),
                ),
                migrations.AlterField(
                    model_name='chofer',
                    name='licencia',
                    field=models.CharField(blank=True, max_length=255, null=True, unique=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql='ALTER TABLE choferes ALTER COLUMN rfc DROP NOT NULL;',
                    reverse_sql='ALTER TABLE choferes ALTER COLUMN rfc SET NOT NULL;',
                ),
                migrations.RunSQL(
                    sql='ALTER TABLE choferes ALTER COLUMN licencia DROP NOT NULL;',
                    reverse_sql='ALTER TABLE choferes ALTER COLUMN licencia SET NOT NULL;',
                ),
            ],
        ),
    ]
