import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const codigo = readFileSync('./js/api.js', 'utf8') +
  '\nthis._getPlano = _getPlano; this.PLANOS = PLANOS;';

const contexto = {
  console,
  setTimeout,
  clearTimeout
};

vm.createContext(contexto);
vm.runInContext(codigo, contexto);

test('Plano 1 deve ser Gratuito', () => {
  assert.equal(contexto._getPlano(1).nome, 'Gratuito');
});

test('Plano 2 deve ser Básico', () => {
  assert.equal(contexto._getPlano(2).nome, 'Básico');
});

test('Plano 3 deve ser Premium', () => {
  assert.equal(contexto._getPlano(3).nome, 'Premium');
});

test('Plano inexistente deve retornar Gratuito', () => {
  assert.equal(contexto._getPlano(999).nome, 'Gratuito');
});

test('Plano Premium deve possuir análises ilimitadas', () => {
  assert.equal(contexto._getPlano(3).limite_analises, Infinity);
});
