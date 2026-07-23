from django.contrib import admin
from django.utils import timezone

from .models import DispositivoConfianza
from .views import _cerrar_todas_las_sesiones


@admin.register(DispositivoConfianza)
class DispositivoConfianzaAdmin(admin.ModelAdmin):
    """Panel de recuperación (decisión 14): el admin ve y revoca los equipos de
    confianza de CUALQUIER usuario. Es lo que permite atender un móvil perdido
    sin esperar a que caduquen los 14 días."""

    list_display  = ('usuario', 'etiqueta', 'creado_en', 'expira_en',
                     'revocado_en', 'vigente')
    list_filter   = ('revocado_en', 'creado_en')
    search_fields = ('usuario__username', 'etiqueta')
    # Todo de solo lectura: son registros del sistema, no se editan a mano. El
    # alta ocurre al iniciar sesión con la casilla, nunca desde aquí.
    readonly_fields = ('usuario', 'token_hash', 'etiqueta', 'ip_alta',
                       'user_agent_alta', 'creado_en', 'expira_en', 'revocado_en')
    actions = ('revocar_y_cerrar_sesiones',)

    def has_add_permission(self, request):
        return False

    @admin.display(boolean=True, description='Vigente')
    def vigente(self, obj):
        return obj.vigente

    @admin.action(description='Revocar y cerrar todas las sesiones del usuario')
    def revocar_y_cerrar_sesiones(self, request, queryset):
        n = 0
        for disp in queryset.filter(revocado_en__isnull=True):
            disp.revocado_en = timezone.now()
            disp.save(update_fields=['revocado_en'])
            _cerrar_todas_las_sesiones(disp.usuario)
            n += 1
        self.message_user(request, f'{n} equipo(s) revocado(s) y sesiones cerradas.')
