/**
 * Tomeye — fazendas.js
 * Módulo de gerenciamento de fazendas.
 * CRUD completo + seleção de fazenda ativa.
 */

const Fazendas = {

  /** Lista de fazendas carregadas */
  _fazendas: [],

  /**
   * Inicializa a tela de fazendas.
   */
  async init() {
    if (!(await App.requireAuthAsync())) return;

    // Amadores não têm fazendas — redirecionar para o dashboard
    if (App.isAmador()) {
      App.showToast('Esta área não está disponível para o perfil amador.', 'info');
      App.navigate('dashboard.html');
      return;
    }

    // Renderizar navegação inferior
    App.renderBottomNav('fazendas');

    // Botão nova fazenda
    const btnNova = document.getElementById('btn-nova-fazenda');
    if (btnNova) {
      btnNova.addEventListener('click', () => this.showForm());
    }

    // Cancelar formulário
    const btnCancelar = document.getElementById('btn-cancelar-fazenda');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => this.hideForm());
    }

    // Fechar ao clicar no backdrop
    const backdrop = document.getElementById('fazenda-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.hideForm();
      });
    }

    // Submit do formulário
    const form = document.getElementById('fazenda-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSave();
      });
    }

    // Carregar dados
    await this.loadData();
  },


  /**
   * Carrega a lista de fazendas.
   */
  async loadData() {
    const userId = App.getUserId();

    try {
      this._fazendas = await FazendasAPI.listar(userId);
      this.render(this._fazendas);
    } catch (error) {
      console.error('[Fazendas] Erro ao carregar:', error);
      App.showToast('Erro ao carregar fazendas.', 'error');
    }
  },

  /**
   * Renderiza a lista de fazendas.
   * @param {Array} fazendas
   */
  render(fazendas) {
    const container = document.getElementById('fazendas-list');
    if (!container) return;

    const ativas = fazendas.filter(f => f.ativa);

    if (ativas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><span class="material-symbols-rounded">grass</span></div>
          <h3>Nenhuma fazenda cadastrada</h3>
          <p>Adicione sua primeira fazenda para começar a usar o sistema.</p>
          <button class="btn btn-primary mt-md" onclick="Fazendas.showForm()">+ Nova fazenda</button>
        </div>
      `;
      return;
    }

    container.innerHTML = ativas.map(f => {
      // Compatibilidade: suporta campo 'cidade' (novo) e 'municipio' (legado)
      const cidade = f.cidade || f.municipio || '';
      const estado = f.estado || '';
      const localizacao = estado ? `${cidade} &mdash; ${estado}` : (cidade || 'Localização não informada');
      return `
        <div class="card mb-sm" style="border: ${f.selecionada ? '2px solid var(--color-primary)' : '1px solid var(--border-color)'}">
          <div class="card-header">
            <div class="flex items-center gap-sm">
              <span style="font-size:20px">${f.selecionada ? '<span class="material-symbols-rounded">check_circle</span>' : '<span class="material-symbols-rounded">grass</span>'}</span>
              <div>
                <div class="card-title">${f.nome}</div>
                <div class="card-subtitle">${localizacao}</div>
              </div>
            </div>
            ${f.selecionada ? '<span class="badge badge-primary">Ativa</span>' : ''}
          </div>
          <div class="card-body">
            <div class="flex gap-lg" style="font-size: var(--font-size-sm); color: var(--text-secondary); flex-wrap: wrap;">
              ${f.area_ha ? `<span><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">straighten</span> ${f.area_ha} ha</span>` : ''}
            </div>
          </div>
          <div class="card-footer">
            <div class="flex gap-sm">
              ${!f.selecionada ? `<button class="btn btn-primary btn-sm" onclick="Fazendas.handleSelect('${f.id}')">Selecionar</button>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="Fazendas.showForm('${f.id}')">Editar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--color-error)" onclick="Fazendas.handleDelete('${f.id}')">Excluir</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Exibe o formulário de criação/edição.
   * ANTES de abrir, verifica os limites do plano (server-side).
   * @param {string} [fazendaId] — ID da fazenda para edição (pula verificação de limite)
   */
  async showForm(fazendaId) {
    const modal = document.getElementById('fazenda-form-modal');
    const title = document.getElementById('fazenda-form-title');
    const form = document.getElementById('fazenda-form');
    if (!modal || !form) return;

    // Se for criação (não edição), verificar limites ANTES de abrir
    if (!fazendaId) {
      try {
        const userId = App.getUserId();
        const resultado = await PlanosHelper.verificarLimiteFazendas(userId);

        if (!resultado.permitido) {
          // Montar título e mensagem conforme o tipo de restrição
          const titulo = resultado.plano_nao_permite
            ? '🔒 Recurso indisponível'
            : '🔒 Limite de fazendas atingido';

          const infoExtra = resultado.plano_nao_permite
            ? ''
            : `<p style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                Fazendas: <strong>${resultado.atuais}/${resultado.limite}</strong> · Plano: <strong>${resultado.plano_nome}</strong>
              </p>`;

          App.showModal({
            title: titulo,
            message: `
              <div style="text-align:center;">
                <p style="margin-bottom: var(--space-sm);">${resultado.mensagem}</p>
                <p style="margin-bottom: var(--space-sm); color: var(--text-secondary); font-size: var(--font-size-sm);">${resultado.mensagem_upgrade}</p>
                ${infoExtra}
              </div>
            `,
            confirmText: 'Ver planos',
            cancelText: 'Fechar',
            confirmType: 'primary',
            onConfirm: () => App.navigate('assinatura.html'),
          });
          return;
        }
      } catch (e) {
        console.warn('[Fazendas] Erro ao verificar limites:', e);
        // Em caso de erro na verificação, permitir abrir o formulário
        // A validação server-side no FazendasAPI.criar() será a barreira final
      }
    }

    // Limpar formulário
    form.reset();
    App.clearValidationErrors('fazenda-form');
    document.getElementById('fazenda-id').value = '';

    if (fazendaId) {
      // Modo edição: preencher campos
      // Comparar como string (IDs do Firestore são strings)
      const fazenda = this._fazendas.find(f => String(f.id) === String(fazendaId));
      if (!fazenda) return;

      title.textContent = 'Editar Fazenda';
      document.getElementById('fazenda-id').value = fazenda.id;
      document.getElementById('fazenda-nome').value = fazenda.nome || '';
      // Compatibilidade: campo 'cidade' (novo) ou 'municipio' (legado)
      document.getElementById('fazenda-cidade').value = fazenda.cidade || fazenda.municipio || '';
      document.getElementById('fazenda-estado').value = fazenda.estado || '';
      document.getElementById('fazenda-area').value = fazenda.area_ha || '';
    } else {
      title.textContent = 'Nova Fazenda';
    }

    modal.classList.remove('hidden');
  },

  /**
   * Esconde o formulário.
   */
  hideForm() {
    const modal = document.getElementById('fazenda-form-modal');
    if (modal) modal.classList.add('hidden');
  },

  /**
   * Salva a fazenda (criação ou edição).
   * A validação de limites real ocorre no FazendasAPI.criar() (server-side).
   */
  async handleSave() {
    const { valid } = App.validate([
      { field: 'fazenda-nome', label: 'Nome', rules: ['required'] },
      { field: 'fazenda-cidade', label: 'Cidade', rules: ['required'] },
      { field: 'fazenda-estado', label: 'Estado', rules: ['required'] },
    ]);

    if (!valid) return;

    const fazendaId = document.getElementById('fazenda-id').value;
    const dados = {
      nome: document.getElementById('fazenda-nome').value.trim(),
      cidade: document.getElementById('fazenda-cidade').value.trim(),
      estado: document.getElementById('fazenda-estado').value,
      area_ha: parseFloat(document.getElementById('fazenda-area').value) || null,
    };

    const btn = document.getElementById('btn-salvar-fazenda');

    try {
      btn.disabled = true;
      btn.textContent = 'Salvando...';

      if (fazendaId) {
        // ID do Firestore é string — não converter para int
        await FazendasAPI.atualizar(fazendaId, dados);
        App.showToast('Fazenda atualizada com sucesso!', 'success');
      } else {
        // A validação de limite é feita dentro do FazendasAPI.criar()
        // consultando dados REAIS do Firestore (nunca confiando no frontend)
        await FazendasAPI.criar(dados);
        App.showToast('Fazenda cadastrada com sucesso!', 'success');
      }

      this.hideForm();
      await this.loadData();

    } catch (error) {
      // Se o erro for de limite, mostrar opção de upgrade
      const isLimiteError = error.message?.includes('Limite de fazendas');
      if (isLimiteError) {
        this.hideForm();
        App.showModal({
          title: '🔒 Limite atingido',
          message: error.message,
          confirmText: 'Ver planos',
          cancelText: 'Fechar',
          confirmType: 'primary',
          onConfirm: () => App.navigate('assinatura.html'),
        });
      } else {
        App.showToast(error.message || 'Erro ao salvar fazenda.', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar fazenda';
    }
  },

  /**
   * Exclui (desativa) uma fazenda.
   * @param {number} id
   */
  handleDelete(id) {
    // Comparar como string (IDs do Firestore são strings)
    const fazenda = this._fazendas.find(f => String(f.id) === String(id));
    App.showModal({
      title: 'Excluir fazenda',
      message: `Tem certeza que deseja excluir "${fazenda?.nome || 'esta fazenda'}"? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir',
      confirmType: 'danger',
      onConfirm: async () => {
        try {
          App.showLoading('Excluindo...');
          await FazendasAPI.excluir(id);
          App.hideLoading();
          App.showToast('Fazenda excluída.', 'success');
          await this.loadData();
        } catch (error) {
          App.hideLoading();
          App.showToast(error.message || 'Erro ao excluir.', 'error');
        }
      },
    });
  },

  /**
   * Seleciona uma fazenda como ativa.
   * @param {number} id
   */
  async handleSelect(id) {
    try {
      App.showLoading('Selecionando...');
      await FazendasAPI.selecionar(id);
      App.hideLoading();
      App.showToast('Fazenda selecionada!', 'success');
      await this.loadData();
    } catch (error) {
      App.hideLoading();
      App.showToast(error.message || 'Erro ao selecionar fazenda.', 'error');
    }
  },
};
