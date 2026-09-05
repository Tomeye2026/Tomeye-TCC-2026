/**
 * Tomeye — notificacoes.js
 * Módulo de notificações do sistema.
 */

const Notificacoes = {

  /**
   * Inicializa a tela de notificações.
   */
  async init() {
    if (!(await App.requireAuthAsync())) return;

    App.renderBottomNav('');

    // Configurar botão "marcar todas como lidas"
    const btnTodas = document.getElementById('btn-marcar-todas');
    if (btnTodas) {
      btnTodas.addEventListener('click', () => Notificacoes.handleMarcarTodasLidas());
    }

    // Carregar notificações
    await Notificacoes.loadData();
  },

  /**
   * Carrega e renderiza as notificações.
   */
  async loadData() {
    const userId = App.getUserId();

    try {
      const lista = await NotificacoesAPI.listar(userId);
      Notificacoes.render(lista);
    } catch (error) {
      console.error('[Notificacoes] Erro ao carregar:', error);
      App.showToast('Erro ao carregar notificações.', 'error');
    }
  },

  /**
   * Renderiza a lista de notificações.
   * @param {Array} lista
   */
  render(lista) {
    const container = document.getElementById('notificacoes-list');
    if (!container) return;

    if (!lista || lista.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><span class="material-symbols-rounded">notifications</span></div>
          <h3>Nenhuma notificação</h3>
          <p>Você está em dia! Novas notificações aparecerão aqui.</p>
        </div>
      `;
      return;
    }

    // Ícones por tipo
    const icones = {
      analise: '<span class="material-symbols-rounded">biotech</span>',
      alerta: '<span class="material-symbols-rounded">warning</span>',
      info: '<span class="material-symbols-rounded">info</span>',
      sucesso: '<span class="material-symbols-rounded">check_circle</span>',
    };

    container.innerHTML = lista.map(n => {
      const icone = icones[n.tipo] || '<span class="material-symbols-rounded">notifications</span>';
      const data = App.formatDate(n.created_at, true);
      const naoLidaStyle = n.lida ? '' : 'background: rgba(26,122,74,0.04); border-left: 3px solid var(--color-primary);';
      const linkHref = n.tipo === 'analise' && n.referencia_id
        ? `relatorio.html?id=${n.referencia_id}`
        : '#';

      return `
        <div class="list-item" data-notif-id="${n.id}" style="${naoLidaStyle} border-radius: var(--border-radius-md); margin-bottom: var(--space-sm);">
          <div style="font-size:24px; flex-shrink:0;">${icone}</div>
          <div class="list-item-body">
            <div class="list-item-title" style="${n.lida ? 'font-weight: var(--font-weight-medium);' : ''}">
              ${n.titulo}
              ${!n.lida ? '<span class="badge badge-primary" style="margin-left:6px;font-size:9px;">NOVA</span>' : ''}
            </div>
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-top: 2px;">${n.mensagem}</div>
            <div style="font-size: var(--font-size-xs); color: var(--text-muted); margin-top: 4px;">${data}</div>
          </div>
          <div class="list-item-actions flex flex-col gap-sm">
            ${!n.lida ? `<button class="btn btn-ghost btn-sm" title="Marcar como lida" onclick="Notificacoes.handleMarcarLida('${n.id}')"><span class="material-symbols-rounded" style="font-size:16px;">done</span></button>` : ''}
            ${n.tipo === 'analise' && n.referencia_id ? `<a href="${linkHref}" class="btn btn-ghost btn-sm" title="Ver análise"><span class="material-symbols-rounded" style="font-size:16px;">visibility</span></a>` : ''}
            <button class="btn btn-ghost btn-sm" style="color:var(--color-error);" title="Excluir" onclick="Notificacoes.handleExcluir('${n.id}')"><span class="material-symbols-rounded" style="font-size:16px;">delete</span></button>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Marca uma notificação como lida.
   * @param {number} id
   */
  async handleMarcarLida(id) {
    try {
      await NotificacoesAPI.marcarLida(id);
      App.showToast('Notificação marcada como lida.', 'success');
      await Notificacoes.loadData();
      App.updateNavBadge();
    } catch (error) {
      App.showToast('Erro ao marcar notificação.', 'error');
    }
  },

  /**
   * Marca todas as notificações como lidas.
   */
  async handleMarcarTodasLidas() {
    const userId = App.getUserId();
    try {
      App.showLoading('Atualizando...');
      await NotificacoesAPI.marcarTodasLidas(userId);
      App.hideLoading();
      App.showToast('Todas as notificações marcadas como lidas.', 'success');
      await Notificacoes.loadData();
      App.updateNavBadge();
    } catch (error) {
      App.hideLoading();
      App.showToast('Erro ao atualizar notificações.', 'error');
    }
  },

  /**
   * Exclui uma notificação.
   * @param {number} id
   */
  handleExcluir(id) {
    App.showModal({
      title: 'Excluir notificação',
      message: 'Deseja excluir esta notificação?',
      confirmText: 'Excluir',
      confirmType: 'danger',
      onConfirm: async () => {
        try {
          await NotificacoesAPI.excluir(id);
          App.showToast('Notificação excluída.', 'success');
          await Notificacoes.loadData();
          App.updateNavBadge();
        } catch (error) {
          App.showToast('Erro ao excluir notificação.', 'error');
        }
      },
    });
  },
};
