/**
 * Tomeye — admin.js
 * Painel Administrativo — Métricas, Financeiro, Usuários, Doenças e IA.
 * Design Limpo: Branco & Vermelho
 */

const Admin = {

  // Despesas operacionais fixas estimadas (R$/mês)
  DESPESAS: {
    infra: 350.00,
    ia: 120.00,
    storage: 80.00,
    suporte: 200.00,
  },

  _doencasCache: [],

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async init() {
    Admin._setupTabs();
    Admin._setupRefreshBtn();

    // Verificação de autenticação
    try {
      const authOk = await App.requireAuthAsync();
      if (!authOk) return;

      if (!App.isAdmin()) {
        const session = App.getSession();
        if (!session?.usuario?.email?.toLowerCase().includes('admin')) {
          App.showToast('Acesso restrito a administradores.', 'error');
          setTimeout(() => App.navigate('dashboard.html'), 1500);
          return;
        }
      }
    } catch (e) {
      console.warn('[Admin] Verificação de sessão:', e.message);
    }

    await Admin.loadMetricas();
  },

  // ============================================================
  // TABS & NAVEGAÇÃO SUPERIOR
  // ============================================================

  switchTab(target) {
    if (!target) return;
    const tabs = document.querySelectorAll('.admin-tab-btn');
    tabs.forEach(t => {
      if (t.getAttribute('data-tab') === target) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById(`panel-${target}`);
    if (panel) panel.classList.remove('hidden');

    switch (target) {
      case 'metricas': Admin.loadMetricas(); break;
      case 'financeiro': Admin.loadFinanceiro(); break;
      case 'usuarios': Admin.loadUsuarios(); break;
      case 'doencas': Admin.loadDoencas(); break;
      case 'modelo': Admin.loadModelo(); break;
    }
  },

  _setupTabs() {
    if (Admin._tabsInitialized) return;
    Admin._tabsInitialized = true;

    document.addEventListener('click', (e) => {
      const tab = e.target.closest('.admin-tab-btn');
      if (!tab) return;
      e.preventDefault();
      const target = tab.getAttribute('data-tab');
      Admin.switchTab(target);
    });
  },

  async refreshActiveTab(btnEl) {
    const btn = btnEl || document.getElementById('btn-refresh-admin');
    if (btn) {
      btn.style.transform = 'rotate(360deg)';
      btn.style.transition = 'transform 0.5s ease';
    }
    const activeTab = document.querySelector('.admin-tab-btn.active')?.getAttribute('data-tab') || 'metricas';
    Admin.switchTab(activeTab);
    if (btn) setTimeout(() => { btn.style.transform = ''; }, 500);
  },

  _setupRefreshBtn() {
    if (Admin._refreshInitialized) return;
    Admin._refreshInitialized = true;

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('#btn-refresh-admin, .btn-refresh-admin');
      if (!btn) return;
      e.preventDefault();
      Admin.refreshActiveTab(btn);
    });
  },

  // ============================================================
  // 1. VISÃO GERAL / MÉTRICAS
  // ============================================================

  async loadMetricas() {
    try {
      const metricas = await AdminAPI.getMetricas();
      const despesasTotal = Object.values(Admin.DESPESAS).reduce((s, v) => s + v, 0);
      const lucroMensal = metricas.receitaMensal - despesasTotal;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      set('kpi-usuarios', metricas.totalUsuarios);
      set('kpi-usuarios-sub', `${metricas.totalDoencas || 0} doenças cadastradas`);

      set('kpi-analises', metricas.totalAnalises);
      const media = metricas.totalUsuarios > 0
        ? (metricas.totalAnalises / metricas.totalUsuarios).toFixed(1) : 0;
      set('kpi-analises-sub', `Média de ${media} por usuário`);

      set('kpi-receita', App.formatCurrency(metricas.receitaMensal));
      set('kpi-receita-sub', `${App.formatCurrency(metricas.receitaAnualEstimada)}/ano est.`);

      const elLucro = document.getElementById('kpi-lucro');
      if (elLucro) {
        elLucro.textContent = App.formatCurrency(lucroMensal);
        elLucro.style.color = lucroMensal >= 0 ? '#16a34a' : '#dc2626';
      }
      const margemPct = metricas.receitaMensal > 0
        ? Math.round((lucroMensal / metricas.receitaMensal) * 100) : 0;
      set('kpi-lucro-sub', `Margem: ${margemPct}%`);

      Admin._renderPlanosDist(metricas.distribuicaoPlanos);
      await Admin._renderDoencasStats();

    } catch (err) {
      console.error('[Admin] Erro ao carregar métricas:', err);
      App.showToast('Erro ao carregar métricas.', 'error');
    }
  },

  _renderPlanosDist(distribuicao) {
    const container = document.getElementById('admin-planos-dist');
    const badge = document.getElementById('badge-total-assinantes');
    if (!container) return;

    const total = (distribuicao || []).reduce((s, p) => s + p.quantidade, 0);
    if (badge) badge.textContent = `${total} assinante(s)`;

    if (!distribuicao || distribuicao.length === 0) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Nenhuma assinatura</div>';
      return;
    }

    const colors = { 1: '#64748b', 2: '#e53935', 3: '#d97706', 4: '#0284c7' };
    const icons = { 1: 'lock_open', 2: 'eco', 3: 'business', 4: 'corporate_fare' };

    container.innerHTML = distribuicao.map(p => {
      const pct = total > 0 ? Math.round((p.quantidade / total) * 100) : 0;
      const color = colors[p.plano_id] || '#e53935';
      const icon = icons[p.plano_id] || 'inventory_2';
      return `
        <div class="plan-bar-row">
          <div style="display:flex; align-items:center; gap:8px; font-weight:600; color:#0f172a;">
            <span class="material-symbols-rounded" style="color:${color}; font-size:18px;">${icon}</span>
            ${p.plano}
          </div>
          <div style="display:flex; align-items:center; gap:12px; width:50%;">
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%; background:${color};"></div>
            </div>
            <span style="font-size:11px; color:#64748b; width:70px; text-align:right;">${p.quantidade} (${pct}%)</span>
          </div>
        </div>
      `;
    }).join('');
  },

  async _renderDoencasStats() {
    const container = document.getElementById('admin-doencas-stats');
    const badge = document.getElementById('badge-total-doencas-det');
    if (!container) return;

    let analises = [];
    try {
      const snap = await db.collection('analises').get();
      analises = snap.docs.map(d => d.data());
    } catch (e) { }

    const contagem = {};
    analises.forEach(a => {
      const nome = a.doenca_nome || 'Desconhecida';
      contagem[nome] = (contagem[nome] || 0) + 1;
    });

    const ranking = Object.entries(contagem)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    if (badge) badge.textContent = `${analises.length} análise(s)`;

    if (ranking.length === 0) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Nenhuma análise realizada</div>';
      return;
    }

    const maxCount = ranking[0][1];
    container.innerHTML = ranking.map(([nome, count], i) => {
      const pct = Math.round((count / maxCount) * 100);
      return `
        <div class="doenca-stat-row">
          <div style="display:flex; align-items:center; gap:8px; font-weight:600; color:#0f172a;">
            <span style="font-size:11px; font-weight:700; color:#e53935; background:#fff0f0; width:20px; height:20px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;">${i + 1}</span>
            ${nome}
          </div>
          <div style="display:flex; align-items:center; gap:12px; width:50%;">
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%; background:#e53935;"></div>
            </div>
            <span style="font-size:11px; color:#64748b; width:70px; text-align:right;">${count} caso(s)</span>
          </div>
        </div>
      `;
    }).join('');
  },

  // ============================================================
  // 2. FINANCEIRO
  // ============================================================

  async loadFinanceiro() {
    try {
      const metricas = await AdminAPI.getMetricas();
      const D = Admin.DESPESAS;
      const despesasTotal = Object.values(D).reduce((s, v) => s + v, 0);
      const receitaBruta = metricas.receitaMensal;
      const lucroMensal = receitaBruta - despesasTotal;
      const margemPct = receitaBruta > 0 ? Math.round((lucroMensal / receitaBruta) * 100) : 0;

      const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

      set('fin-receita-bruta', App.formatCurrency(receitaBruta));

      const elRecPorPlano = document.getElementById('fin-receita-por-plano');
      if (elRecPorPlano && metricas.distribuicaoPlanos) {
        const precos = { 1: 0, 2: 60.00, 3: 100.00, 4: 1000.00 };
        elRecPorPlano.innerHTML = metricas.distribuicaoPlanos.map(p => {
          const preco = precos[p.plano_id] || 0;
          const receita = preco * p.quantidade;
          return `
            <div class="finance-row">
              <span class="finance-row-label">
                <span class="material-symbols-rounded" style="color:#e53935;">inventory_2</span>
                ${p.plano} (${p.quantidade} × R$ ${preco.toFixed(2)})
              </span>
              <span class="finance-row-value positive">${App.formatCurrency(receita)}</span>
            </div>
          `;
        }).join('');
      }

      set('fin-despesas-total', App.formatCurrency(despesasTotal));
      set('fin-infra', `- ${App.formatCurrency(D.infra)}`);
      set('fin-ia', `- ${App.formatCurrency(D.ia)}`);
      set('fin-storage', `- ${App.formatCurrency(D.storage)}`);
      set('fin-suporte', `- ${App.formatCurrency(D.suporte)}`);

      set('fin-result-receita', App.formatCurrency(receitaBruta));
      set('fin-result-despesas', `- ${App.formatCurrency(despesasTotal)}`);

      const elResultLucro = document.getElementById('fin-result-lucro');
      if (elResultLucro) {
        elResultLucro.textContent = `${lucroMensal >= 0 ? '+' : ''}${App.formatCurrency(lucroMensal)}`;
        elResultLucro.className = `finance-row-value ${lucroMensal >= 0 ? 'positive' : 'negative'}`;
      }

      set('fin-anual', App.formatCurrency(receitaBruta * 12));
      set('fin-lucro-anual', App.formatCurrency(lucroMensal * 12));

      set('fin-margem-pct', `${margemPct}%`);
      const elBar = document.getElementById('fin-margem-bar');
      if (elBar) {
        const clamp = Math.max(0, Math.min(100, margemPct));
        setTimeout(() => { elBar.style.width = clamp + '%'; }, 100);
        elBar.style.background = margemPct >= 30 ? '#16a34a' : margemPct >= 10 ? '#e53935' : '#dc2626';
      }

      const elDesc = document.getElementById('fin-margem-desc');
      if (elDesc) {
        if (margemPct >= 30) elDesc.textContent = '✓ Excelente — margem de lucro saudável.';
        else if (margemPct >= 10) elDesc.textContent = '⚠ Regular — monitore as despesas operacionais.';
        else elDesc.textContent = '✗ Baixa/Prejuízo — necessária revisão de custos.';
      }

    } catch (err) {
      console.error('[Admin] Erro ao carregar financeiro:', err);
      App.showToast('Erro ao carregar dados financeiros.', 'error');
    }
  },

  // ============================================================
  // 3. USUÁRIOS
  // ============================================================

  async loadUsuarios() {
    const containerList = document.getElementById('admin-usuarios-list');
    const containerAss = document.getElementById('admin-assinaturas-list');
    if (!containerList) return;

    containerList.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Carregando usuários...</div>';
    if (containerAss) containerAss.innerHTML = containerList.innerHTML;

    try {
      const usuarios = await AdminAPI.getUsuarios();
      // Filtrar: remover admins e funcionários da lista de exibição
      const naoAdmin = usuarios.filter(u => u.tipo !== 'admin' && u.tipo !== 'funcionario');

      const produtores = naoAdmin.filter(u => u.tipo === 'produtor').length;
      const amadores = naoAdmin.filter(u => u.tipo === 'amador').length;
      const empresas = naoAdmin.filter(u => u.tipo === 'empresa').length;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('kpi-produtores', produtores);
      set('kpi-empresas', empresas);
      set('badge-total-users', `${naoAdmin.length} usuário(s)`);

      if (!naoAdmin.length) {
        containerList.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Nenhum usuário cadastrado.</div>';
        return;
      }

      const planoPill = (nome) => {
        if (!nome || nome === 'Gratuito') return `<span class="plan-pill pill-free">Gratuito</span>`;
        if (nome === 'Avançado') return `<span class="plan-pill pill-avancado">Avançado</span>`;
        if (nome === 'Premium') return `<span class="plan-pill pill-premium">Premium</span>`;
        return `<span class="plan-pill pill-empresa">Empresarial</span>`;
      };

      containerList.innerHTML = naoAdmin.map(u => `
        <div class="user-table-row">
          <div style="display:flex; align-items:center; flex:1; min-width:0;">
            <div class="user-avatar-sm">${App.getInitials(u.nome)}</div>
            <div class="user-info">
              <div class="user-name">${u.nome}</div>
              <div class="user-email">${u.email}</div>
            </div>
          </div>
          ${planoPill(u.plano_nome)}
        </div>
      `).join('');

      // Assinaturas
      const badgeAss = document.getElementById('badge-assinaturas');
      let assinaturasBrutas = [];
      try {
        const snap = await db.collection('assinaturas').get();
        assinaturasBrutas = snap.docs.map(d => d.data());
      } catch (e) { }

      const assinaturas = assinaturasBrutas.filter(a => {
        const u = usuarios.find(u => u.id === a.usuario_id);
        return u && u.tipo !== 'admin' && u.ativo;
      });

      if (badgeAss) badgeAss.textContent = `${assinaturas.length} ativa(s)`;

      if (containerAss) {
        if (!assinaturas.length) {
          containerAss.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Nenhuma assinatura ativa</div>';
        } else {
          const planosList = await AssinaturasAPI.listarPlanos();
          containerAss.innerHTML = assinaturas.map(a => {
            const user = usuarios.find(u => u.id === a.usuario_id);
            const plano = planosList.find(p => p.id === a.plano_id);
            const tipoBadge = a.tipo === 'anual'
              ? '<span class="badge badge-success" style="font-size:10px;">Anual</span>'
              : '<span class="badge badge-info" style="font-size:10px;">Mensal</span>';
            const venc = a.vencimento ? `Venc. ${new Date(a.vencimento).toLocaleDateString('pt-BR')}` : '';
            return `
              <div class="user-table-row">
                <div class="user-info" style="margin-left:0;">
                  <div class="user-name">${user?.nome || '—'}</div>
                  <div class="user-email">${plano?.nome || '—'} · ${venc}</div>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                  ${tipoBadge}
                  ${planoPill(plano?.nome)}
                </div>
              </div>
            `;
          }).join('');
        }
      }

    } catch (err) {
      console.error('[Admin] Erro ao carregar usuários:', err);
      containerList.innerHTML = '<div style="padding:20px; text-align:center; color:#dc2626;">Erro ao carregar usuários.</div>';
    }
  },

  // ============================================================
  // 4. DOENÇAS (CRUD)
  // ============================================================

  async loadDoencas() {
    const container = document.getElementById('admin-doencas-list');
    if (!container) return;

    container.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Carregando doenças...</div>';

    const btnNova = document.getElementById('btn-nova-doenca');
    if (btnNova) {
      const novoBtn = btnNova.cloneNode(true);
      btnNova.parentNode.replaceChild(novoBtn, btnNova);
      novoBtn.addEventListener('click', () => Admin._openDoencaModal(null));
    }

    try {
      const doencas = await DoencasAPI.listar();
      Admin._doencasCache = doencas || [];

      if (!Admin._doencasCache.length) {
        container.innerHTML = `
          <div style="padding:40px 20px; text-align:center; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0;">
            <span class="material-symbols-rounded" style="font-size:40px; color:#94a3b8; margin-bottom:8px;">coronavirus</span>
            <div style="font-weight:700; color:#0f172a;">Nenhuma doença cadastrada</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">Clique em "Nova Doença" para cadastrar.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = Admin._doencasCache.map((d, idx) => `
        <div class="doenca-card">
          <div class="doenca-card-left">
            <div class="doenca-card-icon">
              <span class="material-symbols-rounded">coronavirus</span>
            </div>
            <div style="min-width:0;">
              <div class="doenca-card-name">${d.nome}</div>
              <div class="doenca-card-sub">${d.agente || 'Agente não especificado'} · ${d.cultura || 'Tomate'}</div>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="btn-icon-clean" data-action="editar" data-idx="${idx}" title="Editar">
              <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
            </button>
            <button class="btn-icon-clean danger" data-action="excluir" data-idx="${idx}" title="Excluir">
              <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
            </button>
          </div>
        </div>
      `).join('');

      container.removeEventListener('click', Admin._doencaContainerClickHandler);
      container.addEventListener('click', Admin._doencaContainerClickHandler);

    } catch (err) {
      console.error('[Admin] Erro ao carregar doenças:', err);
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#dc2626;">Erro ao carregar doenças.</div>';
    }
  },

  _doencaContainerClickHandler(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const idx = parseInt(btn.getAttribute('data-idx'), 10);
    const doenca = Admin._doencasCache[idx];

    if (!doenca) {
      App.showToast('Doença não encontrada.', 'error');
      return;
    }

    if (action === 'editar') Admin._openDoencaModal(doenca);
    if (action === 'excluir') Admin._confirmarExcluirDoenca(doenca.id, doenca.nome);
  },

  _openDoencaModal(doenca) {
    document.getElementById('doenca-clean-modal')?.remove();

    const isEdit = doenca !== null && doenca !== undefined;

    const wrapper = document.createElement('div');
    wrapper.id = 'doenca-clean-modal';
    wrapper.className = 'clean-modal-backdrop';

    wrapper.innerHTML = `
      <div class="clean-modal">
        <div class="clean-modal-title">${isEdit ? 'Editar Doença' : 'Nova Doença'}</div>
        <div class="clean-modal-sub">${isEdit ? `Atualizando informações de ${doenca.nome}` : 'Cadastre uma nova doença no sistema'}</div>

        <form id="doenca-modal-form" novalidate>
          <label class="clean-label" for="doenca-nome">Nome da Doença *</label>
          <input type="text" id="doenca-nome" class="clean-input" value="${doenca?.nome || ''}" placeholder="Ex: Requeima" required>

          <label class="clean-label" for="doenca-agente">Agente Causador</label>
          <input type="text" id="doenca-agente" class="clean-input" value="${doenca?.agente || ''}" placeholder="Ex: Phytophthora infestans">

          <label class="clean-label" for="doenca-cultura">Cultura</label>
          <input type="text" id="doenca-cultura" class="clean-input" value="${doenca?.cultura || 'Tomate'}" placeholder="Ex: Tomate">

          <label class="clean-label" for="doenca-descricao">Descrição</label>
          <textarea id="doenca-descricao" class="clean-input" rows="2" placeholder="Descrição detalhada...">${doenca?.descricao || ''}</textarea>

          <label class="clean-label" for="doenca-sintomas">Sintomas</label>
          <textarea id="doenca-sintomas" class="clean-input" rows="2" placeholder="Sintomas observados...">${doenca?.sintomas || ''}</textarea>

          <label class="clean-label" for="doenca-tratamento">Tratamento</label>
          <textarea id="doenca-tratamento" class="clean-input" rows="2" placeholder="Recomendações...">${doenca?.tratamento || ''}</textarea>

          <label class="clean-label" for="doenca-prevencao">Prevenção</label>
          <textarea id="doenca-prevencao" class="clean-input" rows="2" placeholder="Medidas preventivas...">${doenca?.prevencao || ''}</textarea>

          <div class="clean-modal-actions">
            <button type="button" class="btn btn-ghost btn-full" id="btn-cancelar-doenca">Cancelar</button>
            <button type="submit" class="btn-admin-red" style="flex:1; justify-content:center; padding:10px;" id="btn-salvar-doenca">
              ${isEdit ? 'Salvar Alterações' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(wrapper);

    wrapper.addEventListener('click', e => { if (e.target === wrapper) wrapper.remove(); });
    document.getElementById('btn-cancelar-doenca').addEventListener('click', () => wrapper.remove());

    document.getElementById('doenca-modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('doenca-nome').value.trim();
      if (!nome) {
        App.showToast('Nome da doença é obrigatório.', 'error');
        return;
      }

      const dados = {
        nome,
        agente: document.getElementById('doenca-agente').value.trim(),
        cultura: document.getElementById('doenca-cultura').value.trim() || 'Tomate',
        descricao: document.getElementById('doenca-descricao').value.trim(),
        sintomas: document.getElementById('doenca-sintomas').value.trim(),
        tratamento: document.getElementById('doenca-tratamento').value.trim(),
        prevencao: document.getElementById('doenca-prevencao').value.trim(),
      };

      const btn = document.getElementById('btn-salvar-doenca');
      try {
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        if (isEdit) {
          await DoencasAPI.atualizar(doenca.id, dados);
          App.showToast('Doença atualizada!', 'success');
        } else {
          await DoencasAPI.criar(dados);
          App.showToast('Doença cadastrada!', 'success');
        }

        wrapper.remove();
        await Admin.loadDoencas();
      } catch (err) {
        App.showToast(err.message || 'Erro ao salvar.', 'error');
        btn.disabled = false;
        btn.textContent = isEdit ? 'Salvar Alterações' : 'Cadastrar';
      }
    });
  },

  _confirmarExcluirDoenca(id, nome) {
    document.getElementById('confirm-del-modal')?.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'confirm-del-modal';
    wrapper.className = 'clean-modal-backdrop';

    wrapper.innerHTML = `
      <div class="clean-modal" style="max-width:380px; text-align:center;">
        <div style="width:48px; height:48px; border-radius:50%; background:#fee2e2; color:#dc2626; display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px;">
          <span class="material-symbols-rounded" style="font-size:28px;">delete</span>
        </div>
        <div class="clean-modal-title">Excluir Doença</div>
        <div style="font-size:13px; color:#64748b; margin-bottom:20px;">
          Tem certeza que deseja excluir <strong>"${nome}"</strong>? Esta ação não pode ser desfeita.
        </div>
        <div class="clean-modal-actions">
          <button type="button" class="btn btn-ghost btn-full" id="btn-cancel-del">Cancelar</button>
          <button type="button" class="btn-admin-red" style="flex:1; justify-content:center; background:#dc2626;" id="btn-confirm-del">Excluir</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);

    wrapper.addEventListener('click', e => { if (e.target === wrapper) wrapper.remove(); });
    document.getElementById('btn-cancel-del').addEventListener('click', () => wrapper.remove());

    document.getElementById('btn-confirm-del').addEventListener('click', async () => {
      const btn = document.getElementById('btn-confirm-del');
      try {
        btn.disabled = true;
        btn.textContent = 'Excluindo...';
        await DoencasAPI.excluir(id);
        wrapper.remove();
        App.showToast('Doença excluída com sucesso.', 'success');
        await Admin.loadDoencas();
      } catch (err) {
        App.showToast(err.message || 'Erro ao excluir.', 'error');
        wrapper.remove();
      }
    });
  },

  // ============================================================
  // 5. MODELO IA
  // ============================================================

  async loadModelo() {
    const container = document.getElementById('modelo-info');
    if (!container) return;

    container.innerHTML = '<div style="padding:10px; text-align:center; color:#94a3b8;">Carregando...</div>';

    try {
      const info = await AdminAPI.getModeloInfo();
      const acuracia = info.acuracia || 0;
      const isAdequado = acuracia >= 80;

      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; font-size:13px;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">
            <span style="color:#64748b;">URL:</span>
            <span style="font-weight:600; color:#0f172a; max-width:200px; word-break:break-all; text-align:right;">${info.url || '—'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">
            <span style="color:#64748b;">Versão:</span>
            <span style="font-weight:700; color:#0f172a;">${info.versao || '—'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">
            <span style="color:#64748b;">Acurácia:</span>
            <span style="font-weight:800; color:${isAdequado ? '#16a34a' : '#dc2626'};">${acuracia ? acuracia + '%' : '—'}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#64748b;">Última Atualização:</span>
            <span style="color:#0f172a;">${App.formatDate(info.atualizadoEm, true)}</span>
          </div>
          <div style="margin-top:6px; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:600; background:${isAdequado ? '#dcfce7' : '#fee2e2'}; color:${isAdequado ? '#16a34a' : '#dc2626'};">
            ${isAdequado ? '✓ Modelo adequado (≥ 80%)' : '⚠ Modelo abaixo do padrão mínimo de acurácia (80%)'}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = '<div style="color:#dc2626;">Erro ao carregar informações do modelo.</div>';
    }

    Admin._setupModeloForm();
  },

  _setupModeloForm() {
    const form = document.getElementById('modelo-form');
    if (!form || form._listenerSet) return;
    form._listenerSet = true;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const url = document.getElementById('modelo-url').value.trim();
      const versao = document.getElementById('modelo-versao').value.trim();
      const acuracia = parseInt(document.getElementById('modelo-acuracia').value, 10);

      if (!url || !versao || isNaN(acuracia)) {
        App.showToast('Preencha todos os campos do modelo.', 'error');
        return;
      }

      const btn = document.getElementById('btn-atualizar-modelo');
      try {
        btn.disabled = true;
        btn.textContent = 'Atualizando...';
        await AdminAPI.atualizarModelo({ url, versao, acuracia });
        App.showToast('Modelo atualizado com sucesso!', 'success');
        form.reset();
        await Admin.loadModelo();
      } catch (err) {
        App.showToast(err.message || 'Erro ao atualizar modelo.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-rounded">save</span> Salvar e Atualizar';
      }
    });
  },
};

// Exporta globalmente para window
window.Admin = Admin;

// Auto-inicialização
(function autoInit() {
  const isPaginaAdmin = location.pathname.includes('admin') || document.getElementById('panel-metricas');
  if (!isPaginaAdmin) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Admin.init());
  } else {
    Admin.init();
  }
})();
