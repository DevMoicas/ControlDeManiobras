from django.db import migrations, models


# Diésel y urea del reporte de viaje: de 2 a 10 decimales (usuario, 2026-10-02).
# numeric(10,2) -> numeric(20,10) solo ensancha: ningún valor existente se trunca.
# Sin GRANT: los de api_cargacombustible son de tabla y no dependen del tipo.


def _campo():
    return models.DecimalField(blank=True, decimal_places=10, max_digits=20, null=True)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0074_reparacion_volcado'),
    ]

    operations = [
        migrations.AlterField(model_name='cargacombustible', name=nombre, field=_campo())
        for nombre in ('litros_diesel', 'precio_litro', 'litros_urea', 'total_urea')
    ]
