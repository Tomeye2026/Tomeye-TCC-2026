import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const codigo =
  readFileSync('./js/api.js', 'utf8') +
  '\nthis._resolverOwnerId = _resolverOwnerId; this.PlanosHelper = PlanosHelper; this._carregarSessao = _carregarSessao;';

test('RESOLVER OWNER ID - Funcionário herda empregador_id', async () => {
  const contexto = {
    console,
    setTimeout,
    clearTimeout,
    db: {
      collection(col) {
        return {
          doc(id) {
            return {
              async get() {
                if (col === 'usuarios' && id === 'func-123') {
                  return {
                    exists: true,
                    data: () => ({ tipo: 'funcionario', empregador_id: 'emp-456' })
                  };
                }
                if (col === 'usuarios' && id === 'prod-999') {
                  return {
                    exists: true,
                    data: () => ({ tipo: 'produtor' })
                  };
                }
                return { exists: false };
              }
            };
          }
        };
      }
    }
  };

  vm.createContext(contexto);
  vm.runInContext(codigo, contexto);

  const ownerFunc = await contexto._resolverOwnerId('func-123');
  assert.equal(ownerFunc, 'emp-456');

  const ownerProd = await contexto._resolverOwnerId('prod-999');
  assert.equal(ownerProd, 'prod-999');

  // Com cache de perfil
  const ownerCache = await contexto._resolverOwnerId('func-cache', { tipo: 'funcionario', empregador_id: 'boss-777' });
  assert.equal(ownerCache, 'boss-777');
});

test('PLANOS HELPER - getLimitesUsuario consulta limites do empregador para funcionario', async () => {
  let queriedUserId = null;
  const contexto = {
    console,
    setTimeout,
    clearTimeout,
    db: {
      collection(col) {
        return {
          doc(id) {
            return {
              async get() {
                if (col === 'usuarios' && id === 'func-1') {
                  return {
                    exists: true,
                    data: () => ({ tipo: 'funcionario', empregador_id: 'boss-1' })
                  };
                }
                return { exists: false };
              }
            };
          },
          where(field, op, val) {
            if (col === 'assinaturas' && field === 'usuario_id') {
              queriedUserId = val;
            }
            return {
              where() { return this; },
              limit() { return this; },
              async get() {
                if (col === 'assinaturas') {
                  return {
                    empty: false,
                    docs: [{
                      data: () => ({ usuario_id: val, plano_id: 3, analises_utilizadas: 5, status: 'ativa' })
                    }]
                  };
                }
                return { size: 1, docs: [] };
              }
            };
          }
        };
      }
    }
  };

  vm.createContext(contexto);
  vm.runInContext(codigo, contexto);

  const limites = await contexto.PlanosHelper.getLimitesUsuario('func-1');
  assert.equal(queriedUserId, 'boss-1', 'A consulta de assinatura no Firestore deve ser feita usando o boss-1 (ownerId)');
  assert.equal(limites.plano.nome, 'Premium');
  assert.equal(limites.analises_utilizadas, 5);
});
