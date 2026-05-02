from django.db import models
from django.core.validators import MinLengthValidator

class Tracto(models.Model):
    no_eco = models.CharField(max_length=255, unique=True)
    unidad = models.CharField(max_length=255)
    anio = models.IntegerField()
    placas = models.CharField(max_length=255, unique=True, validators=[MinLengthValidator(6)])
    tipo = models.CharField(max_length=255)

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
    rfc = models.CharField(max_length=13, unique=True, validators=[MinLengthValidator(13)])
    licencia = models.CharField(max_length=255, unique=True)

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
    fecha_pis = models.CharField(max_length=50, null=True, blank=True)
    horario = models.CharField(max_length=50, null=True, blank=True)
    
    # Nuevos campos agregados
    tipo_y_peso = models.CharField(max_length=255, null=True, blank=True)
    contenedor = models.CharField(max_length=255, null=True, blank=True)
    pedimento = models.CharField(max_length=255, null=True, blank=True)
    cliente = models.CharField(max_length=100, null=True, blank=True)
    origen = models.CharField(max_length=100, null=True, blank=True)
    destino = models.CharField(max_length=100, null=True, blank=True)
    asignacion_operador_status = models.CharField(max_length=100, null=True, blank=True)

    #ultimos 7 campos agregados
    unidad = models.CharField(max_length=100, null=True, blank=True)
    folio = models.CharField(max_length=100, null=True, blank=True)
    vacio_patio = models.CharField(max_length=255, null=True, blank=True)
    status_vacio = models.CharField(max_length=100, null=True, blank=True)
    fecha_entrega_mercancia = models.CharField(max_length=50, null=True, blank=True)
    no_factura = models.CharField(max_length=100, null=True, blank=True)
    ccp = models.CharField(max_length=100, null=True, blank=True)

    STATUS_CHOICES = [
        ("activo",    "Activo / En viaje"),
        ("pendiente", "Pendiente"),
        ("quemada",   "Quemada"),
        ("por_salir", "Por salir"),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        null=True,
        blank=True,
        db_index=True,   # permite filtrar por status eficientemente en el futuro dashboard
    )

    

    def __str__(self):
        return f"{self.solicita} - {self.codigo_pis}"

    class Meta:
        managed = False  # Para que use tu tabla de pgAdmin
        db_table = 'maniobras'
        
class Gasto(models.Model):
    carta_porte = models.CharField(max_length=100, null=True, blank=True)

    fecha_entrega_mercancia = models.CharField(max_length=50, null=True, blank=True)

    casetas_ida = models.FloatField(null=True, blank=True)
    casetas_regreso = models.FloatField(null=True, blank=True)

    gastos_adicionales = models.FloatField(null=True, blank=True)

    entregado = models.FloatField(null=True, blank=True)

    gasto_tag = models.FloatField(null=True, blank=True)
    gasto_diesel = models.FloatField(null=True, blank=True)

    comision_operador = models.FloatField(null=True, blank=True)
    reparaciones = models.FloatField(null=True, blank=True)

    gastos_totales = models.FloatField(null=True, blank=True)

    facturado = models.CharField(max_length=50, null=True, blank=True)
    descripcion_gastos = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Carta Porte: {self.carta_porte}"

    class Meta:
        managed = False
        db_table = 'gastos'