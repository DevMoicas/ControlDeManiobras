from django.db import models
from django.core.validators import MinLengthValidator

class Tracto(models.Model):
    no_eco = models.CharField(max_length=255, unique=True)
    unidad = models.CharField(max_length=255)
    placas = models.CharField(max_length=255, unique=True, validators=[MinLengthValidator(7)])
    tipo = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.no_eco} - {self.placas}"

class Remolque(models.Model):
    color = models.CharField(max_length=255)
    tipo = models.CharField(max_length=255)
    placas = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.placas

class Chofer(models.Model):
    nombre = models.CharField(max_length=255)
    rfc = models.CharField(max_length=13, unique=True, validators=[MinLengthValidator(13)])
    licencia = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.nombre
