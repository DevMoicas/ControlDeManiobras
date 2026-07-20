from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_add_transportista_cargo'),
    ]

    operations = [
        migrations.AlterField(
            model_name='maniobra',
            name='peso',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]
