from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_vacio_transportista_operador_entrega'),
    ]

    # Backfill puntual (petición del usuario, 2026-07-24): los vacíos SIN status
    # pasan a 'entregado'. Solo datos, no esquema. Idempotente (WHERE acota a los
    # sin status). Irreversible: al deshacer no se puede distinguir cuáles estaban
    # en NULL vs '' antes, así que el reverse es no-op.
    operations = [
        migrations.RunSQL(
            sql="UPDATE vacios SET status = 'entregado' WHERE status IS NULL OR status = '';",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
