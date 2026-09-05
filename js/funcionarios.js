/**
 * Tomeye — funcionarios.js
 * Módulo de gerenciamento de funcionários (empresa e produtor rural).
 * Ao criar um funcionário, uma conta de usuário é criada automaticamente no app.
 */

const Funcionarios = {

  /** Lista de funcionários carregados */
  _funcionarios: [],

  /** Lista de fazendas do usuário (para o select) */
  _fazendas: [],

  /**
   * Inicializa a tela de funcionários.
   */
  async init() {
    if (!(await App.requireAuthAsync())) return;

    App.renderBottomNav('');

    // Verificar se pode gerenciar funcionários (empresa ou produtor)
    if (!App.podeGerenciarFuncionarios()) {
      document.getElementById('aviso-nao-empresa').classList.remove('hidden');
      document.getElementById('funcionarios-list').classList.add('hidden');
      document.getElementById('btn-novo-funcionario').classList.add('hidden');
      return;
    }

    // Configurar botões
    const btnNovo = document.getElementById('btn-novo-funcionario');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showForm());

    const btnCancelar = document.getElementById('btn-cancelar-func');
    if (btnCancelar) btnCancelar.addEventListener('click', () => this.hideForm());

    const backdrop = document.getElementById('funcionario-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.hideForm();
      });
    }

    // Máscara de CPF e telefone
    const cpfInput = document.getElementById('func-cpf');
    if (cpfInput) App.maskCpfCnpj(cpfInput);

    const telInput = document.getElementById('func-telefone');
    if (telInput) App.maskTelefone(telInput);

    // Toggle de visibilidade das senhas
    document.querySelectorAll('[data-toggle-password]').forEach(btn => {
      const targetId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(targetId);
      if (input) {
        App.bindPasswordToggle(input, btn);
      }
    });

    // Submit
    const form = document.getElementById('funcionario-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSave();
      });
    }

    // Carregar dados
    await this._loadFazendas();
    await this.loadData();
  },

  /**
   * Carrega as fazendas do usuário logado.
   */
  async _loadFazendas() {
    const userId = App.getUserId();
    try {
      const todas = await FazendasAPI.listar(userId);
      this._fazendas = todas.filter(f => f.ativa !== false);
    } catch (e) {
      console.warn('[Funcionarios] Erro ao carregar fazendas:', e);
      this._fazendas = [];
    }
  },

  /**
   * Carrega a lista de funcionários do usuário.
   */
  async loadData() {
    const userId = App.getUserId();
    try {
      // Buscar limites reais do plano via Firestore
      const limitesData = await PlanosHelper.verificarLimiteFuncionarios(userId);
      this._maxFuncionarios = limitesData.limite;
      this._planoNaoPermite = limitesData.plano_nao_permite;
      this._limitesInfo = limitesData;

      this._funcionarios = await FuncionariosAPI.listar(userId);
      this.render(this._funcionarios);

      // Atualizar aparência do botão "+ Novo" com base no plano atual
      const btnNovo = document.getElementById('btn-novo-funcionario');
      if (btnNovo) {
        const restrito = !limitesData.permitido;

        // Não desabilitar o botão — deixar o clique ocorrer para mostrar a mensagem no showForm()
        // Apenas indicar visualmente que está restrito
        btnNovo.style.opacity = restrito ? '0.5' : '';
        btnNovo.title = limitesData.plano_nao_permite
          ? 'Seu plano não permite funcionários. Faça upgrade.'
          : !limitesData.permitido
            ? `Limite de ${limitesData.limite} funcionários atingido.`
            : '';
      }
    } catch (error) {
      console.error('[Funcionarios] Erro ao carregar:', error);
      App.showToast('Erro ao carregar funcionários.', 'error');
    }
  },

  /**
   * Renderiza a lista de funcionários.
   * @param {Array} lista
   */
  render(lista) {
    const container = document.getElementById('funcionarios-list');
    if (!container) return;

    if (lista.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><span class="material-symbols-rounded">group</span></div>
          <h3>Nenhum funcionário</h3>
          <p>Adicione funcionários para que eles possam acessar o app e fazer diagnósticos.</p>
          <button class="btn btn-primary mt-md" onclick="Funcionarios.showForm()">+ Adicionar funcionário</button>
        </div>
      `;
      return;
    }

    container.innerHTML = lista.map(f => {
      const permissoes = [];
      if (f.perm_fotos) permissoes.push('<span class="material-symbols-rounded" title="Tirar fotos" style="font-size:16px;">photo_camera</span>');
      if (f.perm_diagnostico) permissoes.push('<span class="material-symbols-rounded" title="Diagnóstico" style="font-size:16px;">biotech</span>');
      if (f.perm_historico) permissoes.push('<span class="material-symbols-rounded" title="Histórico" style="font-size:16px;">history</span>');
      if (f.perm_excluir) permissoes.push('<span class="material-symbols-rounded" title="Excluir" style="font-size:16px;">delete</span>');
      if (f.perm_usuarios) permissoes.push('<span class="material-symbols-rounded" title="Gerenciar usuários" style="font-size:16px;">manage_accounts</span>');

      const fazenda = this._fazendas.find(fz => fz.id === f.fazenda_id);
      const fazendaLabel = fazenda
        ? fazenda.nome
        : '<span style="color:var(--color-warning)">Sem fazenda</span>';

      return `
        <div class="card mb-sm">
          <div class="card-header">
            <div class="flex items-center gap-sm">
              <div class="avatar avatar-sm">${App.getInitials(f.nome)}</div>
              <div>
                <div class="card-title">${f.nome}</div>
                <div class="card-subtitle">${f.cargo || 'Sem cargo'} · ${f.email}</div>
              </div>
            </div>
            <span class="badge ${f.ativo ? 'badge-success' : 'badge-muted'}">${f.ativo ? 'Ativo' : 'Inativo'}</span>
          </div>
          <div class="card-body">
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-xs);">
              <span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">agriculture</span>
              Fazenda: ${fazendaLabel}
            </div>
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); display:flex; align-items:center; gap:4px;">
              <span style="margin-right:2px;">Permissões:</span>
              ${permissoes.length > 0 ? permissoes.join('') : '<span style="color:var(--text-muted)">Nenhuma</span>'}
            </div>
          </div>
          <div class="card-footer">
            <div class="flex gap-sm">
              <button class="btn btn-ghost btn-sm" onclick="Funcionarios.showForm('${f.id}')">Editar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--color-error)" onclick="Funcionarios.handleRemove('${f.id}')">Remover</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Exibe o formulário de criação/edição de funcionário.
   * @param {number} [funcId] - se informado, modo edição
   */
  showForm(funcId) {
    // Verificar limites na criação usando dados já carregados do PlanosHelper
    if (this._planoNaoPermite) {
      App.showModal({
        title: '🔒 Recurso indisponível',
        message: `
          <div style="text-align:center;">
            <p style="margin-bottom: var(--space-sm);">Seu plano atual não permite o cadastro de funcionários.</p>
            <p style="margin-bottom: var(--space-sm); color: var(--text-secondary); font-size: var(--font-size-sm);">
              Faça upgrade do seu plano para ter acesso ao gerenciamento de funcionários.
            </p>
          </div>
        `,
        confirmText: 'Ver planos',
        cancelText: 'Fechar',
        confirmType: 'primary',
        onConfirm: () => App.navigate('assinatura.html'),
      });
      return;
    }

    if (!funcId) {
      // Verifica limite apenas na criação
      if (this._funcionarios.length >= this._maxFuncionarios) {
        App.showModal({
          title: '🔒 Limite de funcionários atingido',
          message: `
            <div style="text-align:center;">
              <p style="margin-bottom: var(--space-sm);">Você atingiu o limite de ${this._maxFuncionarios} funcionário${this._maxFuncionarios !== 1 ? 's' : ''} do seu plano.</p>
              <p style="margin-bottom: var(--space-sm); color: var(--text-secondary); font-size: var(--font-size-sm);">Faça upgrade para adicionar mais funcionários.</p>
              <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                Funcionários: <strong>${this._funcionarios.length}/${this._maxFuncionarios}</strong>
              </p>
            </div>
          `,
          confirmText: 'Ver planos',
          cancelText: 'Fechar',
          confirmType: 'primary',
          onConfirm: () => App.navigate('assinatura.html'),
        });
        return;
      }
    }

    const modal = document.getElementById('funcionario-form-modal');
    const title = document.getElementById('funcionario-form-title');
    const subtitle = document.getElementById('funcionario-form-subtitle');
    const form = document.getElementById('funcionario-form');
    const campsConta = document.getElementById('func-campos-conta');
    const btnSalvar = document.getElementById('btn-salvar-func');
    if (!modal || !form) return;

    form.reset();
    App.clearValidationErrors('funcionario-form');
    document.getElementById('func-id').value = '';

    // Popular select de fazendas com as fazendas do próprio usuário
    const fazendaSelect = document.getElementById('func-fazenda');
    if (fazendaSelect) {
      fazendaSelect.innerHTML = '<option value="">Selecione uma fazenda...</option>';
      if (this._fazendas.length === 0) {
        fazendaSelect.innerHTML += '<option value="" disabled>Nenhuma fazenda cadastrada</option>';
      } else {
        this._fazendas.forEach(fz => {
          fazendaSelect.innerHTML += `<option value="${fz.id}">${fz.nome}${fz.municipio ? ' — ' + fz.municipio : ''}</option>`;
        });
      }
    }

    // Resetar checkboxes
    document.getElementById('perm-fotos').checked = true;
    document.getElementById('perm-diagnostico').checked = true;
    document.getElementById('perm-historico').checked = true;
    document.getElementById('perm-excluir').checked = false;
    document.getElementById('perm-usuarios').checked = false;

    if (funcId) {
      // ── Modo edição ──────────────────────────────────────────────
      // BUG 7 FIX: Comparar como string para suportar IDs Firestore (string) e números
      const func = this._funcionarios.find(f => String(f.id) === String(funcId));
      if (!func) return;

      title.textContent = 'Editar Funcionário';
      subtitle.textContent = 'Atualize os dados do funcionário. A senha não pode ser alterada aqui.';

      // Ocultar campos de senha (conta já existe)
      if (campsConta) campsConta.classList.add('hidden');
      if (btnSalvar) btnSalvar.textContent = 'Salvar alterações';

      document.getElementById('func-id').value = func.id;
      document.getElementById('func-nome').value = func.nome || '';
      document.getElementById('func-email').value = func.email || '';
      document.getElementById('func-telefone').value = func.telefone || '';
      document.getElementById('func-cpf').value = func.cpf || '';
      document.getElementById('func-cargo').value = func.cargo || '';
      if (fazendaSelect && func.fazenda_id) fazendaSelect.value = func.fazenda_id;
      document.getElementById('perm-fotos').checked = !!func.perm_fotos;
      document.getElementById('perm-diagnostico').checked = !!func.perm_diagnostico;
      document.getElementById('perm-historico').checked = !!func.perm_historico;
      document.getElementById('perm-excluir').checked = !!func.perm_excluir;
      document.getElementById('perm-usuarios').checked = !!func.perm_usuarios;

    } else {
      // ── Modo criação ─────────────────────────────
      title.textContent = 'Novo Funcionário';
      subtitle.textContent = 'Crie a conta de acesso do funcionário. Ele entrará no app usando o e-mail e a senha temporária definidos abaixo.';

      // Mostrar campos de conta (criação)
      if (campsConta) campsConta.classList.remove('hidden');
      if (btnSalvar) btnSalvar.textContent = 'Criar conta e adicionar';

      // Pré-selecionar fazenda se só houver uma
      if (this._fazendas.length === 1 && fazendaSelect) {
        fazendaSelect.value = this._fazendas[0].id;
      }
    }

    modal.classList.remove('hidden');
  },

  /**
   * Esconde o formulário.
   */
  hideForm() {
    const modal = document.getElementById('funcionario-form-modal');
    if (modal) modal.classList.add('hidden');
  },

  /**
   * Salva (cria ou edita) o funcionário.
   */
  async handleSave() {
    const funcId = document.getElementById('func-id').value;
    const isEdicao = !!funcId;

    // Regras de validação base
    const regras = [
      { field: 'func-nome', label: 'Nome', rules: ['required'] },
      { field: 'func-email', label: 'E-mail', rules: ['required', 'email'] },
      { field: 'func-telefone', label: 'Telefone', rules: ['required', 'telefone'] },
      { field: 'func-cpf', label: 'CPF', rules: ['required', 'cpf_cnpj'] },
      { field: 'func-fazenda', label: 'Fazenda vinculada', rules: ['required'] },
    ];

    // Senha obrigatória apenas no cadastro
    if (!isEdicao) {
      regras.push(
        { field: 'func-senha', label: 'Senha temporária', rules: ['required', 'min:6'] },
        { field: 'func-confirmar-senha', label: 'Confirmação de senha', rules: ['required', 'match:func-senha'] }
      );
    }

    const { valid } = App.validate(regras);
    if (!valid) return;

    const fazendaId = document.getElementById('func-fazenda').value || null;

    // Segurança: garantir que a fazenda pertence ao usuário (comparar como string)
    const fazendaValida = fazendaId ? this._fazendas.find(fz => String(fz.id) === String(fazendaId)) : false;
    if (!fazendaValida) {
      App.showToast('Fazenda inválida. Selecione uma fazenda da sua propriedade.', 'error');
      return;
    }

    const dados = {
      nome: document.getElementById('func-nome').value.trim(),
      email: document.getElementById('func-email').value.trim(),
      telefone: document.getElementById('func-telefone').value.trim(),
      cpf: document.getElementById('func-cpf').value.trim(),
      cargo: document.getElementById('func-cargo').value.trim() || null,
      fazenda_id: fazendaId,
      perm_fotos: document.getElementById('perm-fotos').checked,
      perm_diagnostico: document.getElementById('perm-diagnostico').checked,
      perm_historico: document.getElementById('perm-historico').checked,
      perm_excluir: document.getElementById('perm-excluir').checked,
      perm_usuarios: document.getElementById('perm-usuarios').checked,
    };

    // Incluir senha apenas no cadastro
    if (!isEdicao) {
      dados.senha = document.getElementById('func-senha').value;
    }

    const btn = document.getElementById('btn-salvar-func');

    try {
      btn.disabled = true;
      btn.textContent = 'Salvando...';

      if (isEdicao) {
        await FuncionariosAPI.atualizar(funcId, dados); // ID do Firestore é string
        App.showToast('Funcionário atualizado!', 'success');
      } else {
        // Cria conta + vínculo de funcionário
        await FuncionariosAPI.criarComConta(dados);
        App.showToast('Conta criada e funcionário adicionado!', 'success');
      }

      this.hideForm();
      await this.loadData();

    } catch (error) {
      App.showToast(error.message || 'Erro ao salvar.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = isEdicao ? 'Salvar alterações' : 'Criar conta e adicionar';
    }
  },

  /**
   * Remove um funcionário (desativa conta vinculada).
   * @param {number} id
   */
  handleRemove(id) {
    // BUG 7 FIX: Comparar como string para suportar IDs Firestore
    const func = this._funcionarios.find(f => String(f.id) === String(id));
    App.showModal({
      title: 'Remover funcionário',
      message: `Tem certeza que deseja remover "${func?.nome || 'este funcionário'}"? A conta de acesso dele também será desativada.`,
      confirmText: 'Remover',
      confirmType: 'danger',
      onConfirm: async () => {
        try {
          App.showLoading('Removendo...');
          await FuncionariosAPI.remover(id);
          App.hideLoading();
          App.showToast('Funcionário removido.', 'success');
          await this.loadData();
        } catch (error) {
          App.hideLoading();
          App.showToast(error.message || 'Erro ao remover.', 'error');
        }
      },
    });
  },
};
