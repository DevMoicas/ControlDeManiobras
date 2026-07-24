from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0026_backfill_vacio_status_entregado'),
    ]

    # Normaliza el status de los vacíos a minúsculas: había filas heredadas con
    # 'ENTREGADO' en MAYÚSCULAS que no casaban con los ids del selector ni del
    # filtro (pendiente/entregado), así que no aparecían al filtrar "Entregados"
    # y su badge salía en gris. El selector ya escribe en minúscula, así que esto
    # deja la columna consistente. Solo datos. Idempotente (solo toca las que
    # difieren). Irreversible (no se puede recuperar la caja original) → reverse no-op.
    operations = [
        migrations.RunSQL(
            sql="UPDATE vacios SET status = LOWER(status) WHERE status IS NOT NULL AND status <> LOWER(status);",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
