/**
 * Tomeye — admin.js
 * Painel Administrativo — Métricas, Financeiro, Usuários, Doenças e IA.
 * Design Limpo: Branco & Vermelho
 */

const Admin = {

  // Despesas operacionais fixas estimadas (R$/mês)
  // Tabela oficial de custos para 12 meses de operação presencial
  FINANCEIRO_PROJETO: {
    custoMensalTotal: 23890.16,
    custoAnualTotal: 286681.92,
    subtotalMensal: 21718.33,
    subtotalAnual: 260619.96,
    contingenciaMensal: 2171.83,
    contingenciaAnual: 26061.96,
    itens: [
      { categoria: 'Infraestrutura Física', item: 'Aluguel de sala/escritório', mensal: 1100.00, anual: 13200.00 },
      { categoria: 'Infraestrutura Física', item: 'Energia elétrica', mensal: 280.00, anual: 3360.00 },
      { categoria: 'Infraestrutura Física', item: 'Internet (fibra, plano empresarial)', mensal: 180.00, anual: 2160.00 },
      { categoria: 'Infraestrutura Física', item: 'Água e saneamento', mensal: 100.00, anual: 1200.00 },
      { categoria: 'Equipamentos', item: 'Notebooks, 9 unidades (R$183,00 cada)*', mensal: 1647.00, anual: 19764.00, depreciacao: true },
      { categoria: 'Equipamentos', item: 'Celular para coleta de imagens*', mensal: 75.00, anual: 900.00, depreciacao: true },
      { categoria: 'Software e Serviços', item: 'Hospedagem web (plano Business)', mensal: 33.00, anual: 396.00 },
      { categoria: 'Software e Serviços', item: 'Domínio .com.br (Registro.br)', mensal: 3.33, anual: 40.00 },
      { categoria: 'Software e Serviços', item: 'Ferramentas de desenvolvimento e API de IA', mensal: 150.00, anual: 1800.00 },
      { categoria: 'Recursos Humanos', item: 'Equipe de desenvolvimento, 9 pessoas (R$2.000,00/pessoa)', mensal: 18000.00, anual: 216000.00 },
      { categoria: 'Marketing e Divulgação', item: 'Material impresso e digital', mensal: 150.00, anual: 1800.00 },
    ],
  },

  _doencasCache: [],
  _usuariosCache: [],

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
      const custoMensal = Admin.FINANCEIRO_PROJETO.custoMensalTotal;
      const lucroMensal = metricas.receitaMensal - custoMensal;

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
      set('kpi-lucro-sub', lucroMensal >= 0 ? `Margem: ${margemPct}%` : `Custo est.: ${App.formatCurrency(custoMensal)}`);

      Admin._renderPlanosDist(metricas.distribuicaoPlanos);
      await Admin._renderDoencasStats();

    } catch (err) {
      console.error('[Admin] Erro ao carregar métricas:', err);
      const isPermissao = err.code === 'permission-denied' ||
        (err.message && (
          err.message.toLowerCase().includes('permission') ||
          err.message.toLowerCase().includes('insufficient') ||
          err.message.toLowerCase().includes('permiss')
        ));
      App.showToast(isPermissao ? 'Erro ao carregar métricas: permissão negada no Firestore.' : 'Erro ao carregar métricas: ' + (err.message || ''), 'error');
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
  // 2. FINANCEIRO & PONTO DE EQUILÍBRIO
  // ============================================================

  async loadFinanceiro() {
    try {
      const metricas = await AdminAPI.getMetricas();
      const F = Admin.FINANCEIRO_PROJETO;
      const receitaBruta = metricas.receitaMensal;
      const custoMensal = F.custoMensalTotal;
      const custoAnual = F.custoAnualTotal;
      const lucroMensal = receitaBruta - custoMensal;
      const lucroAnual = (receitaBruta * 12) - custoAnual;

      const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

      // Renderizar a tabela oficial completa de custos
      Admin._renderTabelaCustos();

      // Ponto de Equilíbrio (Break-Even Point)
      const pctEquilibrio = custoMensal > 0 ? ((receitaBruta / custoMensal) * 100) : 0;
      const pctEquilibrioFormatado = pctEquilibrio >= 100 ? pctEquilibrio.toFixed(1) : pctEquilibrio.toFixed(1);

      set('be-custo-total', App.formatCurrency(custoMensal));
      set('be-receita-real', App.formatCurrency(receitaBruta));

      const assinantesPagos = (metricas.distribuicaoPlanos || [])
        .filter(p => p.plano_id !== 1)
        .reduce((sum, p) => sum + p.quantidade, 0);
      set('be-receita-sub', `${assinantesPagos} assinante(s) pago(s)`);

      set('be-progresso-pct', `${pctEquilibrioFormatado}%`);
      const deficitVal = custoMensal - receitaBruta;
      if (deficitVal > 0) {
        set('be-deficit', `Déficit: -${App.formatCurrency(deficitVal)}`);
      } else {
        set('be-deficit', `Superávit: +${App.formatCurrency(Math.abs(deficitVal))}`);
      }

      set('be-progress-text', `${pctEquilibrioFormatado}% da meta de equilíbrio`);
      const barEl = document.getElementById('be-progress-bar');
      if (barEl) {
        barEl.style.width = `${Math.min(100, Math.max(0, pctEquilibrio))}%`;
      }

      // Detalhamento de Receita por Plano
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
                ${p.plano} (${p.quantidade} × ${App.formatCurrency(preco)})
              </span>
              <span class="finance-row-value positive">${App.formatCurrency(receita)}</span>
            </div>
          `;
        }).join('');
      }

      // Demonstrativo Operacional
      set('fin-result-receita', App.formatCurrency(receitaBruta));
      set('fin-result-despesas', `- ${App.formatCurrency(custoMensal)}`);

      const elResultLucro = document.getElementById('fin-result-lucro');
      if (elResultLucro) {
        elResultLucro.textContent = `${lucroMensal >= 0 ? '+' : ''}${App.formatCurrency(lucroMensal)}`;
        elResultLucro.className = `finance-row-value ${lucroMensal >= 0 ? 'positive' : 'negative'}`;
      }

      set('fin-anual', App.formatCurrency(receitaBruta * 12));
      const elLucroAnual = document.getElementById('fin-lucro-anual');
      if (elLucroAnual) {
        elLucroAnual.textContent = `${lucroAnual >= 0 ? '+' : ''}${App.formatCurrency(lucroAnual)}`;
        elLucroAnual.className = `finance-row-value ${lucroAnual >= 0 ? 'positive' : 'negative'}`;
      }

    } catch (err) {
      console.error('[Admin] Erro ao carregar financeiro:', err);
      App.showToast('Erro ao carregar dados financeiros.', 'error');
    }
  },

  _renderTabelaCustos() {
    const tbody = document.getElementById('admin-tabela-custos-body');
    if (!tbody) return;

    const F = Admin.FINANCEIRO_PROJETO;
    const catIcons = {
      'Infraestrutura Física': 'apartment',
      'Equipamentos': 'devices',
      'Software e Serviços': 'cloud_sync',
      'Recursos Humanos': 'engineering',
      'Marketing e Divulgação': 'campaign',
    };

    let rowsHtml = '';
    let catAnterior = '';

    F.itens.forEach(item => {
      const ehNovaCat = item.categoria !== catAnterior;
      catAnterior = item.categoria;

      rowsHtml += `
        <tr class="cost-row">
          <td class="cost-col-cat">
            ${ehNovaCat ? `
              <div class="cost-cat-badge">
                <span class="material-symbols-rounded">${catIcons[item.categoria] || 'folder'}</span>
                <span>${item.categoria}</span>
              </div>
            ` : ''}
          </td>
          <td class="cost-col-item">
            <span class="cost-item-text">${item.item}</span>
          </td>
          <td class="cost-col-num">
            ${App.formatCurrency(item.mensal).replace('R$', '').trim()}
          </td>
          <td class="cost-col-num">
            ${App.formatCurrency(item.anual).replace('R$', '').trim()}
          </td>
        </tr>
      `;
    });

    // Subtotal
    rowsHtml += `
      <tr class="cost-row-subtotal">
        <td colspan="2" style="font-weight:700; color:#0f172a;">Subtotal</td>
        <td class="cost-col-num" style="font-weight:700; color:#0f172a;">${App.formatCurrency(F.subtotalMensal).replace('R$', '').trim()}</td>
        <td class="cost-col-num" style="font-weight:700; color:#0f172a;">${App.formatCurrency(F.subtotalAnual).replace('R$', '').trim()}</td>
      </tr>
      <tr class="cost-row-contingencia">
        <td class="cost-col-cat">
          <div class="cost-cat-badge" style="background:#fef3c7; color:#b45309;">
            <span class="material-symbols-rounded">shield</span>
            <span>Reserva de Contingência</span>
          </div>
        </td>
        <td class="cost-col-item">Imprevistos (10% do subtotal)</td>
        <td class="cost-col-num" style="color:#b45309; font-weight:600;">${App.formatCurrency(F.contingenciaMensal).replace('R$', '').trim()}</td>
        <td class="cost-col-num" style="color:#b45309; font-weight:600;">${App.formatCurrency(F.contingenciaAnual).replace('R$', '').trim()}</td>
      </tr>
      <tr class="cost-row-total">
        <td colspan="2" style="font-weight:800; font-size:14px; color:#b71c1c;">TOTAL ESTIMADO</td>
        <td class="cost-col-num" style="font-weight:800; font-size:14px; color:#b71c1c;">${App.formatCurrency(F.custoMensalTotal).replace('R$', '').trim()}</td>
        <td class="cost-col-num" style="font-weight:800; font-size:14px; color:#b71c1c;">${App.formatCurrency(F.custoAnualTotal).replace('R$', '').trim()}</td>
      </tr>
    `;

    tbody.innerHTML = rowsHtml;
  },

  // ============================================================
  // 3. USUÁRIOS REAIS DO SISTEMA
  // ============================================================

  async loadUsuarios() {
    const containerList = document.getElementById('admin-usuarios-list');
    const containerAss = document.getElementById('admin-assinaturas-list');
    if (!containerList) return;

    containerList.innerHTML = '<tr><td colspan="5" style="padding:24px; text-align:center; color:#94a3b8;">Carregando usuários do banco de dados...</td></tr>';

    try {
      const usuarios = await AdminAPI.getUsuarios();
      Admin._usuariosCache = usuarios || [];

      // Atualizar contadores KPIs com dados reais
      const total = usuarios.length;
      const produtores = usuarios.filter(u => u.tipo === 'produtor').length;
      const amadores = usuarios.filter(u => u.tipo === 'amador').length;
      const empresas = usuarios.filter(u => u.tipo === 'empresa').length;
      const funcionarios = usuarios.filter(u => u.tipo === 'funcionario').length;
      const admins = usuarios.filter(u => u.tipo === 'admin').length;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('kpi-total-usuarios', total);
      set('kpi-produtores', produtores);
      set('kpi-amadores', amadores);
      set('kpi-empresas', empresas);
      set('kpi-outros-sub', `${funcionarios} func. · ${admins} admin`);
      set('badge-total-users', `${total} cadastrado(s)`);

      // Renderizar tabela com lista completa inicial
      Admin._renderUsuarios(Admin._usuariosCache);

      // Carregar Assinaturas Vinculadas reais
      const badgeAss = document.getElementById('badge-assinaturas');
      let assinaturasBrutas = [];
      try {
        const snap = await db.collection('assinaturas').get();
        assinaturasBrutas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('[Admin] Erro ao buscar assinaturas:', e.message);
      }

      if (badgeAss) badgeAss.textContent = `${assinaturasBrutas.length} assinatura(s)`;

      if (containerAss) {
        if (!assinaturasBrutas.length) {
          containerAss.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Nenhuma assinatura cadastrada</div>';
        } else {
          const planosList = PLANOS;
          containerAss.innerHTML = assinaturasBrutas.map(a => {
            const user = usuarios.find(u => u.id === a.usuario_id);
            const plano = planosList.find(p => p.id === a.plano_id);
            const tipoBadge = a.tipo === 'anual'
              ? '<span class="badge badge-success" style="font-size:10px;">Anual</span>'
              : '<span class="badge badge-info" style="font-size:10px;">Mensal</span>';
            const venc = a.vencimento ? `Venc. ${new Date(a.vencimento).toLocaleDateString('pt-BR')}` : '';
            return `
              <div class="user-table-row">
                <div class="user-info" style="margin-left:0;">
                  <div class="user-name">${user?.nome || 'Usuário (' + (a.usuario_id || 'ID') + ')'}</div>
                  <div class="user-email">${plano?.nome || 'Plano'} · ${venc}</div>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                  ${tipoBadge}
                  ${Admin._planoPill(plano?.nome)}
                </div>
              </div>
            `;
          }).join('');
        }
      }

    } catch (err) {
      console.error('[Admin] Erro ao carregar usuários:', err);
      const isPermissao = err.code === 'permission-denied' ||
        (err.message && (
          err.message.toLowerCase().includes('permission') ||
          err.message.toLowerCase().includes('insufficient') ||
          err.message.toLowerCase().includes('permiss')
        ));

      const msgToast = isPermissao
        ? 'Erro ao carregar usuários: permissão negada no Firestore (Missing or insufficient permissions).'
        : 'Erro ao carregar usuários: ' + (err.message || 'falha de comunicação com o banco.');

      App.showToast(msgToast, 'error');

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('kpi-total-usuarios', '—');
      set('kpi-produtores', '—');
      set('kpi-amadores', '—');
      set('kpi-empresas', '—');
      set('kpi-outros-sub', 'Erro de permissão');
      set('badge-total-users', 'Erro');

      containerList.innerHTML = `
        <tr>
          <td colspan="5" style="padding:32px 16px; text-align:center; color:#dc2626;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
              <span class="material-symbols-rounded" style="font-size:36px; color:#dc2626;">lock</span>
              <strong style="font-size:14px;">${msgToast}</strong>
              <span style="font-size:12px; color:#64748b; max-width:440px;">
                ${isPermissao
                  ? 'As regras do Firestore (firestore.rules) precisam autorizar expressamente <code>allow list: if isAdmin();</code> na coleção de usuários para que o painel administrativo possa consultar a lista.'
                  : 'Ocorreu uma falha ao consultar o banco de dados.'}
              </span>
            </div>
          </td>
        </tr>
      `;
    }
  },

  filterUsuarios() {
    const termo = (document.getElementById('admin-user-search')?.value || '').toLowerCase().trim();
    const filtroTipo = document.getElementById('admin-filter-tipo')?.value || '';
    const filtroPlano = document.getElementById('admin-filter-plano')?.value || '';

    let filtrados = Admin._usuariosCache || [];

    if (termo) {
      filtrados = filtrados.filter(u =>
        (u.nome && u.nome.toLowerCase().includes(termo)) ||
        (u.email && u.email.toLowerCase().includes(termo))
      );
    }

    if (filtroTipo) {
      filtrados = filtrados.filter(u => u.tipo === filtroTipo);
    }

    if (filtroPlano) {
      filtrados = filtrados.filter(u => (u.plano_nome || '').toLowerCase() === filtroPlano.toLowerCase());
    }

    Admin._renderUsuarios(filtrados);
  },

  _planoPill(nome) {
    const n = (nome || '').toLowerCase();
    if (!nome || n.includes('gratuito')) return `<span class="plan-pill pill-free">Gratuito</span>`;
    if (n.includes('básico') || n.includes('basico') || n.includes('avançado') || n.includes('avancado')) {
      return `<span class="plan-pill pill-avancado">Básico</span>`;
    }
    if (n.includes('premium')) return `<span class="plan-pill pill-premium">Premium</span>`;
    return `<span class="plan-pill pill-empresa">Empresarial</span>`;
  },

  _renderUsuarios(lista) {
    const tbody = document.getElementById('admin-usuarios-list');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:32px; text-align:center; color:#94a3b8;">Nenhum usuário encontrado com os filtros selecionados.</td></tr>';
      return;
    }

    const mapIconeTipo = {
      'produtor': 'psychiatry',
      'amador': 'potted_plant',
      'empresa': 'corporate_fare',
      'funcionario': 'badge',
      'admin': 'shield_person',
    };

    tbody.innerHTML = lista.map(u => {
      const iconeTipo = mapIconeTipo[u.tipo] || 'person';
      const statusBadge = u.ativo
        ? '<span class="status-badge status-active"><span class="status-dot"></span>Ativo</span>'
        : '<span class="status-badge status-inactive"><span class="status-dot"></span>Inativo</span>';

      return `
        <tr class="user-row-item">
          <!-- Usuário -->
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="user-avatar-sm">${App.getInitials(u.nome)}</div>
              <div style="min-width:0;">
                <div class="user-name" title="${u.nome}">${u.nome}</div>
                <div class="user-email" title="${u.email}">${u.email}</div>
              </div>
            </div>
          </td>

          <!-- Tipo de Conta -->
          <td>
            <span class="account-type-badge type-${u.tipo || 'amador'}">
              <span class="material-symbols-rounded">${iconeTipo}</span>
              ${u.tipo_formatado || u.tipo}
            </span>
          </td>

          <!-- Plano -->
          <td>
            ${Admin._planoPill(u.plano_nome)}
          </td>

          <!-- Data de Cadastro -->
          <td style="color:#475569; font-size:12px; font-weight:500;">
            ${u.data_cadastro || '—'}
          </td>

          <!-- Status -->
          <td style="text-align:center;">
            ${statusBadge}
          </td>
        </tr>
      `;
    }).join('');
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
