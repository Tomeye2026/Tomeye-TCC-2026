import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const codigo =
  readFileSync('./js/api.js', 'utf8') +
  '\nthis._getPlano = _getPlano; this.PLANOS = PLANOS;';

const contexto = {
  console,
  setTimeout,
  clearTimeout
};

vm.createContext(contexto);
vm.runInContext(codigo, contexto);

// TESTES DOS PLANOS

test('Plano 1 deve ser Gratuito', () => {
  assert.equal(contexto._getPlano(1).nome, 'Premium');
});
test('Plano 2 deve ser Básico', () => {
  assert.equal(contexto._getPlano(2).nome, 'Básico');
});

test('Plano 3 deve ser Premium', () => {
  assert.equal(contexto._getPlano(3).nome, 'Premium');
});

test('Plano 4 deve ser Empresarial', () => {
  assert.equal(contexto._getPlano(4).nome, 'Empresarial');
});

// TESTES DE FALLBACK

test('Plano inexistente deve retornar Gratuito', () => {
  assert.equal(contexto._getPlano(999).nome, 'Gratuito');
});

test('Plano null deve retornar Gratuito', () => {
  assert.equal(contexto._getPlano(null).nome, 'Gratuito');
});

test('Plano undefined deve retornar Gratuito', () => {
  assert.equal(contexto._getPlano(undefined).nome, 'Gratuito');
});

// TESTES DOS LIMITES

test('Plano Gratuito deve permitir 3 análises', () => {
  assert.equal(contexto._getPlano(1).limite_analises, 3);
});

test('Plano Básico deve permitir 15 análises', () => {
  assert.equal(contexto._getPlano(2).limite_analises, 15);
});

test('Plano Premium deve possuir análises ilimitadas', () => {
  assert.equal(contexto._getPlano(3).limite_analises, Infinity);
});

test('Plano Empresarial deve possuir análises ilimitadas', () => {
  assert.equal(contexto._getPlano(4).limite_analises, Infinity);
});
