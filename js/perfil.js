/**
 * Tomeye — perfil.js
 * Módulo de gerenciamento do perfil do usuário.
 */

const Perfil = {

  /** Dados do perfil carregados */
  _data: null,

  /**
   * Inicializa a tela de perfil.
   */
  async init() {
    if (!(await App.requireAuthAsync())) return;

    // Aplicar máscara de telefone
    const telInput = document.getElementById('perfil-telefone');
    if (telInput) App.maskTelefone(telInput);

    // Configurar formulários
    this.setupForms();

    // Configurar file input para avatar
    const avatar = document.getElementById('perfil-avatar');
    const inputFoto = document.getElementById('perfil-foto-input');
    if (avatar && inputFoto) {
      avatar.addEventListener('click', () => inputFoto.click());
      inputFoto.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          this._novaFotoBase64 = ev.target.result;
          avatar.style.backgroundImage = `url(${this._novaFotoBase64})`;
          const initials = document.getElementById('perfil-avatar-initials');
          if (initials) initials.style.display = 'none';
        };
        reader.readAsDataURL(file);
      });
    }

    // Carregar dados
    await this.loadData();

    // Configurar logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        App.showModal({
          title: 'Sair da conta',
          message: 'Tem certeza que deseja sair? Você precisará fazer login novamente.',
          confirmText: 'Sair',
          confirmType: 'danger',
          onConfirm: () => Auth.logout(),
        });
      });
    }

    // Configurar exclusão de conta
    const btnExcluir = document.getElementById('btn-excluir-conta');
    if (btnExcluir) {
      btnExcluir.addEventListener('click', () => Perfil.handleDeleteAccount());
    }

    // Configurar botão "Alterar Perfil"
    const btnAlterarPerfil = document.getElementById('btn-alterar-perfil');
    if (btnAlterarPerfil) {
      btnAlterarPerfil.addEventListener('click', () => Perfil.openAlterarPerfilModal());
    }
  },

  /**
   * Exclui a conta do usuário com dupla confirmação (RF 1.1).
   */
  handleDeleteAccount() {
    // Modal com campo de confirmação
    App.closeModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'app-modal';

    backdrop.innerHTML = `
      <div class="modal">
        <h3 class="modal-title" style="color:var(--color-error);"><span class="material-symbols-rounded" style="vertical-align:middle;font-size:18px;">warning</span> Excluir conta</h3>
        <p style="margin-bottom:var(--space-md);">
          Esta ação é <strong>irreversível</strong>. Todos os seus dados serão permanentemente excluídos, incluindo análises, fazendas e configurações.
        </p>
        <div class="form-group" style="margin-bottom:var(--space-md);">
          <label class="form-label">Digite <strong>EXCLUIR</strong> para confirmar:</label>
          <input type="text" id="confirmar-exclusao" class="form-control" placeholder="EXCLUIR" autocomplete="off">
        </div>
        <div class="modal-actions">
          <button class="btn btn-full" id="modal-confirm-delete" style="background:var(--color-error); color:white; border:none;" disabled>
            Excluir permanentemente
          </button>
          <button class="btn btn-ghost btn-full" id="modal-cancel-delete">Cancelar</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const input = document.getElementById('confirmar-exclusao');
    const btnConfirm = document.getElementById('modal-confirm-delete');

    input.addEventListener('input', () => {
      btnConfirm.disabled = input.value.trim() !== 'EXCLUIR';
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) App.closeModal();
    });

    document.getElementById('modal-cancel-delete').addEventListener('click', () => App.closeModal());

    btnConfirm.addEventListener('click', async () => {
      if (input.value.trim() !== 'EXCLUIR') return;
      App.closeModal();

      try {
        App.showLoading('Excluindo conta...');
        const userId = App.getUserId();
        await PerfilAPI.excluirConta(userId);
        App.hideLoading();
        App.clearSession();
        App.showToast('Conta excluída com sucesso.', 'success');
        setTimeout(() => { window.location.href = 'login.html'; }, 1000);
      } catch (error) {
        App.hideLoading();
        App.showToast(error.message || 'Erro ao excluir conta.', 'error');
      }
    });
  },

  /**
   * Configura os formulários de edição.
   */
  setupForms() {
    // Formulário de dados pessoais
    const perfilForm = document.getElementById('perfil-form');
    if (perfilForm) {
      perfilForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSave();
      });
    }

    // Formulário de senha
    const senhaForm = document.getElementById('senha-form');
    if (senhaForm) {
      senhaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleChangePassword();
      });
    }
  },

  /**
   * Carrega os dados do perfil.
   */
  async loadData() {
    const userId = App.getUserId();

    try {
      const data = await PerfilAPI.obter(userId);
      this._data = data;
      this.render(data);
    } catch (error) {
      console.error('[Perfil] Erro ao carregar:', error);
      App.showToast('Erro ao carregar dados do perfil.', 'error');
    }
  },

  /**
   * Renderiza os dados do perfil nos campos.
   * @param {object} data — { usuario, assinatura, plano }
   */
  render(data) {
    const { usuario, assinatura, plano } = data;

    // Avatar
    const avatar = document.getElementById('perfil-avatar');
    const initials = document.getElementById('perfil-avatar-initials');
    if (avatar && initials) {
      if (usuario.foto_perfil) {
        avatar.style.backgroundImage = `url(${usuario.foto_perfil})`;
        initials.style.display = 'none';
      } else {
        avatar.style.backgroundImage = 'none';
        initials.style.display = 'inline';
        initials.textContent = App.getInitials(usuario.nome);
      }
    }

    // Nome de exibição
    const nomeDisplay = document.getElementById('perfil-nome-display');
    if (nomeDisplay) nomeDisplay.textContent = usuario.nome;

    // Badge do plano
    const planoBadge = document.getElementById('perfil-plano-badge');
    if (planoBadge) planoBadge.textContent = plano?.nome || 'Gratuito';

    // Campos do formulário
    const campos = {
      'perfil-nome': usuario.nome,
      'perfil-email': usuario.email,
      'perfil-cpf-cnpj': usuario.cpf_cnpj,
      'perfil-telefone': usuario.telefone,
    };

    Object.entries(campos).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor || '';
    });

    // Mostrar CPF mascarado se disponível
    const cpfEl = document.getElementById('perfil-cpf-cnpj');
    if (cpfEl) {
      cpfEl.value = usuario.cpf_display || usuario.cpf_cnpj || '';
    }

    // Card do plano
    const planoCard = document.getElementById('perfil-plano-card');
    if (planoCard) {
      const utilizadas = assinatura?.analises_utilizadas || 0;
      const limite = plano?.limite_analises || 5;

      planoCard.innerHTML = `
        <div class="card-body">
          <div class="flex justify-between items-center mb-sm">
            <span class="font-semibold">${plano?.nome || 'Gratuito'}</span>
            <span class="badge badge-success">${assinatura?.status || 'ativa'}</span>
          </div>
          <p style="font-size: var(--font-size-sm); margin-bottom: var(--space-sm);">
            ${plano?.descricao || 'Plano básico gratuito'}
          </p>
          <div class="divider"></div>
          <div class="flex justify-between" style="font-size: var(--font-size-sm);">
            <span class="text-secondary">Análises: ${utilizadas}/${limite}</span>
            <span class="text-secondary">Vencimento: ${assinatura ? App.formatDate(assinatura.vencimento) : '—'}</span>
          </div>
          <a href="assinatura.html" class="btn btn-secondary btn-sm btn-full mt-md">Gerenciar plano</a>
        </div>
      `;
    }
  },

  /**
   * Salva alterações do perfil.
   */
  async handleSave() {
    const { valid } = App.validate([
      { field: 'perfil-nome', label: 'Nome', rules: ['required'] },
      { field: 'perfil-email', label: 'E-mail', rules: ['required', 'email'] },
      { field: 'perfil-telefone', label: 'Telefone', rules: ['required', 'telefone'] },
    ]);

    if (!valid) return;

    const dados = {
      nome: document.getElementById('perfil-nome').value.trim(),
      email: document.getElementById('perfil-email').value.trim(),
      telefone: document.getElementById('perfil-telefone').value.trim(),
    };

    if (this._novaFotoBase64) {
      dados.foto_perfil = this._novaFotoBase64;
    }

    const btn = document.getElementById('btn-salvar-perfil');

    try {
      btn.disabled = true;
      btn.textContent = 'Salvando...';

      const userId = App.getUserId();
      await PerfilAPI.atualizar(userId, dados);

      // Atualizar sessão local
      const session = App.getSession();
      session.usuario = { ...session.usuario, ...dados };
      App.setSession(session);

      App.showToast('Perfil atualizado com sucesso!', 'success');

      // Atualizar exibição
      const nomeDisplay = document.getElementById('perfil-nome-display');
      if (nomeDisplay) nomeDisplay.textContent = dados.nome;

      const avatar = document.getElementById('perfil-avatar');
      const initials = document.getElementById('perfil-avatar-initials');
      if (avatar && initials) {
        if (dados.foto_perfil) {
          avatar.style.backgroundImage = `url(${dados.foto_perfil})`;
          initials.style.display = 'none';
        } else {
          initials.textContent = App.getInitials(dados.nome);
        }
      }

    } catch (error) {
      App.showToast(error.message || 'Erro ao salvar perfil.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar alterações';
    }
  },

  /**
   * Altera a senha do usuário.
   */
  async handleChangePassword() {
    const { valid } = App.validate([
      { field: 'senha-atual', label: 'Senha atual', rules: ['required'] },
      { field: 'senha-nova', label: 'Nova senha', rules: ['required', 'min:6'] },
      { field: 'senha-confirmar', label: 'Confirmação', rules: ['required', 'match:senha-nova'] },
    ]);

    if (!valid) return;

    const senhaAtual = document.getElementById('senha-atual').value;
    const novaSenha = document.getElementById('senha-nova').value;
    const btn = document.getElementById('btn-alterar-senha');

    try {
      btn.disabled = true;
      btn.textContent = 'Alterando...';

      const userId = App.getUserId();
      await PerfilAPI.alterarSenha(userId, senhaAtual, novaSenha);

      App.showToast('Senha alterada com sucesso!', 'success');

      // Limpar campos de senha
      document.getElementById('senha-atual').value = '';
      document.getElementById('senha-nova').value = '';
      document.getElementById('senha-confirmar').value = '';
      App.clearValidationErrors('senha-form');

    } catch (error) {
      App.showToast(error.message || 'Erro ao alterar senha.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Alterar senha';
    }
  },

  /**
   * Abre um modal completo para alterar o perfil (tipo de conta, local de produção, etc.).
   */
  openAlterarPerfilModal() {
    // Remover modal anterior se existir
    document.getElementById('alterar-perfil-modal')?.remove();

    const data = this._data;
    if (!data) {
      App.showToast('Dados do perfil ainda não carregados.', 'error');
      return;
    }

    const { usuario } = data;

    const wrapper = document.createElement('div');
    wrapper.id = 'alterar-perfil-modal';
    wrapper.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);padding:16px;';

    wrapper.innerHTML = `
      <div style="background:white;border-radius:16px;max-width:460px;width:100%;max-height:88vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="material-symbols-rounded" style="color:#e53935;font-size:22px;">edit</span>
          <h3 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">Alterar Perfil</h3>
        </div>
        <p style="font-size:13px;color:#64748b;margin-bottom:20px;">Edite as informações que deseja atualizar.</p>

        <form id="alterar-perfil-form" novalidate>

          <!-- ── Dados Pessoais ── -->
          <div style="font-size:12px;font-weight:700;color:#e53935;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-rounded" style="font-size:16px;">person</span> Dados Pessoais
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Nome Completo</label>
            <input type="text" id="alt-nome" value="${usuario.nome || ''}" placeholder="Seu nome completo"
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">E-mail</label>
            <input type="email" id="alt-email" value="${usuario.email || ''}" placeholder="seu@email.com"
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Telefone</label>
            <input type="tel" id="alt-telefone" value="${usuario.telefone || ''}" placeholder="(00) 00000-0000"
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
          </div>

          <!-- CPF (somente leitura) -->
          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">CPF</label>
            <input type="text" value="${usuario.cpf_display || usuario.cpf_cnpj || 'Não informado'}" disabled
              style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;box-sizing:border-box;background:#f8fafc;color:#94a3b8;">
            <span style="font-size:11px;color:#94a3b8;margin-top:3px;display:block;">O CPF não pode ser alterado.</span>
          </div>

          <!-- ── Nova Senha (opcional) ── -->
          <div style="font-size:12px;font-weight:700;color:#e53935;text-transform:uppercase;letter-spacing:0.5px;margin:18px 0 10px;display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-rounded" style="font-size:16px;">lock</span> Alterar Senha
            <span style="font-size:10px;font-weight:400;color:#94a3b8;text-transform:none;letter-spacing:0;">(opcional)</span>
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Senha Atual</label>
            <input type="password" id="alt-senha-atual" placeholder="Digite sua senha atual"
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
          </div>

          <div style="display:flex;gap:10px;margin-bottom:14px;">
            <div style="flex:1;">
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Nova Senha</label>
              <input type="password" id="alt-senha-nova" placeholder="Mín. 6 caracteres"
                style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
            </div>
            <div style="flex:1;">
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Confirmar</label>
              <input type="password" id="alt-senha-confirmar" placeholder="Repita a senha"
                style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
            </div>
          </div>

          <!-- ── Perfil de Uso ── -->
          <div style="font-size:12px;font-weight:700;color:#e53935;text-transform:uppercase;letter-spacing:0.5px;margin:18px 0 10px;display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-rounded" style="font-size:16px;">agriculture</span> Perfil de Uso
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Tipo de Conta</label>
            <select id="alt-tipo" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;background:white;color:#0f172a;">
              <option value="amador" ${usuario.tipo === 'amador' ? 'selected' : ''}>Horta em casa / Amador</option>
              <option value="produtor" ${usuario.tipo === 'produtor' ? 'selected' : ''}>Produtor Rural</option>
              <option value="empresa" ${usuario.tipo === 'empresa' ? 'selected' : ''}>Empresa</option>
            </select>
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Local de Produção</label>
            <select id="alt-local" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;background:white;color:#0f172a;">
              <option value="casa" ${usuario.local_producao === 'casa' || !usuario.local_producao ? 'selected' : ''}>Horta em casa</option>
              <option value="fazenda" ${usuario.local_producao === 'fazenda' ? 'selected' : ''}>Fazenda / Propriedade Rural</option>
            </select>
          </div>

          <!-- Campos de Empresa (condicional) -->
          <div id="alt-grupo-empresa" style="margin-bottom:14px;display:${usuario.tipo === 'empresa' ? 'block' : 'none'};background:#f8fafc;border-radius:12px;padding:14px;border:1px solid #e2e8f0;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Dados da Empresa</div>
            
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Razão Social</label>
            <input type="text" id="alt-razao-social" value="${usuario.razao_social || ''}" placeholder="Nome oficial da empresa"
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;margin-bottom:10px;">

            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">CNPJ</label>
            <input type="text" id="alt-cnpj" value="${usuario.cpf_cnpj || ''}" placeholder="00.000.000/0000-00"
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;margin-bottom:10px;">

            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Nº de Funcionários</label>
            <input type="number" id="alt-funcionarios" value="${usuario.numero_funcionarios || ''}" placeholder="Ex: 15" min="1"
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
          </div>

          <!-- Botões -->
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button type="button" id="alt-cancelar" style="flex:1;padding:12px;border-radius:10px;background:transparent;color:#64748b;border:1px solid #d1d5db;font-weight:600;font-size:14px;cursor:pointer;">Cancelar</button>
            <button type="submit" id="alt-salvar" style="flex:1;padding:12px;border-radius:10px;background:#e53935;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;">Salvar Alterações</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(wrapper);

    // Fechar ao clicar no backdrop
    wrapper.addEventListener('click', e => { if (e.target === wrapper) wrapper.remove(); });
    document.getElementById('alt-cancelar').addEventListener('click', () => wrapper.remove());

    // Máscara de telefone
    const telInput = document.getElementById('alt-telefone');
    if (telInput && typeof App !== 'undefined' && App.maskTelefone) {
      App.maskTelefone(telInput);
    }

    // Mostrar/ocultar grupo empresa ao mudar tipo
    const tipoSelect = document.getElementById('alt-tipo');
    tipoSelect.addEventListener('change', () => {
      const grupoEmpresa = document.getElementById('alt-grupo-empresa');
      if (grupoEmpresa) grupoEmpresa.style.display = tipoSelect.value === 'empresa' ? 'block' : 'none';
    });

    // Submit
    document.getElementById('alterar-perfil-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const novoNome = document.getElementById('alt-nome').value.trim();
      const novoEmail = document.getElementById('alt-email').value.trim();
      const novoTelefone = document.getElementById('alt-telefone').value.trim();
      const novoTipo = document.getElementById('alt-tipo').value;
      const novoLocal = document.getElementById('alt-local').value;

      // Validações básicas
      if (!novoNome) { App.showToast('O nome é obrigatório.', 'error'); return; }
      if (!novoEmail) { App.showToast('O e-mail é obrigatório.', 'error'); return; }
      if (!novoTelefone) { App.showToast('O telefone é obrigatório.', 'error'); return; }

      const dadosUpdate = {
        nome: novoNome,
        email: novoEmail,
        telefone: novoTelefone,
        tipo: novoTipo,
        local_producao: novoLocal,
      };

      if (novoTipo === 'empresa') {
        dadosUpdate.razao_social = document.getElementById('alt-razao-social').value.trim();
        const cnpj = document.getElementById('alt-cnpj').value.trim();
        if (cnpj) dadosUpdate.cpf_cnpj = cnpj;
        dadosUpdate.numero_funcionarios = document.getElementById('alt-funcionarios').value.trim() || null;
      }

      const btn = document.getElementById('alt-salvar');
      try {
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const userId = App.getUserId();

        // Alterar senha se preenchida
        const senhaAtual = document.getElementById('alt-senha-atual').value;
        const senhaNova = document.getElementById('alt-senha-nova').value;
        const senhaConfirmar = document.getElementById('alt-senha-confirmar').value;

        if (senhaAtual || senhaNova || senhaConfirmar) {
          if (!senhaAtual) { App.showToast('Digite a senha atual para alterar.', 'error'); throw new Error('stop'); }
          if (!senhaNova || senhaNova.length < 6) { App.showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error'); throw new Error('stop'); }
          if (senhaNova !== senhaConfirmar) { App.showToast('As senhas não coincidem.', 'error'); throw new Error('stop'); }

          await PerfilAPI.alterarSenha(userId, senhaAtual, senhaNova);
          App.showToast('Senha alterada com sucesso!', 'success');
        }

        // Salvar dados do perfil
        await PerfilAPI.atualizar(userId, dadosUpdate);

        // Atualizar sessão local
        const session = App.getSession();
        session.usuario = { ...session.usuario, ...dadosUpdate };
        App.setSession(session);

        App.showToast('Perfil atualizado com sucesso!', 'success');
        wrapper.remove();

        // Recarregar dados do perfil
        await Perfil.loadData();

      } catch (error) {
        if (error.message !== 'stop') {
          App.showToast(error.message || 'Erro ao atualizar perfil.', 'error');
        }
        btn.disabled = false;
        btn.textContent = 'Salvar Alterações';
      }
    });
  },
};
