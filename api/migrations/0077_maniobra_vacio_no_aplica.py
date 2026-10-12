# ¿MANIOBRA DE VACÍO? pasa de Sí/No a si / no / no_aplica (usuario, 2026-10-12).
#
# RunSQL y no un AlterField a secas: el cast de boolean a texto daria 'true' /
# 'false'. El CASE convierte en la misma sentencia y null se queda null (sin
# contestar). Sin GRANT nuevo: la tabla es la misma.

from django.db import migrations, models

SQL = """
ALTER TABLE api_reporteviaje ALTER COLUMN maniobra_vacio TYPE varchar(10)
USING CASE maniobra_vacio WHEN true THEN 'si' WHEN false THEN 'no' END;
"""

SQL_REVERSA = """
ALTER TABLE api_reporteviaje ALTER COLUMN maniobra_vacio TYPE boolean
USING CASE maniobra_vacio WHEN 'si' THEN true WHEN 'no' THEN false END;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0076_sueldo_historial'),
    ]

    operations = [
        migrations.RunSQL(
            SQL, SQL_REVERSA,
            state_operations=[
                migrations.AlterField(
                    model_name='reporteviaje',
                    name='maniobra_vacio',
                    field=models.CharField(
                        blank=True, max_length=10, null=True,
                        choices=[('si', 'Sí'), ('no', 'No'), ('no_aplica', 'No aplica')]),
                ),
            ],
        ),
    ]
