/**
 * Tomeye — auth.js
 * Módulo de autenticação: login, cadastro, recuperação de senha e redefinição.
 *
 * Organização:
 *  1. Helpers compartilhados  — funções reutilizadas em vários lugares
 *  2. Login                   — initLogin / handleLogin
 *  3. Cadastro                — initCadastro / handleCadastro
 *  4. Recuperação de senha    — initRecuperar / handleRecuperar / reenvio
 *  5. Nova senha              — initNovaSenha / handleNovaSenha
 *  6. Logout
 */

const Auth = {

  // ============================================================
  // 0. ESTADO INTERNO
  // Variáveis compartilhadas entre os métodos do objeto
  // ============================================================

  _ultimaCredencial: null, // último e-mail/CPF informado no "esqueci senha" (para reenvio)
  _countdownTimer: null, // referência do setInterval do countdown de reenvio
  _oobCode: null, // código único da URL do link de redefinição de senha
  _emailReset: null, // e-mail associado ao oobCode acima

  // ============================================================
  // 1. HELPERS COMPARTILHADOS
  // Funções pequenas e reutilizadas em vários pontos do código
  // ============================================================

  /**
   * Alterna a visibilidade de um campo de senha (mostrar/ocultar).
   * Atualiza o ícone do botão automaticamente.
   *
   * @param {string} inputId - ID do <input type="password">
   * @param {string} btnId   - ID do <button> que dispara o toggle
   */
  _toggleSenha(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (input && btn) Auth._toggleSenhaEl(input, btn);
  },

  /**
   * Versão do _toggleSenha que recebe os elementos diretamente.
   *
   * @param {HTMLInputElement}  input - Campo de senha
   * @param {HTMLButtonElement} btn   - Botão de toggle
   */
  _toggleSenhaEl(input, btn) {
    // Delega para App.bindPasswordToggle (app.js carregado antes de auth.js em todas as páginas)
    if (input && btn) App.bindPasswordToggle(input, btn);
  },

  /**
   * Coloca um botão em estado de "carregando" ou restaura ao normal.
   *
   * @param {string}  btnId     - ID do botão
   * @param {boolean} carregando - true = desabilita e mostra texto de loading
   * @param {string}  textoNormal   - Texto/HTML quando não está carregando
   * @param {string}  textoLoading  - Texto/HTML durante o carregamento
   */
  _setBtnLoading(btnId, carregando, textoNormal, textoLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = carregando;
    btn.innerHTML = carregando ? textoLoading : textoNormal;
  },

  /**
   * Traduz códigos de erro do Firebase Auth para mensagens em português.
   * Se o código não estiver no mapa, retorna a mensagem padrão fornecida.
   *
   * @param {string} codigo      - Ex.: 'auth/user-not-found'
   * @param {string} [padrao=''] - Mensagem de fallback
   * @returns {string}
   */
  _traduzirErroFirebase(codigo, padrao = 'Ocorreu um erro. Tente novamente.') {
    const mapa = {
      'auth/user-not-found': 'Nenhuma conta encontrada com este e-mail ou CPF/CNPJ.',
      'auth/wrong-password': 'E-mail ou senha incorretos.',
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/invalid-email': 'O e-mail informado é inválido.',
      'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
      'auth/weak-password': 'A senha é muito fraca. Use pelo menos 6 caracteres.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      'auth/network-request-failed': 'Erro de conexão. Verifique sua internet e tente novamente.',
      'auth/expired-action-code': 'O link de recuperação expirou. Solicite um novo.',
      'auth/invalid-action-code': 'O link de recuperação é inválido ou já foi usado. Solicite um novo.',
      'auth/user-disabled': 'Esta conta foi desativada. Contate o suporte.',
    };
    return mapa[codigo] || padrao;
  },

  /**
   * Na página nova-senha.html, mostra apenas o estado desejado
   * (loading | erro | formulário | sucesso) e esconde os outros.
   *
   * @param {'loading'|'erro'|'form'|'sucesso'} estado
   */
  _mostrarEstadoNovaSenha(estado) {
    const ids = {
      loading: 'state-loading',
      erro: 'state-erro',
      form: 'state-form',
      sucesso: 'state-sucesso',
    };
    // Esconde todos e mostra só o escolhido
    Object.values(ids).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const alvo = document.getElementById(ids[estado]);
    if (alvo) alvo.classList.remove('hidden');
  },

  // ============================================================
  // 2. LOGIN
  // ============================================================

  /**
   * Inicializa a tela de login (login.html).
   * - Se já existe sessão ativa, redireciona para o dashboard.
   * - Configura o toggle de senha e o submit do formulário.
   */
  initLogin() {
    // 1. Configurar imediatamente elementos de interface (UI)
    Auth._toggleSenha('login-senha', 'toggle-senha');
    document.querySelectorAll('[data-toggle-password]').forEach(btn => {
      const input = document.getElementById(btn.getAttribute('data-toggle-password'));
      if (input) Auth._toggleSenhaEl(input, btn);
    });

    const form = document.getElementById('login-form');
    if (!form) {
      console.error('[Auth] #login-form não encontrado.');
      return;
    }

    // Submit do formulário
    if (!form._hasSubmitHandler) {
      form._hasSubmitHandler = true;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await Auth.handleLogin();
      });
    }

    // 2. Verificação de sessão (assíncrona)
    // Verifica sessão via localStorage primeiro (resposta imediata)
    const session = App.getSession();
    if (session?.token && session?.usuario) {
      // Confirma com Firebase antes de redirecionar
      const unsub = auth.onAuthStateChanged((user) => {
        unsub(); // Cancela o listener após a primeira resposta
        if (user) {
          App.navigate('dashboard.html');
        } else {
          // Sessão do localStorage está desatualizada — limpa
          App.clearSession();
        }
      });
      return;
    }

    // Sem sessão local — verifica se Firebase ainda tem usuário autenticado
    const unsub = auth.onAuthStateChanged(async (user) => {
      unsub(); // Cancela após a primeira resposta
      if (user) {
        try {
          const sessao = await _carregarSessao(user);
          App.setSession(sessao);
          App.navigate('dashboard.html');
        } catch (e) {
          // Sessão inválida, permanece na tela de login
          console.warn('[Auth] Sessão Firebase inválida:', e.message);
        }
      }
    });
  },

  /**
   * Processa o login:
   * 1. Valida os campos
   * 2. Chama a API de login (Firebase Auth via CPF/e-mail)
   * 3. Salva a sessão e redireciona ao dashboard
   */
  async handleLogin() {
    // Limpa erros visuais anteriores
    App.clearValidationErrors('login-form');

    // Valida campos obrigatórios
    const credencial = document.getElementById('login-credencial')?.value.trim() || '';
    const senha = document.getElementById('login-senha')?.value || '';

    if (!credencial) {
      App.validate([{ field: 'login-credencial', label: 'E-mail ou CPF/CNPJ', rules: ['required'] }]);
      return;
    }
    if (!senha) {
      App.validate([{ field: 'login-senha', label: 'Senha', rules: ['required'] }]);
      return;
    }

    const textoBotaoNormal = 'Entrar';
    Auth._setBtnLoading(
      'btn-login', true,
      textoBotaoNormal,
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">hourglass_empty</span> Entrando...'
    );

    try {
      const data = await AuthAPI.login(credencial, senha);

      // Salva os dados da sessão no localStorage
      App.setSession({
        token: data.token,
        usuario: data.usuario,
        assinatura: data.assinatura,
        plano: data.plano,
      });

      App.showToast('Login realizado com sucesso!', 'success');

      // Pequeno delay para o toast aparecer antes de navegar
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);

    } catch (error) {
      const msg = Auth._traduzirErroFirebase(error.code, error.message || 'E-mail ou senha incorretos.');
      App.showToast(msg, 'error');
      Auth._setBtnLoading('btn-login', false, textoBotaoNormal, '');
    }
  },

  // ============================================================
  // 3. CADASTRO
  // ============================================================

  /**
   * Inicializa a tela de cadastro (cadastro.html).
   * - Aplica máscaras nos campos de CPF/CNPJ e telefone.
   * - Configura os toggles de senha.
   * - Exibe/oculta grupos de campos conforme o tipo de conta selecionado.
   */
  initCadastro() {
    const form = document.getElementById('cadastro-form');
    if (!form) {
      console.error('[Auth] #cadastro-form não encontrado.');
      return;
    }

    // ── Máscaras de entrada ──────────────────────────────────────
    // Aplica formatação automática de CPF/CNPJ e telefone enquanto o usuário digita
    ['cadastro-cpf-geral', 'cadastro-cnpj'].forEach(id => {
      const el = document.getElementById(id);
      if (el) App.maskCpfCnpj(el);
    });
    const telInput = document.getElementById('cadastro-telefone');
    if (telInput) App.maskTelefone(telInput);

    // ── Toggles de senha via atributo data-toggle-password ──────
    // Cada botão com [data-toggle-password="id-do-input"] vira um toggle.
    // Usa _toggleSenhaEl para não depender de IDs nos botões.
    document.querySelectorAll('[data-toggle-password]').forEach(btn => {
      const input = document.getElementById(btn.getAttribute('data-toggle-password'));
      if (input) Auth._toggleSenhaEl(input, btn);
    });


    // ── Visibilidade dos grupos de campos ────────────────────────
    const tipoSelect = document.getElementById('cadastro-tipo');
    const grupoProdutor = document.getElementById('grupo-produtor');
    const grupoEmpresa = document.getElementById('grupo-empresa');
    const grupoLocalProducao = document.getElementById('grupo-local-producao');

    // Quando o usuário muda o tipo de conta (produtor, empresa, amador)
    if (tipoSelect) {
      tipoSelect.addEventListener('change', () => {
        const tipo = tipoSelect.value;
        const grupoAmador = document.getElementById('grupo-amador');

        // Esconde todos os grupos específicos por tipo
        [grupoProdutor, grupoEmpresa, grupoAmador].forEach(g => g?.classList.add('hidden'));

        // Mostra "local de produção" apenas para produtor e empresa
        const precisaLocal = tipo === 'produtor' || tipo === 'empresa';
        if (grupoLocalProducao) {
          grupoLocalProducao.classList.toggle('hidden', !precisaLocal);
        }

        // Mostra o grupo específico do tipo escolhido
        if (tipo === 'produtor' && grupoProdutor) grupoProdutor.classList.remove('hidden');
        else if (tipo === 'empresa' && grupoEmpresa) grupoEmpresa.classList.remove('hidden');
        else if (tipo === 'amador' && grupoAmador) grupoAmador.classList.remove('hidden');
      });
    }

    // Submit do formulário
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await Auth.handleCadastro();
    });
  },

  /**
   * Processa o cadastro:
   * 1. Valida campos obrigatórios (incluindo condicionais por tipo)
   * 2. Verifica aceitação dos termos de uso
   * 3. Envia para a API e redireciona ao login
   */
  async handleCadastro() {
    const tipo = document.getElementById('cadastro-tipo')?.value;

    // Regras de validação comuns a todos os tipos
    const regras = [
      { field: 'cadastro-nome', label: 'Nome', rules: ['required'] },
      { field: 'cadastro-tipo', label: 'Tipo de conta', rules: ['required'] },
      { field: 'cadastro-email', label: 'E-mail', rules: ['required', 'email'] },
      { field: 'cadastro-telefone', label: 'Telefone', rules: ['required', 'telefone'] },
      { field: 'cadastro-cpf-geral', label: 'CPF', rules: ['required', 'cpf_cnpj'] },
      { field: 'cadastro-senha', label: 'Senha', rules: ['required', 'min:6'] },
      { field: 'cadastro-confirmar-senha', label: 'Confirmação de senha', rules: ['required', 'match:cadastro-senha'] },
    ];

    // Regras extras para empresa
    if (tipo === 'empresa') {
      regras.push(
        { field: 'cadastro-razao-social', label: 'Razão Social', rules: ['required'] },
        { field: 'cadastro-cnpj', label: 'CNPJ', rules: ['required', 'cpf_cnpj'] },
        { field: 'cadastro-funcionarios', label: 'Número de funcionários', rules: ['required'] }
      );
    }
    // Local de produção obrigatório para produtor e empresa
    // (salva como preferência no perfil, mas NÃO cria fazenda no cadastro)
    if (tipo === 'produtor' || tipo === 'empresa') {
      regras.push({ field: 'cadastro-local-producao', label: 'Local de produção', rules: ['required'] });
    }

    // Pergunta de segurança — obrigatória para todos os tipos
    regras.push(
      { field: 'cadastro-pergunta-seguranca', label: 'Pergunta de segurança', rules: ['required'] },
      { field: 'cadastro-resposta-seguranca', label: 'Resposta de segurança', rules: ['required'] }
    );

    // Verificação dos termos de uso separada (não é campo de texto normal)
    const termosCheckbox = document.getElementById('cadastro-termos');
    const errorTermos = document.getElementById('error-termos');
    if (termosCheckbox && errorTermos) {
      const aceito = termosCheckbox.checked;
      errorTermos.textContent = aceito ? '' : 'Você deve aceitar os Termos de Uso para criar uma conta.';
      errorTermos.closest('.form-group')?.classList.toggle('has-error', !aceito);
      if (!aceito) return;
    }

    // Valida todos os campos
    const { valid } = App.validate(regras);
    if (!valid) return;

    // Monta o objeto de dados para enviar à API
    const dados = {
      nome: document.getElementById('cadastro-nome').value.trim(),
      tipo,
      email: document.getElementById('cadastro-email').value.trim(),
      telefone: document.getElementById('cadastro-telefone').value.trim(),
      cpf_raw: document.getElementById('cadastro-cpf-geral').value.trim(), // CPF formatado para hash
      senha: document.getElementById('cadastro-senha').value,
      confirmar_senha: document.getElementById('cadastro-confirmar-senha').value,
    };

    // Adiciona campos específicos por tipo
    if (tipo === 'empresa') {
      dados.razao_social = document.getElementById('cadastro-razao-social').value.trim();
      dados.cpf_cnpj = document.getElementById('cadastro-cnpj').value.trim();
      dados.numero_funcionarios = document.getElementById('cadastro-funcionarios').value.trim();
    }

    // Local de produção (salvo como preferência do perfil, sem criar fazenda)
    if (tipo === 'produtor' || tipo === 'empresa') {
      const local = document.getElementById('cadastro-local-producao')?.value;
      dados.local_producao = local || 'casa';
    }

    // Dados de recuperação de senha local
    dados.pergunta_seguranca = document.getElementById('cadastro-pergunta-seguranca')?.value || '';
    dados.resposta_seguranca = document.getElementById('cadastro-resposta-seguranca')?.value.trim() || '';

    Auth._setBtnLoading('btn-cadastro', true, 'Criar conta', 'Criando conta...');

    try {
      await AuthAPI.cadastro(dados);
      App.showToast('Conta criada com sucesso! Faça login.', 'success');
      setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    } catch (error) {
      App.showToast(error.message || 'Erro ao criar conta.', 'error');
      Auth._setBtnLoading('btn-cadastro', false, 'Criar conta', '');
    }
  },

  // ============================================================
  // 4. RECUPERAÇÃO LOCAL DE SENHA (sem e-mail)
  //
  // Wizard de 3 etapas em recuperar-senha.html:
  //   Etapa 1 — Identificação (e-mail/CPF)
  //   Etapa 2 — Pergunta de segurança
  //   Etapa 3 — Nova senha
  //
  // Estado intermediário guardado em _recuperacao{}
  // ============================================================

  // Dados temporários entre etapas (e-mail, uid, pergunta, senha decriptografada)
  _recuperacao: null,

  /**
   * Inicializa a tela de recuperação de senha.
   * Conecta os listeners de submit de cada etapa do wizard.
   */
  initRecuperar() {
    const f1 = document.getElementById('form-step-1');
    const f2 = document.getElementById('form-step-2');
    const f3 = document.getElementById('form-step-3');

    if (!f1) { console.error('[Auth] #form-step-1 não encontrado'); return; }

    // Etapa 1: busca o usuário e a pergunta de segurança
    f1.addEventListener('submit', async (e) => { e.preventDefault(); await Auth._handleStep1(); });

    // Etapa 2: verifica a resposta e decriptografa a senha
    if (f2) f2.addEventListener('submit', async (e) => { e.preventDefault(); await Auth._handleStep2(); });

    // Etapa 3: define a nova senha
    if (f3) {
      f3.addEventListener('submit', async (e) => { e.preventDefault(); await Auth._handleStep3(); });

      // Toggle de visibilidade dos campos de senha
      Auth._toggleSenha('nova-senha-rec', 'toggle-nova-senha-rec');
      Auth._toggleSenha('confirmar-senha-rec', 'toggle-confirmar-senha-rec');

      // Indicador de força da senha em tempo real
      const inputSenha = document.getElementById('nova-senha-rec');
      if (inputSenha) {
        inputSenha.addEventListener('input', () => Auth._atualizarForcaSenhaRec(inputSenha.value));
      }
    }
  },

  /**
   * Etapa 1: verifica se o usuário existe e tem pergunta de segurança.
   * Avança para a Etapa 2 mostrando a pergunta cadastrada.
   * @private
   */
  async _handleStep1() {
    // Limpa erro anterior
    const errCred = document.getElementById('err-credencial');
    if (errCred) errCred.textContent = '';

    const credencial = document.getElementById('recuperar-credencial')?.value.trim();
    if (!credencial) {
      if (errCred) errCred.textContent = 'Informe seu e-mail ou CPF/CNPJ.';
      return;
    }

    Auth._setBtnLoading(
      'btn-step-1', true,
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">arrow_forward</span> Continuar',
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">hourglass_empty</span> Verificando...'
    );

    try {
      // Busca a pergunta de segurança do usuário no Firestore
      const dados = await AuthAPI.buscarPerguntaSeguranca(credencial);

      // Guarda os dados para as próximas etapas
      Auth._recuperacao = dados;

      // Exibe a pergunta na Etapa 2
      const perguntaEl = document.getElementById('pergunta-texto');
      if (perguntaEl) perguntaEl.textContent = dados.pergunta_seguranca;

      // Limpa campo de resposta ao avançar
      const respostaInput = document.getElementById('resposta-seguranca');
      if (respostaInput) respostaInput.value = '';
      const errResp = document.getElementById('err-resposta');
      if (errResp) errResp.textContent = '';

      // Avança para a Etapa 2
      Auth._avancarStep(1, 2);

      // Foca no campo de resposta
      setTimeout(() => respostaInput?.focus(), 300);

    } catch (error) {
      const msg = error.message || 'Erro ao buscar conta. Verifique o e-mail ou CPF/CNPJ.';
      App.showToast(msg, 'error');
      if (errCred) errCred.textContent = msg;
      Auth._setBtnLoading(
        'btn-step-1', false,
        '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">arrow_forward</span> Continuar', ''
      );
    }
  },

  /**
   * Etapa 2: verifica a resposta de segurança.
   * Se correta, decriptografa a senha e avança para a Etapa 3.
   * @private
   */
  async _handleStep2() {
    // Limpa erro anterior
    const errResp = document.getElementById('err-resposta');
    if (errResp) errResp.textContent = '';

    const resposta = document.getElementById('resposta-seguranca')?.value.trim();
    if (!resposta) {
      if (errResp) errResp.textContent = 'Digite sua resposta de segurança.';
      return;
    }

    // Verifica se ainda temos os dados da Etapa 1
    if (!Auth._recuperacao) {
      App.showToast('Sessão expirada. Comece novamente.', 'error');
      Auth.voltarStep(1);
      return;
    }

    Auth._setBtnLoading(
      'btn-step-2', true,
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">verified_user</span> Verificar resposta',
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">hourglass_empty</span> Verificando...'
    );

    try {
      // Verifica a resposta e decriptografa a senha de backup
      const senhaAtual = await AuthAPI.verificarEDecriptografar(Auth._recuperacao, resposta);

      if (!senhaAtual) {
        throw new Error('Não foi possível verificar a resposta. Tente novamente.');
      }

      // Guarda para a Etapa 3 (necessária para reautenticar)
      Auth._recuperacao.senhaAtual = senhaAtual;
      Auth._recuperacao.respostaNorm = resposta.trim().toLowerCase().replace(/\s+/g, ' ');

      // Limpa campos da etapa 3
      const novaSenhaInput = document.getElementById('nova-senha-rec');
      const confirmarInput = document.getElementById('confirmar-senha-rec');
      if (novaSenhaInput) novaSenhaInput.value = '';
      if (confirmarInput) confirmarInput.value = '';
      const errNova = document.getElementById('err-nova-senha');
      const errConf = document.getElementById('err-confirmar-senha');
      if (errNova) errNova.textContent = '';
      if (errConf) errConf.textContent = '';

      // Avança para a Etapa 3
      Auth._avancarStep(2, 3);
      setTimeout(() => novaSenhaInput?.focus(), 300);

    } catch (error) {
      const msg = error.message || 'Resposta incorreta. Verifique e tente novamente.';
      App.showToast(msg, 'error');
      if (errResp) errResp.textContent = msg;
      Auth._setBtnLoading(
        'btn-step-2', false,
        '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">verified_user</span> Verificar resposta', ''
      );
    }
  },

  /**
   * Etapa 3: define a nova senha.
   * Reautentica com a senha atual (decriptografada), troca no Firebase Auth
   * e atualiza o backup criptografado no Firestore.
   * @private
   */
  async _handleStep3() {
    // Limpa erros anteriores
    const errNova = document.getElementById('err-nova-senha');
    const errConf = document.getElementById('err-confirmar-senha');
    if (errNova) errNova.textContent = '';
    if (errConf) errConf.textContent = '';

    const novaSenha = document.getElementById('nova-senha-rec')?.value || '';
    const confirmar = document.getElementById('confirmar-senha-rec')?.value || '';

    // Validações locais antes de chamar a API
    if (novaSenha.length < 6) {
      if (errNova) errNova.textContent = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    if (novaSenha !== confirmar) {
      if (errConf) errConf.textContent = 'As senhas não coincidem.';
      return;
    }
    if (!Auth._recuperacao?.senhaAtual) {
      App.showToast('Sessão expirada. Comece o processo novamente.', 'error');
      Auth.voltarStep(1);
      return;
    }

    Auth._setBtnLoading(
      'btn-step-3', true,
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">lock_reset</span> Redefinir senha',
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">hourglass_empty</span> Salvando...'
    );

    try {
      const { email, uid, senhaAtual, respostaNorm } = Auth._recuperacao;

      // Reautentica + troca a senha no Firebase Auth + atualiza backup
      await AuthAPI.redefinirSenhaLocal(email, uid, senhaAtual, novaSenha, respostaNorm);

      // Limpa o estado temporário
      Auth._recuperacao = null;

      // Mostra tela de sucesso e redireciona em 3s
      Auth._avancarStep(3, 'sucesso');
      App.showToast('Senha redefinida com sucesso!', 'success');

      let seg = 3;
      const countdown = document.getElementById('countdown-rec');
      const timer = setInterval(() => {
        seg--;
        if (countdown) countdown.textContent = seg;
        if (seg <= 0) { clearInterval(timer); window.location.href = 'login.html'; }
      }, 1000);

    } catch (error) {
      const msg = Auth._traduzirErroFirebase(error.code, error.message || 'Erro ao redefinir senha. Tente novamente.');
      App.showToast(msg, 'error');
      Auth._setBtnLoading(
        'btn-step-3', false,
        '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">lock_reset</span> Redefinir senha', ''
      );
    }
  },

  /**
   * Avança ou recua entre as etapas do wizard de recuperação.
   * Atualiza os indicadores visuais de etapa.
   *
   * @param {number|string} de  - etapa atual (1, 2 ou 3)
   * @param {number|string} para - próxima etapa (1, 2, 3 ou 'sucesso')
   */
  _avancarStep(de, para) {
    // Esconde a etapa atual
    const divAtual = document.getElementById(de === 'sucesso' ? 'step-sucesso' : `step-${de}`);
    if (divAtual) divAtual.classList.add('hidden');

    // Mostra a próxima etapa
    const divProxima = document.getElementById(para === 'sucesso' ? 'step-sucesso' : `step-${para}`);
    if (divProxima) divProxima.classList.remove('hidden');

    // Atualiza os círculos indicadores de etapa (só para etapas numéricas)
    if (typeof de === 'number') {
      const circAtual = document.getElementById(`circle-${de}`);
      const labelAtual = document.getElementById(`label-${de}`);
      if (circAtual) { circAtual.classList.remove('active'); circAtual.classList.add('done'); circAtual.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;">check</span>'; }
      if (labelAtual) { labelAtual.classList.remove('active'); }
    }
    if (typeof para === 'number') {
      const circProx = document.getElementById(`circle-${para}`);
      const labelProx = document.getElementById(`label-${para}`);
      if (circProx) { circProx.classList.add('active'); }
      if (labelProx) { labelProx.classList.add('active'); }
      // Marca o conector entre as etapas como "feito"
      const conn = document.getElementById(`conn-${de}-${para}`);
      if (conn) conn.classList.add('done');
    }
  },

  /**
   * Volta para uma etapa anterior do wizard.
   * Chamado pelos botões "← Voltar" de cada etapa.
   * @param {number} etapa - número da etapa para onde voltar
   */
  voltarStep(etapa) {
    // Remove a classe active do círculo atual e volta para o anterior
    const etapaAtual = etapa + 1;
    const circAtual = document.getElementById(`circle-${etapaAtual}`);
    const labelAtual = document.getElementById(`label-${etapaAtual}`);
    const circAnterior = document.getElementById(`circle-${etapa}`);
    const labelAnterior = document.getElementById(`label-${etapa}`);

    if (circAtual) { circAtual.classList.remove('active'); }
    if (labelAtual) { labelAtual.classList.remove('active'); }
    if (circAnterior) {
      // Remove estado "done" e restaura o número da etapa (innerHTML pode ter ícone check)
      circAnterior.classList.remove('done');
      circAnterior.innerHTML = String(etapa);
      circAnterior.classList.add('active');
    }
    if (labelAnterior) { labelAnterior.classList.add('active'); }

    // Reverte o conector
    const conn = document.getElementById(`conn-${etapa}-${etapaAtual}`);
    if (conn) conn.classList.remove('done');

    // Troca as divs
    document.getElementById(`step-${etapaAtual}`)?.classList.add('hidden');
    document.getElementById(`step-${etapa}`)?.classList.remove('hidden');
  },

  /**
   * Atualiza o indicador de força de senha na tela de recuperação.
   * @param {string} senha
   * @private
   */
  _atualizarForcaSenhaRec(senha) {
    const container = document.getElementById('rec-strength-container');
    const bar = document.getElementById('rec-strength-bar');
    const label = document.getElementById('rec-strength-label');

    if (!senha) {
      if (container) container.style.display = 'none';
      return;
    }
    if (container) container.style.display = 'block';

    // Pontuação baseada em comprimento e variedade de caracteres
    const pontos = [
      senha.length >= 6,
      senha.length >= 10,
      /[A-Z]/.test(senha),
      /[0-9]/.test(senha),
    ].filter(Boolean).length;

    const niveis = [
      { width: '25%', color: '#ef4444', texto: 'Fraca' },
      { width: '50%', color: '#f59e0b', texto: 'Razoável' },
      { width: '75%', color: '#3b82f6', texto: 'Boa' },
      { width: '100%', color: '#16a34a', texto: 'Forte' },
    ];
    const nivel = niveis[Math.max(0, pontos - 1)];
    if (bar) { bar.style.width = nivel.width; bar.style.backgroundColor = nivel.color; }
    if (label) { label.textContent = nivel.texto; label.style.color = nivel.color; }
  },



  // ============================================================
  // 5. NOVA SENHA (nova-senha.html)
  // Esta página recebe o link do e-mail de recuperação.
  // O link contém um `oobCode` (código único gerado pelo Firebase).
  // Com esse código chamamos auth.confirmPasswordReset(oobCode, novaSenha)
  // que troca a senha SEM precisar da senha antiga.
  // ============================================================

  /**
   * Inicializa a página nova-senha.html.
   * Lê o oobCode da URL e verifica se ainda é válido no Firebase.
   * Exibe o formulário ou uma mensagem de erro conforme o resultado.
   */
  initNovaSenha() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');

    // Se a URL não tem os parâmetros esperados, mostra erro imediato
    if (mode !== 'resetPassword' || !oobCode) {
      Auth._mostrarEstadoNovaSenha('erro');
      const erroMsg = document.getElementById('erro-msg');
      if (erroMsg) erroMsg.textContent =
        'Link de recuperação inválido. Acesse a página de recuperação de senha para solicitar um novo.';
      return;
    }

    // Verifica com o Firebase se o oobCode é válido (não expirou, não foi usado)
    auth.verifyPasswordResetCode(oobCode)
      .then((email) => {
        // Código válido — salva para usar no submit e exibe o formulário
        Auth._oobCode = oobCode;
        Auth._emailReset = email;

        // Exibe o e-mail no subtítulo para o usuário confirmar que é a conta certa
        const subtitle = document.getElementById('page-subtitle');
        if (subtitle) subtitle.textContent = `Crie uma nova senha para ${email}`;

        Auth._mostrarEstadoNovaSenha('form');
        Auth._initNovaSenhaForm();
      })
      .catch((err) => {
        // Código inválido ou expirado
        Auth._mostrarEstadoNovaSenha('erro');
        const erroMsg = document.getElementById('erro-msg');
        if (erroMsg) erroMsg.textContent = Auth._traduzirErroFirebase(
          err.code,
          'Link inválido ou expirado. Solicite um novo link de recuperação.'
        );
        console.error('[Auth] oobCode inválido:', err.code);
      });
  },

  /**
   * Configura os eventos do formulário de nova senha:
   * - Toggles de visibilidade nos campos de senha
   * - Indicador de força da senha em tempo real
   * - Submit do formulário
   * @private
   */
  _initNovaSenhaForm() {
    const form = document.getElementById('nova-senha-form');
    if (!form) return;

    // Toggles de visibilidade para os dois campos de senha
    Auth._toggleSenha('nova-senha', 'toggle-nova-senha');
    Auth._toggleSenha('confirmar-senha', 'toggle-confirmar-senha');

    // Atualiza o indicador de força enquanto o usuário digita
    const novaSenhaInput = document.getElementById('nova-senha');
    if (novaSenhaInput) {
      novaSenhaInput.addEventListener('input', () => {
        Auth._atualizarForcaSenha(novaSenhaInput.value);
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await Auth.handleNovaSenha();
    });
  },

  /**
   * Atualiza visualmente o indicador de força da senha em tempo real.
   * Mostra uma barra colorida e checklist de requisitos.
   *
   * @param {string} senha - Valor atual do campo de senha
   * @private
   */
  _atualizarForcaSenha(senha) {
    const container = document.getElementById('strength-container');
    const bar = document.getElementById('strength-bar');
    const label = document.getElementById('strength-label');
    const reqsEl = document.getElementById('requirements');

    // Se o campo está vazio, esconde os indicadores
    if (!senha) {
      if (container) container.style.display = 'none';
      if (reqsEl) reqsEl.style.display = 'none';
      return;
    }

    if (container) container.style.display = 'block';
    if (reqsEl) reqsEl.style.display = 'block';

    // Verifica cada requisito
    const requisitos = {
      'req-length': senha.length >= 6,
      'req-upper': /[A-Z]/.test(senha),
      'req-number': /[0-9]/.test(senha),
    };

    // Atualiza o ícone de cada requisito (✓ verde ou ○ cinza)
    Object.entries(requisitos).forEach(([id, atendido]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('met', atendido);
      el.querySelector('.material-symbols-rounded').textContent =
        atendido ? 'check_circle' : 'radio_button_unchecked';
    });

    // Calcula a pontuação (0–4) e escolhe cor/texto da barra
    const pontos = [
      requisitos['req-length'],
      requisitos['req-upper'],
      requisitos['req-number'],
      senha.length >= 10, // bônus por senha mais longa
    ].filter(Boolean).length;

    const niveis = [
      { width: '0%', color: '#e5e7eb', texto: '' },
      { width: '33%', color: '#ef4444', texto: 'Fraca' },
      { width: '55%', color: '#f59e0b', texto: 'Média' },
      { width: '78%', color: '#3b82f6', texto: 'Boa' },
      { width: '100%', color: '#16a34a', texto: 'Forte' },
    ];
    const nivel = niveis[pontos] || niveis[0];

    if (bar) { bar.style.width = nivel.width; bar.style.backgroundColor = nivel.color; }
    if (label) { label.textContent = nivel.texto; label.style.color = nivel.color; }
  },

  /**
   * Processa a redefinição de senha com o oobCode da URL.
   * Chama auth.confirmPasswordReset(oobCode, novaSenha) — SEM precisar da senha antiga.
   * Após sucesso, redireciona ao login em 3 segundos.
   */
  async handleNovaSenha() {
    const novaSenha = document.getElementById('nova-senha')?.value || '';
    const confirmar = document.getElementById('confirmar-senha')?.value || '';

    // Validações locais antes de chamar o Firebase
    if (novaSenha.length < 6) {
      App.showToast('A senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (novaSenha !== confirmar) {
      App.showToast('As senhas não coincidem. Verifique e tente novamente.', 'error');
      const errEl = document.querySelector('#confirmar-senha + span.form-error, #nova-senha-form .form-group:last-of-type .form-error');
      if (errEl) errEl.textContent = 'As senhas não coincidem.';
      return;
    }
    if (!Auth._oobCode) {
      App.showToast('Código de redefinição inválido. Solicite um novo link.', 'error');
      return;
    }

    Auth._setBtnLoading(
      'btn-nova-senha', true,
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">lock_reset</span> Redefinir senha',
      '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">hourglass_empty</span> Salvando...'
    );

    try {
      // ✅ Redefine a senha sem precisar da senha atual
      await auth.confirmPasswordReset(Auth._oobCode, novaSenha);

      Auth._mostrarEstadoNovaSenha('sucesso');
      App.showToast('Senha redefinida com sucesso!', 'success');

      // Redireciona ao login com countdown visual de 3 segundos
      let seg = 3;
      const countdownEl = document.getElementById('countdown-login');
      const timer = setInterval(() => {
        seg--;
        if (countdownEl) countdownEl.textContent = seg;
        if (seg <= 0) {
          clearInterval(timer);
          window.location.href = 'login.html';
        }
      }, 1000);

    } catch (err) {
      const msg = Auth._traduzirErroFirebase(err.code, 'Erro ao redefinir a senha. Tente novamente.');
      App.showToast(msg, 'error');
      console.error('[Auth] Erro ao confirmar reset:', err.code, err.message);
      Auth._setBtnLoading(
        'btn-nova-senha', false,
        '<span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;">lock_reset</span> Redefinir senha',
        ''
      );
    }
  },

  // ============================================================
  // 6. LOGOUT
  // ============================================================

  /**
   * Faz o logout do usuário:
   * - Encerra a sessão no Firebase Auth
   * - Limpa os dados locais (localStorage)
   * - Redireciona para o login
   */
  async logout() {
    try {
      App.showLoading('Saindo...');
      await AuthAPI.logout();
    } catch (e) {
      console.warn('[Auth] Erro no logout (ignorado):', e);
    } finally {
      App.hideLoading();
      App.clearSession();
      window.location.href = 'login.html';
    }
  },
};

// ============================================================
// AUTO-INICIALIZAÇÃO
//
// Como auth.js é carregado com defer, ele executa APÓS o HTML ser
// parseado, mas ANTES do DOMContentLoaded disparar.
// Isso garante que o DOM existe E que podemos usar addEventListener.
//
// Detecta qual página está aberta pelo nome do arquivo na URL
// e chama automaticamente a função de inicialização correta.
// Não é mais necessário nenhum script inline nas páginas HTML.
// ============================================================
(function autoInit() {
  // Extrai só o nome do arquivo da URL (ex: "recuperar-senha.html")
  const pagina = location.pathname.split('/').pop().split('?')[0]
    || location.href.split('/').pop().split('?')[0]
    || '';

  // Mapa: nome da página → função de inicialização
  const mapa = {
    'login.html': () => Auth.initLogin(),
    'cadastro.html': () => Auth.initCadastro(),
    'recuperar-senha.html': () => Auth.initRecuperar(),
    'nova-senha.html': () => Auth.initNovaSenha(),
  };

  const init = mapa[pagina];
  if (!init) return; // página não precisa de inicialização de Auth

  // Scripts defer executam com readyState = 'interactive'
  // (DOM pronto, mas DOMContentLoaded ainda não disparou)
  // Então adicionamos o listener normalmente — ele vai disparar logo.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // readyState já é 'interactive' ou 'complete': chama direto
    init();
  }
})();

