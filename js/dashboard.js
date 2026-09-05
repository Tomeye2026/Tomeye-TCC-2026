/**
 * Tomeye — dashboard.js
 * Módulo do painel principal (Dashboard).
 * Carrega dados do usuário, estatísticas e últimas análises.
 */

const Dashboard = {

  /**
   * Inicializa o dashboard.
   */
  async init() {
    // Verificar autenticação (aguarda Firebase Auth inicializar)
    const autenticado = await App.requireAuthAsync();
    if (!autenticado) return;

    // Renderizar navegação inferior
    App.renderBottomNav('dashboard');

    // Configurar botão de Ajuda
    const btnAjuda = document.getElementById('qa-ajuda');
    if (btnAjuda) {
      btnAjuda.addEventListener('click', (e) => {
        e.preventDefault();
        App.showModal({
          title: '❓ Ajuda & Suporte',
          message: `
            <div style="text-align:left; font-size: var(--font-size-sm); line-height: 1.7;">
              <p style="margin-bottom: var(--space-sm);"><strong>Como funciona o TomEye?</strong><br>
              Tire uma foto da folha do tomateiro e nossa IA identificará possíveis doenças com recomendações de tratamento.</p>
              <p style="margin-bottom: var(--space-sm);"><strong>Dúvidas frequentes:</strong></p>
              <ul style="padding-left: 1.2rem; margin-bottom: var(--space-sm);">
                <li>Use fotos com boa iluminação e foco na folha</li>
                <li>Cada plano tem um limite de análises por mês</li>
                <li>O histórico fica salvo na seção "Histórico"</li>
              </ul>
              <p style="margin-bottom: 0;"><strong>Contato:</strong><br>
              📧 projetotcc.026@gmail.com<br>
              
            </div>
          `,
          confirmText: 'Entendi',
          cancelText: 'Fechar',
          confirmType: 'primary',
        });
      });
    }

    // Ocultar atalho de Fazendas para amadores é feito no renderLimites()

    // Configurar dropdown de perfil
    this.setupProfileDropdown();

    // Carregar dados
    await this.loadData();
  },

  /**
   * Carrega e renderiza todos os dados do dashboard.
   */
  async loadData() {
    const session = App.getSession();
    const userId = session.usuario.id;

    try {
      // Carregar dados em paralelo
      const [perfilData, fazendas, analises, limitesData] = await Promise.all([
        PerfilAPI.obter(userId),
        FazendasAPI.listar(userId),
        AnalisesAPI.listar(userId),
        PlanosHelper.getLimitesUsuario(userId),
      ]);

      // Renderizar saudação
      this.renderHero(session.usuario, fazendas || []);

      // Renderizar estatísticas do plano
      this.renderStats(perfilData);

      // Renderizar limites de fazendas e análises
      this.renderLimites(limitesData, fazendas || []);

      // Renderizar últimas análises (defensivo: garantir que é array)
      const listaAnalises = Array.isArray(analises) ? analises : [];
      this.renderUltimasAnalises(listaAnalises.slice(0, 3));

      // Configurar seleção de fazenda
      this.setupFarmSelector(fazendas || []);

    } catch (error) {
      console.error('[Dashboard] Erro ao carregar dados:', error);
      App.showToast('Erro ao carregar dados do painel.', 'error');
      // Mostrar estado vazio nas análises mesmo em caso de erro
      this.renderUltimasAnalises([]);
    }
  },

  /**
   * Renderiza os cards de limites do plano: fazendas e análises.
   * Também gerencia a exibição dos CTAs (cadastrar fazenda / upgrade).
   * @param {object} limitesData — retorno de PlanosHelper.getLimitesUsuario()
   * @param {Array} fazendas — lista de fazendas ativas
   */
  renderLimites(limitesData, fazendas) {
    const { plano, limites, fazendasAtuais, funcionariosAtuais, analises_utilizadas } = limitesData;
    const isAmador = App.isAmador();

    // ── Info de fazendas ──────────────────────────────
    const statFazendasInfo = document.getElementById('stat-fazendas-info');
    const progressFazendas = document.getElementById('progress-fazendas');

    if (isAmador) {
      // Amadores não usam fazendas — ocultar o card de fazendas
      if (statFazendasInfo) statFazendasInfo.textContent = 'N/A';
      if (progressFazendas) progressFazendas.style.width = '0%';
    } else {
      const maxFaz = limites.max_fazendas;
      if (maxFaz === 0) {
        // Plano não permite fazendas
        if (statFazendasInfo) statFazendasInfo.textContent = 'Indisponível';
        if (progressFazendas) progressFazendas.style.width = '0%';
      } else {
        if (statFazendasInfo) statFazendasInfo.textContent = `${fazendasAtuais}/${maxFaz}`;
        const percentFaz = Math.round((fazendasAtuais / maxFaz) * 100);
        if (progressFazendas) {
          progressFazendas.style.width = `${Math.min(percentFaz, 100)}%`;
          progressFazendas.classList.remove('fill-warning', 'fill-error');
          if (percentFaz >= 100) progressFazendas.classList.add('fill-error');
          else if (percentFaz >= 70) progressFazendas.classList.add('fill-warning');
        }
      }
    }

    // ── Info de funcionários ──────────────────────────
    const statFuncInfo = document.getElementById('stat-funcionarios-info');
    const progressFunc = document.getElementById('progress-funcionarios');

    if (isAmador) {
      if (statFuncInfo) statFuncInfo.textContent = 'N/A';
      if (progressFunc) progressFunc.style.width = '0%';
    } else {
      const maxFunc = limites.max_funcionarios;
      const funcAtuais = funcionariosAtuais || 0;
      if (maxFunc === 0) {
        if (statFuncInfo) statFuncInfo.textContent = 'Indisponível';
        if (progressFunc) progressFunc.style.width = '0%';
      } else {
        if (statFuncInfo) statFuncInfo.textContent = `${funcAtuais}/${maxFunc}`;
        const percentFunc = Math.round((funcAtuais / maxFunc) * 100);
        if (progressFunc) {
          progressFunc.style.width = `${Math.min(percentFunc, 100)}%`;
          progressFunc.classList.remove('fill-warning', 'fill-error');
          if (percentFunc >= 100) progressFunc.classList.add('fill-error');
          else if (percentFunc >= 70) progressFunc.classList.add('fill-warning');
        }
      }
    }

    // ── CTA: Cadastrar fazenda / Upgrade ────────────────
    const ctaFazenda = document.getElementById('cta-fazenda');
    const ctaUpgrade = document.getElementById('cta-upgrade-fazendas');

    if (!isAmador && limites.max_fazendas === 0) {
      // Plano não permite fazendas → mostrar CTA de upgrade
      if (ctaFazenda) ctaFazenda.classList.add('hidden');
      if (ctaUpgrade) ctaUpgrade.classList.remove('hidden');
      const upgradeMsg = document.getElementById('cta-upgrade-msg');
      if (upgradeMsg) {
        upgradeMsg.textContent = 'Seu plano atual não permite o cadastro de fazendas';
      }
    } else if (!isAmador && fazendasAtuais === 0 && limites.pode_criar_fazenda) {
      // Sem fazendas, mas pode criar → mostrar CTA incentivando
      if (ctaFazenda) ctaFazenda.classList.remove('hidden');
      if (ctaUpgrade) ctaUpgrade.classList.add('hidden');
    } else if (!isAmador && !limites.pode_criar_fazenda && fazendasAtuais > 0) {
      // Limite atingido → mostrar CTA de upgrade
      if (ctaFazenda) ctaFazenda.classList.add('hidden');
      if (ctaUpgrade) ctaUpgrade.classList.remove('hidden');
      const upgradeMsg = document.getElementById('cta-upgrade-msg');
      if (upgradeMsg) {
        upgradeMsg.textContent = `Limite de fazendas atingido (${fazendasAtuais}/${limites.max_fazendas})`;
      }
    } else {
      // OK normal — esconder ambos
      if (ctaFazenda) ctaFazenda.classList.add('hidden');
      if (ctaUpgrade) ctaUpgrade.classList.add('hidden');
    }

    // Ocultar atalho de Fazendas para amadores
    if (isAmador) {
      const qaFazendas = document.getElementById('qa-fazendas');
      if (qaFazendas) qaFazendas.style.display = 'none';
    }
  },


  /**
   * Renderiza a seção hero com saudação.
   * @param {object} usuario
   * @param {Array} fazendas
   */
  renderHero(usuario, fazendas) {
    // Saudação baseada na hora
    const hora = new Date().getHours();
    let saudacao = 'Boa noite,';
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia,';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde,';

    const greetingEl = document.getElementById('hero-greeting');
    const nameEl = document.getElementById('hero-name');
    const farmNameEl = document.getElementById('hero-farm-name');

    if (greetingEl) greetingEl.textContent = saudacao;
    if (nameEl) nameEl.textContent = usuario.nome || 'Usuário';

    // Popular avatar com dados do usuário
    this.renderHeroAvatar(usuario);

    // Fazenda selecionada
    const fazendaSelecionada = fazendas.find(f => f.selecionada && f.ativa);
    if (farmNameEl) {
      // Amadores não têm fazenda — ocultar o botão de seleção
      const heroFarm = document.getElementById('hero-farm');
      if (App.isAmador()) {
        if (heroFarm) heroFarm.style.display = 'none';
      } else {
        const fazendaSelecionada = fazendas.find(f => f.selecionada && f.ativa);
        farmNameEl.textContent = fazendaSelecionada
          ? fazendaSelecionada.nome
          : (fazendas.length > 0 ? 'Selecione uma fazenda' : 'Nenhuma fazenda');
      }
    }
  },

  /**
   * Popula o avatar e dropdown com os dados do usuário.
   * @param {object} usuario
   */
  renderHeroAvatar(usuario) {
    const session = App.getSession();
    const nome = usuario.nome || session?.usuario?.nome || '';
    const email = usuario.email || session?.usuario?.email || '';
    const foto = usuario.foto_url || usuario.fotoUrl || usuario.foto || null;

    // Gerar iniciais (máx 2 letras)
    const partes = nome.trim().split(/\s+/);
    const iniciais = partes.length >= 2
      ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
      : (partes[0]?.[0] || '?').toUpperCase();

    // Atualizar botão do avatar (hero)
    const avatarCircle = document.getElementById('hero-avatar-circle');
    const avatarInitials = document.getElementById('hero-avatar-initials');
    if (avatarCircle && avatarInitials) {
      if (foto) {
        avatarCircle.style.backgroundImage = `url(${foto})`;
        avatarInitials.style.display = 'none';
      } else {
        avatarInitials.textContent = iniciais;
      }
    }

    // Atualizar dropdown: avatar, nome e email
    const dropdownAvatar = document.getElementById('hero-dropdown-avatar');
    const dropdownInitials = document.getElementById('hero-dropdown-initials');
    const dropdownName = document.getElementById('hero-dropdown-name');
    const dropdownEmail = document.getElementById('hero-dropdown-email');

    if (dropdownAvatar && dropdownInitials) {
      if (foto) {
        dropdownAvatar.style.backgroundImage = `url(${foto})`;
        dropdownInitials.style.display = 'none';
      } else {
        dropdownInitials.textContent = iniciais;
      }
    }
    if (dropdownName) dropdownName.textContent = nome || 'Usuário';
    if (dropdownEmail) dropdownEmail.textContent = email;
  },

  /**
   * Configura o dropdown do perfil no hero (abrir/fechar e ações).
   */
  setupProfileDropdown() {
    const btn = document.getElementById('hero-avatar-btn');
    const dropdown = document.getElementById('hero-profile-dropdown');
    const btnLogout = document.getElementById('hero-dd-logout');

    if (!btn || !dropdown) return;

    const openDropdown = () => {
      dropdown.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    };

    const closeDropdown = () => {
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };

    // Toggle ao clicar no botão
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
    });

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        closeDropdown();
      }
    });

    // Fechar com Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });

    // Logout com confirmação
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        closeDropdown();
        App.showModal({
          title: 'Sair da conta',
          message: 'Tem certeza que deseja sair? Você precisará fazer login novamente.',
          confirmText: 'Sair',
          confirmType: 'danger',
          onConfirm: () => Auth.logout(),
        });
      });
    }
  },

  /**
   * Renderiza as estatísticas do plano.
   * @param {object} perfilData — { usuario, assinatura, plano }
   */
  renderStats(perfilData) {
    const { assinatura, plano } = perfilData;

    // Plano
    const statPlano = document.getElementById('stat-plano');
    if (statPlano) statPlano.textContent = plano?.nome || 'Gratuito';

    // Análises
    const utilizadas = assinatura?.analises_utilizadas || 0;
    const limite = plano?.limite_analises || 3;
    const isIlimitado = limite === Infinity;
    const restantes = isIlimitado ? '∞' : Math.max(0, limite - utilizadas);
    const percent = isIlimitado ? 0 : (limite > 0 ? Math.round((utilizadas / limite) * 100) : 0);

    const statRestantes = document.getElementById('stat-restantes');
    const statInfo = document.getElementById('stat-utilizadas-info');
    const statPercent = document.getElementById('stat-percent');
    const progressFill = document.getElementById('progress-fill');

    if (statRestantes) statRestantes.textContent = restantes;
    if (statInfo) statInfo.textContent = isIlimitado ? 'Ilimitadas' : `${utilizadas} de ${limite} utilizadas`;
    if (statPercent) statPercent.textContent = utilizadas;

    if (progressFill) {
      progressFill.style.width = `${Math.min(percent, 100)}%`;
      // Mudar cor conforme uso
      progressFill.classList.remove('fill-warning', 'fill-error');
      if (percent >= 90) progressFill.classList.add('fill-error');
      else if (percent >= 70) progressFill.classList.add('fill-warning');
    }
  },

  /**
   * Renderiza as últimas análises.
   * @param {Array} analises — Lista de até 3 análises
   */
  renderUltimasAnalises(analises) {
    const container = document.getElementById('ultimas-analises');
    if (!container) return;

    if (!analises || analises.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-lg);">
          <div class="empty-icon"><span class="material-symbols-rounded">photo_camera</span></div>
          <h3>Nenhuma análise ainda</h3>
          <p>Faça sua primeira análise para começar!</p>
          <a href="analise.html" class="btn btn-primary btn-sm mt-md">Nova análise</a>
        </div>
      `;
      return;
    }

    container.innerHTML = analises.map(a => {
      const doencaNome = a.doenca?.nome || 'Desconhecida';
      const fazendaNome = a.fazenda?.nome || '—';
      const data = App.formatDate(a.created_at);
      const confianca = a.confianca ? `${a.confianca}%` : '—';

      return `
        <a href="relatorio.html?id=${a.id}" class="list-item" style="text-decoration:none; color:inherit;">
          <div class="thumbnail-placeholder"><span class="material-symbols-rounded">biotech</span></div>
          <div class="list-item-body">
            <div class="list-item-title">${doencaNome}</div>
            <div class="list-item-subtitle">${fazendaNome} · ${data}</div>
          </div>
          <span class="badge badge-primary">${confianca}</span>
        </a>
      `;
    }).join('');
  },

  /**
   * Configura o seletor de fazenda no hero.
   * @param {Array} fazendas
   */
  setupFarmSelector(fazendas) {
    const heroFarm = document.getElementById('hero-farm');
    if (!heroFarm || fazendas.length === 0) return;

    heroFarm.addEventListener('click', () => {
      // Mostrar modal com lista de fazendas
      const fazendasAtivas = fazendas.filter(f => f.ativa);
      if (fazendasAtivas.length === 0) {
        App.showToast('Nenhuma fazenda cadastrada.', 'info');
        return;
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'app-modal';

      backdrop.innerHTML = `
        <div class="modal">
          <h3 class="modal-title">Selecionar Fazenda</h3>
          <div class="flex flex-col gap-sm" id="farm-list">
            ${fazendasAtivas.map(f => `
              <button class="list-item" data-farm-id="${f.id}" style="margin-bottom:0; border:${f.selecionada ? '2px solid var(--color-primary)' : '1px solid var(--border-color)'};">
                <span style="font-size:20px">${f.selecionada ? '<span class="material-symbols-rounded">check_circle</span>' : '<span class="material-symbols-rounded">grass</span>'}</span>
                <div class="list-item-body">
                  <div class="list-item-title">${f.nome}</div>
                  <div class="list-item-subtitle">${f.cidade || f.municipio || ''} — ${f.estado || ''}</div>
                </div>
              </button>
            `).join('')}
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost btn-full" id="modal-cancel">Fechar</button>
          </div>
        </div>
      `;

      document.body.appendChild(backdrop);

      // Fechar modal
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) App.closeModal();
      });
      document.getElementById('modal-cancel').addEventListener('click', () => App.closeModal());

      // Selecionar fazenda
      document.getElementById('farm-list').addEventListener('click', async (e) => {
        const item = e.target.closest('[data-farm-id]');
        if (!item) return;
        const farmId = item.getAttribute('data-farm-id'); // ID é string no Firestore
        App.closeModal();

        try {
          App.showLoading('Selecionando fazenda...');
          await FazendasAPI.selecionar(farmId);
          App.hideLoading();
          App.showToast('Fazenda selecionada!', 'success');
          // Recarregar dashboard
          await this.loadData();
        } catch (error) {
          App.hideLoading();
          App.showToast('Erro ao selecionar fazenda.', 'error');
        }
      });
    });
  },
};
