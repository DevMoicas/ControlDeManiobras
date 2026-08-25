from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0055_maniobra_hora_entrega'),
    ]

    # El CHECK de `orden` pierde el tope superior: la pantalla del reporte ya
    # deja añadir renglones de diésel con un botón, así que un orden alto no
    # puede quedarse invisible — que era justo el motivo del límite (ver el
    # comentario original en CargaCombustible.Meta).
    #
    # Se conserva el mínimo: un orden 0 o negativo no es un renglón, y el
    # `ordering = ['orden']` del modelo lo colaría delante del primero.
    #
    # api_cargacombustible es managed=True y hoy no tiene ninguna fila fuera de
    # rango (el CHECK viejo lo impedía), así que soltar el tope no puede
    # invalidar nada existente. Al revés sí importaría: volver atrás con cargas
    # de orden 6+ ya guardadas fallaría, y por eso el reverse las borra primero.
    operations = [
        migrations.RemoveConstraint(
            model_name='cargacombustible',
            name='carga_orden_en_rango',
        ),
        migrations.AddConstraint(
            model_name='cargacombustible',
            constraint=models.CheckConstraint(
                condition=models.Q(orden__gte=1),
                name='carga_orden_en_rango',
            ),
        ),
    ]
