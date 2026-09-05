/**
 * Tomeye — app.js
 * Módulo central com utilitários globais reutilizáveis.
 * Gerencia sessão, navegação, toasts, modais, loading e validação.
 */

// ============================================================
// OBJETO GLOBAL App
// ============================================================
const App = {

  // ----------------------------------------------------------
  // SESSÃO (localStorage)
  // ----------------------------------------------------------

  /**
   * Retorna a sessão armazenada ou null.
   * @returns {{ token: string, usuario: object, assinatura: object, plano: object } | null}
   */
  getSession() {
    try {
      const raw = localStorage.getItem('tomeye_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Salva dados de sessão no localStorage.
   * @param {object} data — { token, usuario, assinatura, plano }
   */
  setSession(data) {
    localStorage.setItem('tomeye_session', JSON.stringify(data));
  },

  /**
   * Limpa a sessão (logout).
   */
  clearSession() {
    localStorage.removeItem('tomeye_session');
  },

  /**
   * Retorna o ID do usuário logado ou null.
   * @returns {number|null}
   */
  getUserId() {
    const session = this.getSession();
    return session?.usuario?.id || null;
  },

  /**
   * Verifica se o usuário é do tipo empresa.
   * @returns {boolean}
   */
  isEmpresa() {
    const session = this.getSession();
    return session?.usuario?.tipo === 'empresa';
  },

  /**
   * Verifica se o usuário é do tipo produtor rural.
   * @returns {boolean}
   */
  isProdutor() {
    const session = this.getSession();
    return session?.usuario?.tipo === 'produtor';
  },

  /**
   * Verifica se o usuário pode gerenciar funcionarios (empresa ou produtor).
   * @returns {boolean}
   */
  podeGerenciarFuncionarios() {
    const session = this.getSession();
    const tipo = session?.usuario?.tipo;
    return tipo === 'empresa' || tipo === 'produtor';
  },

  /**
   * Verifica se o usuário é do tipo amador (Horta em casa).
   * Usuários amadores não precisam de fazenda para realizar análises.
   * @returns {boolean}
   */
  isAmador() {
    const session = this.getSession();
    const tipo = session?.usuario?.tipo;
    const local = session?.usuario?.local_producao;
    return tipo === 'amador' || local === 'casa';
  },

  /**
   * Verifica se o usuário é administrador.
   * @returns {boolean}
   */
  isAdmin() {
    const session = this.getSession();
    return session?.usuario?.tipo === 'admin';
  },

  // ----------------------------------------------------------
  // GUARD DE AUTENTICAÇÃO
  // ----------------------------------------------------------

  /**
   * Redireciona para login se não houver sessão ativa.
   * Deve ser chamado no início de cada página protegida.
   * @returns {boolean} true se autenticado
   */
  requireAuth() {
    const session = this.getSession();
    if (!session || !session.token || !session.usuario) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },

  /**
   * Aguarda o Firebase Auth inicializar e sincroniza a sessão.
   * Use este método em páginas protegidas para garantir que a sessão
   * está válida antes de carregar dados.
   * @returns {Promise<boolean>} true se autenticado
   */
  async requireAuthAsync() {
    return new Promise((resolve) => {
      // Verificação rápida no localStorage primeiro
      const session = this.getSession();
      if (!session || !session.token || !session.usuario) {
        window.location.href = 'login.html';
        resolve(false);
        return;
      }

      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Se o Firebase demorar (ex: offline), aceita a sessão válida do localStorage
          console.warn('[App] Firebase Auth demorou para responder, usando sessão local.');
          resolve(true);
        }
      }, 2500);

      // Confirmar com Firebase Auth (pode haver token expirado)
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        unsubscribe(); // Cancela o listener após a primeira resposta
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);

        if (!user) {
          // Token expirou ou sessão inválida
          this.clearSession();
          window.location.href = 'login.html';
          resolve(false);
          return;
        }

        // Renovar token se necessário e atualizar sessão
        try {
          const newToken = await user.getIdToken(false);
          if (newToken && session.token !== newToken) {
            session.token = newToken;
            this.setSession(session);
          }
        } catch (e) {
          console.warn('[App] Não foi possível renovar token:', e.message);
        }

        resolve(true);
      });
    });
  },

  // ----------------------------------------------------------
  // NAVEGAÇÃO
  // ----------------------------------------------------------

  /**
   * Navega para uma URL.
   * @param {string} url
   */
  navigate(url) {
    window.location.href = url;
  },

  /**
   * Volta para a página anterior.
   */
  goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.navigate('dashboard.html');
    }
  },

  // ----------------------------------------------------------
  // TOAST (notificações visuais)
  // ----------------------------------------------------------

  /**
   * Garante que o container de toast exista no DOM.
   */
  _ensureToastContainer() {
    if (!document.getElementById('toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  },

  /**
   * Exibe uma mensagem toast.
   * @param {string} message — Texto da mensagem
   * @param {'success'|'error'|'warning'|'info'} type — Tipo visual
   * @param {number} duration — Duração em ms (padrão 3000)
   */
  showToast(message, type = 'info', duration = 3000) {
    this._ensureToastContainer();
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-remover
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // ----------------------------------------------------------
  // LOADING OVERLAY
  // ----------------------------------------------------------

  /**
   * Exibe overlay de carregamento global.
   * @param {string} message — Mensagem opcional
   */
  showLoading(message = 'Carregando...') {
    // Remove existente
    this.hideLoading();

    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
      <div class="spinner"></div>
      <div class="loading-message">${message}</div>
    `;
    document.body.appendChild(overlay);
  },

  /**
   * Remove overlay de carregamento.
   */
  hideLoading() {
    const existing = document.getElementById('loading-overlay');
    if (existing) existing.remove();
  },

  // ----------------------------------------------------------
  // MODAL DE CONFIRMAÇÃO
  // ----------------------------------------------------------

  /**
   * Exibe um modal de confirmação.
   * @param {object} config
   * @param {string} config.title — Título do modal
   * @param {string} config.message — Mensagem
   * @param {string} config.confirmText — Texto do botão confirmar
   * @param {string} config.cancelText — Texto do botão cancelar
   * @param {'primary'|'danger'} config.confirmType — Estilo do botão
   * @param {Function} config.onConfirm — Callback ao confirmar
   * @param {Function} config.onCancel — Callback ao cancelar
   */
  showModal({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', confirmType = 'primary', onConfirm, onCancel }) {
    // Remove modal existente
    this.closeModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'app-modal';

    backdrop.innerHTML = `
      <div class="modal">
        <h3 class="modal-title">${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn btn-${confirmType} btn-full" id="modal-confirm">${confirmText}</button>
          <button class="btn btn-ghost btn-full" id="modal-cancel">${cancelText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Fechar ao clicar no backdrop
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.closeModal();
        if (onCancel) onCancel();
      }
    });

    document.getElementById('modal-confirm').addEventListener('click', () => {
      this.closeModal();
      if (onConfirm) onConfirm();
    });

    document.getElementById('modal-cancel').addEventListener('click', () => {
      this.closeModal();
      if (onCancel) onCancel();
    });
  },

  /**
   * Fecha modal aberto.
   */
  closeModal() {
    const modal = document.getElementById('app-modal');
    if (modal) modal.remove();
  },

  // ----------------------------------------------------------
  // VALIDAÇÃO DE FORMULÁRIOS
  // ----------------------------------------------------------

  /**
   * Valida campos de um formulário.
   * @param {Array<object>} rules — Lista de regras de validação
   *   Cada regra: { field: 'id_do_campo', label: 'Nome', rules: ['required', 'email', 'cpf_cnpj', 'telefone', 'min:6', 'match:outro_campo'] }
   * @returns {{ valid: boolean, errors: object }}
   */
  validate(rules) {
    const errors = {};
    let valid = true;

    rules.forEach(({ field, label, rules: fieldRules }) => {
      const element = document.getElementById(field);
      if (!element) return;

      const value = element.value.trim();
      const formGroup = element.closest('.form-group');
      const errorEl = formGroup?.querySelector('.form-error');

      // Limpar erros anteriores
      if (formGroup) formGroup.classList.remove('has-error');
      element.classList.remove('is-invalid');

      for (const rule of fieldRules) {
        let errorMsg = null;

        if (rule === 'required' && !value) {
          errorMsg = `${label} é obrigatório.`;
        }

        if (rule === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errorMsg = `${label} inválido.`;
        }

        if (rule === 'cpf_cnpj' && value) {
          const digits = value.replace(/\D/g, '');
          if (digits.length !== 11 && digits.length !== 14) {
            errorMsg = `${label} deve ter 11 (CPF) ou 14 (CNPJ) dígitos.`;
          }
        }

        if (rule === 'telefone' && value) {
          const digits = value.replace(/\D/g, '');
          if (digits.length < 10 || digits.length > 11) {
            errorMsg = `${label} inválido.`;
          }
        }

        if (rule.startsWith('min:') && value) {
          const min = parseInt(rule.split(':')[1]);
          if (value.length < min) {
            errorMsg = `${label} deve ter pelo menos ${min} caracteres.`;
          }
        }

        if (rule.startsWith('match:') && value) {
          const otherField = rule.split(':')[1];
          const otherElement = document.getElementById(otherField);
          if (otherElement && value !== otherElement.value.trim()) {
            errorMsg = `${label} não confere.`;
          }
        }

        if (errorMsg) {
          errors[field] = errorMsg;
          valid = false;
          if (formGroup) formGroup.classList.add('has-error');
          element.classList.add('is-invalid');
          if (errorEl) {
            errorEl.textContent = errorMsg;
            errorEl.style.display = 'block';
          }
          break; // Parar na primeira regra que falhar
        }
      }
    });

    return { valid, errors };
  },

  /**
   * Limpa erros de validação de um formulário.
   * @param {string} formId — ID do formulário
   */
  clearValidationErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.querySelectorAll('.form-group').forEach(group => {
      group.classList.remove('has-error');
      const errorEl = group.querySelector('.form-error');
      if (errorEl) errorEl.style.display = 'none';
    });

    form.querySelectorAll('.form-control').forEach(control => {
      control.classList.remove('is-invalid', 'is-valid');
    });
  },

  // ----------------------------------------------------------
  // FORMATAÇÃO
  // ----------------------------------------------------------

  /**
   * Formata data ISO para formato brasileiro.
   * @param {string} isoDate
   * @param {boolean} includeTime — Incluir hora
   * @returns {string}
   */
  formatDate(isoDate, includeTime = false) {
    if (!isoDate) return '—';
    const d = new Date(isoDate);
    const date = d.toLocaleDateString('pt-BR');
    if (includeTime) {
      return `${date} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date;
  },

  /**
   * Formata valor monetário.
   * @param {number} value
   * @returns {string}
   */
  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  },

  /**
   * Retorna as iniciais de um nome (até 2 letras).
   * @param {string} nome
   * @returns {string}
   */
  getInitials(nome) {
    if (!nome) return '?';
    const parts = nome.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  },

  // ----------------------------------------------------------
  // MÁSCARAS DE INPUT
  // ----------------------------------------------------------

  /**
   * Aplica máscara de CPF/CNPJ em tempo real.
   * @param {HTMLInputElement} input
   */
  maskCpfCnpj(input) {
    input.addEventListener('input', () => {
      let val = input.value.replace(/\D/g, '');
      if (val.length <= 11) {
        // CPF: 000.000.000-00
        val = val.replace(/(\d{3})(\d)/, '$1.$2');
        val = val.replace(/(\d{3})(\d)/, '$1.$2');
        val = val.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      } else {
        // CNPJ: 00.000.000/0000-00
        val = val.substring(0, 14);
        val = val.replace(/^(\d{2})(\d)/, '$1.$2');
        val = val.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        val = val.replace(/\.(\d{3})(\d)/, '.$1/$2');
        val = val.replace(/(\d{4})(\d)/, '$1-$2');
      }
      input.value = val;
    });
  },

  /**
   * Aplica máscara de telefone em tempo real.
   * @param {HTMLInputElement} input
   */
  maskTelefone(input) {
    input.addEventListener('input', () => {
      let val = input.value.replace(/\D/g, '');
      if (val.length <= 10) {
        // Fixo: (00) 0000-0000
        val = val.replace(/(\d{2})(\d)/, '($1) $2');
        val = val.replace(/(\d{4})(\d)/, '$1-$2');
      } else {
        // Celular: (00) 00000-0000
        val = val.substring(0, 11);
        val = val.replace(/(\d{2})(\d)/, '($1) $2');
        val = val.replace(/(\d{5})(\d)/, '$1-$2');
      }
      input.value = val;
    });
  },

  // ----------------------------------------------------------
  // BOTTOM NAVIGATION
  // ----------------------------------------------------------

  /**
   * Gera e insere a navegação inferior na página.
   * @param {string} activePage — Página ativa (ex: 'dashboard', 'historico', 'analise', 'fazendas')
   */
  renderBottomNav(activePage = '') {
    // Remove nav existente
    const existing = document.querySelector('.bottom-nav');
    if (existing) existing.remove();

    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.id = 'bottom-nav';

    const items = [
      { id: 'dashboard', icon: '<span class="material-symbols-rounded">home</span>', label: 'Início', href: 'dashboard.html' },
      { id: 'historico', icon: '<span class="material-symbols-rounded">history</span>', label: 'Histórico', href: 'historico.html' },
      { id: 'analise', icon: '<span class="material-symbols-rounded">photo_camera</span>', label: 'Análise', href: 'analise.html', center: true },
      // Fazendas: visível apenas para produtores e empresas (não para amadores)
      ...(!this.isAmador() ? [{ id: 'fazendas', icon: '<span class="material-symbols-rounded">grass</span>', label: 'Fazendas', href: 'fazendas.html' }] : []),
      { id: 'menu', icon: '<span class="material-symbols-rounded">menu</span>', label: 'Menu', href: '#menu' },
    ];

    items.forEach(item => {
      const isActive = activePage === item.id;

      if (item.center) {
        // Botão central de destaque (Nova Análise)
        nav.innerHTML += `
          <a href="${item.href}" class="nav-item nav-center ${isActive ? 'active' : ''}" data-nav="${item.id}">
            <div class="nav-icon-wrap">${item.icon}</div>
          </a>
        `;
      } else if (item.id === 'menu') {
        // Botão Menu (abre drawer)
        nav.innerHTML += `
          <button class="nav-item ${isActive ? 'active' : ''}" data-nav="${item.id}" id="nav-menu-btn">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </button>
        `;
      } else {
        nav.innerHTML += `
          <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}" data-nav="${item.id}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
            ${item.id === 'dashboard' ? '<span class="nav-badge hidden" id="nav-notif-badge"></span>' : ''}
          </a>
        `;
      }
    });

    document.body.appendChild(nav);

    // Configurar botão de menu
    const menuBtn = document.getElementById('nav-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => this.showMenuDrawer());
    }

    // Atualizar badge de notificações
    this.updateNavBadge();
  },

  /**
   * Exibe o drawer/menu lateral com opções adicionais.
   */
  showMenuDrawer() {
    this.closeModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'app-modal';

    const session = this.getSession();
    const userName = session?.usuario?.nome || 'Usuário';
    const initials = this.getInitials(userName);

    const fotoHtml = session?.usuario?.foto_perfil
      ? `<div class="avatar" style="background-image: url(${session.usuario.foto_perfil}); background-size: cover; background-position: center; color: transparent;"></div>`
      : `<div class="avatar">${initials}</div>`;

    backdrop.innerHTML = `
      <div class="modal">
        <div class="flex items-center justify-between mb-lg">
          <div class="flex items-center gap-md">
            ${fotoHtml}
            <div>
              <div class="font-semibold">${userName}</div>
              <div class="text-muted" style="font-size: var(--font-size-sm);">${session?.plano?.nome || 'Gratuito'}</div>
            </div>
          </div>
          <button id="menu-close-btn" class="btn btn-icon btn-ghost" aria-label="Fechar menu" style="color: var(--text-muted); border: none; padding: 4px; border-radius: 50%;">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="divider"></div>
        <div class="flex flex-col gap-sm" id="menu-items">
          <a href="perfil.html" class="list-item" style="margin-bottom:0">
            <span style="font-size:20px"><span class="material-symbols-rounded">person</span></span>
            <div class="list-item-body"><div class="list-item-title">Perfil</div></div>
            <span style="color:var(--text-muted)">›</span>
          </a>
          ${!this.isAmador() ? `
          <a href="funcionarios.html" class="list-item" style="margin-bottom:0">
            <span style="font-size:20px"><span class="material-symbols-rounded">group</span></span>
            <div class="list-item-body"><div class="list-item-title">Funcionários</div></div>
            <span style="color:var(--text-muted)">›</span>
          </a>
          ` : ''}
          <a href="assinatura.html" class="list-item" style="margin-bottom:0">
            <span style="font-size:20px"><span class="material-symbols-rounded">workspace_premium</span></span>
            <div class="list-item-body"><div class="list-item-title">Assinatura</div></div>
            <span style="color:var(--text-muted)">›</span>
          </a>
          <a href="notificacoes.html" class="list-item" style="margin-bottom:0">
            <span style="font-size:20px"><span class="material-symbols-rounded">notifications</span></span>
            <div class="list-item-body"><div class="list-item-title">Notificações</div></div>
            <span class="nav-badge" id="menu-notif-badge" style="position:static; display:none;">0</span>
            <span style="color:var(--text-muted)">›</span>
          </a>
          ${this.isAdmin() ? `
          <div class="divider"></div>
          <a href="admin.html" class="list-item" style="margin-bottom:0">
            <span style="font-size:20px"><span class="material-symbols-rounded">settings</span></span>
            <div class="list-item-body"><div class="list-item-title">Administração</div></div>
            <span style="color:var(--text-muted)">›</span>
          </a>
          ` : ''}
          <div class="divider"></div>
          <button class="btn btn-ghost btn-full" id="menu-logout-btn" style="color:var(--color-error)">
            <span class="material-symbols-rounded" style="vertical-align:middle;font-size:18px;">logout</span> Sair da conta
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Fechar ao clicar no backdrop ou no botão X
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.closeModal();
    });

    const closeBtn = document.getElementById('menu-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    // Logout
    document.getElementById('menu-logout-btn').addEventListener('click', async () => {
      this.closeModal();
      try {
        await AuthAPI.logout();
      } catch (e) {
        console.warn('Erro ao fazer logout:', e);
      }
      this.clearSession();
      this.navigate('login.html');
    });

    // Atualizar badge no menu
    this._updateMenuNotifBadge();
  },

  /**
   * Atualiza o badge de notificações na nav inferior.
   */
  async updateNavBadge() {
    try {
      const userId = this.getUserId();
      if (!userId) return;
      const count = await NotificacoesAPI.contarNaoLidas(userId);
      const badge = document.getElementById('nav-notif-badge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 9 ? '9+' : count;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('Erro ao atualizar badge:', e);
    }
  },

  /**
   * Atualiza badge de notificações no menu drawer.
   */
  async _updateMenuNotifBadge() {
    try {
      const userId = this.getUserId();
      if (!userId) return;
      const count = await NotificacoesAPI.contarNaoLidas(userId);
      const badge = document.getElementById('menu-notif-badge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count;
          badge.style.display = 'flex';
        }
      }
    } catch (e) {
      console.warn('Erro ao atualizar badge do menu:', e);
    }
  },

  // ----------------------------------------------------------
  // TOGGLE DE SENHA AUTOMÁTICO
  // ----------------------------------------------------------

  /**
   * Vincula a funcionalidade de alternar visualização de senha a um par input + botão.
   * Evita vincular múltiplos listeners duplicados.
   * @param {HTMLInputElement} input
   * @param {HTMLButtonElement} btn
   */
  bindPasswordToggle(input, btn) {
    if (!input || !btn) return;
    if (btn._hasPasswordToggleAttached) return;
    btn._hasPasswordToggleAttached = true;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mostrando = input.type === 'text';
      input.type = mostrando ? 'password' : 'text';
      btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:20px;">${mostrando ? 'visibility' : 'visibility_off'}</span>`;
      btn.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
      btn.setAttribute('title', mostrando ? 'Mostrar senha' : 'Ocultar senha');
    });
  },

  /**
   * Inicializa automaticamente todos os botões de alternar visualização de senha da página.
   */
  initPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach(btn => {
      const targetId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(targetId);
      if (input) {
        this.bindPasswordToggle(input, btn);
      }
    });

    document.querySelectorAll('.password-toggle, .input-password-toggle').forEach(btn => {
      if (btn.hasAttribute('data-toggle-password')) return;
      const parent = btn.closest('.input-wrapper, .input-group');
      const input = parent ? parent.querySelector('input[type="password"], input[type="text"]') : null;
      if (input) {
        this.bindPasswordToggle(input, btn);
      }
    });
  },

  // ----------------------------------------------------------
  // PAGE HEADER (cabeçalho de páginas internas)
  // ----------------------------------------------------------

  /**
   * Gera o cabeçalho padrão de páginas internas.
   * @param {string} title — Título da página
   * @param {object} options
   * @param {string} options.backUrl — URL do botão voltar (default: goBack)
   * @param {string} options.actionText — Texto da ação no header
   * @param {Function} options.onAction — Callback da ação
   * @returns {string} HTML do header
   */
  renderPageHeader(title, { backUrl, actionText, onAction } = {}) {
    const backHandler = backUrl ? `href="${backUrl}"` : `href="#" onclick="App.goBack(); return false;"`;

    let actionHtml = '';
    if (actionText) {
      actionHtml = `<button class="page-header-action" id="page-header-action">${actionText}</button>`;
    }

    return `
      <header class="page-header">
        <a ${backHandler} class="page-header-back">←</a>
        <h1 class="page-header-title">${title}</h1>
        ${actionHtml}
      </header>
    `;
  },
};

// Auto-inicializar toggles de senha quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.initPasswordToggles());
} else {
  App.initPasswordToggles();
}

