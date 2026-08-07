from django.db import migrations


# Valores literales a propósito: una migración de datos NO debe importar
# api.models (LETRAS_CICLO/START_NUMERO pueden cambiar mañana y esta migración
# tiene que seguir produciendo exactamente estas 28 filas).
LETRAS_CICLO = ['F', 'R', 'A', 'B', 'A', 'C', 'O', 'N', 'T', 'A', 'I', 'N', 'E', 'R']
SEEDS = [
    ('manzanillo', 2279, '{letra}-{numero}'),
    ('lazaro',      323, '{letra}-LCR-{numero}'),
]


def seed(apps, schema_editor):
    """Siembra el primer lote de cada tabla.

    Garantiza que SIEMPRE exista >=1 fila por tabla, así el action `generar`
    nunca tiene que resolver el caso "tabla vacía" al tomar el lock.
    """
    Folio = apps.get_model('api', 'Folio')
    filas = []
    for tabla, inicio, formato in SEEDS:
        for i, letra in enumerate(LETRAS_CICLO):
            numero = inicio + i
            filas.append(Folio(tabla=tabla, numero=numero, letra=letra,
                               codigo=formato.format(letra=letra, numero=numero)))
    Folio.objects.bulk_create(filas)


def unseed(apps, schema_editor):
    Folio = apps.get_model('api', 'Folio')
    for tabla, inicio, _ in SEEDS:
        Folio.objects.filter(tabla=tabla, numero__range=(inicio, inicio + 13)).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0030_grant_folio_to_standard_role'),
    ]

    operations = [
        migrations.RunPython(seed, reverse_code=unseed),
    ]
