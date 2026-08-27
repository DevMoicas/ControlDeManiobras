from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.validators import MinLengthValidator, MinValueValidator
from django.db import models
from django.utils import timezone

class Tracto(models.Model):
    no_eco = models.CharField(max_length=255, unique=True)
    unidad = models.CharField(max_length=255)
    anio = models.IntegerField()
    placas = models.CharField(max_length=255, unique=True, validators=[MinLengthValidator(6)])
    tipo = models.CharField(max_length=255)
    tag = models.CharField(max_length=100, null=True, blank=True)
    # Número de póliza, alfanumérico. Declarado JUSTO antes de su fecha a
    # propósito: el serializer usa fields='__all__' y CatalogosPage pinta las
    # columnas en el orden que llegan, así que este orden ES el de la tabla.
    poliza = models.CharField(max_length=100, null=True, blank=True)
    fecha_vencimiento_poliza = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.no_eco} - {self.placas}"
    
    class Meta:
        managed = False  # Esto le dice a Django: "Yo cree la tabla, no la toques"
        db_table = 'tractos'

class Remolque(models.Model):
    color = models.CharField(max_length=255)
    tipo = models.CharField(max_length=255)
    placas = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.placas
    class Meta:
        managed = False  # Esto le dice a Django: "Yo cree la tabla, no la toques"
        db_table = 'remolques'

class Chofer(models.Model):
    nombre = models.CharField(max_length=255)
    rfc = models.CharField(max_length=13, unique=True, null=True, blank=True, validators=[MinLengthValidator(13)])
    licencia = models.CharField(max_length=255, unique=True, null=True, blank=True)
    fecha_vencimiento_licencia = models.DateField(null=True, blank=True)

    def __str__(self):
        return self.nombre
    class Meta:
        managed = False  # Esto le dice a Django: "Yo cree la tabla, no la toques"
        db_table = 'choferes'

# --- NUEVO MODELO ---
class Maniobra(models.Model):
    solicita = models.CharField(max_length=255, null=True, blank=True)
    agencia = models.CharField(max_length=255, null=True, blank=True)
    codigo_pis = models.CharField(max_length=100, null=True, blank=True)
    terminal = models.CharField(max_length=100, null=True, blank=True)
    placas_pis = models.CharField(max_length=100, null=True, blank=True)
    saca = models.CharField(max_length=100, null=True, blank=True)
    fecha_pis = models.DateField(max_length=50, null=True, blank=True, db_index=True)
    horario = models.CharField(max_length=50, null=True, blank=True)
    
    # Nuevos campos agregados
    tipo_y_peso = models.CharField(max_length=255, null=True, blank=True)
    # Tipo de servicio explícito (lo elige el usuario, ya no se infiere del texto).
    # null/blank: los registros anteriores a este campo no lo tienen — los documentos
    # caen a la heurística previa (ver _generar_pdf_cta_port en views.py).
    TIPO_SERVICIO_CHOICES = [
        ('sencillo', 'Sencillo'),
        ('full', 'Full'),
        ('carga_suelta', 'Carga suelta'),
    ]
    tipo_servicio = models.CharField(
        max_length=20, choices=TIPO_SERVICIO_CHOICES, null=True, blank=True
    )
    tipo = models.CharField(max_length=100, null=True, blank=True)
    # CharField (no DecimalField) para permitir dos pesos "23412 - 22000".
    # Los documentos los suman via _sumar_peso; no hay agregaciones numéricas en BD.
    peso = models.CharField(max_length=50, null=True, blank=True)
    contenedor = models.CharField(max_length=255, null=True, blank=True)
    referencia = models.CharField(max_length=255, null=True, blank=True)
    pedimento = models.CharField(max_length=255, null=True, blank=True)
    cliente = models.CharField(max_length=100, null=True, blank=True)
    # Cliente real del catálogo. `cliente` (arriba) solo guarda el nombre y no
    # distingue homónimos: dos "YAZAKI" con distinta dirección son dos filas de
    # api_cliente y el nombre resuelve siempre a la misma. Se llama cliente_fk
    # porque `cliente` ya ocupa ese nombre; la columna real es cliente_id, que la
    # añade la migración 0028 vía RunSQL (la tabla es managed=False).
    # ponytail: sin índice en cliente_id; solo se usa vía select_related (JOIN por
    # la PK de api_cliente). Añadirlo si algún día se listan maniobras por cliente.
    cliente_fk = models.ForeignKey(
        'api.Cliente', null=True, blank=True, on_delete=models.SET_NULL,
        db_column='cliente_id', related_name='maniobras',
    )
    origen = models.CharField(max_length=100, null=True, blank=True)
    destino = models.CharField(max_length=100, null=True, blank=True)
    # Texto libre: en que situacion esta la carga mientras sigue en piso.
    # Columna real anadida por la 0054 (maniobras es managed=False).
    status_piso = models.CharField(max_length=255, null=True, blank=True)
    # PENDIENTE DE PROGRAMAR: la casilla que se marca en el desglose de
    # PENDIENTES de la pantalla de inicio. Se guarda en la base y no en el
    # navegador porque el repaso es COMPARTIDO: lo que marca una persona lo
    # tienen que ver las demas (decision del usuario, 2026-08-26).
    #
    # Columna propia y no un valor mas de `status`: marcarla no saca el servicio
    # de pendiente, solo anota que ya se reviso. Meterlo en status obligaria a
    # inventar combinaciones y perderia el estado real al desmarcar — mismo
    # razonamiento que llevo a `vacios.reprogramado` a tener columna (ADR-0002).
    #
    # Columna real en la migracion 0057 (maniobras es managed=False).
    pendiente_programar = models.BooleanField(default=False)
    transportista = models.CharField(max_length=255, null=True, blank=True)
    asignacion_operador_status = models.CharField(max_length=100, null=True, blank=True)

    #ultimos 7 campos agregados
    unidad = models.CharField(max_length=100, null=True, blank=True)
    remolque = models.CharField(max_length=255, null=True, blank=True)  # guarda las placas del remolque
    remolque_2 = models.CharField(max_length=100, null=True, blank=True)
    folio = models.CharField(max_length=100, null=True, blank=True)
    vacio_patio = models.CharField(max_length=255, null=True, blank=True)
    status_vacio = models.CharField(max_length=100, null=True, blank=True)
    fecha_entrega_mercancia = models.DateField(max_length=50, null=True, blank=True, db_index=True)
    # Hora de la entrega, aparte de la fecha y como TEXTO 'HH:mm' — mismo par que
    # fecha_pis + horario. Separadas a proposito: la fecha viaja como 'YYYY-MM-DD'
    # al autollenado de la Carta Porte y al gasto automatico, y meterla en un
    # timestamp obligaria a decidir la zona horaria en el servidor (USE_TZ=True,
    # TIME_ZONE='UTC'), con lo que una entrega de la tarde se registraria como del
    # dia siguiente. Columna real anadida por la 0055 (maniobras es managed=False).
    hora_entrega = models.CharField(max_length=50, null=True, blank=True)
    no_factura = models.CharField(max_length=100, null=True, blank=True)
    # Texto libre. Va declarada junto a ccp por ser su vecina en la tabla; el
    # orden de las columnas de Maniobras lo fija COLUMNAS en el frontend, no el
    # serializer, así que aquí es solo cuestión de que se lea bien.
    dd = models.CharField(max_length=100, null=True, blank=True)
    ccp = models.CharField(max_length=100, null=True, blank=True)
    ruta_inicio = models.DateTimeField(null=True, blank=True)
    ruta_fin    = models.DateTimeField(null=True, blank=True)

    # ── Segundo operador (migración 0035) ────────────────────────────────────
    # Un Full puede repartirse entre dos operadores: cada uno se lleva UN
    # contenedor con su propio tracto y sus remolques. El reparto es posicional
    # y fijo: folio/contenedor/tipo/peso + unidad + remolque/remolque_2 son del
    # operador 1; los campos _2 y remolque_3/4 son del operador 2.
    #
    # La carga va en columnas propias (no partiendo la cadena "A / B" del
    # formato viejo) porque facturación y nóminas necesitan saber qué operador
    # se llevó qué contenedor sin partir texto en SQL. Los registros anteriores
    # a esta migración conservan los dos valores dentro de la columna 1: NO hay
    # backfill, el frontend lee los dos formatos y migra cada fila al editarla.
    operador_2 = models.CharField(max_length=100, null=True, blank=True)
    unidad_2 = models.CharField(max_length=100, null=True, blank=True)
    folio_2 = models.CharField(max_length=100, null=True, blank=True)
    remolque_3 = models.CharField(max_length=255, null=True, blank=True)
    remolque_4 = models.CharField(max_length=100, null=True, blank=True)
    tipo_2 = models.CharField(max_length=100, null=True, blank=True)
    peso_2 = models.CharField(max_length=50, null=True, blank=True)
    contenedor_2 = models.CharField(max_length=255, null=True, blank=True)
    # CCP del operador 2 (migración 0036). La remisión del documento es
    # "folio / ccp", así que cada operador necesita el suyo o la carta porte del
    # segundo saldría con el CCP del primero.
    ccp_2 = models.CharField(max_length=100, null=True, blank=True)

    # Una maniobra puede tener hasta 2 status a la vez. Se guardan en este mismo
    # campo separados por coma, SIEMPRE en orden de prioridad descendente:
    #     por_salir > activo > quemada > cancelado > pendiente
    # (mismo orden que PRIORITY_ORDER en el frontend, src/config/statusConfig.js).
    #
    # Ese orden canónico hace dos cosas gratis:
    #   1. El primer segmento antes de la coma es siempre el color que gana en la fila.
    #   2. Un combo mal ordenado ("quemada,activo") no está en la lista → DRF lo
    #      rechaza con 400 automáticamente, sin escribir validación.
    #
    # Los combos más largos, "por_salir,cancelado" y "cancelado,pendiente", miden 19
    # caracteres: caben en el max_length=20 que ya tenía la columna, así que añadir
    # CANCELADO tampoco necesita tocar el esquema.
    STATUS_CHOICES = [
        ("activo",    "Activo / En viaje"),
        ("pendiente", "Pendiente"),
        ("quemada",   "Quemada"),
        ("por_salir", "Por salir"),
        # CANCELADO va junto a QUEMADA en la prioridad y comparte su color: los dos
        # son finales de viaje que no salieron bien, y en la fila se leen igual.
        ("cancelado", "Cancelado"),
        # Combinaciones de 2 (orden canónico: mayor prioridad primero)
        ("por_salir,activo",    "Por salir + Activo"),
        ("por_salir,quemada",   "Por salir + Quemada"),
        ("por_salir,cancelado", "Por salir + Cancelado"),
        ("por_salir,pendiente", "Por salir + Pendiente"),
        ("activo,quemada",      "Activo + Quemada"),
        ("activo,cancelado",    "Activo + Cancelado"),
        ("activo,pendiente",    "Activo + Pendiente"),
        ("quemada,cancelado",   "Quemada + Cancelado"),
        ("quemada,pendiente",   "Quemada + Pendiente"),
        ("cancelado,pendiente", "Cancelado + Pendiente"),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        null=True,
        blank=True,
        db_index=True,   # permite filtrar por status eficientemente en el futuro dashboard
    )

    # Marca "TERCERO": bandera independiente del `status` combinado de arriba, NO se
    # mezcla con él. Un botón aparte (columna Tercero, a un lado de Transportista) la
    # activa/desactiva; guarda "tercero" o NULL. La columna real la añade la migración
    # 0017 vía RunSQL porque la tabla es managed=False (vive en pgAdmin).
    tercero = models.CharField(max_length=20, null=True, blank=True)

    # Color de relleno de la fila, elegido a mano como en una hoja de cálculo.
    # Manda sobre el color que pinta `status`, y NULL significa "sin pintar": la
    # fila vuelve al color de su status sin que haya que recordar cuál era.
    # Formato "#rrggbb" — el serializer lo valida, porque este valor acaba en el
    # CSS de la tabla. Columna real en la migración 0047 (tabla managed=False).
    color = models.CharField(max_length=7, null=True, blank=True)

    # ── Auditoría (quién/cuándo). editable=False / auto_now → read_only en el
    # serializer; created_by/updated_by se rellenan en perform_create/update. ──
    created_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    def __str__(self):
        return f"{self.solicita} - {self.codigo_pis}"

    class Meta:
        managed = False  # Para que use tu tabla de pgAdmin
        db_table = 'maniobras'
        
class Gasto(models.Model):
    maniobra = models.OneToOneField(Maniobra, on_delete=models.CASCADE, related_name='gasto')
    fecha_entrega_mercancia = models.CharField(max_length=50, null=True, blank=True)
    casetas_ida = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    casetas_regreso = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    gastos_adicionales = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    entregado = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    gasto_tag = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    gasto_diesel = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    comision_operador = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reparaciones = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    gastos_totales = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    facturado = models.CharField(max_length=50, null=True, blank=True)
    descripcion_gastos = models.TextField(null=True, blank=True)
    # Texto libre propio del gasto. NO es la `unidad` de la maniobra (placas del
    # tracto): se escribe a mano en la fila y no se deriva del folio.
    unidad = models.CharField(max_length=100, null=True, blank=True)

    # Desglose tal cual se escribió en cada celda de dinero, por campo:
    # {"casetas_ida": "=150+230+430"}. La columna de dinero guarda el TOTAL —es
    # lo que suma save()—; esto solo sirve para volver a enseñar la fórmula al
    # editar, como hace Excel. Sin fórmula, la clave no está.
    #
    # Un solo jsonb en vez de una columna por campo: son 8 campos de dinero y
    # ninguno necesita indexarse ni filtrarse por su fórmula.
    formulas = models.JSONField(default=dict, blank=True)

    # ── Auditoría (quién/cuándo) ──
    created_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    def save(self, *args, **kwargs):
        campos = [
            self.casetas_ida or 0,
            self.casetas_regreso or 0,
            self.gastos_adicionales or 0,
            self.gasto_tag or 0,
            self.gasto_diesel or 0,
            self.comision_operador or 0,
            self.reparaciones or 0,
        ]
        self.gastos_totales = sum(campos)
        super().save(*args, **kwargs)
        
    def __str__(self):
        return f"Carta Porte: {self.carta_porte}"

    class Meta:
        managed = False
        db_table = 'gastos'

class Vacio(models.Model):
    contenedor = models.CharField(max_length=255, null=True, blank=True)
    # Tipo del contenedor (40HC, 20DC…). Texto libre: no hay catálogo de tipos y
    # el histórico de Maniobra.tipo tampoco lo tiene.
    tipo_contenedor = models.CharField(max_length=100, null=True, blank=True)
    # Empleado con cargo 'Coordinador' que lleva el vacío. Se guarda el NOMBRE y
    # no una FK, igual que operador/transportista en esta misma tabla: `vacios`
    # es managed=False y el resto de sus referencias a personas ya son por texto.
    coordinador = models.CharField(max_length=255, null=True, blank=True)
    patio = models.CharField(max_length=255, null=True, blank=True)
    fecha_maniobra = models.DateField(null=True, blank=True)
    fecha_entrega = models.DateField(null=True, blank=True)
    fecha_notificacion_cliente = models.CharField(max_length=50, null=True, blank=True)
    status = models.CharField(max_length=100, null=True, blank=True)
    # STATUS EIR: en qué punto está el EIR físico del vacío. Va aparte de `status`
    # (que es el del vacío en sí) porque son dos cosas independientes: un vacío
    # entregado puede seguir con el EIR pendiente. Columna real en la migración
    # 0032 (managed=False). Con `choices`, DRF valida solo y rechaza cualquier
    # otro valor con un 400 — no hace falta escribir la validación.
    STATUS_EIR_CHOICES = [
        ('enviado',        'Enviado'),
        ('pendiente',      'Pendiente'),
        ('sin_eir_fisico', 'Sin EIR Físico'),
    ]
    status_eir = models.CharField(
        max_length=20, choices=STATUS_EIR_CHOICES, null=True, blank=True
    )
    # Reprogramación. Columna PROPIA y no un valor más de `status`: es un estado
    # INDEPENDIENTE de Pendiente/Entregado, no los sustituye. Un vacío entregado
    # puede estar reprogramado y al quitarle la reprogramación su Entregado sigue
    # intacto — con un solo campo compartido, ese valor se habría perdido.
    # Por eso el filtro REPROGRAMADOS pregunta por esta columna y no por status.
    reprogramado = models.BooleanField(default=False)
    # Solo tiene sentido con reprogramado=True; la UI oculta el campo si no lo
    # está. NO se borra al desmarcar: es un dato que escribió una persona.
    fecha_reprogramacion = models.DateField(null=True, blank=True)
    operador = models.CharField(max_length=255, null=True, blank=True)
    # Vacíos: transportista del vacío y segundo operador ("Entregó"), que se filtra
    # por ese transportista (mismo patrón que Maniobra). Nullable → las filas
    # existentes quedan en NULL. Columnas reales en la migración 0025 (managed=False).
    transportista = models.CharField(max_length=255, null=True, blank=True)
    operador_entrega = models.CharField(max_length=255, null=True, blank=True)
    cita = models.CharField(max_length=255, null=True, blank=True)
    cd = models.CharField(max_length=255, null=True, blank=True)

    # Color de relleno de la fila, elegido a mano. Mismo contrato que
    # Maniobra.color: "#rrggbb" o NULL, validado en el serializer porque el valor
    # acaba en el CSS de la tabla. Aquí no hay color por status que sobreescribir
    # —las filas de Vacios no se pintan solas—, así que NULL devuelve la fila al
    # fondo normal. Columna real en la migracion 0048 (tabla managed=False).
    color = models.CharField(max_length=7, null=True, blank=True)

    # ── Auditoría (quién/cuándo) ──
    created_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    def __str__(self):
        return str(self.contenedor) if self.contenedor else "Vacio sin contenedor"

    class Meta:
        managed = False
        db_table = 'vacios'

class Patio(models.Model):
    nombre = models.CharField(max_length=100)

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Empleado(models.Model):
    nombre_trabajador = models.CharField(max_length=255)
    fecha_ingreso = models.CharField(max_length=50, null=True, blank=True)
    nss = models.CharField(max_length=255, null=True, blank=True)
    cargo = models.CharField(max_length=255, null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self):
        return self.nombre_trabajador

    class Meta:
        managed = False  # Usa tu propia tabla de pgAdmin
        db_table = 'empleados'
        ordering = ['id']


class Cliente(models.Model):
    nombre_cliente = models.CharField(max_length=255)
    domicilio = models.TextField(blank=True, default='')
    colonia = models.CharField(max_length=255, blank=True, default='')
    ciudad = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        managed = True
        ordering = ['nombre_cliente']

    def __str__(self):
        return self.nombre_cliente


class Folio(models.Model):
    MANZANILLO = 'manzanillo'
    LAZARO     = 'lazaro'
    TABLA_CHOICES = [
        (MANZANILLO, 'Folios Manzanillo'),
        (LAZARO,     'Folios Lázaro C'),
    ]

    tabla      = models.CharField(max_length=20, choices=TABLA_CHOICES, db_index=True)
    numero     = models.IntegerField()
    letra      = models.CharField(max_length=1)
    codigo     = models.CharField(max_length=30, unique=True)
    asignacion = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        managed  = True
        ordering = ['tabla', 'numero']
        constraints = [
            models.UniqueConstraint(fields=['tabla', 'numero'], name='uniq_folio_tabla_numero'),
        ]

    def __str__(self):
        return self.codigo


# Ciclo de 14 letras "FRABA"+"CONTAINER". Cada lote de AÑADIR FOLIOS reinicia
# siempre en F (confirmado con el usuario) — el índice dentro del lote define
# la letra, no numero % 14.
LETRAS_CICLO = ['F', 'R', 'A', 'B', 'A', 'C', 'O', 'N', 'T', 'A', 'I', 'N', 'E', 'R']
BATCH_SIZE   = len(LETRAS_CICLO)  # 14

START_NUMERO = {Folio.MANZANILLO: 2279, Folio.LAZARO: 323}
FORMATO_CODIGO = {
    Folio.MANZANILLO: '{letra}-{numero}',
    Folio.LAZARO:     '{letra}-LCR-{numero}',
}

# ponytail: sin campos de auditoría (created_by/updated_by). El único dato
# editable es `asignacion` y no hay borrado en la UI; se añaden con el mismo
# bloque de 4 líneas de Maniobra/Gasto/Vacio si algún día hace falta.


class Origen(models.Model):
    ciudad = models.CharField(max_length=255)

    class Meta:
        managed = True
        ordering = ['ciudad']

    def __str__(self):
        return self.ciudad


class Destino(models.Model):
    ciudad = models.CharField(max_length=255)

    class Meta:
        managed = True
        ordering = ['ciudad']

    def __str__(self):
        return self.ciudad


class FotoRegistro(models.Model):
    TIPO_CHOICES = [
        ('maniobra', 'Maniobra'),
        ('vacio', 'Vacío'),
    ]
    tipo        = models.CharField(max_length=20, choices=TIPO_CHOICES)
    registro_id = models.IntegerField()
    foto_1      = models.BinaryField(null=True, blank=True)
    foto_1_mime = models.CharField(max_length=30, null=True, blank=True)
    foto_2      = models.BinaryField(null=True, blank=True)
    foto_2_mime = models.CharField(max_length=30, null=True, blank=True)

    class Meta:
        managed = True
        unique_together = [('tipo', 'registro_id')]

    def __str__(self):
        return f"Fotos {self.tipo} #{self.registro_id}"


class MovimientoLocal(models.Model):
    PENDIENTE = 'pendiente'
    PAGADO    = 'pagado'
    STATUS_CHOICES = [
        (PENDIENTE, 'Pendiente'),
        (PAGADO,    'Pagado'),
    ]

    fecha      = models.DateField(null=True, blank=True)
    operador   = models.CharField(max_length=255, null=True, blank=True)
    movimiento = models.CharField(max_length=500, null=True, blank=True)
    unidad     = models.CharField(max_length=255, null=True, blank=True)
    contenedor = models.CharField(max_length=255, null=True, blank=True)
    status     = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=PENDIENTE,
        db_index=True,
    )

    # ── Auditoría (quién/cuándo) ──
    created_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_by = models.CharField(max_length=150, null=True, blank=True, editable=False)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        managed  = True
        ordering = ['-id']

    def __str__(self):
        return f"Movimiento #{self.id} - {self.operador or 's/operador'}"


class Transportista(models.Model):
    nombre = models.CharField(max_length=255, unique=True)

    class Meta:
        managed  = True
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Cargo(models.Model):
    nombre = models.CharField(max_length=255, unique=True)

    class Meta:
        managed  = True
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class UnidadTercero(models.Model):
    """Placas de una unidad de transportista tercero, con el transportista
    (por nombre) asignado — mismo patrón que Maniobra.transportista."""
    placas        = models.CharField(max_length=255)
    transportista = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        managed  = True
        ordering = ['placas']

    def __str__(self):
        return self.placas


class OperadorTercero(models.Model):
    """Operador (chofer) de un transportista tercero, con el transportista
    (por nombre) asignado."""
    nombre        = models.CharField(max_length=255)
    transportista = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        managed  = True
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class CostoExtra(models.Model):
    """Catálogo de conceptos de costo extra (Finanzas → Costos extra).

    `costo` es Decimal y no CharField como el `peso` de Maniobra: aquí Sí se
    suman importes en BD (el reporte por folio que vendrá después), y sumar
    texto obliga a castear en cada consulta. MinValueValidator(0) lo aplica DRF
    solo, sin escribir validación en el serializer.
    """
    movimiento = models.CharField(max_length=255)
    costo      = models.DecimalField(
        max_digits=10, decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
    )

    class Meta:
        managed  = True
        ordering = ['id']

    def __str__(self):
        return f"{self.movimiento} (${self.costo})"


class ManiobraCostoExtra(models.Model):
    """Un costo extra seleccionado en una maniobra, con la tarifa CONGELADA.

    `movimiento` y `costo` se copian del catálogo al seleccionar y no vuelven a
    tocarse: subir la tarifa de "Grúa" de 500 a 600 no debe reescribir lo que
    costó un servicio de agosto. Por eso hay columnas propias aquí y no un
    simple JOIN al catálogo (decisión del usuario, 2026-08-20).

    Tabla de enlace y no una columna JSON en `maniobras` porque el reporte que
    vendrá después ("recuperarlo con el folio") es un SUM sobre un JOIN, no un
    recorrido de arrays JSON.
    """
    # db_constraint=False en las dos FK por el mismo motivo que
    # DispositivoConfianza.usuario: `api` corre sin migraciones en la base de
    # test, donde las tablas managed=False (maniobras) no existen, y un
    # constraint contra ellas rompería la creación de la BD de pruebas.
    # El CASCADE del ORM sigue actuando en los borrados por Django.
    maniobra = models.ForeignKey(
        Maniobra, on_delete=models.CASCADE,
        related_name='costos_extra_links', db_constraint=False,
    )
    # SET_NULL y no CASCADE/PROTECT: si el admin borra el concepto del catálogo,
    # lo que ya se cobró en una maniobra no puede evaporarse (CASCADE) ni dejar
    # el catálogo imborrable (PROTECT). El enlace sobrevive huérfano con su
    # importe congelado; solo deja de ofrecerse para nuevas selecciones.
    costo_extra = models.ForeignKey(
        CostoExtra, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', db_constraint=False,
    )
    movimiento = models.CharField(max_length=255)
    costo      = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        managed  = True
        ordering = ['id']
        constraints = [
            # Un mismo concepto no puede estar dos veces en la misma maniobra.
            # Postgres permite varios NULL aquí, así que los enlaces huérfanos
            # (costo_extra borrado del catálogo) no chocan entre sí.
            models.UniqueConstraint(
                fields=['maniobra', 'costo_extra'],
                name='uniq_maniobra_costo_extra',
            ),
        ]

    def __str__(self):
        return f"Maniobra #{self.maniobra_id} · {self.movimiento} (${self.costo})"


class Pendiente(models.Model):
    """Una línea de la lista de pendientes de un tablero.

    Cinco tableros fijos con nombre de persona, compartidos por toda la empresa:
    no hay noción de dueño ni de usuario, todos ven y marcan lo mismo. Van como
    `choices` y no como tabla de catálogo porque son cinco valores que no cambian
    — una tabla, su ABM y su pantalla serían andamiaje para nada. Añadir un sexto
    tablero es una línea aquí y otra en PendientesPage.jsx.

    Se borran a mano, con el botón de la lista, y NO caducan solos: el borrado
    lo puede hacer cualquier usuario autenticado (decidido con el usuario el
    2026-08-25).
    """
    TABLERO_CHOICES = [
        ('ali',     'Ali'),
        ('enrique', 'Enrique'),
        ('mari',    'Mari'),
        ('shell',   'Shell'),
        ('edson',   'Edson'),
    ]
    # Con `choices`, DRF rechaza solo cualquier otro tablero con un 400: no hace
    # falta escribir la validación.
    tablero   = models.CharField(max_length=20, choices=TABLERO_CHOICES, db_index=True)
    texto     = models.CharField(max_length=500)
    hecho     = models.BooleanField(default=False)
    # db_index: cada listado filtra y barre por esta columna.
    creado_en = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        managed  = True
        # Ascendente = orden de creación: el primero arriba, el último abajo.
        ordering = ['id']

    def __str__(self):
        return f"[{self.tablero}] {self.texto[:40]}"


# ── 9.1 fase 3: dispositivo de confianza ────────────────────────────────────
DIAS_CONFIANZA = 14  # decisión 5: ventana ABSOLUTA, no desliza.


def _caducidad_por_defecto():
    # Encapsulado aquí para que ningún sitio que cree un dispositivo pueda
    # equivocarse con la ventana. Se fija al ALTA y no se toca después.
    return timezone.now() + timedelta(days=DIAS_CONFIANZA)


class DispositivoConfianza(models.Model):
    """Equipo marcado como de confianza: salta el segundo factor (no la
    contraseña) durante 14 días absolutos desde el alta.

    La cookie lleva el token EN CLARO; aquí solo vive su hash SHA-256. Un
    vistazo a esta tabla —o un backup filtrado— no permite entrar en ningún
    sitio, porque del hash no se recupera el token. Es la misma razón por la
    que la cookie es httpOnly: esta credencial salta el MFA y no puede quedar
    al alcance de un XSS (ver tarea 9.3).

    Revocar es un UPDATE de `revocado_en`, no un DELETE: el proyecto reserva el
    DELETE para el admin (decisión A1) y esto encaja en los permisos que el rol
    estándar ya tiene, dejando además rastro de auditoría.
    """
    usuario         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='dispositivos_confianza',
        # Sin constraint de FK a nivel de BD. `api` corre sin migraciones en la
        # base de test (las managed=False no se pueden crear ahí), y entonces sus
        # tablas se crean por syncdb ANTES que auth_user, así que un constraint a
        # auth_user rompería la creación de la BD de test. El cascade del ORM
        # sigue actuando en los borrados por Django; un huérfano solo sería
        # posible por un DELETE en SQL crudo, y sería inerte (buscar_vigente
        # exige que el usuario coincida). Ver config/settings_test.py.
        db_constraint=False,
    )
    token_hash      = models.CharField(max_length=64, unique=True)  # SHA-256 hex
    etiqueta        = models.CharField(max_length=120, blank=True, default='')
    ip_alta         = models.GenericIPAddressField(null=True, blank=True)
    user_agent_alta = models.CharField(max_length=400, blank=True, default='')
    creado_en       = models.DateTimeField(auto_now_add=True)
    expira_en       = models.DateTimeField(default=_caducidad_por_defecto)
    revocado_en     = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed  = True
        ordering = ['-creado_en']

    def __str__(self):
        cad = self.expira_en.strftime('%Y-%m-%d') if self.expira_en else '?'
        return f"{self.usuario} · {self.etiqueta or 'equipo'} (expira {cad})"

    @property
    def vigente(self):
        return self.revocado_en is None and self.expira_en > timezone.now()

    @classmethod
    def buscar_vigente(cls, usuario, token_hash):
        """Ruta crítica: el dispositivo que permite saltar el MFA. Tiene que
        ser del usuario, no estar revocado y no haber caducado. Devuelve None
        si falla cualquiera — nunca lanza."""
        if not token_hash:
            return None
        return (
            cls.objects
            .filter(
                usuario=usuario,
                token_hash=token_hash,
                revocado_en__isnull=True,
                expira_en__gt=timezone.now(),
            )
            .first()
        )


# Dos bolitas por unidad: la 1 es la VERDE (día en que sale) y la 2 la ROJA
# (día en que vuelve). El CHECK de TorreControl ya admitía las dos, así que
# pasar de 1 a 2 no tocó el esquema — para eso estaba.
#
# El frontend tiene su propia copia en src/utils/torreControl.mjs: son dos
# repositorios distintos y un valor que cambia una vez en la vida no justifica
# un endpoint de configuración. Si se cambia aquí, cambiar allí.
BOLITAS_POR_UNIDAD = 2

INDICE_INICIO = 1   # bolita verde
INDICE_FIN    = 2   # bolita roja


class TorreControl(models.Model):
    """Una bolita ocupada del tablero de la torre de control.

    Una fila es una unidad ocupada, pegada a un día del calendario. Sin fila, la
    unidad está libre. No hay columna `ocupada` que pueda contradecir al tablero:
    colocar o mover una bolita es un UPDATE de `fecha` y liberarla es borrar la
    fila, así que los dos estados no pueden desincronizarse.

    La ocupación NO caduca. Nada la libera al cambiar de día ni de mes: se queda
    donde la dejaron hasta que alguien arrastre la bolita a UNIDADES LIBRES. Lo
    que quedó en un mes pasado lo delata el aviso del frontend, que lo deriva de
    `fecha` — por eso aquí no hace falta ninguna columna de estado ni de caducidad.
    """
    # db_constraint=False por el mismo motivo que ManiobraCostoExtra.maniobra:
    # `api` corre sin migraciones en la base de test, donde las tablas
    # managed=False (tractos) no existen, y un constraint contra ellas rompería
    # la creación de la BD de pruebas. El CASCADE del ORM sigue actuando.
    tracto = models.ForeignKey(
        Tracto, on_delete=models.CASCADE,
        related_name='bolitas', db_constraint=False,
    )
    # 1 hoy, 2 cuando se suba BOLITAS_POR_UNIDAD. El CHECK deja el esquema listo
    # para las dos; quien decide cuántas se pintan es la constante, no la base.
    indice = models.PositiveSmallIntegerField(default=1)
    fecha  = models.DateField()

    class Meta:
        managed  = True
        ordering = ['id']
        constraints = [
            # "Una bolita por unidad" vive aquí y no en el código: dos peticiones
            # simultáneas no pueden colar una bolita duplicada.
            models.UniqueConstraint(
                fields=['tracto', 'indice'],
                name='uniq_torre_control_tracto_indice',
            ),
            # De paso acota la tabla a nº de tractos × 2 filas: nadie puede
            # inflarla mandando índices arbitrarios.
            models.CheckConstraint(
                condition=models.Q(indice__gte=1, indice__lte=2),
                name='torre_control_indice_1_o_2',
            ),
        ]

    def __str__(self):
        return f"{self.tracto.no_eco}#{self.indice} → {self.fecha}"


class TorreFolio(models.Model):
    """El folio de la maniobra que está haciendo una unidad, puesto a mano.

    Es el ÚNICO vínculo entre la torre y Maniobras. Se descartó cruzar por las
    placas y por `ruta_inicio`/`ruta_fin`: esas columnas hoy están vacías y el
    tablero no puede depender de un hábito que todavía no existe. El folio, en
    cambio, ya se captura siempre.

    No guarda nada de la maniobra —ni cliente, ni destino, ni fechas—. Todo eso
    se lee del folio cada vez, así que editar la maniobra se refleja aquí solo y
    no hay dos copias que puedan contradecirse.
    """
    # OneToOne y no FK: un Eco lleva un folio a la vez. La unicidad la pone la
    # base, no el codigo, asi que dos peticiones simultaneas no pueden colar dos.
    # db_constraint=False por lo mismo que TorreControl.tracto: `tractos` es
    # managed=False y no existe en la base de pruebas.
    tracto = models.OneToOneField(
        Tracto, on_delete=models.CASCADE,
        related_name='folio_torre', db_constraint=False,
    )
    # unique: al asignar un folio a un Eco queda bloqueado para los demas
    # (decision del usuario, 2026-08-21). Un folio es una maniobra y la maniobra
    # ya tiene su unidad: repetirlo es un error de dedo, no un caso de uso.
    folio = models.CharField(max_length=100, unique=True)

    class Meta:
        managed  = True
        ordering = ['id']

    def __str__(self):
        return f"{self.tracto.no_eco} → folio {self.folio}"


# ── Reporte de viaje (coordinadores) ─────────────────────────────────────────
# El formato en papel que llena el coordinador por cada viaje. Ver
# docs/planes/PLAN_REPORTE_COORDINADORES.md (rama main) y la plantilla
# api/documentos/templates/REPORTE COORDINADORES.xlsx.

class ReporteViaje(models.Model):
    """Un reporte de viaje. Uno por folio.

    Al revés que TorreFolio —que lee la maniobra en vivo y nunca copia—, aquí lo
    que viene del folio se COPIA al crear el reporte y desde ese momento vive
    aquí. El motivo es que el reporte se FIRMA: si leyera en vivo y alguien
    corrigiera la maniobra la semana siguiente, el papel firmado y la pantalla
    dejarían de decir lo mismo, y el que vale es el papel. Un reporte es una foto
    de lo que pasó, no una vista de lo que hay.

    Los Sí/No van como BooleanField(null=True) y no con default=False: "todavía
    no contestado" no es "No", y este formato se llena por etapas a lo largo de
    varios días. Ese null es además lo que deja el "SI / NO" impreso intacto en
    el Excel, para rodearlo a mano.

    Sin columnas calculadas: KM TOTALES, RENDIMIENTO y el TOTAL de cada carga
    salen del serializer. Guardar un dato al lado de sus operandos es garantizar
    que algún día se contradigan.
    """
    RECOLECCION_CHOICES = [
        ('propio',  'Propio'),
        ('tercero', 'Tercero'),
    ]

    # unique: la regla "un reporte por folio" la pone la base y no el código, así
    # que dos peticiones simultáneas no pueden colar dos. Sin db_index aparte:
    # unique ya crea el suyo.
    folio       = models.CharField(max_length=100, unique=True)
    fecha       = models.DateField(null=True, blank=True)
    coordinador = models.CharField(max_length=255, blank=True, default='')

    # ── Identificación. Lo marcado ← lo precarga el folio, pero es editable ──
    servicio    = models.CharField(max_length=20, blank=True, default='')   # ← tipo_servicio
    cliente     = models.CharField(max_length=255, blank=True, default='')  # ←
    recoleccion = models.CharField(max_length=10, choices=RECOLECCION_CHOICES,
                                   blank=True, default='')
    origen      = models.CharField(max_length=100, blank=True, default='')  # ←
    destino     = models.CharField(max_length=100, blank=True, default='')  # ←
    operador    = models.CharField(max_length=255, blank=True, default='')  # ←

    cita           = models.DateTimeField(null=True, blank=True)
    salida_puerto  = models.DateTimeField(null=True, blank=True)
    inicio_pactado = models.DateTimeField(null=True, blank=True)  # ← ruta_inicio
    salida_real    = models.DateTimeField(null=True, blank=True)

    # ── Información del viaje ──
    unidad          = models.CharField(max_length=100, blank=True, default='')  # ←
    remolque_1      = models.CharField(max_length=255, blank=True, default='')  # ←
    remolque_2      = models.CharField(max_length=255, blank=True, default='')  # ←
    km_inicial      = models.PositiveIntegerField(null=True, blank=True)
    km_final        = models.PositiveIntegerField(null=True, blank=True)
    llegada_cliente = models.DateTimeField(null=True, blank=True)
    descarga        = models.DateTimeField(null=True, blank=True)

    # ── En trayecto. Las 5 cargas de combustible viven en CargaCombustible ──
    litros_aceite    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    precio_aceite    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reparacion       = models.BooleanField(null=True)
    reparacion_que   = models.CharField(max_length=255, blank=True, default='')
    reparacion_costo = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    rescate          = models.BooleanField(null=True)
    rescate_unidad   = models.CharField(max_length=100, blank=True, default='')
    rescate_operador = models.CharField(max_length=255, blank=True, default='')

    # ── Regreso ──
    llegada_manzanillo = models.DateTimeField(null=True, blank=True)  # ← ruta_fin
    maniobra_vacio     = models.BooleanField(null=True)
    # Cita y patio van SEPARADOS aunque en el papel compartan renglón
    # (confirmado con el usuario, 2026-08-24).
    patio_entrega  = models.CharField(max_length=100, blank=True, default='')
    cita_vacio     = models.DateTimeField(null=True, blank=True)
    unidad_vacio   = models.CharField(max_length=100, blank=True, default='')
    operador_vacio = models.CharField(max_length=255, blank=True, default='')
    estadias       = models.BooleanField(null=True)
    estadias_horas = models.PositiveSmallIntegerField(null=True, blank=True)

    comentarios = models.TextField(blank=True, default='')

    # ── El rendimiento SÍ se guarda ──────────────────────────────────────
    # Es la excepción a la regla de no guardar calculados, y es a propósito: los
    # informes que vendrán después necesitan agregar rendimientos de muchos
    # viajes, y recalcularlos en cada consulta obligaría a arrastrar las cargas
    # de combustible de cada reporte (decisión del usuario, 2026-08-24).
    #
    # El riesgo asumido es el de siempre con un calculado guardado: si alguien
    # corrige el kilometraje, la cifra vieja se queda. Se acota recalculando en
    # CADA escritura —nadie escribe este campo a mano, es read_only en el
    # serializer— y el usuario planea cerrar el resto con permisos por rol.
    #
    # max_digits=6: hasta 9999.99 km/lt. Un camión real anda por 2-4.
    rendimiento = models.DecimalField(max_digits=6, decimal_places=2,
                                      null=True, blank=True, editable=False)

    creado_en      = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        managed  = True
        ordering = ['-id']

    def __str__(self):
        return f"Reporte de viaje {self.folio}"

    # ── Los cálculos viven aquí, no en el serializer ─────────────────────
    # Así el recálculo al guardar y lo que se sirve por la API salen del MISMO
    # sitio: dos copias de esta división acabarían dando cifras distintas.
    def km_totales(self):
        if self.km_inicial is None or self.km_final is None:
            return None
        return self.km_final - self.km_inicial

    def calcular_rendimiento(self):
        """Kilómetros por litro de diésel del viaje entero. None si falta algo.

        Se suman los litros de las cinco cargas: el rendimiento es de todo el
        diésel cargado, no del de una parada. La urea no cuenta — no es
        combustible de tracción y el papel tampoco la mete en el cálculo.
        """
        km = self.km_totales()
        # .exclude() y no .all(): el ViewSet trae el reporte con prefetch_related
        # ('cargas'), y sobre un prefetch, .all() devuelve la CACHÉ — o sea las
        # cargas de antes de la escritura. Con eso, añadir un renglón dejaba el
        # rendimiento con el valor viejo, sin fallar. Cualquier método distinto
        # de .all() construye una consulta nueva y lee lo que hay ahora.
        litros = (self.cargas.exclude(litros_diesel__isnull=True)
                      .aggregate(total=models.Sum('litros_diesel'))['total']
                  or Decimal('0'))
        if km is None or not litros:
            return None
        return (Decimal(km) / litros).quantize(Decimal('0.01'),
                                               rounding=ROUND_HALF_UP)

    def total_diesel(self):
        """Lo que costo el diesel del viaje: suma de litros x precio de las cinco
        cargas. None si ninguna tiene los dos datos — no es lo mismo que cero.

        Cuenta solo el diesel. La urea tiene su propio total en el papel y no es
        combustible de traccion.
        """
        total = Decimal('0')
        for carga in self.cargas.exclude(litros_diesel__isnull=True).exclude(
                precio_litro__isnull=True):
            total += carga.litros_diesel * carga.precio_litro
        if not total:
            return None
        return total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def volcar_diesel_al_gasto(self, usuario=''):
        """Escribe el costo del diesel en el gasto del folio. Devuelve si escribio.

        El reporte es el dueno de esa cifra: trae el detalle por parada, y como se
        captura por etapas tiene que poder pisar lo que hubiera — si respetara lo
        anterior, la primera carga fijaria el valor y las cuatro siguientes nunca
        llegarian al gasto. El campo sigue siendo editable a mano en Gastos
        (decision del usuario, 2026-08-24): lo que se escriba ahi aguanta hasta
        que alguien vuelva a guardar el reporte.

        Si no hay gasto no se crea ninguno: los folios antiguos son manuales y los
        viajes de terceros no llevan gasto. El reporte se guarda igual.
        """
        total = self.total_diesel()
        if total is None:
            return False
        # El folio puede estar en cualquiera de las dos columnas: un Full
        # repartido gasta un folio por operador. Mismo criterio que la torre.
        maniobra = Maniobra.objects.filter(
            models.Q(folio=self.folio) | models.Q(folio_2=self.folio)).first()
        if maniobra is None:
            return False
        gasto = Gasto.objects.filter(maniobra=maniobra).first()
        if gasto is None or gasto.gasto_diesel == total:
            return False
        gasto.gasto_diesel = total
        if usuario:
            gasto.updated_by = usuario
        # save() completo y no update(): gastos_totales se recalcula en
        # Gasto.save(), asi que un UPDATE directo dejaria el total desfasado.
        gasto.save()
        return True

    def refrescar_rendimiento(self):
        """Recalcula y guarda. Va DESPUÉS de escribir las cargas: en un alta las
        filas hijas todavía no existen cuando se guarda el reporte."""
        nuevo = self.calcular_rendimiento()
        if nuevo != self.rendimiento:
            self.rendimiento = nuevo
            self.save(update_fields=['rendimiento', 'actualizado_en'])


# Los renglones que caben en la plantilla del Excel: fila 12 = orden 1, y la 17
# ya es el aceite. NO es el máximo de cargas de un reporte — en pantalla se
# pueden añadir las que hagan falta y todas cuentan para el total del diésel y
# el rendimiento; simplemente, de la sexta en adelante no salen impresas.
CARGAS_EN_EL_PAPEL = 5


class CargaCombustible(models.Model):
    """Un renglón del bloque EN TRAYECTO: el diésel y la urea de una parada.

    Tabla hija y no 20 columnas `litros_diesel_1..5` dentro de ReporteViaje: son
    5 "de momento" (usuario, 2026-08-24), y operador_2 / remolque_3 / remolque_4
    ya enseñaron adónde lleva numerar columnas. Un sexto renglón aquí es una fila
    — y desde el 2026-08-25 se pueden añadir desde la pantalla, sin tope.

    `total_urea` se captura, no se calcula: el papel trae PRECIO X LITRO solo
    para el diésel, así que el total de la urea no es derivable de lo que hay.
    """
    reporte = models.ForeignKey(ReporteViaje, on_delete=models.CASCADE,
                                related_name='cargas')
    orden   = models.PositiveSmallIntegerField()

    litros_diesel = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    precio_litro  = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    litros_urea   = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_urea    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        managed  = True
        ordering = ['orden']
        constraints = [
            models.UniqueConstraint(fields=['reporte', 'orden'],
                                    name='uniq_carga_reporte_orden'),
            # Sin tope superior (decidido con el usuario el 2026-08-25): la
            # pantalla ya deja añadir renglones, así que un orden alto no puede
            # quedarse invisible. Se conserva el mínimo: un orden 0 o negativo
            # no es un renglón, y `ordering` lo colaría delante del primero.
            models.CheckConstraint(
                condition=models.Q(orden__gte=1),
                name='carga_orden_en_rango',
            ),
        ]

    def __str__(self):
        return f"{self.reporte.folio} · carga {self.orden}"
