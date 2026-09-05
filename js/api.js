/**
 * Tomeye — api.js
 * Camada centralizada de comunicação com o Firebase (Firestore + Auth).
 * Todas as funções mantêm a mesma interface do mock anterior.
 * Depende de: firebase-config.js (deve ser carregado antes)
 */

// ============================================================
// PLANOS — dados fixos (regras oficiais do TomEye)
//
// IMPORTANTE: NÃO altere estes valores sem autorização.
// Eles refletem os planos de assinatura oficiais do sistema.
//
// Para análises ilimitadas usa-se Infinity.
// ============================================================
const PLANOS = [
  {
    id: 1, nome: 'Gratuito',
    descricao: '3 análises/mês e acesso aos recursos básicos.',
    preco_mensal: 0, preco_anual: 0,
    limite_analises: 3, max_funcionarios: 0, max_fazendas: 0,
    recursos: ['analise_basica', 'historico_limitado'],
  },
  {
    id: 2, nome: 'Básico',
    descricao: '15 análises/mês e acesso ao histórico completo.',
    preco_mensal: 60.00, preco_anual: 600.00,
    limite_analises: 15, max_funcionarios: 0, max_fazendas: 0,
    recursos: ['analise_basica', 'historico_completo'],
  },
  {
    id: 3, nome: 'Premium',
    descricao: 'Análises ilimitadas, até 1 fazenda e até 3 funcionários.',
    preco_mensal: 100.00, preco_anual: 1000.00,
    limite_analises: Infinity, max_funcionarios: 3, max_fazendas: 1,
    recursos: ['analise_basica', 'historico_completo', 'funcionarios', 'relatorios_avancados'],
  },
  {
    id: 4, nome: 'Empresarial',
    descricao: 'Análises ilimitadas, até 2 fazendas, até 8 funcionários e suporte prioritário.',
    preco_mensal: 1000.00, preco_anual: 10000.00,
    limite_analises: Infinity, max_funcionarios: 8, max_fazendas: 2,
    recursos: ['analise_basica', 'historico_completo', 'funcionarios', 'relatorios_avancados', 'suporte_prioritario'],
  },
];

// ============================================================
// HELPER: converter doc Firestore → objeto JS simples
// ============================================================
function _docData(snap) {
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

function _colData(snap) {
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================================
// HELPERS REUTILIZÁVEIS — evitam repetição de padrões comuns
// ============================================================

/** Retorna o timestamp atual em ISO 8601. */
const _now = () => new Date().toISOString();

/** Retorna a data de hoje no formato YYYY-MM-DD. */
const _today = () => _now().split('T')[0];

/**
 * Retorna o plano correspondente ao ID fornecido.
 * Se não encontrar, retorna o plano Gratuito (id=1).
 * @param {number|null|undefined} planoId
 * @param {number} [fallback=1] — ID de fallback
 */
function _getPlano(planoId, fallback = 1) {
  return PLANOS.find(p => p.id === (planoId ?? fallback)) ?? PLANOS[0];
}

/**
 * Busca a assinatura ativa de um usuário no Firestore.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function _getAssinatura(userId) {
  const snap = await db.collection('assinaturas')
    .where('usuario_id', '==', userId)
    .limit(1)
    .get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/**
 * Busca um único documento Firestore por coleção e ID.
 * @param {string} coll — nome da coleção
 * @param {string|number} id — ID do documento
 * @returns {Promise<object|null>}
 */
async function _getDoc(coll, id) {
  const snap = await db.collection(coll).doc(String(id)).get();
  return _docData(snap);
}

// ============================================================
// HELPER interno: monta o objeto de sessão (usuario + assinatura + plano)
// a partir de um usuário autenticado no Firebase Auth.
// Usado tanto pelo login manual quanto pelo listener onAuthStateChanged.
// ============================================================
async function _carregarSessao(user) {
  const token = await user.getIdToken();

  const perfilSnap = await db.collection('usuarios').doc(user.uid).get();
  if (!perfilSnap.exists) throw new Error('Perfil não encontrado. Contate o suporte.');

  const perfil = perfilSnap.data();
  if (!perfil.ativo) {
    await auth.signOut();
    throw new Error('Conta desativada. Contate o suporte.');
  }

  const assinatura = await _getAssinatura(user.uid);
  const plano = _getPlano(assinatura?.plano_id);

  // Buscar contagem real de fazendas para o dashboard
  let fazendasCount = 0;
  try {
    const fazSnap = await db.collection('fazendas')
      .where('usuario_id', '==', user.uid)
      .where('ativa', '==', true)
      .get();
    fazendasCount = fazSnap.size;
  } catch (e) {
    console.warn('[API] Erro ao contar fazendas na sessão:', e.message);
  }

  return {
    token,
    usuario: { id: user.uid, ...perfil },
    assinatura,
    plano,
    fazendas_count: fazendasCount,
  };
}

// ============================================================
// PLANOS HELPER — verificação centralizada de limites
// Sempre consulta dados REAIS do Firestore, nunca confia
// em valores enviados pelo frontend.
// ============================================================
const PlanosHelper = {

  /**
   * Retorna os limites do plano atual do usuário, consultando
   * dados reais do Firestore.
   * @param {string} userId
   * @returns {Promise<{plano, assinatura, fazendasAtuais, funcionariosAtuais, analises_utilizadas, limites}>}
   */
  async getLimitesUsuario(userId) {
    const [assinatura, fazSnap, funcSnap] = await Promise.all([
      _getAssinatura(userId),
      db.collection('fazendas')
        .where('usuario_id', '==', userId)
        .where('ativa', '==', true)
        .get(),
      db.collection('funcionarios')
        .where('empresa_id', '==', userId)
        .where('ativo', '==', true)
        .get(),
    ]);

    const plano = _getPlano(assinatura?.plano_id);
    const fazendasAtuais = fazSnap.size;
    const funcionariosAtuais = funcSnap.size;
    const analises_utilizadas = assinatura?.analises_utilizadas || 0;
    const analiseIlimitada = plano.limite_analises === Infinity;

    return {
      plano,
      assinatura,
      fazendasAtuais,
      funcionariosAtuais,
      analises_utilizadas,
      limites: {
        max_fazendas: plano.max_fazendas,
        limite_analises: plano.limite_analises,
        max_funcionarios: plano.max_funcionarios,
        pode_criar_fazenda: fazendasAtuais < plano.max_fazendas,
        pode_criar_funcionario: funcionariosAtuais < plano.max_funcionarios,
        pode_analisar: analiseIlimitada || analises_utilizadas < plano.limite_analises,
        fazendas_restantes: Math.max(0, plano.max_fazendas - fazendasAtuais),
        funcionarios_restantes: Math.max(0, plano.max_funcionarios - funcionariosAtuais),
        analises_restantes: analiseIlimitada ? Infinity : Math.max(0, plano.limite_analises - analises_utilizadas),
        analise_ilimitada: analiseIlimitada,
      },
    };
  },

  /**
   * Verifica se o usuário pode criar mais uma fazenda.
   * Diferencia entre "plano não permite fazendas" e "limite atingido".
   * @param {string} userId
   * @returns {Promise<{permitido: boolean, mensagem: string, limite: number, atuais: number, plano_nome: string, plano_nao_permite: boolean}>}
   */
  async verificarLimiteFazendas(userId) {
    const { plano, fazendasAtuais } = await this.getLimitesUsuario(userId);

    // Plano não permite fazendas (Gratuito e Básico: max = 0)
    if (plano.max_fazendas === 0) {
      return {
        permitido: false,
        plano_nao_permite: true,
        mensagem: 'Seu plano atual não permite o cadastro de fazendas.',
        mensagem_upgrade: 'Faça upgrade do seu plano para ter acesso ao gerenciamento de fazendas.',
        limite: 0,
        atuais: fazendasAtuais,
        plano_nome: plano.nome,
      };
    }

    // Limite atingido (Premium: 1, Empresarial: 2)
    if (fazendasAtuais >= plano.max_fazendas) {
      return {
        permitido: false,
        plano_nao_permite: false,
        mensagem: `Você atingiu o limite de ${plano.max_fazendas} fazenda${plano.max_fazendas !== 1 ? 's' : ''} do plano ${plano.nome}.`,
        mensagem_upgrade: 'Faça upgrade para cadastrar mais fazendas.',
        limite: plano.max_fazendas,
        atuais: fazendasAtuais,
        plano_nome: plano.nome,
      };
    }

    return {
      permitido: true,
      plano_nao_permite: false,
      mensagem: '',
      mensagem_upgrade: '',
      limite: plano.max_fazendas,
      atuais: fazendasAtuais,
      plano_nome: plano.nome,
    };
  },

  /**
   * Verifica se o usuário pode realizar mais uma análise.
   * Planos Premium e Empresarial têm análises ilimitadas.
   * @param {string} userId
   * @returns {Promise<{permitido: boolean, mensagem: string}>}
   */
  async verificarLimiteAnalises(userId) {
    const { plano, analises_utilizadas } = await this.getLimitesUsuario(userId);

    // Análises ilimitadas (Premium e Empresarial)
    if (plano.limite_analises === Infinity) {
      return { permitido: true, mensagem: '' };
    }

    if (analises_utilizadas >= plano.limite_analises) {
      return {
        permitido: false,
        mensagem: `Limite de ${plano.limite_analises} análise${plano.limite_analises !== 1 ? 's' : ''} do plano ${plano.nome} atingido. Faça upgrade para continuar.`,
      };
    }

    return { permitido: true, mensagem: '' };
  },

  /**
   * Verifica se o usuário pode adicionar mais um funcionário.
   * Diferencia entre "plano não permite funcionários" e "limite atingido".
   * @param {string} userId
   * @returns {Promise<{permitido: boolean, mensagem: string, limite: number, atuais: number, plano_nome: string, plano_nao_permite: boolean}>}
   */
  async verificarLimiteFuncionarios(userId) {
    const { plano, funcionariosAtuais } = await this.getLimitesUsuario(userId);

    // Plano não permite funcionários (Gratuito e Básico: max = 0)
    if (plano.max_funcionarios === 0) {
      return {
        permitido: false,
        plano_nao_permite: true,
        mensagem: 'Seu plano atual não permite o cadastro de funcionários.',
        mensagem_upgrade: 'Faça upgrade do seu plano para ter acesso ao gerenciamento de funcionários.',
        limite: 0,
        atuais: funcionariosAtuais,
        plano_nome: plano.nome,
      };
    }

    // Limite atingido (Premium: 3, Empresarial: 8)
    if (funcionariosAtuais >= plano.max_funcionarios) {
      return {
        permitido: false,
        plano_nao_permite: false,
        mensagem: `Você atingiu o limite de ${plano.max_funcionarios} funcionário${plano.max_funcionarios !== 1 ? 's' : ''} do plano ${plano.nome}.`,
        mensagem_upgrade: 'Faça upgrade para adicionar mais funcionários.',
        limite: plano.max_funcionarios,
        atuais: funcionariosAtuais,
        plano_nome: plano.nome,
      };
    }

    return {
      permitido: true,
      plano_nao_permite: false,
      mensagem: '',
      mensagem_upgrade: '',
      limite: plano.max_funcionarios,
      atuais: funcionariosAtuais,
      plano_nome: plano.nome,
    };
  },
};

// ============================================================
// HELPERS CRIPTOGRÁFICOS — recuperação local de senha
//
// Usa a API WebCrypto nativa do navegador (sem bibliotecas externas).
// A resposta da pergunta de segurança é usada como chave
// para criptografar a senha no Firestore.
// ============================================================

/** Normaliza a resposta de segurança: minusculas, sem espaços extras */
function _normalizarResposta(resposta) {
  return resposta.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Gera um hash SHA-256 e retorna como string hexadecimal */
async function _sha256(texto) {
  const dados = new TextEncoder().encode(texto);
  const buffer = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deriva uma chave AES-GCM a partir de um texto (a resposta de segurança)
 * usando PBKDF2. Retorna uma CryptoKey pronta para encrypt ou decrypt.
 */
async function _derivarChave(texto, operacao) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(texto), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('tomeye-recovery-v1'), // salt fixo
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [operacao] // 'encrypt' ou 'decrypt'
  );
}

/**
 * Criptografa um texto com AES-GCM usando a resposta como chave.
 * Retorna base64 de (IV 12 bytes + dados criptografados).
 */
async function _criptografar(texto, resposta) {
  const chave = await _derivarChave(_normalizarResposta(resposta), 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto)
  );
  const combined = new Uint8Array(12 + enc.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(enc), 12);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decriptografa dados AES-GCM usando a resposta como chave.
 * Lança erro se a resposta estiver errada (o AES-GCM verifica integridade).
 */
async function _decriptografar(dadosB64, resposta) {
  const chave = await _derivarChave(_normalizarResposta(resposta), 'decrypt');
  const combined = Uint8Array.from(atob(dadosB64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) },
    chave,
    combined.slice(12)
  );
  return new TextDecoder().decode(dec);
}

// ============================================================
// AUTH API — Firebase Authentication
// ============================================================
const AuthAPI = {

  /**
   * Login com e-mail ou CPF/CNPJ.
   * Se a credencial não contiver '@', busca o e-mail no Firestore pelo CPF/CNPJ.
   */
  async login(credencial, senha) {
    let email = credencial.trim();

    // Login por CPF/CNPJ: buscar e-mail no Firestore
    if (!email.includes('@')) {
      // Normaliza: remove tudo que não é dígito para busca por CPF/CNPJ com máscara
      const apenasDigitos = email.replace(/\D/g, '');

      // Tenta buscar com o valor exato digitado (caso esteja com máscara)
      let snap = await db.collection('usuarios')
        .where('cpf_cnpj', '==', email)
        .where('ativo', '==', true)
        .limit(1)
        .get();

      // Se não encontrou, tenta aplicar a máscara e buscar novamente
      if (snap.empty && apenasDigitos.length >= 11) {
        let cpfCnpjFormatado = email;
        if (apenasDigitos.length === 11) {
          // Formata CPF: 000.000.000-00
          cpfCnpjFormatado = apenasDigitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        } else if (apenasDigitos.length === 14) {
          // Formata CNPJ: 00.000.000/0000-00
          cpfCnpjFormatado = apenasDigitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        }
        snap = await db.collection('usuarios')
          .where('cpf_cnpj', '==', cpfCnpjFormatado)
          .where('ativo', '==', true)
          .limit(1)
          .get();
      }

      if (snap.empty) throw new Error('E-mail ou senha incorretos.');
      email = snap.docs[0].data().email;
    }

    let user;
    try {
      const cred = await auth.signInWithEmailAndPassword(email, senha);
      user = cred.user;
    } catch (err) {
      throw new Error('E-mail ou senha incorretos.');
    }

    return _carregarSessao(user);
  },

  /**
   * Cadastro: cria conta no Firebase Auth + perfil no Firestore.
   * Também salva a pergunta de segurança e a senha criptografada
   * (usadas na recuperação local de senha sem e-mail).
   */
  async cadastro(dados) {
    // 1. Criar conta no Firebase Auth
    const cred = await auth.createUserWithEmailAndPassword(dados.email.trim(), dados.senha);
    const uid = cred.user.uid;

    try {
      // 2. Salvar perfil básico no Firestore
      //    NÃO cria fazenda — o usuário fará isso depois, no dashboard/fazendas
      const perfil = {
        nome: dados.nome,
        tipo: dados.tipo,
        email: dados.email.trim(),
        cpf_cnpj: dados.cpf_cnpj || null,
        telefone: dados.telefone || null,
        razao_social: dados.razao_social || null,
        numero_funcionarios: dados.numero_funcionarios || null,
        local_producao: dados.local_producao || (dados.tipo === 'amador' ? 'casa' : null),
        plano_id: 1,
        foto_perfil: null,
        ativo: true,
        created_at: _now(),
      };

      // 2b. CPF obrigatório: armazenar como hash SHA-256 + versão mascarada para display
      if (dados.cpf_raw) {
        const cpfDigits = dados.cpf_raw.replace(/\D/g, '');
        perfil.cpf_hash = await _sha256(cpfDigits);
        // Versão mascarada para exibição: ***.XXX.***-XX
        if (cpfDigits.length === 11) {
          perfil.cpf_display = `***.${cpfDigits.substring(3, 6)}.***-${cpfDigits.substring(9, 11)}`;
        } else {
          perfil.cpf_display = dados.cpf_raw;
        }
        // Salvar CPF formatado também para busca no login/recuperação
        perfil.cpf_cnpj = dados.cpf_raw;
      }

      // 3. Adicionar dados de recuperação de senha (se fornecidos)
      //    A resposta é armazenada só como hash — nunca em texto puro.
      //    A senha é armazenada criptografada com a resposta como chave.
      if (dados.pergunta_seguranca && dados.resposta_seguranca) {
        const respostaNorm = _normalizarResposta(dados.resposta_seguranca);
        perfil.pergunta_seguranca = dados.pergunta_seguranca;
        perfil.resposta_hash = await _sha256(respostaNorm);
        perfil.senha_backup = await _criptografar(dados.senha, respostaNorm);
      }

      await db.collection('usuarios').doc(uid).set(perfil);

      // 4. Criar assinatura gratuita (plano_id = 1)
      //    Fazenda NÃO é criada aqui — será criada posteriormente
      //    pelo usuário na tela de fazendas, respeitando os limites do plano.
      await db.collection('assinaturas').add({
        usuario_id: uid,
        plano_id: 1,
        status: 'ativa',
        tipo: 'gratuito',
        inicio: _today(),
        vencimento: '2099-12-31',
        analises_utilizadas: 0,
      });

      return { mensagem: 'Cadastro realizado com sucesso!' };

    } catch (err) {
      // Se algo falhar após criar a conta Auth, deletar para não deixar órfã
      await cred.user.delete().catch(() => { });
      throw err;
    }
  },

  // ── RECUPERAÇÃO LOCAL DE SENHA (sem e-mail) ──────────────────────
  //
  // Fluxo em 3 etapas:
  //   1. buscarPerguntaSeguranca(credencial) → retorna pergunta cadastrada
  //   2. verificarEDecriptografar(dados, resposta) → verifica resposta e
  //      decriptografa a senha atual (necessária para reautenticar)
  //   3. redefinirSenhaLocal(email, uid, senhaAtual, novaSenha, respostaNorm)
  //      → reautentica → troca senha no Firebase Auth → atualiza backup
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Etapa 1: busca a pergunta de segurança do usuário no Firestore.
   * @param {string} credencial - e-mail ou CPF/CNPJ
   * @returns {{ email, uid, pergunta_seguranca, resposta_hash, senha_backup }}
   */
  async buscarPerguntaSeguranca(credencial) {
    let email = credencial.trim();
    let uid;

    // Se for CPF/CNPJ, busca o e-mail correspondente no Firestore
    if (!email.includes('@')) {
      const apenasDigitos = email.replace(/\D/g, '');

      // Tenta buscar com o valor exato (com ou sem máscara)
      let snap = await db.collection('usuarios')
        .where('cpf_cnpj', '==', email)
        .where('ativo', '==', true)
        .limit(1).get();

      // Tenta com máscara formatada se não encontrou
      if (snap.empty && apenasDigitos.length >= 11) {
        let cpfCnpjFormatado = email;
        if (apenasDigitos.length === 11) {
          cpfCnpjFormatado = apenasDigitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        } else if (apenasDigitos.length === 14) {
          cpfCnpjFormatado = apenasDigitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        }
        snap = await db.collection('usuarios')
          .where('cpf_cnpj', '==', cpfCnpjFormatado)
          .where('ativo', '==', true)
          .limit(1).get();
      }

      if (snap.empty) throw new Error('Nenhuma conta encontrada com estes dados.');
      email = snap.docs[0].data().email;
      uid = snap.docs[0].id;
    }

    // Busca o documento do usuário pelo e-mail se o uid ainda não foi obtido
    if (!uid) {
      const snap = await db.collection('usuarios')
        .where('email', '==', email)
        .where('ativo', '==', true)
        .limit(1).get();
      if (snap.empty) throw new Error('Nenhuma conta encontrada com este e-mail.');
      uid = snap.docs[0].id;
    }

    const doc = await db.collection('usuarios').doc(uid).get();
    if (!doc.exists) throw new Error('Conta não encontrada.');

    const dados = doc.data();

    // Verifica se a conta tem pergunta de segurança configurada
    if (!dados.pergunta_seguranca || !dados.resposta_hash || !dados.senha_backup) {
      throw new Error(
        'Esta conta não tem pergunta de segurança configurada.\n' +
        'Somente contas criadas após a atualização do sistema podem usar este recurso.'
      );
    }

    return {
      email,
      uid,
      pergunta_seguranca: dados.pergunta_seguranca,
      resposta_hash: dados.resposta_hash,
      senha_backup: dados.senha_backup,
    };
  },

  /**
   * Etapa 2: verifica a resposta de segurança e decriptografa a senha de backup.
   * @param {{ resposta_hash, senha_backup }} dados - dados da Etapa 1
   * @param {string} respostaInformada - resposta digitada pelo usuário
   * @returns {string} - senha atual decriptografada
   */
  async verificarEDecriptografar(dados, respostaInformada) {
    const respostaNorm = _normalizarResposta(respostaInformada);
    const hashCalculado = await _sha256(respostaNorm);

    // Compara o hash da resposta informada com o hash armazenado
    if (hashCalculado !== dados.resposta_hash) {
      throw new Error('Resposta incorreta. Verifique e tente novamente.');
    }

    try {
      // Decriptografa a senha atual usando a resposta como chave
      return await _decriptografar(dados.senha_backup, respostaNorm);
    } catch {
      // O AES-GCM falha na decriptografia se a chave for errada
      throw new Error('Resposta incorreta. Verifique e tente novamente.');
    }
  },

  /**
   * Etapa 3: reautentica o usuário com a senha atual e define a nova senha.
   * Também atualiza o backup criptografado no Firestore com a nova senha.
   * @param {string} email       - e-mail do usuário
   * @param {string} uid         - ID do documento Firestore
   * @param {string} senhaAtual  - senha decriptografada (Etapa 2)
   * @param {string} novaSenha   - nova senha escolhida pelo usuário
   * @param {string} respostaNorm - resposta normalizada (para re-criptografar)
   */
  async redefinirSenhaLocal(email, uid, senhaAtual, novaSenha, respostaNorm) {
    // Autentica com a senha atual (necessário para o Firebase Auth aceitar updatePassword)
    let cred;
    try {
      cred = await auth.signInWithEmailAndPassword(email, senhaAtual);
    } catch {
      throw new Error('Erro ao verificar sua identidade. Tente solicitar recuperação novamente.');
    }

    // Troca a senha no Firebase Auth
    await cred.user.updatePassword(novaSenha);

    // Atualiza o backup criptografado com a NOVA senha
    const novoBackup = await _criptografar(novaSenha, respostaNorm);
    await db.collection('usuarios').doc(uid).update({ senha_backup: novoBackup });

    // Faz logout — o usuário vai logar com a nova senha
    await auth.signOut();
  },

  async logout() {
    await auth.signOut();
    return { mensagem: 'Logout realizado.' };
  },

  /**
   * Escuta o estado de autenticação do Firebase em tempo real.
   * Deve ser chamado na inicialização do app (ex: em app.js), no lugar de
   * ler usuário/token de localStorage/sessionStorage.
   *
   * Uso:
   *   AuthAPI.escutarSessao((sessao) => {
   *     if (sessao) { App.setSession(sessao); renderizarApp(); }
   *     else        { App.clearSession(); renderizarLogin(); }
   *   });
   *
   * Retorna a função de unsubscribe do Firebase, caso precise parar de escutar.
   */
  escutarSessao(onChange) {
    return auth.onAuthStateChanged(async (user) => {
      if (!user) {
        onChange(null);
        return;
      }
      try {
        const sessao = await _carregarSessao(user);
        onChange(sessao);
      } catch (err) {
        console.error('[Auth] Erro ao carregar sessão:', err);
        onChange(null);
      }
    });
  },
};

// ============================================================
// PERFIL API — Firestore: coleção "usuarios"
// ============================================================
const PerfilAPI = {

  async obter(userId) {
    const snap = await db.collection('usuarios').doc(userId).get();
    if (!snap.exists) throw new Error('Usuário não encontrado.');
    const perfil = { id: snap.id, ...snap.data() };

    // Se funcionário, herdar assinatura do empregador
    const assinaturaOwnerId = (perfil.tipo === 'funcionario' && perfil.empregador_id)
      ? perfil.empregador_id
      : userId;

    const assinatura = await _getAssinatura(assinaturaOwnerId);
    const plano = _getPlano(assinatura?.plano_id ?? perfil.plano_id);

    return { usuario: perfil, assinatura, plano };
  },

  async atualizar(userId, dados) {
    // Remover campos sensíveis antes de salvar
    const { senha, senha_hash, id, ...dadosLimpos } = dados;
    await db.collection('usuarios').doc(userId).update(dadosLimpos);
    return { mensagem: 'Perfil atualizado com sucesso!' };
  },

  async alterarSenha(userId, senhaAtual, novaSenha) {
    const user = auth.currentUser;
    if (!user) throw new Error('Usuário não autenticado.');

    // Re-autenticar para verificar senha atual
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(novaSenha);
    return { mensagem: 'Senha alterada com sucesso!' };
  },

  async excluirConta(userId) {
    const batch = db.batch();

    // Soft delete no Firestore
    batch.update(db.collection('usuarios').doc(userId), { ativo: false });

    // Remover assinaturas
    const assSnap = await db.collection('assinaturas').where('usuario_id', '==', userId).get();
    assSnap.docs.forEach(d => batch.delete(d.ref));

    // Remover análises
    const anaSnap = await db.collection('analises').where('usuario_id', '==', userId).get();
    anaSnap.docs.forEach(d => batch.delete(d.ref));

    // Remover notificações
    const notSnap = await db.collection('notificacoes').where('usuario_id', '==', userId).get();
    notSnap.docs.forEach(d => batch.delete(d.ref));

    // Remover fazendas
    const fazSnap = await db.collection('fazendas').where('usuario_id', '==', userId).get();
    fazSnap.docs.forEach(d => batch.delete(d.ref));

    await batch.commit();

    // Deletar conta do Firebase Auth
    await auth.currentUser?.delete();

    return { mensagem: 'Conta excluída com sucesso.' };
  },
};

// ============================================================
// FAZENDAS API — Firestore: coleção "fazendas"
// ============================================================
const FazendasAPI = {

  async listar(userId) {
    const userSnap = await db.collection('usuarios').doc(userId).get();
    const user = userSnap.exists ? userSnap.data() : null;

    if (user && user.tipo === 'funcionario' && user.fazenda_id) {
      // Funcionário: buscar fazenda pelo doc ID (não por campo 'id')
      const fazSnap = await db.collection('fazendas').doc(user.fazenda_id).get();
      if (fazSnap.exists) return [_docData(fazSnap)];
      return [];
    } else {
      // Produtor/Empresa: listar fazendas ativas do usuário
      // Índice composto necessário: usuario_id + ativa
      // Na primeira execução o Firebase exibe no console um link para criá-lo.
      const snap = await db.collection('fazendas')
        .where('usuario_id', '==', userId)
        .where('ativa', '==', true)
        .get();
      return _colData(snap);
    }
  },

  async criar(dados) {
    // ── VALIDAÇÃO SERVER-SIDE ─────────────────────────────────
    // Nunca confiar em dados do frontend (session, plano, limites).
    // Sempre consultar o Firestore para obter dados reais.
    const user = auth.currentUser;
    if (!user) throw new Error('Usuário não autenticado.');
    const userId = user.uid;

    // Buscar dados REAIS: perfil, assinatura e fazendas existentes
    const [perfilSnap, assinatura, fazSnap] = await Promise.all([
      db.collection('usuarios').doc(userId).get(),
      _getAssinatura(userId),
      db.collection('fazendas')
        .where('usuario_id', '==', userId)
        .where('ativa', '==', true)
        .get(),
    ]);

    if (!perfilSnap.exists) throw new Error('Perfil não encontrado.');

    const plano = _getPlano(assinatura?.plano_id);
    const fazendasAtuais = fazSnap.size;

    // Verificar limite de fazendas do plano REAL
    if (plano.max_fazendas === 0) {
      throw new Error(
        'Seu plano atual não permite o cadastro de fazendas. Faça upgrade do seu plano para ter acesso ao gerenciamento de fazendas.'
      );
    }
    if (fazendasAtuais >= plano.max_fazendas) {
      throw new Error(
        `Você atingiu o limite de ${plano.max_fazendas} fazenda${plano.max_fazendas !== 1 ? 's' : ''} do plano ${plano.nome}. Faça upgrade para cadastrar mais.`
      );
    }

    const jaTemFazenda = fazendasAtuais > 0;

    const nova = {
      usuario_id: userId,
      nome: dados.nome,
      // Suportar tanto 'cidade'/'estado' (formulário) quanto 'municipio' (legado)
      cidade: dados.cidade || dados.municipio || '',
      estado: dados.estado || '',
      municipio: dados.cidade || dados.municipio || '', // compatibilidade
      area_ha: dados.area_ha ? parseFloat(dados.area_ha) : (dados.area ? parseFloat(dados.area) : null),
      tipo_solo: dados.tipo_solo || null,
      tipo_producao: dados.tipo_producao || dados.cultura_principal || null,
      metodo_irrigacao: dados.metodo_irrigacao || null,
      car: dados.car || null,
      ativa: true,
      selecionada: !jaTemFazenda,
      created_at: _now(),
    };

    const ref = await db.collection('fazendas').add(nova);
    return { fazenda: { id: ref.id, ...nova }, mensagem: 'Fazenda cadastrada com sucesso!' };
  },

  async atualizar(id, dados) {
    const { id: _, ...dadosLimpos } = dados;
    // Normalizar campos de localiza\u00e7\u00e3o para compatibilidade
    if (dadosLimpos.cidade !== undefined || dadosLimpos.municipio !== undefined) {
      dadosLimpos.municipio = dadosLimpos.cidade || dadosLimpos.municipio || '';
    }
    await db.collection('fazendas').doc(String(id)).update(dadosLimpos);
    return { fazenda: await _getDoc('fazendas', id), mensagem: 'Fazenda atualizada com sucesso!' };
  },

  async excluir(id) {
    await db.collection('fazendas').doc(String(id)).update({ ativa: false, selecionada: false });
    return { mensagem: 'Fazenda excluída.' };
  },

  async selecionar(id) {
    const session = App.getSession();
    const userId = session.usuario.id;

    // Desselecionar todas
    const snap = await db.collection('fazendas').where('usuario_id', '==', userId).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { selecionada: false }));
    batch.update(db.collection('fazendas').doc(String(id)), { selecionada: true });
    await batch.commit();

    const selecionada = await _getDoc('fazendas', id);
    return { fazenda: selecionada, mensagem: 'Fazenda selecionada.' };
  },
};

// ============================================================
// FUNCIONÁRIOS API — Firestore: coleção "funcionarios"
// ============================================================
const FuncionariosAPI = {

  async listar(empresaId) {
    const snap = await db.collection('funcionarios')
      .where('empresa_id', '==', empresaId)
      .where('ativo', '==', true)
      .get();
    return _colData(snap);
  },

  async criarComConta(dados) {
    const session = App.getSession();
    const empregadorId = session.usuario.id;

    // Criar conta no Firebase Auth
    const cred = await auth.createUserWithEmailAndPassword(dados.email.trim(), dados.senha);
    const uid = cred.user.uid;

    try {
      // Criar perfil do funcionário
      await db.collection('usuarios').doc(uid).set({
        nome: dados.nome,
        tipo: 'funcionario',
        email: dados.email.trim(),
        telefone: dados.telefone || null,
        cpf_cnpj: dados.cpf || null,
        empregador_id: empregadorId,
        fazenda_id: dados.fazenda_id || null,
        plano_id: 1,
        foto_perfil: null,
        ativo: true,
        created_at: _now(),
      });

      // Criar vínculo de funcionário
      const funcRef = await db.collection('funcionarios').add({
        empresa_id: empregadorId,
        usuario_id: uid,
        nome: dados.nome,
        email: dados.email.trim(),
        telefone: dados.telefone || null,
        cpf: dados.cpf || null,
        cargo: dados.cargo || null,
        fazenda_id: dados.fazenda_id || null,
        perm_fotos: dados.perm_fotos ?? true,
        perm_diagnostico: dados.perm_diagnostico ?? true,
        perm_historico: dados.perm_historico ?? true,
        perm_excluir: dados.perm_excluir ?? false,
        perm_usuarios: dados.perm_usuarios ?? false,
        ativo: true,
        created_at: _now(),
      });

      return {
        funcionario: { id: funcRef.id },
        mensagem: 'Conta criada e funcionário adicionado com sucesso!',
      };

    } catch (err) {
      await cred.user.delete().catch(() => { });
      throw err;
    }
  },

  async atualizar(id, dados) {
    const { id: _, ...dadosLimpos } = dados;
    const funcSnap = await db.collection('funcionarios').doc(id).get();
    if (!funcSnap.exists) throw new Error('Funcionário não encontrado.');

    await db.collection('funcionarios').doc(id).update(dadosLimpos);

    // Atualizar também o perfil de usuário vinculado
    const usuarioId = funcSnap.data().usuario_id;
    if (usuarioId) {
      const upd = {};
      if (dados.nome) upd.nome = dados.nome;
      if (dados.telefone) upd.telefone = dados.telefone;
      if (Object.keys(upd).length) {
        await db.collection('usuarios').doc(usuarioId).update(upd);
      }
    }
    return { mensagem: 'Funcionário atualizado.' };
  },

  async remover(id) {
    const snap = await db.collection('funcionarios').doc(id).get();
    if (!snap.exists) throw new Error('Funcionário não encontrado.');

    const usuarioId = snap.data().usuario_id;
    const batch = db.batch();
    batch.update(db.collection('funcionarios').doc(id), { ativo: false });
    if (usuarioId) {
      batch.update(db.collection('usuarios').doc(usuarioId), { ativo: false });
    }
    await batch.commit();
    return { mensagem: 'Funcionário removido e conta desativada.' };
  },
};

// ============================================================
// ANÁLISES API — Firestore: coleção "analises"
// ============================================================
const AnalisesAPI = {

  async listar(userId, filtros = {}) {
    // Filtro e ordenação feitos no próprio Firestore.
    // IMPORTANTE: queries com where() + orderBy() em campos diferentes exigem
    // índice composto no Firestore. Se der erro, clique no link do console
    // para criar o índice automaticamente.
    let query = db.collection('analises').where('usuario_id', '==', userId);

    const temFiltroData = filtros.data_inicio || filtros.data_fim;

    if (filtros.data_inicio) {
      query = query.where('created_at', '>=', filtros.data_inicio);
    }
    if (filtros.data_fim) {
      query = query.where('created_at', '<=', filtros.data_fim + 'T23:59:59');
    }

    // orderBy é necessário para paginação e para queries com range filters
    // Se não há filtro de data, apenas ordena por created_at desc
    query = query.orderBy('created_at', 'desc');

    let snap;
    try {
      snap = await query.get();
    } catch (indexErr) {
      // Fallback nível 1: busca sem orderBy caso o índice composto não exista
      console.warn('[AnalisesAPI] Índice composto ausente, buscando sem ordenação:', indexErr.message);
      try {
        let fallbackQuery = db.collection('analises').where('usuario_id', '==', userId);
        if (filtros.data_inicio) fallbackQuery = fallbackQuery.where('created_at', '>=', filtros.data_inicio);
        if (filtros.data_fim) fallbackQuery = fallbackQuery.where('created_at', '<=', filtros.data_fim + 'T23:59:59');
        snap = await fallbackQuery.get();
      } catch (fallbackErr) {
        // Fallback nível 2: buscar tudo e filtrar em memória (funciona sempre)
        console.warn('[AnalisesAPI] Fallback com filtro de data falhou, buscando tudo e filtrando em memória:', fallbackErr.message);
        snap = await db.collection('analises').where('usuario_id', '==', userId).get();
      }
    }

    let analises = _colData(snap);

    // Ordenação em memória como garantia extra
    analises.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Enriquecer com dados de fazenda (em paralelo, limitado para não fazer muitas chamadas)
    const enriquecidas = await Promise.all(analises.map(async a => {
      let fazenda = null;
      if (a.fazenda_id) {
        try {
          const fSnap = await db.collection('fazendas').doc(String(a.fazenda_id)).get();
          fazenda = fSnap.exists ? _docData(fSnap) : null;
        } catch (e) {
          console.warn('[AnalisesAPI] Erro ao buscar fazenda:', e.message);
        }
      }
      return {
        ...a,
        doenca: { nome: a.doenca_nome || 'Não identificada', agente: '', cultura: '' },
        fazenda,
      };
    }));

    return enriquecidas;
  },

  async obter(id) {
    const snap = await db.collection('analises').doc(id).get();
    if (!snap.exists) throw new Error('Análise não encontrada.');
    const analise = _docData(snap);
    const doenca = { nome: analise.doenca_nome || 'Não identificada', agente: '', cultura: '' };
    let fazenda = null;
    if (analise.fazenda_id) {
      const fSnap = await db.collection('fazendas').doc(analise.fazenda_id).get();
      fazenda = fSnap.exists ? _docData(fSnap) : null;
    }
    return { analise, doenca, relatorio: {}, fazenda };
  },

  /**
   * Cria uma nova análise no Firestore.
   * Substitui o antigo `MockDB.analises.push()` usado em analises.js.
   *
   * `dados` deve incluir ao menos: usuario_id, doenca_nome, fazenda_id (opcional).
   */
  async criar(dados) {
    const nova = {
      ...dados,
      created_at: dados.created_at || _now(),
    };
    const ref = await db.collection('analises').add(nova);
    return { analise: { id: ref.id, ...nova }, mensagem: 'Análise registrada com sucesso!' };
  },

  async excluir(id) {
    await db.collection('analises').doc(id).delete();
    return { mensagem: 'Análise excluída.' };
  },

  async excluirTodas(userId) {
    const snap = await db.collection('analises').where('usuario_id', '==', userId).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return { mensagem: `${snap.size} análise(s) excluída(s).`, removidas: snap.size };
  },
};

// ============================================================
// ASSINATURAS API — Firestore: coleção "assinaturas"
// ============================================================
const AssinaturasAPI = {

  async listarPlanos() {
    return PLANOS;
  },

  async obterAssinatura(userId) {
    const assinatura = await _getAssinatura(userId);
    const plano = _getPlano(assinatura?.plano_id);
    return { assinatura, plano };
  },

  async contratarPlano(userId, planoId, tipo) {
    const plano = PLANOS.find(p => p.id === planoId);
    if (!plano) throw new Error('Plano não encontrado.');

    const snap = await db.collection('assinaturas')
      .where('usuario_id', '==', userId)
      .limit(1)
      .get();

    const novaAssinatura = {
      usuario_id: userId,
      plano_id: planoId,
      status: 'ativa',
      tipo,
      inicio: _today(),
      vencimento: new Date(Date.now() + (tipo === 'anual' ? 365 : 30) * 86400000).toISOString().split('T')[0],
      analises_utilizadas: 0,
    };

    if (snap.empty) {
      await db.collection('assinaturas').add(novaAssinatura);
    } else {
      await snap.docs[0].ref.update(novaAssinatura);
    }

    // NOTA: plano_id no perfil do usuário NÃO é atualizado aqui.
    // A fonte de verdade do plano é a coleção 'assinaturas'.
    // O campo plano_id em 'usuarios' é definido apenas no cadastro
    // e protegido contra alteração pelas Firestore Security Rules.

    return { assinatura: novaAssinatura, plano, mensagem: `Plano ${plano.nome} ativado com sucesso!` };
  },

  /**
   * Incrementa em 1 o contador de análises usadas da assinatura ativa do usuário.
   * Substitui o antigo incremento manual `MockDB.assinaturas[idx].analises_utilizadas++`
   * usado em analises.js. Usa FieldValue.increment para ser atômico mesmo com
   * chamadas concorrentes.
   */
  async incrementarUso(userId) {
    const snap = await db.collection('assinaturas')
      .where('usuario_id', '==', userId)
      .limit(1)
      .get();
    if (snap.empty) throw new Error('Assinatura não encontrada.');

    await snap.docs[0].ref.update({
      analises_utilizadas: firebase.firestore.FieldValue.increment(1),
    });
    return { mensagem: 'Uso de análise registrado.' };
  },
};

// ============================================================
// NOTIFICAÇÕES API — Firestore: coleção "notificacoes"
// ============================================================
const NotificacoesAPI = {

  async listar(userId) {
    const snap = await db.collection('notificacoes')
      .where('usuario_id', '==', userId)
      .get();
    let notificacoes = _colData(snap);

    // Ordenar e limitar em memória
    notificacoes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return notificacoes.slice(0, 50);
  },

  /**
   * Cria uma nova notificação no Firestore.
   * Substitui o antigo `MockDB.notificacoes.unshift()` usado em analises.js.
   */
  async criar(dados) {
    const nova = {
      ...dados,
      lida: dados.lida ?? false,
      created_at: dados.created_at || _now(),
    };
    const ref = await db.collection('notificacoes').add(nova);
    return { notificacao: { id: ref.id, ...nova } };
  },

  async marcarLida(id) {
    await db.collection('notificacoes').doc(id).update({ lida: true });
    return { mensagem: 'Notificação marcada como lida.' };
  },

  async marcarTodasLidas(userId) {
    const snap = await db.collection('notificacoes')
      .where('usuario_id', '==', userId)
      .where('lida', '==', false)
      .get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { lida: true }));
    await batch.commit();
    return { mensagem: 'Todas as notificações marcadas como lidas.' };
  },

  async excluir(id) {
    await db.collection('notificacoes').doc(id).delete();
    return { mensagem: 'Notificação excluída.' };
  },

  async contarNaoLidas(userId) {
    const snap = await db.collection('notificacoes')
      .where('usuario_id', '==', userId)
      .where('lida', '==', false)
      .get();
    return snap.size;
  },
};

// ============================================================
// DOENÇAS API — Firestore: coleção "doencas"
// ============================================================
const DoencasAPI = {

  // Doenças padrão para seed se a coleção estiver vazia
  _DOENCAS_PADRAO: [
    {
      nome: 'Requeima',
      agente: 'Phytophthora infestans',
      cultura: 'Tomate',
      descricao: 'A requeima é considerada a doença mais destrutiva do tomateiro, atacando folhas, hastes e frutos.',
      sintomas: 'Manchas encharcadas que escurecem rapidamente e viram lesões necróticas.',
      tratamento: 'Remover partes infectadas. Aplicar fungicidas à base de cobre de forma preventiva.',
      prevencao: 'Evitar áreas baixas e irrigação por aspersão; usar gotejamento e rotação de culturas.'
    },
    {
      nome: 'Septoriose',
      agente: 'Septoria lycopersici',
      cultura: 'Tomate',
      descricao: 'Doença fúngica que ataca principalmente as folhas mais velhas da base do tomateiro.',
      sintomas: 'Manchas pequenas circulares com centro claro, bordas escuras e pontuações pretas no centro.',
      tratamento: 'Eliminar folhas da base afetadas e aplicar fungicidas protetores recomendados.',
      prevencao: 'Rotação de culturas por 2 a 3 anos e cobertura morta do solo (mulching).'
    },
    {
      nome: 'Mofo das folhas',
      agente: 'Passalora fulva',
      cultura: 'Tomate',
      descricao: 'Doença comum em cultivo protegido ou estufas com umidade elevada e ventilação deficiente.',
      sintomas: 'Manchas amareladas na face superior e bolor aveludado verde-oliva na face inferior da folha.',
      tratamento: 'Aumentar a ventilação do ambiente e podar folhas afetadas.',
      prevencao: 'Usar cultivares resistentes e controlar a umidade da estufa.'
    },
    {
      nome: 'Mancha bacteriana',
      agente: 'Xanthomonas spp.',
      cultura: 'Tomate',
      descricao: 'Doença bacteriana severa que afeta folhas, ramos e frutos do tomateiro.',
      sintomas: 'Lesões com aspecto encharcado que evoluem para manchas escuras com halo amarelado.',
      tratamento: 'Não há tratamento curativo; aplicar cúpricos preventivamente e eliminar focos.',
      prevencao: 'Sementes certificadas, desinfecção de ferramentas e rotação de cultura.'
    }
  ],

  async listar() {
    try {
      let snap;
      try {
        snap = await db.collection('doencas').orderBy('nome').get();
      } catch (e) {
        snap = await db.collection('doencas').get();
      }

      let doencas = _colData(snap);

      // Se a coleção estiver vazia, auto-seeda com as doenças padrão
      if (!doencas || doencas.length === 0) {
        for (const item of DoencasAPI._DOENCAS_PADRAO) {
          try {
            const ref = await db.collection('doencas').add({ ...item, created_at: _now() });
            doencas.push({ id: ref.id, ...item });
          } catch (err) { }
        }
      }

      return doencas.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    } catch (err) {
      console.warn('[DoencasAPI] Erro ao listar Firestore, usando padrão:', err.message);
      return DoencasAPI._DOENCAS_PADRAO.map((d, i) => ({ id: `local_${i + 1}`, ...d }));
    }
  },

  async obter(id) {
    const snap = await db.collection('doencas').doc(id).get();
    if (!snap.exists) throw new Error('Doença não encontrada.');
    return _docData(snap);
  },

  async criar(dados) {
    const nova = { ...dados, created_at: _now() };
    const ref = await db.collection('doencas').add(nova);
    return { doenca: { id: ref.id, ...nova }, mensagem: 'Doença cadastrada com sucesso!' };
  },

  async atualizar(id, dados) {
    const { id: _, ...dadosLimpos } = dados;
    await db.collection('doencas').doc(id).update(dadosLimpos);
    return { doenca: await _getDoc('doencas', id), mensagem: 'Doença atualizada com sucesso!' };
  },

  async excluir(id) {
    await db.collection('doencas').doc(id).delete();
    return { mensagem: 'Doença excluída com sucesso!' };
  },
};

// ============================================================
// ADMIN API — métricas e gestão via Firestore
// ============================================================
const AdminAPI = {

  async getMetricas() {
    let usuarios = [];
    let analisesCount = 0;
    let assinaturas = [];
    let doencasCount = 0;

    // Buscar IDs de usuários admin para filtrar assinaturas
    const adminIds = new Set();
    try {
      const uSnap = await db.collection('usuarios').get();
      const todosUsuarios = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      todosUsuarios.forEach(u => {
        if (u.tipo === 'admin') adminIds.add(u.id);
      });
      usuarios = todosUsuarios.filter(u => u.tipo !== 'admin' && u.ativo !== false);
    } catch (e) { console.warn('[AdminAPI] Erro ao buscar usuários:', e.message); }

    try {
      const aSnap = await db.collection('analises').get();
      analisesCount = aSnap.size;
    } catch (e) { console.warn('[AdminAPI] Erro ao buscar análises:', e.message); }

    try {
      const assSnap = await db.collection('assinaturas').get();
      // Filtrar assinaturas de admins
      assinaturas = assSnap.docs.map(d => d.data()).filter(a => !adminIds.has(a.usuario_id));
    } catch (e) { console.warn('[AdminAPI] Erro ao buscar assinaturas:', e.message); }

    try {
      const dSnap = await db.collection('doencas').get();
      doencasCount = dSnap.size || DoencasAPI._DOENCAS_PADRAO.length;
    } catch (e) { doencasCount = DoencasAPI._DOENCAS_PADRAO.length; }

    const distribuicaoPlanos = PLANOS.map(p => ({
      plano: p.nome,
      plano_id: p.id,
      quantidade: assinaturas.filter(a => a.plano_id === p.id).length,
    }));

    let receitaMensal = 0;
    assinaturas.forEach(a => {
      const plano = _getPlano(a.plano_id);
      // Plano gratuito (id=1) não gera receita
      if (plano && plano.id !== 1) {
        receitaMensal += a.tipo === 'anual' ? plano.preco_anual / 12 : plano.preco_mensal;
      }
    });

    return {
      totalUsuarios: usuarios.length,
      distribuicaoPlanos,
      receitaMensal: parseFloat(receitaMensal.toFixed(2)),
      receitaAnualEstimada: parseFloat((receitaMensal * 12).toFixed(2)),
      totalAnalises: analisesCount,
      totalDoencas: doencasCount,
    };
  },

  async getUsuarios() {
    try {
      const snap = await db.collection('usuarios').get();
      const usuarios = _colData(snap).filter(u => u.ativo !== false);

      return Promise.all(usuarios.map(async u => {
        try {
          const assinatura = await _getAssinatura(u.id);
          const plano = _getPlano(assinatura?.plano_id ?? u.plano_id);
          return {
            ...u,
            plano_nome: plano?.nome || 'Gratuito',
            assinatura_tipo: assinatura?.tipo || 'gratuito',
          };
        } catch (err) {
          return {
            ...u,
            plano_nome: 'Gratuito',
            assinatura_tipo: 'gratuito',
          };
        }
      }));
    } catch (err) {
      console.warn('[AdminAPI] Erro ao buscar lista de usuários:', err.message);
      return [];
    }
  },

  async atualizarModelo(dados) {
    const info = {
      url: dados.url || '',
      versao: dados.versao || '2.0',
      acuracia: dados.acuracia || 85,
      atualizadoEm: _now(),
    };
    await db.collection('configuracoes').doc('modelo_ia').set(info);
    return { mensagem: 'Modelo atualizado com sucesso!', modelo: info };
  },

  async getModeloInfo() {
    try {
      const snap = await db.collection('configuracoes').doc('modelo_ia').get();
      if (snap.exists) return snap.data();
    } catch (err) { }

    return {
      url: 'https://teachablemachine.withgoogle.com/models/wlVSA5l3P/',
      versao: '1.0',
      acuracia: 82,
      atualizadoEm: '2024-01-01T00:00:00.000Z',
    };
  },
};

console.log('[API] Firebase API carregada.');