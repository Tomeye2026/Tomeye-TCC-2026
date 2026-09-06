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


// ==========================================
// UNIT - IDENTIFICAÇÃO DOS PLANOS
// ==========================================

test('UNIT-001 - Plano 1 deve ser Gratuito', () => {
  assert.equal(contexto._getPlano(1).nome, 'Gratuito');
});

test('UNIT-002 - Plano 2 deve ser Básico', () => {
  assert.equal(contexto._getPlano(2).nome, 'Básico');
});

test('UNIT-003 - Plano 3 deve ser Premium', () => {
  assert.equal(contexto._getPlano(3).nome, 'Premium');
});

test('UNIT-004 - Plano 4 deve ser Empresarial', () => {
  assert.equal(contexto._getPlano(4).nome, 'Empresarial');
});


// ==========================================
// UNIT - PLANOS INVÁLIDOS
// ==========================================

test('UNIT-005 - Plano inexistente deve retornar Gratuito', () => {
  assert.equal(contexto._getPlano(999).nome, 'Gratuito');
});

test('UNIT-006 - Plano null deve retornar Gratuito', () => {
  assert.equal(contexto._getPlano(null).nome, 'Gratuito');
});

test('UNIT-007 - Plano undefined deve retornar Gratuito', () => {
  assert.equal(contexto._getPlano(undefined).nome, 'Gratuito');
});


// ==========================================
// UNIT - LIMITE DE ANÁLISES
// ==========================================

test('UNIT-008 - Plano Gratuito deve permitir 3 análises', () => {
  assert.equal(contexto._getPlano(1).limite_analises, 3);
});

test('UNIT-009 - Plano Básico deve permitir 15 análises', () => {
  assert.equal(contexto._getPlano(2).limite_analises, 15);
});

test('UNIT-010 - Plano Premium deve possuir análises ilimitadas', () => {
  assert.equal(contexto._getPlano(3).limite_analises, Infinity);
});

test('UNIT-011 - Plano Empresarial deve possuir análises ilimitadas', () => {
  assert.equal(contexto._getPlano(4).limite_analises, Infinity);
});


// ==========================================
// UNIT - PREÇOS
// ==========================================

test('UNIT-012 - Plano Gratuito deve custar R$ 0 por mês', () => {
  assert.equal(contexto._getPlano(1).preco_mensal, 0);
});

test('UNIT-013 - Plano Básico deve custar R$ 60 por mês', () => {
  assert.equal(contexto._getPlano(2).preco_mensal, 60);
});

test('UNIT-014 - Plano Premium deve custar R$ 100 por mês', () => {
  assert.equal(contexto._getPlano(3).preco_mensal, 100);
});

test('UNIT-015 - Plano Empresarial deve custar R$ 1000 por mês', () => {
  assert.equal(contexto._getPlano(4).preco_mensal, 1000);
});


// ==========================================
// UNIT - FUNCIONÁRIOS
// ==========================================

test('UNIT-016 - Plano Gratuito não deve permitir funcionários', () => {
  assert.equal(contexto._getPlano(1).max_funcionarios, 0);
});

test('UNIT-017 - Plano Básico não deve permitir funcionários', () => {
  assert.equal(contexto._getPlano(2).max_funcionarios, 0);
});

test('UNIT-018 - Plano Premium deve permitir até 3 funcionários', () => {
  assert.equal(contexto._getPlano(3).max_funcionarios, 3);
});

test('UNIT-019 - Plano Empresarial deve permitir até 8 funcionários', () => {
  assert.equal(contexto._getPlano(4).max_funcionarios, 8);
});


// ==========================================
// UNIT - FAZENDAS
// ==========================================

test('UNIT-020 - Plano Gratuito não deve permitir fazendas', () => {
  assert.equal(contexto._getPlano(1).max_fazendas, 0);
});

test('UNIT-021 - Plano Básico não deve permitir fazendas', () => {
  assert.equal(contexto._getPlano(2).max_fazendas, 0);
});

test('UNIT-022 - Plano Premium deve permitir até 1 fazenda', () => {
  assert.equal(contexto._getPlano(3).max_fazendas, 1);
});

test('UNIT-023 - Plano Empresarial deve permitir até 2 fazendas', () => {
  assert.equal(contexto._getPlano(4).max_fazendas, 2);
});


// ==========================================
// UNIT - RECURSOS DOS PLANOS
// ==========================================

test('UNIT-024 - Plano Gratuito deve possuir análise básica', () => {
  assert.ok(
    contexto._getPlano(1).recursos.includes('analise_basica')
  );
});

test('UNIT-025 - Plano Gratuito deve possuir histórico limitado', () => {
  assert.ok(
    contexto._getPlano(1).recursos.includes('historico_limitado')
  );
});

test('UNIT-026 - Plano Básico deve possuir análise básica', () => {
  assert.ok(
    contexto._getPlano(2).recursos.includes('analise_basica')
  );
});

test('UNIT-027 - Plano Básico deve possuir histórico completo', () => {
  assert.ok(
    contexto._getPlano(2).recursos.includes('historico_completo')
  );
});

test('UNIT-028 - Plano Premium deve possuir funcionários', () => {
  assert.ok(
    contexto._getPlano(3).recursos.includes('funcionarios')
  );
});

test('UNIT-029 - Plano Premium deve possuir relatórios avançados', () => {
  assert.ok(
    contexto._getPlano(3).recursos.includes('relatorios_avancados')
  );
});

test('UNIT-030 - Plano Empresarial deve possuir suporte prioritário', () => {
  assert.ok(
    contexto._getPlano(4).recursos.includes('suporte_prioritario')
  );
});
