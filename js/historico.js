/**
 * Tomeye — historico.js
 * Módulo do histórico de análises.
 */

const Historico = {

  /** Lista de doenças para os filtros */
  _doencas: [],

  /**
   * Inicializa a tela de histórico.
   */
  async init() {
    if (!(await App.requireAuthAsync())) return;

    App.renderBottomNav('historico');

    // Configurar filtros
    Historico._setupFiltros();

    // Configurar botão excluir tudo
    const btnExcluirTudo = document.getElementById('btn-excluir-tudo');
    if (btnExcluirTudo) {
      btnExcluirTudo.addEventListener('click', () => Historico.handleDeleteAll());
    }

    // Carregar análises
    await Historico.loadAnalises();
  },

  _setupFiltros() {
    // Limitar intervalos de data
    const hoje = new Date().toISOString().split('T')[0];              // "YYYY-MM-DD"
    const anoAtual = new Date().getFullYear();
    const fimAnoAtual = `${anoAtual}-12-31`;                          // "AAAA-12-31"
    const minData = '2025-01-01';

    const inputInicio = document.getElementById('filtro-data-inicio');
    const inputFim = document.getElementById('filtro-data-fim');
    if (inputInicio) { inputInicio.min = minData; inputInicio.max = hoje; }
    if (inputFim)    { inputFim.min = minData;    inputFim.max = fimAnoAtual; }

    // Corrigir valores digitados manualmente (min/max não bloqueiam teclado)
    const _clampDate = (input) => {
      if (!input || !input.value) return;
      if (input.value < input.min) input.value = input.min;
      if (input.value > input.max) input.value = input.max;
    };
    if (inputInicio) inputInicio.addEventListener('change', () => _clampDate(inputInicio));
    if (inputFim)    inputFim.addEventListener('change',    () => _clampDate(inputFim));

    const form = document.getElementById('filtros-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await Historico.loadAnalises();
      });
    }

    const btnLimpar = document.getElementById('btn-limpar-filtros');
    if (btnLimpar) {
      btnLimpar.addEventListener('click', async () => {
        if (inputInicio) inputInicio.value = '';
        if (inputFim) inputFim.value = '';
        const nomeEl = document.getElementById('filtro-nome-doenca');
        if (nomeEl) nomeEl.value = '';
        await Historico.loadAnalises();
      });
    }
  },

  /**
   * Carrega e renderiza análises com filtros opcionais.
   */
  async loadAnalises() {
    const userId = App.getUserId();
    const container = document.getElementById('historico-list');

    if (container) {
      container.innerHTML = '<div class="empty-state"><div class="spinner spinner-dark spinner-sm"></div></div>';
    }

    const filtros = {};
    const dataInicio = document.getElementById('filtro-data-inicio')?.value;
    const dataFim = document.getElementById('filtro-data-fim')?.value;
    const nomeTexto = document.getElementById('filtro-nome-doenca')?.value?.trim() || '';

    if (dataInicio) filtros.data_inicio = dataInicio;
    if (dataFim) filtros.data_fim = dataFim;

    // Helper: normaliza acentos e caixa para busca parcial
    const normalizar = (str) =>
      str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const termoBusca = normalizar(nomeTexto);

    try {
      let analises = await AnalisesAPI.listar(userId, filtros);

      // Filtro de data em memória (garante mesmo sem índice composto no Firestore)
      if (dataInicio) {
        analises = analises.filter(a => a.created_at >= dataInicio);
      }
      if (dataFim) {
        analises = analises.filter(a => a.created_at <= dataFim + 'T23:59:59');
      }

      // Busca por nome: parcial, sem acento, sem case
      if (termoBusca) {
        analises = analises.filter(a => {
          const nome = normalizar(a.doenca?.nome || a.doenca_nome || '');
          return nome.includes(termoBusca);
        });
      }

      Historico.render(analises);
    } catch (error) {
      console.error('[Historico] Erro ao carregar:', error);
      App.showToast('Erro ao carregar histórico.', 'error');
      if (container) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon"><span class="material-symbols-rounded">warning</span></div><h3>Erro ao carregar</h3><p>Tente novamente.</p></div>';
      }
    }
  },

  /**
   * Renderiza a lista de análises.
   * @param {Array} analises
   */
  render(analises) {
    const container = document.getElementById('historico-list');
    if (!container) return;

    if (!analises || analises.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><span class="material-symbols-rounded">history</span></div>
          <h3>Nenhuma análise encontrada</h3>
          <p>Faça sua primeira análise ou ajuste os filtros.</p>
          <a href="analise.html" class="btn btn-primary mt-md"><span class="material-symbols-rounded" style="vertical-align:middle;font-size:16px;">photo_camera</span> Nova análise</a>
        </div>
      `;
      return;
    }

    container.innerHTML = analises.map(a => {
      // Usar doenca_nome diretamente quando objeto doenca não está disponível (RF9/RF10)
      const doencaNome = a.doenca?.nome || a.doenca_nome || 'Desconhecida';
      const fazendaNome = a.fazenda?.nome || '—';
      const data = App.formatDate(a.created_at, true);
      const confianca = a.confianca ? `${a.confianca}%` : '—';

      // Badge de confiança colorido (RF14)
      let badgeClass = 'badge-info';
      if (a.confianca >= 85) badgeClass = 'badge-success';
      else if (a.confianca >= 60) badgeClass = 'badge-warning';
      else if (a.confianca > 0) badgeClass = 'badge-error';

      // Thumbnail ou placeholder
      const thumbHtml = a.imagem_url
        ? `<img src="${a.imagem_url}" class="thumbnail" alt="Imagem">`
        : `<div class="thumbnail-placeholder"><span class="material-symbols-rounded">biotech</span></div>`;

      return `
        <div class="list-item" style="cursor: default;">
          ${thumbHtml}
          <div class="list-item-body">
            <div class="list-item-title">${doencaNome}</div>
            <div class="list-item-subtitle">${fazendaNome}</div>
            <div class="list-item-subtitle" style="font-size: var(--font-size-xs);">${data}</div>
          </div>
          <div class="list-item-actions flex flex-col items-center gap-sm">
            <span class="badge ${badgeClass}" title="Nível de confiança da IA">${confianca}</span>
            <div class="flex gap-sm">
              <a href="relatorio.html?id=${a.id}" class="btn btn-ghost btn-sm" title="Ver relatório"><span class="material-symbols-rounded" style="font-size:16px;">visibility</span></a>
              <button class="btn btn-ghost btn-sm" style="color:var(--color-error);" title="Excluir" onclick="Historico.handleDelete('${a.id}')"><span class="material-symbols-rounded" style="font-size:16px;">delete</span></button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Exclui uma análise com confirmação.
   * @param {number} id
   */
  handleDelete(id) {
    App.showModal({
      title: 'Excluir análise',
      message: 'Tem certeza que deseja excluir esta análise? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      confirmType: 'danger',
      onConfirm: async () => {
        try {
          App.showLoading('Excluindo...');
          await AnalisesAPI.excluir(id);
          App.hideLoading();
          App.showToast('Análise excluída.', 'success');
          await Historico.loadAnalises();
        } catch (error) {
          App.hideLoading();
          App.showToast(error.message || 'Erro ao excluir.', 'error');
        }
      },
    });
  },

  /**
   * Exclui todo o histórico de análises do usuário (RF 1.1).
   */
  handleDeleteAll() {
    App.showModal({
      title: 'Excluir todo o histórico',
      message: 'Tem certeza que deseja excluir <strong>todas</strong> as suas análises? Esta ação é irreversível.',
      confirmText: 'Excluir tudo',
      confirmType: 'danger',
      onConfirm: async () => {
        try {
          App.showLoading('Excluindo histórico...');
          const userId = App.getUserId();
          const result = await AnalisesAPI.excluirTodas(userId);
          App.hideLoading();
          App.showToast(result.mensagem || 'Histórico excluído.', 'success');
          await Historico.loadAnalises();
        } catch (error) {
          App.hideLoading();
          App.showToast(error.message || 'Erro ao excluir histórico.', 'error');
        }
      },
    });
  },
};
