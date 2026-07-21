from django.db import migrations, models


def audit_adds(model_name):
    """Los 4 AddField de auditoría (solo estado) para un modelo."""
    return [
        migrations.AddField(
            model_name=model_name, name='created_by',
            field=models.CharField(blank=True, editable=False, max_length=150, null=True),
        ),
        migrations.AddField(
            model_name=model_name, name='created_at',
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddField(
            model_name=model_name, name='updated_by',
            field=models.CharField(blank=True, editable=False, max_length=150, null=True),
        ),
        migrations.AddField(
            model_name=model_name, name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
        ),
    ]


# Columnas reales para las tablas managed=False. Nullable → las filas existentes
# quedan en NULL (no se puede saber su autor/fecha original). Idempotente.
ADD_SQL = (
    "ALTER TABLE {t} "
    "ADD COLUMN IF NOT EXISTS created_by varchar(150), "
    "ADD COLUMN IF NOT EXISTS created_at timestamptz, "
    "ADD COLUMN IF NOT EXISTS updated_by varchar(150), "
    "ADD COLUMN IF NOT EXISTS updated_at timestamptz;"
)
DROP_SQL = (
    "ALTER TABLE {t} "
    "DROP COLUMN IF EXISTS created_by, "
    "DROP COLUMN IF EXISTS created_at, "
    "DROP COLUMN IF EXISTS updated_by, "
    "DROP COLUMN IF EXISTS updated_at;"
)


def _unmanaged(model_name, table):
    """managed=False: estado (AddField) + DDL real (RunSQL) por separado.
    Mismo patrón que 0017_maniobra_tercero."""
    return migrations.SeparateDatabaseAndState(
        state_operations=audit_adds(model_name),
        database_operations=[
            migrations.RunSQL(
                sql=ADD_SQL.format(t=table),
                reverse_sql=DROP_SQL.format(t=table),
            ),
        ],
    )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_grant_blacklist_to_standard_role'),
    ]

    operations = [
        _unmanaged('maniobra', 'maniobras'),
        _unmanaged('gasto', 'gastos'),
        _unmanaged('vacio', 'vacios'),
        # MovimientoLocal es managed=True → Django hace el ALTER directamente.
        *audit_adds('movimientolocal'),
    ]
