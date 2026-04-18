from django.db import models
from django.core.validators import MinLengthValidator

class Tracto(models.Model):
    no_eco = models.CharField(max_length=255, unique=True)
    unidad = models.CharField(max_length=255)
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
    tipo_peso = models.CharField(max_length=255, null=True, blank=True)
    contenedor = models.CharField(max_length=255, null=True, blank=True)
    pedimento = models.CharField(max_length=255, null=True, blank=True)
    cliente = models.CharField(max_length=255, null=True, blank=True)
    origen = models.CharField(max_length=255, null=True, blank=True)
    destino = models.CharField(max_length=255, null=True, blank=True)
    asignacion_operador = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.solicita} - {self.codigo_pis}"

    class Meta:
        managed = False  # Para que use tu tabla de pgAdmin
        db_table = 'maniobras'
