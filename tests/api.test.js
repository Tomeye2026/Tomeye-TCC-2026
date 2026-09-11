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


// ==========================================
// UNIT - DADOS FINANCEIROS & PONTO DE EQUILÍBRIO
// ==========================================

const codigoAdmin =
  readFileSync('./js/admin.js', 'utf8') +
  '\nthis.Admin = Admin;';

const contextoAdmin = {
  console,
  setTimeout,
  clearTimeout,
  document: {
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
  },
  window: {},
  location: { pathname: '' },
};

vm.createContext(contextoAdmin);
vm.runInContext(codigoAdmin, contextoAdmin);

test('UNIT-031 - Custo subtotal mensal deve ser R$ 21.718,33', () => {
  assert.equal(contextoAdmin.Admin.FINANCEIRO_PROJETO.subtotalMensal, 21718.33);
});

test('UNIT-032 - Custo subtotal anual deve ser R$ 260.619,96', () => {
  assert.equal(contextoAdmin.Admin.FINANCEIRO_PROJETO.subtotalAnual, 260619.96);
});

test('UNIT-033 - Reserva de contingência mensal (10%) deve ser R$ 2.171,83', () => {
  assert.equal(contextoAdmin.Admin.FINANCEIRO_PROJETO.contingenciaMensal, 2171.83);
});

test('UNIT-034 - Custo total estimado mensal deve ser R$ 23.890,16', () => {
  assert.equal(contextoAdmin.Admin.FINANCEIRO_PROJETO.custoMensalTotal, 23890.16);
});

test('UNIT-035 - Custo total estimado anual deve ser R$ 286.681,92', () => {
  assert.equal(contextoAdmin.Admin.FINANCEIRO_PROJETO.custoAnualTotal, 286681.92);
});

test('UNIT-036 - Soma dos 11 itens mensais deve igualar o subtotal', () => {
  const soma = contextoAdmin.Admin.FINANCEIRO_PROJETO.itens.reduce((s, item) => s + item.mensal, 0);
  assert.equal(parseFloat(soma.toFixed(2)), 21718.33);
});

test('UNIT-037 - Ponto de equilíbrio: Básico precisa de 399 assinantes', () => {
  const meta = Math.ceil(contextoAdmin.Admin.FINANCEIRO_PROJETO.custoMensalTotal / 60);
  assert.equal(meta, 399);
});

test('UNIT-038 - Ponto de equilíbrio: Premium precisa de 239 assinantes', () => {
  const meta = Math.ceil(contextoAdmin.Admin.FINANCEIRO_PROJETO.custoMensalTotal / 100);
  assert.equal(meta, 239);
});

test('UNIT-039 - Ponto de equilíbrio: Empresarial precisa de 24 assinantes', () => {
  const meta = Math.ceil(contextoAdmin.Admin.FINANCEIRO_PROJETO.custoMensalTotal / 1000);
  assert.equal(meta, 24);
});

test('UNIT-040 - Cenário Misto cobre 100% dos custos', () => {
  const receita = (15 * 1000) + (60 * 100) + (49 * 60);
  assert.ok(receita >= contextoAdmin.Admin.FINANCEIRO_PROJETO.custoMensalTotal);
});

