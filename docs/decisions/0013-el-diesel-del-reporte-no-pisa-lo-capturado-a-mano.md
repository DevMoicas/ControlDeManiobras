# ADR-0013: El diésel del reporte no pisa lo capturado a mano en Gastos

## Estado

Aceptada

## Fecha

2026-08-27

## Contexto

Al guardar un reporte de viaje, el backend suma `litros × precio` de sus cargas y
escribe el total en `gastos.gasto_diesel` de la maniobra que tiene ese folio. Hasta hoy
**pisaba siempre**, y estaba decidido así a propósito (2026-08-24): el reporte se llena
por etapas —una parada hoy, otra pasado mañana— y si respetara lo anterior, la primera
carga fijaría el valor y las cuatro siguientes no llegarían nunca al gasto.

El usuario describió el efecto real de esa regla: *"hoy capturo diésel a mano en Gastos;
si mañana un coordinador registra su reporte, lo que hice hoy se pisa y es trabajo en
vano"*. El importe desaparecía **sin avisar**, y nadie se enteraba de que había habido
dos cifras distintas.

El problema de fondo es que con dos números no se puede contestar la pregunta que
importa: *¿ese importe lo puso el reporte o lo escribió una persona?*

## Decisión

Se comparan las dos cifras antes de escribir:

- **Gastos sin diésel** → el reporte lo escribe, como siempre.
- **Coinciden** → no pasa nada.
- **Difieren** → **no se sobrescribe**, y la fila del reporte enseña el descuadre con
  las dos cifras para que una persona decida cuál vale.

Lo que **sí** se sigue pisando es el volcado anterior *del propio reporte*, y eso es lo
que salva el llenado por etapas. La tercera cifra que lo hace posible es la columna
nueva **`api_reporteviaje.diesel_volcado`** (migración `0060`), que guarda lo último que
ese reporte escribió en el gasto: si lo que hay en Gastos es exactamente eso, nadie lo
ha tocado desde entonces.

Cuando las dos cifras **ya coinciden** se anota igualmente el volcado. Sin ese detalle,
alguien que cuadrara el gasto a mano con el reporte lo dejaría bloqueado para siempre: su
siguiente carga se leería como un descuadre nuevo y no volcaría jamás.

`diesel_coincide` lo decide el **servidor** y no la pantalla, para que no pueda darse el
caso de que la interfaz diga que cuadra mientras el volcado se niega a escribir por lo
contrario.

## Alternativas descartadas

### La regla literal: no pisar nada que ya tenga valor

Es lo que se pidió al pie de la letra, y rompe el flujo normal. Al añadir la segunda
carga el sistema vería 9.890 ≠ 7.440 —donde 7.440 lo había puesto él mismo— y lo
marcaría como descuadre **en cada parada del viaje**, obligando al coordinador a ir a
Gastos a copiar el número a mano. Se explicó al usuario con el ejemplo numérico y aceptó
la versión con memoria.

### Seguir pisando siempre y solo avisar

El aviso llegaría cuando el dato ya se ha perdido. Un aviso que informa de un borrado
consumado no es una protección.

### Una columna en `gastos` que marque "esto es manual"

Tabla equivocada y dato equivocado: no distingue *quién* escribió el importe, solo que
alguien lo tocó, y obligaría a mantenerla al día desde los dos lados. `diesel_volcado`
vive en el reporte, que es quien tiene algo que recordar.

### Bloquear el campo en Gastos y dejarlo solo al reporte

Se descartó el 2026-08-24 y no se reabre: hay viajes sin reporte y folios antiguos donde
el diésel se captura a mano y no hay otra vía.

## Consecuencias

- **Migración `0060`, a aplicar en producción ANTES de desplegar.** Ojo con el nombre:
  la tabla es `api_reporteviaje` —el nombre por defecto de Django, porque es
  `managed=True`—, no `reportes_viaje` como las heredadas. `migrar_prod.sh` comprobaba
  la tabla equivocada y se corrigió al detectarlo.
- `diesel_volcado` es **read_only** en el serializer: si se pudiera mandar desde fuera,
  cualquiera desactivaría la protección declarando el importe que quisiera pisar.
- **Queda una ventana conocida**: después de cuadrar el gasto a mano, el reporte
  recupera el mando en *su siguiente guardado*. Si lo siguiente que ocurre es que el
  coordinador añade otra carga, el aviso sale **una vez más** y se resuelve igual. Es el
  precio de no adivinar; se prefirió avisar de más a pisar un número.
- Los reportes que ya existían tienen `diesel_volcado` en NULL y **se curan solos**: en
  cuanto se guardan con las dos cifras cuadradas, queda anotado.
- El aviso se calcula al **leer**, así que desaparece en cuanto alguien cuadra una de las
  dos cifras, sin necesidad de volver a guardar nada.

## Referencias

- `api/models.py`: `ReporteViaje.volcar_diesel_al_gasto`, `diesel_descuadrado`,
  `gasto_del_folio`, `_recordar_volcado`.
- `api/migrations/0060_reporteviaje_diesel_volcado.py`.
- `api/Serializers.py`: `diesel_reporte`, `diesel_gasto`, `diesel_coincide`.
- `api/test_gasto_automatico.py`: `DieselDelReporteAlGastoTests`, 5 pruebas nuevas.
- `src/pages/ReporteViajePage.jsx` y `.css`: la etiqueta `rv-descuadre`.
- Commits `d5b182d3` (backend), `929054d` (frontend).
