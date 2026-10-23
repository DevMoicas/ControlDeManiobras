// node --test src/Login/mfa.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pasoSiguiente, ERROR_CREDS, ERROR_CODIGO } from './mfa.mjs';

test('falta el código: pasa al segundo paso, sin mensaje de error y sin contar intento', () => {
  assert.deepEqual(pasoSiguiente('mfa_requerida'), {
    pedirCodigo: true, error: '', cuentaIntento: false,
  });
});

test('código inválido: sigue en el segundo paso y sí cuenta como intento', () => {
  assert.deepEqual(pasoSiguiente('mfa_invalida'), {
    pedirCodigo: true, error: ERROR_CODIGO, cuentaIntento: true,
  });
});

test('sin codigo (contraseña mal): vuelve al primer paso con el mensaje genérico', () => {
  for (const c of [undefined, null, '', 'otra_cosa']) {
    assert.deepEqual(pasoSiguiente(c), {
      pedirCodigo: false, error: ERROR_CREDS, cuentaIntento: true,
    });
  }
});

test('el mensaje genérico nunca se usa cuando el backend pide el código', () => {
  // La regresión exacta del 2026-07-22.
  assert.notEqual(pasoSiguiente('mfa_requerida').error, ERROR_CREDS);
});
