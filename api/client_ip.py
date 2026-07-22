"""IP real del cliente detrás de los proxies de Azure.

Una sola función para todo: django-axes, el throttle de DRF y el log de
seguridad. Antes cada uno la resolvía a su manera y los tres estaban mal.

── Topología, MEDIDA en producción el 2026-07-22 (no supuesta) ──────────────
Con el App Service alcanzable solo a través de la Static Web App, la cadena es:

    X-Forwarded-For: [lo que inyecte el cliente...], <cliente>:puerto, <SWA>:puerto
                                                          ↑
                                                    posición -2

Los proxies AÑADEN por la derecha, así que todo lo que falsifique el cliente
queda a la izquierda: contando 2 desde el final es inalcanzable para él.

⚠️ Este número vale SOLO si la única entrada es la SWA. Por la ruta directa a
app-cdm-fraba.azurewebsites.net la cadena tiene un salto menos y la posición -2
cae justo en el valor del atacante. Por eso el cierre de esa ruta con
restricciones de IP y este módulo van juntos: uno sin el otro no sirve.

⚠️ Azure incluye el PUERTO de origen ("187.192.198.73:64197") y cambia en cada
conexión TCP. Sin recortarlo, cada conexión sería una identidad distinta y el
throttle no contaría nada.

Comprobación:  python Manage.py test api.test_client_ip
"""

# Saltos de confianza entre el cliente y Django. Medido, no estimado.
PROXIES_DE_CONFIANZA = 2


def _sin_puerto(valor: str) -> str:
    """Quita el puerto de origen. Soporta IPv6 en la forma [::1]:443."""
    valor = valor.strip()
    if valor.startswith("["):                 # IPv6 con puerto: [::1]:443
        cierre = valor.find("]")
        return valor[1:cierre] if cierre != -1 else valor
    if valor.count(":") == 1:                 # IPv4 con puerto: 1.2.3.4:5678
        return valor.split(":", 1)[0]
    return valor                              # IPv6 desnudo, o IPv4 sin puerto


def client_ip(request) -> str:
    """IP del cliente, o cadena vacía si no se puede determinar."""
    if request is None:
        return ""

    xff = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    partes = [p for p in (t.strip() for t in xff.split(",")) if p]

    # Menos saltos de los esperados = la petición no llegó por donde debía
    # (sonda interna, health check, o alguien saltándose la SWA). No se
    # adivina: se cae a REMOTE_ADDR, que no es falsificable aunque sea la IP
    # interna del front-end. Preferible a leer un valor del atacante.
    if len(partes) < PROXIES_DE_CONFIANZA:
        return request.META.get("REMOTE_ADDR", "")

    return _sin_puerto(partes[-PROXIES_DE_CONFIANZA])
