from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0088_facturas_de_servicios_viejos'),
    ]

    # TAG ANAM del tracto (usuario, 2026-10-30): la fecha de expedicion. Mismo
    # patron que la 0065: `tractos` es managed=False, la columna va en RunSQL y
    # el AddField solo mantiene el estado. Nullable sin default: metadata-only en
    # Postgres. El GRANT del rol estandar es de tabla (0005): ya la cubre.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='tracto',
                    name='fecha_tag_anam',
                    field=models.DateField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE tractos ADD COLUMN IF NOT EXISTS fecha_tag_anam date;",
                    reverse_sql="ALTER TABLE tractos DROP COLUMN IF EXISTS fecha_tag_anam;",
                ),
            ],
        ),
    ]
