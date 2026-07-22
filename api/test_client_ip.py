"""Pruebas de api/client_ip.py.

Los valores de X-Forwarded-For no son inventados: salen de la sonda que se
desplegó en producción el 2026-07-22 (commit 7fd084b5).
"""
from django.test import SimpleTestCase, RequestFactory

from api.client_ip import client_ip, _sin_puerto

# Cadena real capturada vía SWA, con una IP falsificada inyectada por el cliente
XFF_REAL_CON_FALSIFICACION = "203.0.113.99, 187.192.198.73:64197, 13.69.116.11:29931"
# Cadena real capturada vía SWA sin falsificar
XFF_REAL_LIMPIA = "187.192.198.73:64175, 13.69.116.11:1454"

CLIENTE_REAL = "187.192.198.73"


class ClientIpTests(SimpleTestCase):
    def setUp(self):
        self.rf = RequestFactory()

    def _peticion(self, xff=None, remote="169.254.129.2"):
        extra = {"REMOTE_ADDR": remote}
        if xff is not None:
            extra["HTTP_X_FORWARDED_FOR"] = xff
        return self.rf.get("/api/maniobras/", **extra)

    def test_cadena_real_sin_falsificacion(self):
        self.assertEqual(client_ip(self._peticion(XFF_REAL_LIMPIA)), CLIENTE_REAL)

    def test_ignora_la_ip_falsificada_por_el_cliente(self):
        """El corazón del asunto: lo inyectado queda a la izquierda y no se lee."""
        self.assertEqual(client_ip(self._peticion(XFF_REAL_CON_FALSIFICACION)), CLIENTE_REAL)

    def test_no_se_deja_empujar_por_muchas_entradas_falsas(self):
        xff = "1.1.1.1, 2.2.2.2, 3.3.3.3, " + XFF_REAL_LIMPIA
        self.assertEqual(client_ip(self._peticion(xff)), CLIENTE_REAL)

    def test_recorta_el_puerto(self):
        """Sin esto cada conexión TCP sería una identidad nueva y el throttle
        no contaría nada, porque el puerto de origen cambia siempre."""
        self.assertEqual(client_ip(self._peticion(XFF_REAL_LIMPIA)), CLIENTE_REAL)
        self.assertNotIn(":", client_ip(self._peticion(XFF_REAL_LIMPIA)))

    def test_menos_saltos_de_los_esperados_cae_a_remote_addr(self):
        """Petición que no llegó por la SWA: no se adivina, se usa REMOTE_ADDR."""
        self.assertEqual(client_ip(self._peticion("9.9.9.9")), "169.254.129.2")

    def test_sin_cabecera_usa_remote_addr(self):
        self.assertEqual(client_ip(self._peticion()), "169.254.129.2")

    def test_request_nulo_no_revienta(self):
        self.assertEqual(client_ip(None), "")

    def test_ipv6_con_y_sin_puerto(self):
        self.assertEqual(_sin_puerto("[2001:db8::1]:443"), "2001:db8::1")
        self.assertEqual(_sin_puerto("2001:db8::1"), "2001:db8::1")
        self.assertEqual(_sin_puerto("1.2.3.4:5678"), "1.2.3.4")
        self.assertEqual(_sin_puerto("1.2.3.4"), "1.2.3.4")
