from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_add_cliente_origen_destino'),
    ]

    operations = [
        migrations.AddField(
            model_name='maniobra',
            name='remolque_2',
            field=models.CharField(max_length=100, null=True, blank=True),
        ),
    ]
