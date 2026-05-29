from django.test import SimpleTestCase
from django.db import IntegrityError

from .utils import custom_exception_handler
from .Serializers import ManiobraSerializer

# Create your tests here.
class ErrorHandlingTests(SimpleTestCase):
	def test_integrity_error_reports_duplicate_field(self):
		exc = IntegrityError('duplicate key value violates unique constraint "maniobras_codigo_pis_key"\nDETAIL: Key (codigo_pis)=(ABC123) already exists.')

		response = custom_exception_handler(exc, context={})

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.data['detail']['codigo_pis'][0], 'Ya existe un registro con el valor "ABC123".')

	def test_serializer_reports_specific_codigo_pis_error(self):
		serializer = ManiobraSerializer(data={'codigo_pis': 'ABC 123'})

		self.assertFalse(serializer.is_valid())
		self.assertIn('codigo_pis', serializer.errors)
		self.assertEqual(str(serializer.errors['codigo_pis'][0]), 'Código PIS inválido.')
