/**
 * Tomeye — assinaturas.js
 * Módulo de planos e assinaturas.
 */

const Assinaturas = {

  /** Tipo de billing selecionado: 'mensal' ou 'anual' */
  _tipoSelecionado: 'mensal',

  /** Dados carregados */
  _planos: [],
  _assinaturaAtual: null,
  _planoAtual: null,

  /**
   * Inicializa a tela de assinaturas.
   */
  async init() {
    if (!(await App.requireAuthAsync())) return;

    App.renderBottomNav('');

    // Configurar toggle mensal/anual
    Assinaturas._setupToggle();

    // Carregar dados
    await Assinaturas.loadData();
  },

  /**
   * Configura os botões de toggle mensal/anual.
   */
  _setupToggle() {
    const btnMensal = document.getElementById('toggle-mensal');
    const btnAnual = document.getElementById('toggle-anual');

    const setTipo = (tipo) => {
      Assinaturas._tipoSelecionado = tipo;

      // Estilo dos botões
      if (tipo === 'mensal') {
        btnMensal?.classList.replace('btn-ghost', 'btn-primary');
        btnAnual?.classList.replace('btn-primary', 'btn-ghost');
      } else {
        btnAnual?.classList.replace('btn-ghost', 'btn-primary');
        btnMensal?.classList.replace('btn-primary', 'btn-ghost');
      }

      // Re-renderizar preços
      if (Assinaturas._planos.length > 0) {
        Assinaturas.renderPlanos(Assinaturas._planos, Assinaturas._assinaturaAtual);
      }
    };

    btnMensal?.addEventListener('click', () => setTipo('mensal'));
    btnAnual?.addEventListener('click', () => setTipo('anual'));

    // Iniciar com mensal selecionado
    setTipo('mensal');
  },

  /**
   * Carrega planos e assinatura atual.
   */
  async loadData() {
    const userId = App.getUserId();

    try {
      const [planos, dadosAssinatura] = await Promise.all([
        AssinaturasAPI.listarPlanos(),
        AssinaturasAPI.obterAssinatura(userId),
      ]);

      Assinaturas._planos = planos;
      Assinaturas._assinaturaAtual = dadosAssinatura.assinatura;
      Assinaturas._planoAtual = dadosAssinatura.plano;

      Assinaturas.renderPlanoAtual(dadosAssinatura);
      Assinaturas.renderPlanos(planos, dadosAssinatura.assinatura);

    } catch (error) {
      console.error('[Assinaturas] Erro ao carregar:', error);
      App.showToast('Erro ao carregar planos.', 'error');
    }
  },

  /**
   * Renderiza o card do plano atual.
   * @param {{ assinatura, plano }} dados
   */
  renderPlanoAtual(dados) {
    const { assinatura, plano } = dados;
    const card = document.getElementById('plano-atual-card');
    if (!card) return;

    if (!assinatura || !plano) {
      card.innerHTML = `
        <div class="flex items-center gap-sm">
          <span style="font-size:20px"><span class="material-symbols-rounded">inventory_2</span></span>
          <div>
            <div class="font-semibold">Plano Gratuito</div>
            <div class="text-secondary" style="font-size:var(--font-size-sm);">Plano atual</div>
          </div>
        </div>
      `;
      return;
    }

    const utilizadas = assinatura.analises_utilizadas || 0;
    const limite = plano.limite_analises || 3;
    const isIlimitado = limite === Infinity;

    card.innerHTML = `
      <div class="flex justify-between items-center mb-sm">
        <div>
          <div class="font-semibold" style="font-size:var(--font-size-md);"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:middle;color:var(--color-success);">check_circle</span> ${plano.nome}</div>
          <div class="text-secondary" style="font-size:var(--font-size-sm);">Plano atual · ${assinatura.tipo === 'anual' ? 'Anual' : 'Mensal'}</div>
        </div>
        <span class="badge badge-success">${assinatura.status}</span>
      </div>
      <div class="flex justify-between" style="font-size:var(--font-size-sm); color:var(--text-secondary); margin-bottom:var(--space-sm);">
        <span>Análises: ${isIlimitado ? 'Ilimitadas' : utilizadas}</span>
        <span>Vence: ${App.formatDate(assinatura.vencimento)}</span>
      </div>
      ${isIlimitado ? '' : `
        <div class="progress-bar-container">
          <div class="progress-bar-fill ${utilizadas / limite >= 0.9 ? 'fill-error' : utilizadas / limite >= 0.7 ? 'fill-warning' : ''}" style="width:${Math.min(Math.round(utilizadas / limite * 100), 100)}%;"></div>
        </div>
      `}
    `;
  },

  /**
   * Renderiza os cards de planos disponíveis.
   * @param {Array} planos
   * @param {object} assinaturaAtual
   */
  renderPlanos(planos, assinaturaAtual) {
    const container = document.getElementById('planos-list');
    if (!container) return;

    const tipo = Assinaturas._tipoSelecionado;

    container.innerHTML = planos.map(plano => {
      const isAtual = assinaturaAtual?.plano_id === plano.id;
      const isFeatured = plano.id === 3; // Plano Premium é recomendado
      const preco = tipo === 'anual' ? plano.preco_anual / 12 : plano.preco_mensal;
      const precoLabel = tipo === 'anual' ? `${App.formatCurrency(plano.preco_anual)}/ano` : '';

      return `
        <div class="plan-card ${isFeatured ? 'featured' : ''} ${isAtual ? 'current' : ''}" style="margin-bottom: var(--space-md);">
          <div class="plan-name">${plano.nome}</div>
          <p style="font-size:var(--font-size-sm); color:var(--text-secondary); margin-bottom:0;">${plano.descricao}</p>
          <div class="plan-price">
            ${preco === 0
          ? `<span class="price-amount">Grátis</span>`
          : `<span class="price-amount">${App.formatCurrency(preco)}</span>
                 <span class="price-period">/mês</span>`
        }
            ${precoLabel ? `<div class="price-annual"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle;">savings</span> ${precoLabel} no plano anual</div>` : ''}
          </div>
          <div class="plan-features">
            <div class="plan-feature">
              <span class="feature-icon"><span class="material-symbols-rounded" style="font-size:16px;">biotech</span></span>
              <span>${plano.limite_analises === Infinity ? 'Ilimitadas' : plano.limite_analises} análises/mês</span>
            </div>
            <div class="plan-feature">
              <span class="feature-icon"><span class="material-symbols-rounded" style="font-size:16px;">grass</span></span>
              <span>${plano.max_fazendas === 0 ? 'Sem fazendas' : `Até ${plano.max_fazendas} fazenda${plano.max_fazendas !== 1 ? 's' : ''}`}</span>
            </div>
            <div class="plan-feature">
              <span class="feature-icon"><span class="material-symbols-rounded" style="font-size:16px;">group</span></span>
              <span>${plano.max_funcionarios === 0 ? 'Sem funcionários' : `Até ${plano.max_funcionarios} funcionários`}</span>
            </div>
          </div>

          ${isAtual
          ? `<button class="btn btn-ghost btn-full" disabled><span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;">check_circle</span> Plano atual</button>`
          : `<button class="btn btn-primary btn-full" onclick="Assinaturas.handleContratar(${plano.id})">
                ${preco === 0 ? 'Usar plano gratuito' : 'Contratar plano'}
               </button>`
        }
        </div>
      `;
    }).join('');
  },

  /**
   * Inicia a contratação de um plano.
   * @param {number} planoId
   */
  handleContratar(planoId) {
    const plano = Assinaturas._planos.find(p => p.id === planoId);
    if (!plano) return;

    const tipo = Assinaturas._tipoSelecionado;
    const preco = tipo === 'anual' ? plano.preco_anual : plano.preco_mensal;
    const precoLabel = preco === 0 ? 'gratuito' : `${App.formatCurrency(preco)}/${tipo === 'anual' ? 'ano' : 'mês'}`;

    // Plano gratuito: confirmar direto sem pagamento
    if (preco === 0) {
      App.showModal({
        title: `Usar ${plano.nome}`,
        message: `Confirma a ativação do plano ${plano.nome} (gratuito)?`,
        confirmText: 'Confirmar',
        confirmType: 'primary',
        onConfirm: async () => {
          const userId = App.getUserId();
          try {
            App.showLoading('Processando...');
            const result = await AssinaturasAPI.contratarPlano(userId, planoId, tipo);
            App.hideLoading();
            const session = App.getSession();
            if (session) {
              session.plano = result.plano;
              session.assinatura = result.assinatura;
              App.setSession(session);
            }
            App.showToast(result.mensagem || 'Plano ativado!', 'success');
            await Assinaturas.loadData();
          } catch (error) {
            App.hideLoading();
            App.showToast(error.message || 'Erro ao contratar plano.', 'error');
          }
        },
      });
      return;
    }

    // Plano pago: abrir modal de pagamento
    document.getElementById('pagamento-modal')?.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'pagamento-modal';
    wrapper.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);padding:16px;';

    wrapper.innerHTML = `
      <div style="background:white;border-radius:16px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <!-- Header -->
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:48px;height:48px;border-radius:50%;background:#fff0f0;color:#e53935;display:inline-flex;align-items:center;justify-content:center;margin-bottom:8px;">
            <span class="material-symbols-rounded" style="font-size:28px;">credit_card</span>
          </div>
          <h3 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">Pagamento</h3>
          <p style="font-size:13px;color:#64748b;margin:4px 0 0;">Plano ${plano.nome} — ${precoLabel}</p>
        </div>

        <!-- Formulário do Cartão -->
        <form id="pagamento-form" novalidate>
          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Nome no Cartão</label>
            <input type="text" id="pag-nome" placeholder="Como aparece no cartão" required
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;">
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Número do Cartão</label>
            <input type="text" id="pag-numero" placeholder="0000 0000 0000 0000" maxlength="19" required
              style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;font-family:monospace;">
          </div>

          <div style="display:flex;gap:12px;margin-bottom:14px;">
            <div style="flex:1;">
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">Validade</label>
              <input type="text" id="pag-validade" placeholder="MM/AA" maxlength="5" required
                style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;font-family:monospace;">
            </div>
            <div style="flex:1;">
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">CVV</label>
              <input type="text" id="pag-cvv" placeholder="123" maxlength="4" required
                style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;font-family:monospace;">
            </div>
          </div>

          <!-- Resumo -->
          <div style="background:#f8fafc;border-radius:10px;padding:12px 16px;margin-bottom:18px;border:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#64748b;margin-bottom:4px;">
              <span>Plano ${plano.nome}</span>
              <span>${tipo === 'anual' ? 'Anual' : 'Mensal'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;color:#0f172a;">
              <span>Total</span>
              <span style="color:#e53935;">${App.formatCurrency(preco)}</span>
            </div>
          </div>

          <!-- Botões -->
          <button type="submit" id="btn-efetuar-pagamento"
            style="width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#e53935,#c62828);color:white;border:none;font-weight:700;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;">
            <span class="material-symbols-rounded" style="font-size:20px;">lock</span>
            Efetuar Pagamento
          </button>
          <button type="button" id="btn-cancelar-pagamento"
            style="width:100%;padding:10px;border-radius:10px;background:transparent;color:#64748b;border:1px solid #d1d5db;font-weight:600;font-size:13px;cursor:pointer;">
            Cancelar
          </button>

          <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:12px;">
            <span class="material-symbols-rounded" style="font-size:13px;vertical-align:middle;">shield</span>
            Pagamento processado de forma segura e criptografada.
          </p>
        </form>
      </div>
    `;

    document.body.appendChild(wrapper);

    // Fechar
    wrapper.addEventListener('click', e => { if (e.target === wrapper) wrapper.remove(); });
    document.getElementById('btn-cancelar-pagamento').addEventListener('click', () => wrapper.remove());

    // Máscara do número do cartão
    const numInput = document.getElementById('pag-numero');
    numInput.addEventListener('input', () => {
      let v = numInput.value.replace(/\D/g, '').substring(0, 16);
      v = v.replace(/(\d{4})(?=\d)/g, '$1 ');
      numInput.value = v;
    });

    // Máscara da validade
    const valInput = document.getElementById('pag-validade');
    valInput.addEventListener('input', () => {
      let v = valInput.value.replace(/\D/g, '').substring(0, 4);
      if (v.length >= 3) v = v.substring(0, 2) + '/' + v.substring(2);
      valInput.value = v;
    });

    // Máscara do CVV
    const cvvInput = document.getElementById('pag-cvv');
    cvvInput.addEventListener('input', () => {
      cvvInput.value = cvvInput.value.replace(/\D/g, '').substring(0, 4);
    });

    // Submit — simular pagamento
    document.getElementById('pagamento-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const nome = document.getElementById('pag-nome').value.trim();
      const numero = document.getElementById('pag-numero').value.trim();
      const validade = document.getElementById('pag-validade').value.trim();
      const cvv = document.getElementById('pag-cvv').value.trim();

      if (!nome || !numero || !validade || !cvv) {
        App.showToast('Preencha todos os dados do cartão.', 'error');
        return;
      }

      if (numero.replace(/\s/g, '').length < 16) {
        App.showToast('Número do cartão inválido.', 'error');
        return;
      }

      if (validade.length < 5) {
        App.showToast('Validade inválida. Use o formato MM/AA.', 'error');
        return;
      }

      if (cvv.length < 3) {
        App.showToast('CVV inválido.', 'error');
        return;
      }

      const btn = document.getElementById('btn-efetuar-pagamento');
      btn.disabled = true;
      btn.innerHTML = `
        <span class="material-symbols-rounded" style="font-size:20px;animation:spin 1s linear infinite;">sync</span>
        Processando pagamento...
      `;
      btn.style.opacity = '0.7';

      // Adicionar animação de spin
      if (!document.getElementById('spin-keyframes')) {
        const style = document.createElement('style');
        style.id = 'spin-keyframes';
        style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }

      // Simular processamento de 2.5 segundos
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Pagamento "aprovado"
      btn.innerHTML = `
        <span class="material-symbols-rounded" style="font-size:20px;">check_circle</span>
        Pagamento aprovado!
      `;
      btn.style.background = '#16a34a';
      btn.style.opacity = '1';

      App.showToast('Pagamento aprovado com sucesso!', 'success');

      // Aguardar 1s para o usuário ver a confirmação, depois ativar o plano
      await new Promise(resolve => setTimeout(resolve, 1000));

      wrapper.remove();

      const userId = App.getUserId();
      try {
        App.showLoading('Ativando plano...');
        const result = await AssinaturasAPI.contratarPlano(userId, planoId, tipo);
        App.hideLoading();

        // Atualizar sessão com novo plano
        const session = App.getSession();
        if (session) {
          session.plano = result.plano;
          session.assinatura = result.assinatura;
          App.setSession(session);
        }

        App.showToast(result.mensagem || 'Plano ativado!', 'success');
        await Assinaturas.loadData();
      } catch (error) {
        App.hideLoading();
        App.showToast(error.message || 'Erro ao ativar plano.', 'error');
      }
    });
  },
};
