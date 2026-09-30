from django.db import migrations


# Fase 3 de PLAN_MODULO_FINANZAS.md: marcar una factura como cobrada (P27) lo
# hacen también los cargos de Finanzas, que escriben con el rol estándar. La 0070
# le dio UPDATE solo de las columnas de la liga; esto añade `cobrada` y nada
# más. Importes y `estado` siguen fuera de su alcance.
TABLA = 'api_factura'


def grant(apps, schema_editor):
    schema_editor.execute(f"GRANT UPDATE (cobrada) ON TABLE {TABLA} TO django_standard_role;")


def revoke(apps, schema_editor):
    schema_editor.execute(f"REVOKE UPDATE (cobrada) ON TABLE {TABLA} FROM django_standard_role;")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0071_clientes_principales'),
    ]

    operations = [
        migrations.RunPython(grant, reverse_code=revoke),
    ]
