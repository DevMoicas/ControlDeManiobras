from django.db import models
from django.core.validators import MinLengthValidator

class Tracto(models.Model):
    no_eco = models.CharField(max_length=255, unique=True)
    unidad = models.CharField(max_length=255)
    anio = models.IntegerField()
    placas = models.CharField(max_length=255, unique=True, validators=[MinLengthValidator(6)])
    tipo = models.CharField(max_length=255)
    tag = models.CharField(max_length=100, null=True, blank=True)
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
    fecha_pis = models.DateField(max_length=50, null=True, blank=True, db_index=True)
    horario = models.CharField(max_length=50, null=True, blank=True)
    
    # Nuevos campos agregados
    tipo_y_peso = models.CharField(max_length=255, null=True, blank=True)
    tipo = models.CharField(max_length=100, null=True, blank=True)
    # CharField (no DecimalField) para permitir dos pesos "23412 - 22000".
    # Los documentos los suman via _sumar_peso; no hay agregaciones numéricas en BD.
    peso = models.CharField(max_length=50, null=True, blank=True)
    contenedor = models.CharField(max_length=255, null=True, blank=True)
    referencia = models.CharField(max_length=255, null=True, blank=True)
    pedimento = models.CharField(max_length=255, null=True, blank=True)
    cliente = models.CharField(max_length=100, null=True, blank=True)
    origen = models.CharField(max_length=100, null=True, blank=True)
    destino = models.CharField(max_length=100, null=True, blank=True)
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
    no_factura = models.CharField(max_length=100, null=True, blank=True)
    ccp = models.CharField(max_length=100, null=True, blank=True)
    ruta_inicio = models.DateTimeField(null=True, blank=True)
    ruta_fin    = models.DateTimeField(null=True, blank=True)

    # Una maniobra puede tener hasta 2 status a la vez. Se guardan en este mismo
    # campo separados por coma, SIEMPRE en orden de prioridad descendente:
    #     por_salir > activo > quemada > pendiente
    # (mismo orden que PRIORITY_ORDER en el frontend, src/config/statusConfig.js).
    #
    # Ese orden canónico hace dos cosas gratis:
    #   1. El primer segmento antes de la coma es siempre el color que gana en la fila.
    #   2. Un combo mal ordenado ("quemada,activo") no está en la lista → DRF lo
    #      rechaza con 400 automáticamente, sin escribir validación.
    #
    # El combo más largo, "pendiente,por_salir", mide 19 caracteres: cabe en el
    # max_length=20 que ya tenía la columna, así que no hace falta tocar el esquema.
    STATUS_CHOICES = [
        ("activo",    "Activo / En viaje"),
        ("pendiente", "Pendiente"),
        ("quemada",   "Quemada"),
        ("por_salir", "Por salir"),
        # Combinaciones de 2 (orden canónico: mayor prioridad primero)
        ("por_salir,activo",    "Por salir + Activo"),
        ("por_salir,quemada",   "Por salir + Quemada"),
        ("por_salir,pendiente", "Por salir + Pendiente"),
        ("activo,quemada",      "Activo + Quemada"),
        ("activo,pendiente",    "Activo + Pendiente"),
        ("quemada,pendiente",   "Quemada + Pendiente"),
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
    patio = models.CharField(max_length=255, null=True, blank=True)
    fecha_maniobra = models.DateField(null=True, blank=True)
    fecha_entrega = models.DateField(null=True, blank=True)
    fecha_notificacion_cliente = models.CharField(max_length=50, null=True, blank=True)
    status = models.CharField(max_length=100, null=True, blank=True)
    operador = models.CharField(max_length=255, null=True, blank=True)
    cita = models.CharField(max_length=255, null=True, blank=True)
    cd = models.CharField(max_length=255, null=True, blank=True)

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