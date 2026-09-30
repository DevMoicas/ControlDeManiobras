from django.db import migrations, models


# Fase 5 de PLAN_MODULO_FINANZAS.md: la memoria del volcado de reparaciones.
# ADD COLUMN nullable sin default: solo metadatos, no reescribe la tabla. Sin
# GRANT: los de api_reporteviaje son de tabla (0052) y ya cubren la columna.


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0073_cuentas_por_pagar_y_capturas'),
    ]

    operations = [
        migrations.AddField(
            model_name='reporteviaje',
            name='reparacion_volcado',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
    ]
