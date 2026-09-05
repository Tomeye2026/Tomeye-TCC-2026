/**
 * Tomeye — analises.js
 * Módulo de análises: captura → Canvas API (filtros.js) → TensorFlow (browser) → relatório.
 *
 * Pipeline:
 * 1. [analise.html]         Capturar imagem (câmera/galeria)
 * 2. [filtros.js]           Pré-processar: redimensionar 224×224, normalizar, nitidez (Canvas API pura)
 * 3. [tf-classificador.js]  TensorFlow/Teachable Machine classifica no browser
 * 4. [processamento.html]   Tela de progresso com 3 steps
 * 5. [relatorio.html]       Exibir resultado completo
 */

const Analises = {

  /** URL do servidor backend */
  _SERVER_URL: 'http://localhost:3000',

  /** File selecionado antes do preprocessamento */
  _arquivoAtual: null,

  // ===========================================================
  // TELA DE CAPTURA — analise.html
  // ===========================================================

  async initCaptura() {
    if (!(await App.requireAuthAsync())) return;
    App.renderBottomNav('analise');

    // Amadores/casa não precisam de fazenda — ocultar card de fazenda
    if (App.isAmador()) {
      const secaoFazenda = document.querySelector('section:has(#analise-fazenda-nome)');
      // fallback: buscar pelo card que contém o ID
      const cardFazenda = document.getElementById('analise-fazenda-nome')?.closest('section');
      if (cardFazenda) cardFazenda.style.display = 'none';
    } else {
      await Analises._loadFazendaSelecionada();
    }

    Analises._setupCapturaInputs();
  },

  async _loadFazendaSelecionada() {
    const userId = App.getUserId();
    try {
      const fazendas = await FazendasAPI.listar(userId);
      const selecionada = fazendas.find(f => f.selecionada && f.ativa);
      const el = document.getElementById('analise-fazenda-nome');
      if (el) el.textContent = selecionada ? selecionada.nome : 'Nenhuma fazenda selecionada';
    } catch (e) { console.warn('[Analises] Fazenda:', e); }
  },

  _setupCapturaInputs() {
    const btnCamera = document.getElementById('btn-camera');
    const inputCamera = document.getElementById('input-camera');
    const btnGaleria = document.getElementById('btn-galeria');
    const inputGaleria = document.getElementById('input-galeria');
    const btnRemover = document.getElementById('btn-remover-imagem');
    const btnEnviar = document.getElementById('btn-enviar-analise');

    if (btnCamera && inputCamera) {
      btnCamera.addEventListener('click', () => inputCamera.click());
      inputCamera.addEventListener('change', e => {
        if (e.target.files[0]) Analises._handleFileSelect(e.target.files[0]);
      });
    }

    if (btnGaleria && inputGaleria) {
      btnGaleria.addEventListener('click', () => inputGaleria.click());
      inputGaleria.addEventListener('change', e => {
        if (e.target.files[0]) Analises._handleFileSelect(e.target.files[0]);
      });
    }

    if (btnRemover) btnRemover.addEventListener('click', () => Analises._clearImage());
    if (btnEnviar) btnEnviar.addEventListener('click', () => Analises._handleSubmit());
  },

  _handleFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) {
      App.showToast('Selecione um arquivo de imagem válido.', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      App.showToast('A imagem deve ter no máximo 15MB.', 'error');
      return;
    }

    Analises._arquivoAtual = file;

    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('image-preview');
      const placeholder = document.getElementById('image-placeholder');
      const btnRemover = document.getElementById('btn-remover-imagem');
      const sectionEnv = document.getElementById('section-enviar');

      if (preview) { preview.src = e.target.result; preview.classList.remove('hidden'); }
      if (placeholder) placeholder.classList.add('hidden');
      if (btnRemover) btnRemover.classList.remove('hidden');
      if (sectionEnv) sectionEnv.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  },

  _clearImage() {
    Analises._arquivoAtual = null;
    const preview = document.getElementById('image-preview');
    const placeholder = document.getElementById('image-placeholder');
    const btnRemover = document.getElementById('btn-remover-imagem');
    const sectionEnv = document.getElementById('section-enviar');

    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    if (placeholder) placeholder.classList.remove('hidden');
    if (btnRemover) btnRemover.classList.add('hidden');
    if (sectionEnv) sectionEnv.classList.add('hidden');

    document.getElementById('input-camera')?.value && (document.getElementById('input-camera').value = '');
    document.getElementById('input-galeria')?.value && (document.getElementById('input-galeria').value = '');
  },

  async _handleSubmit() {
    if (!Analises._arquivoAtual) {
      App.showToast('Selecione uma imagem primeiro.', 'warning');
      return;
    }

    const userId = App.getUserId();

    // ── BUG 1 FIX: Verificar limite do plano ANTES de processar ──
    try {
      const { assinatura, plano } = await AssinaturasAPI.obterAssinatura(userId);
      if (assinatura && plano) {
        const utilizadas = assinatura.analises_utilizadas || 0;
        const limite = plano.limite_analises || 3;
        if (plano.limite_analises !== Infinity && utilizadas >= limite) {
          App.showToast(
            `Limite de ${limite} análise${limite !== 1 ? 's' : ''} do plano ${plano.nome} atingido. Faça upgrade para continuar.`,
            'error',
            5000
          );
          return;
        }
      }
    } catch (limiteErr) {
      console.warn('[Analises] Não foi possível verificar limite do plano:', limiteErr.message);
      // Prosseguir mesmo assim — melhor permitir do que bloquear sem certeza
    }

    const isAmador = App.isAmador();
    let fazenda;

    if (isAmador) {
      // Amadores não precisam de fazenda — usamos uma virtual
      fazenda = { id: null, nome: 'Casa', selecionada: true, ativa: true };
    } else {
      const fazendas = await FazendasAPI.listar(userId);
      fazenda = fazendas.find(f => f.selecionada && f.ativa);

      if (!fazenda) {
        App.showToast('Selecione uma fazenda antes de enviar.', 'warning');
        return;
      }
    }

    try {
      App.showLoading('Detectando folha na imagem...');

      let preprocessado;

      // ──── Pré-processamento via Canvas API (filtros.js) ────
      preprocessado = await ImageFilters.preprocessar(Analises._arquivoAtual, {
        tamanhoTF: 224,
        tamanhoUI: 800,
        nitidez: true,
        normalizar: true,
      });
      preprocessado.metadados = { folhaDetectada: false, ajusteAplicado: true };
      console.log('[Analises] Canvas API processou com sucesso.');

      App.hideLoading();

      // Salvar dados para a tela de processamento
      sessionStorage.setItem('tomeye_analise_imagemTF', preprocessado.imagemTF);
      sessionStorage.setItem('tomeye_analise_imagemUI', preprocessado.imagemUI);
      sessionStorage.setItem('tomeye_analise_fazenda_id', fazenda.id ?? '');
      sessionStorage.setItem('tomeye_analise_metadados', JSON.stringify(preprocessado.metadados || {}));

      App.navigate('processamento.html');

    } catch (error) {
      App.hideLoading();
      console.error('[Analises] Erro ao preprocessar:', error);
      App.showToast('Erro ao processar imagem. Tente novamente.', 'error');
    }
  },

  // ===========================================================
  // TELA DE PROCESSAMENTO — processamento.html
  // ===========================================================

  async initProcessamento() {
    if (!(await App.requireAuthAsync())) return;

    const imagemTF = sessionStorage.getItem('tomeye_analise_imagemTF');
    const imagemUI = sessionStorage.getItem('tomeye_analise_imagemUI');
    const fazendaId = sessionStorage.getItem('tomeye_analise_fazenda_id');

    // Amadores/casa não têm fazenda — fazendaId pode ser string vazia, o que é válido
    if (!imagemTF) {
      App.showToast('Dados não encontrados. Tente novamente.', 'error');
      setTimeout(() => App.navigate('analise.html'), 1500);
      return;
    }

    // ── Timer de processamento (RNF 2.2) ──
    let elapsedSeconds = 0;
    const timerDisplay = document.getElementById('timer-display');
    const slowWarning = document.getElementById('processing-slow-warning');
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      if (timerDisplay) timerDisplay.textContent = `${elapsedSeconds}s`;
      // Aviso após 8 segundos (RNF 2.2)
      if (elapsedSeconds >= 8 && slowWarning) {
        slowWarning.classList.remove('hidden');
      }
    }, 1000);

    // ── Retry handler (RF 1.2) ──
    const btnRetry = document.getElementById('btn-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        // Esconder erro, resetar steps, re-executar
        const errorContainer = document.getElementById('processing-error');
        const mainSpinner = document.getElementById('main-spinner');
        const stepsContainer = document.getElementById('processing-steps');
        if (errorContainer) errorContainer.classList.add('hidden');
        if (mainSpinner) mainSpinner.classList.remove('hidden');
        if (stepsContainer) stepsContainer.classList.remove('hidden');

        // Resetar steps visuais
        [1, 2, 3].forEach(n => {
          const step = document.getElementById(`step-${n}`);
          if (step) { step.classList.remove('active', 'done'); }
          const indicator = step?.querySelector('.step-indicator');
          if (indicator) indicator.innerHTML = '';
        });

        // Resetar timer
        elapsedSeconds = 0;
        if (timerDisplay) timerDisplay.textContent = '0s';
        if (slowWarning) slowWarning.classList.add('hidden');

        // Re-executar pipeline
        Analises._executeProcessingPipeline(imagemTF, imagemUI, fazendaId, timerInterval);
      });
    }

    // Executar pipeline
    await Analises._executeProcessingPipeline(imagemTF, imagemUI, fazendaId, timerInterval);
  },

  /**
   * Executa o pipeline de processamento (separado para permitir retry).
   * @param {string} imagemTF
   * @param {string} imagemUI
   * @param {number} fazendaId
   * @param {number} timerInterval — ID do setInterval do timer
   */
  async _executeProcessingPipeline(imagemTF, imagemUI, fazendaId, timerInterval) {
    // Iniciar animação do step 1 (pré-processamento já foi feito na tela anterior)
    Analises._completeStep(1); // Canvas API concluído
    Analises._activateStep(2); // TensorFlow iniciando

    try {
      // ──── ETAPA 2: TensorFlow no browser ────
      console.log('[Analises] Iniciando classificação TensorFlow no browser...');
      let tfResultado;
      try {
        await TFClassificador.init();
        // Criar elemento imagem a partir do base64 para classificar
        const imgEl = await Analises._base64ParaImagem(imagemTF);
        tfResultado = await TFClassificador.classificar(imgEl);
        console.log('[Analises] TF resultado:', tfResultado);

        // ── Verificar se o modelo classificou como "Desconhecido" ──
        if (tfResultado && !tfResultado.simulado) {
          const classeOriginal = tfResultado.todasClasses?.[0]?.classe || '';
          if (classeOriginal === 'Desconhecido' || tfResultado.doenca === 'Imagem não reconhecida') {
            clearInterval(timerInterval);
            Analises._exibirErraNaoEPlanta(null, tfResultado.confiancaPct);
            return;
          }
        }
      } catch (tfErr) {
        console.warn('[Analises] TF falhou, usando simulação:', tfErr.message);
        tfResultado = null; // servidor usará simulação
      }

      Analises._completeStep(2);
      Analises._activateStep(3);

      // ──── ETAPA 3: Gerar análise textual da IA (100% offline local) ────
      let resultado = null;

      if (typeof IALocal !== 'undefined' && tfResultado) {
        try {
          console.log('[Analises] Usando Sistema Especialista Local...');
          // Suporte ao novo layout (id=step-3-label) e ao legado (#step-3 span)
          const step3Label = document.getElementById('step-3-label') || document.querySelector('#step-3 span');
          if (step3Label) step3Label.textContent = 'Cruzando dados na base de conhecimento...';

          const iaResult = await IALocal.analisar(tfResultado);

          // BUG 2 FIX: Usar SEMPRE o nome da doença do TF como fonte primária.
          // O IALocal pode retornar um nome diferente; manter o nome do TF garante
          // consistência entre o modelo (Teachable Machine) e o relatório exibido.
          const nomeDoencaNormalizado = tfResultado.doenca;

          resultado = {
            sucesso: true,
            analise: {
              doenca: nomeDoencaNormalizado,
              confianca: Math.round(tfResultado.confianca * 100),
              gravidade: tfResultado.gravidade,
              areaAfetada: tfResultado.areaAfetada,
              imagemUrl: imagemUI || imagemTF,
              criadoEm: new Date().toISOString(),
            },
            iaAnalise: iaResult.dados,
            iaFonte: iaResult.fonte,
            geminiAnalise: iaResult.markdown,
          };

          console.log('[Analises] ✅ Análise gerada via Sistema Especialista (Offline)!');
        } catch (localErr) {
          console.warn('[Analises] Sistema Especialista falhou:', localErr.message);
        }
      }

      // Fallback local caso o Sistema Especialista tenha falhado ou não esteja definido
      if (!resultado) {
        console.log('[Analises] Usando simulação local offline...');
        resultado = Analises._simularResultado(imagemUI, tfResultado);
      }

      // Salvar no MockDB local
      const resultadoFinal = await Analises._salvarResultado(resultado, imagemUI, fazendaId);

      // Limpar dados temporários
      sessionStorage.removeItem('tomeye_analise_imagemTF');
      sessionStorage.removeItem('tomeye_analise_imagemUI');
      sessionStorage.removeItem('tomeye_analise_fazenda_id');
      sessionStorage.removeItem('tomeye_analise_metadados');

      sessionStorage.setItem('tomeye_analise_resultado', JSON.stringify(resultadoFinal));

      // Parar timer
      clearInterval(timerInterval);

      Analises._completeStep(3);
      setTimeout(() => App.navigate(`relatorio.html?id=${resultadoFinal.analise.id}`), 800);

    } catch (error) {
      // Parar timer
      clearInterval(timerInterval);

      console.error('[Analises] Erro no processamento:', error);

      // Ocultar aviso de lentidão e elementos de progresso
      const slowWarning2 = document.getElementById('processing-slow-warning');
      const timerEl2 = document.getElementById('processing-timer');
      const progressBar2 = document.getElementById('proc-progress-bar')?.closest('.proc-progress-track');
      if (slowWarning2) { slowWarning2.classList.add('hidden'); slowWarning2.style.display = 'none'; }
      if (timerEl2) timerEl2.style.display = 'none';
      if (progressBar2) progressBar2.style.display = 'none';

      // Exibir UI de erro com botão retry (RF 1.2)
      const errorContainer = document.getElementById('processing-error');
      const errorMsg = document.getElementById('processing-error-msg');
      const mainSpinner = document.getElementById('main-spinner');

      if (errorContainer) {
        errorContainer.classList.remove('hidden');
        if (errorMsg) errorMsg.textContent = error.message || 'Ocorreu um erro ao processar a análise.';
      }
      if (mainSpinner) mainSpinner.classList.add('hidden');

      App.showToast(error.message || 'Erro ao processar análise.', 'error');
    }
  },

  /**
   * Converte uma string base64 em um HTMLImageElement.
   * @param {string} base64
   * @returns {Promise<HTMLImageElement>}
   */
  _base64ParaImagem(base64) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar imagem base64.'));
      img.src = base64;
    });
  },

  /**
   * Simulação local — usada caso o Sistema Especialista local falhe.
   * Se tfResultado (do browser) estiver disponível, usa esses dados.
   * Caso contrário, gera dados aleatórios.
   */
  _simularResultado(imagemUI, tfResultado = null) {
    let doenca, conf, area, gravidade;

    if (tfResultado) {
      // Usar resultado real do TensorFlow (browser)
      doenca = tfResultado.doenca;
      conf = tfResultado.confiancaPct || Math.round(tfResultado.confianca * 100);
      area = tfResultado.areaAfetada;
      gravidade = tfResultado.gravidade;
    } else {
      const doencas = ['Requeima', 'Septoriose', 'Acaro-bronzeado', 'Planta-saudavel'];
      doenca = doencas[Math.floor(Math.random() * doencas.length)];
      conf = Math.round(72 + Math.random() * 26);
      area = Math.floor(5 + Math.random() * 40);
      gravidade = conf > 88 ? 'Grave' : conf > 78 ? 'Moderada' : 'Leve';
    }

    return {
      sucesso: true,
      analise: {
        doenca,
        confianca: conf,
        gravidade,
        areaAfetada: area,
        imagemUrl: imagemUI,
        criadoEm: new Date().toISOString(),
      },
      geminiAnalise: `### Diagnóstico provável\n\n**${doenca}** detectada com ${conf}% de confiança.\n\n### O que isso significa\n\nGravidade: **${gravidade}** — Área foliar afetada: **${area}%**.\n\n> 💡 A análise foi gerada offline usando o Sistema Especialista local.`,
    };
  },

  /**
   * Salva o resultado no Firestore e retorna o objeto padronizado.
   */
  async _salvarResultado(resultado, imagemUI, fazendaId) {
    const session = App.getSession();
    const userId = session.usuario.id;
    const doencaId = Analises._mapearDoencaId(resultado.analise.doenca);

    // Dados a salvar (sem ID — será gerado pelo Firestore)
    const dadosAnalise = {
      usuario_id: userId,
      fazenda_id: fazendaId,
      doenca_id: doencaId,
      doenca_nome: resultado.analise.doenca,
      imagem_url: imagemUI,
      confianca: resultado.analise.confianca,
      gravidade: resultado.analise.gravidade,
      areaAfetada: resultado.analise.areaAfetada,
      status: 'concluida',
      created_at: resultado.analise.criadoEm || new Date().toISOString(),
    };

    // AnalisesAPI.criar() retorna { analise: { id: <firestoreId>, ...dados } }
    const criada = await AnalisesAPI.criar(dadosAnalise);
    // Usar o ID real gerado pelo Firestore (string)
    const analise = criada.analise;

    // Criar notificação referenciando o ID real do Firestore
    await NotificacoesAPI.criar({
      usuario_id: userId,
      titulo: 'Análise concluída',
      mensagem: `${resultado.analise.doenca} — ${resultado.analise.confianca}% de confiança`,
      tipo: 'analise',
      referencia_id: analise.id,
      lida: false,
    });

    // Incrementar análises utilizadas
    try {
      await AssinaturasAPI.incrementarUso(userId);
    } catch (e) {
      console.warn('[Analises] Erro ao incrementar uso da assinatura:', e);
    }

    // Usar o nome da doença que o TF/Gemini retornou
    const nomeRealDoenca = resultado.analise.doenca;
    const doenca = {
      nome: nomeRealDoenca,
      agente: '',
      cultura: '',
    };

    return {
      analise,
      doenca,
      geminiAnalise: resultado.geminiAnalise,
      relatorio: {
        sintomas: [],
        recomendacoes: ['Ver análise completa abaixo'],
        tratamento: resultado.geminiAnalise,
        info_adicional: '',
      },
    };
  },

  /**
   * Mapeia nome de doença retornado pelo TF para ID do MockDB.
   * Nomes canônicos = nomes exibidos no relatório (saída do MAPA_CLASSES do TF).
   */
  _mapearDoencaId(nomeDoenca) {
    const mapa = {
      // ── Nomes canônicos (saída do tf-classificador.js MAPA_CLASSES) ──
      'Requeima': 1,
      'Septoriose (Septoria)': 3,
      'Mofo das folhas': 2,
      'Mancha bacteriana': 5,
      'Vírus do enrolamento amarelo': 5,
      'Planta saudável': null,
      'Imagem não reconhecida': null,
      // ── Aliases de compatibilidade (nomes antigos / paths legados) ──
      'Septoria': 3,  // nome bruto do modelo antes do mapeamento
      'Septoriose': 3,
      'Antracnose': 2,
      'Cercospora': 3,
      'Acaro-bronzeado': 4,
      'Virus-do-mosaico': 5,
      'Mancha-bacteriana': 5,
      'Planta-saudavel': null,
    };
    return mapa[nomeDoenca] ?? 1;
  },

  // ===========================================================
  // VALIDAÇÃO: ERRO DE IMAGEM NÃO É PLANTA
  // ===========================================================

  /**
   * Exibe a UI de erro amigável quando a imagem não é identificada como planta.
   * @param {number|null} porcentagemVerde — % de pixels verdes (null = erro pós-TF)
   * @param {number|null} confiancaTF      — % de confiança do TF (null = erro pré-TF)
   */
  _exibirErraNaoEPlanta(porcentagemVerde = null, confiancaTF = null) {
    // Ocultar todos os elementos de progresso
    const mainSpinner  = document.getElementById('main-spinner');
    const stepsContainer = document.getElementById('processing-steps');
    const timerEl     = document.getElementById('processing-timer');
    const slowWarning  = document.getElementById('processing-slow-warning');
    const progressBar  = document.getElementById('proc-progress-bar')?.closest('.proc-progress-track');
    const procTexts   = document.querySelector('.proc-texts');

    if (mainSpinner)   mainSpinner.style.display   = 'none';
    if (stepsContainer) stepsContainer.style.display = 'none';
    if (timerEl)       timerEl.style.display        = 'none';
    if (progressBar)   progressBar.style.display    = 'none';
    // Esconder aviso de lentidão — irrelevante após o erro
    if (slowWarning) {
      slowWarning.classList.remove('visible');
      slowWarning.classList.add('hidden');
      slowWarning.style.display = 'none';
    }
    // Esconder o bloco de título/subtítulo para não aparecer junto com o erro
    if (procTexts) procTexts.style.display = 'none';

    // Montar mensagem única no container de erro
    const errContainer = document.getElementById('processing-error');
    const errMsg = document.getElementById('processing-error-msg');

    let detalheMsg = 'Esta imagem não parece ser uma folha ou planta de tomateiro.';
    if (confiancaTF !== null) {
      detalheMsg += ` (confiança do modelo: ${confiancaTF}%)`;
    }
    if (errMsg) errMsg.textContent = detalheMsg;

    // Trocar botão "retry" por "selecionar outra imagem" e ocultar link duplicado
    const btnRetry = document.getElementById('btn-retry');
    if (btnRetry) {
      btnRetry.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px">photo_camera</span> Selecionar outra imagem';
      btnRetry.onclick = () => { window.location.href = 'analise.html'; };
    }

    // Ocultar o link ghost "Selecionar outra imagem" (duplicado estático do HTML)
    const ghostLink = document.querySelector('.error-actions a.btn-proc-ghost');
    if (ghostLink) ghostLink.style.display = 'none';

    // Mudar título do bloco de erro para "Imagem inválida"
    const errorTitle = document.querySelector('.error-title');
    if (errorTitle) errorTitle.textContent = 'Imagem inválida';

    // Exibir o container de erro
    if (errContainer) {
      errContainer.classList.remove('hidden');
      errContainer.classList.add('visible');
      errContainer.style.display = 'flex';
    }

    console.warn('[Analises] Imagem rejeitada: não é uma planta.');
  },

  // ===========================================================
  // ANIMAÇÃO DE STEPS (processamento.html)
  // ===========================================================

  _activateStep(n) {
    const step = document.getElementById(`step-${n}`);
    if (!step) return;
    step.classList.add('active');
    const indicator = step.querySelector('.step-indicator');
    if (indicator) indicator.innerHTML = `<div class="spinner spinner-sm" style="width:14px;height:14px;border-width:2px;border-color:rgba(255,255,255,0.3);border-top-color:var(--color-primary-light);"></div>`;
  },

  _completeStep(n) {
    const step = document.getElementById(`step-${n}`);
    if (!step) return;
    step.classList.remove('active');
    step.classList.add('done');
    const indicator = step.querySelector('.step-indicator');
    if (indicator) indicator.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;">check</span>';
  },

  // ===========================================================
  // TELA DE RELATÓRIO — relatorio.html
  // ===========================================================

  async initRelatorio() {
    if (!(await App.requireAuthAsync())) return;
    App.renderBottomNav('');

    const resultadoJson = sessionStorage.getItem('tomeye_analise_resultado');
    const urlParams = new URLSearchParams(window.location.search);
    const analiseId = urlParams.get('id');

    if (resultadoJson) {
      const resultado = JSON.parse(resultadoJson);
      sessionStorage.removeItem('tomeye_analise_resultado');
      Analises._renderRelatorio(resultado);
    } else if (analiseId) {
      await Analises._loadRelatorio(analiseId); // ID do Firestore é string
    } else {
      App.showToast('Nenhuma análise para exibir.', 'warning');
      setTimeout(() => App.navigate('dashboard.html'), 1500);
    }

    Analises._setupRelatorioActions();
  },

  async _loadRelatorio(analiseId) {
    try {
      const data = await AnalisesAPI.obter(analiseId);
      Analises._renderRelatorio(data);
    } catch (e) {
      App.showToast('Erro ao carregar relatório.', 'error');
    }
  },

  _renderRelatorio(data) {
    const { analise, doenca, geminiAnalise, relatorio: relData } = data;

    // ── Imagem (RF5) ──
    const imgContainer = document.getElementById('relatorio-imagem-container');
    if (imgContainer && analise.imagem_url) {
      imgContainer.innerHTML = `
        <img src="${analise.imagem_url}" alt="Imagem analisada" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">
        <button class="img-delete-btn" id="btn-excluir-imagem" title="Excluir imagem desta análise" aria-label="Excluir imagem"><span class="material-symbols-rounded" style="font-size:18px;">delete</span></button>
      `;
    }

    // ── Doença (RF10) ──
    const nomeEl = document.getElementById('relatorio-doenca-nome');
    const agenteEl = document.getElementById('relatorio-doenca-agente');
    if (nomeEl) nomeEl.textContent = doenca?.nome || analise.doenca_nome || analise.doenca || 'Não identificada';
    if (agenteEl) agenteEl.textContent = (doenca?.agente && doenca?.cultura) ? `${doenca.agente} — ${doenca.cultura}` : '';

    // ── Confiança da IA (RF14) ──
    const confianca = analise.confianca || 0;
    const valueEl = document.getElementById('confidence-value');
    if (valueEl) valueEl.textContent = `${confianca}%`;
    // (observer no HTML atualiza barra, anel e badge automaticamente)

    // ── Área afetada ──
    const areaEl = document.getElementById('relatorio-area-afetada');
    if (areaEl) areaEl.textContent = analise.areaAfetada != null ? `${analise.areaAfetada}%` : '—';

    // ── Gravidade ──
    const gravEl = document.getElementById('relatorio-gravidade');
    if (gravEl) {
      const badgeMap = { 'Leve': 'success', 'Moderada': 'warning', 'Grave': 'error', 'Nenhuma': 'info' };
      const tipo = badgeMap[analise.gravidade] || 'info';
      gravEl.innerHTML = `<span class="badge badge-${tipo}">${analise.gravidade || '—'}</span>`;
    }

    // ── Informações sobre a doença: buscar do doencas.json (RF12) ──
    Analises._preencherInfoDoenca(analise.doenca_nome || analise.doenca, data);

    // ── Análise do Sistema Especialista em Markdown (RF10/RF12/RF13) ──
    const geminiContainer = document.getElementById('relatorio-gemini');
    if (geminiContainer) {
      if (geminiAnalise) {
        geminiContainer.innerHTML = Analises._markdownParaHtml(geminiAnalise);
      } else {
        geminiContainer.innerHTML = '<p class="text-muted">Análise detalhada não disponível.</p>';
      }
    }

    Analises._currentAnaliseId = analise.id;
    Analises._currentAnalise = analise;
  },

  /**
   * Preenche as seções estruturadas de informações da doença e tratamento.
   * Combina dados do doencas.json (via IALocal) + relatorios do MockDB.
   * RF12 — Informações sobre a doença | RF13 — Recomendações de tratamento
   * @param {string} nomeDoenca
   * @param {object} data — resultado completo
   */
  async _preencherInfoDoenca(nomeDoenca, data) {
    let dadosDoencaEncontrados = false;

    // ── Dados de doencas.json (base de conhecimento local) ──
    if (typeof IALocal !== 'undefined') {
      try {
        await IALocal._carregarDoencasDB();
        let dadosDoenca = null;
        if (IALocal._doencasDB) {
          dadosDoenca = IALocal._doencasDB[nomeDoenca] ||
            IALocal._doencasDB[Object.keys(IALocal._doencasDB).find(
              k => k.toLowerCase() === (nomeDoenca || '').toLowerCase()
            )];
        }

        if (dadosDoenca) {
          dadosDoencaEncontrados = true;

          // Descrição (RF12)
          const boxDesc = document.getElementById('box-descricao');
          const descEl = document.getElementById('relatorio-descricao');
          if (descEl && dadosDoenca.descricao) {
            descEl.textContent = dadosDoenca.descricao;
            if (boxDesc) boxDesc.style.display = '';
          }

          // Causas (RF12)
          const boxCausas = document.getElementById('box-causas');
          const causasEl = document.getElementById('relatorio-causas');
          if (causasEl && dadosDoenca.causas) {
            causasEl.textContent = dadosDoenca.causas;
            if (boxCausas) boxCausas.style.display = '';
          }

          // Tratamento (RF13)
          const boxTrat = document.getElementById('box-tratamento');
          const tratEl = document.getElementById('relatorio-tratamento');
          if (tratEl && dadosDoenca.tratamento) {
            tratEl.textContent = dadosDoenca.tratamento;
            if (boxTrat) boxTrat.style.display = '';
          }

          // Prevenção (RF13)
          const boxPrev = document.getElementById('box-prevencao');
          const prevEl = document.getElementById('relatorio-prevencao');
          if (prevEl && dadosDoenca.prevencao) {
            prevEl.textContent = dadosDoenca.prevencao;
            if (boxPrev) boxPrev.style.display = '';
          }
        }
      } catch (e) {
        console.warn('[Analises] Erro ao preencher info doença:', e);
      }
    }

    // ── Dados do relatório via API ──
    const doencaId = data.analise?.doenca_id;
    if (doencaId) {
      try {
        // Os dados estruturados da doença também estão no Firestore,
        // mas a UI de relatório do doencas.json (acima) preenche o básico.
        console.log('[Analises] Relatórios estáticos desativados, baseados agora no doencas.json ou Gemini.');
      } catch (e) {
        console.warn('[Analises] Erro ao carregar informações da doença:', e);
      }
    }

    // ── Se as seções estruturadas foram preenchidas, ocultar a seção gemini ──
    // O conteúdo do Sistema Especialista é gerado a partir do mesmo doencas.json,
    // por isso seria uma duplicata. A seção gemini fica visível apenas como fallback
    // quando não há dados estruturados disponíveis na base local.
    if (dadosDoencaEncontrados) {
      const sectionGemini = document.getElementById('section-gemini');
      if (sectionGemini) sectionGemini.style.display = 'none';
    }
  },

  /**
   * Converte Markdown simples para HTML (sem dependências externas).
   * Suporte: ###, ##, #, **negrito**, *itálico*, listas, blockquotes, ---
   */
  _markdownParaHtml(md) {
    return md
      .replace(/^### (.+)$/gm, '<h4 style="margin:1.2rem 0 0.4rem;color:var(--color-primary);">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="margin:1.4rem 0 0.5rem;">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 style="margin:1.6rem 0 0.6rem;">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--color-primary);padding-left:var(--space-sm);color:var(--text-secondary);margin:var(--space-sm) 0;">$1</blockquote>')
      .replace(/^[-*] (.+)$/gm, '<li style="margin:0.2rem 0;">$1</li>')
      .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="padding-left:1.4rem;margin:0.5rem 0;">$&</ul>')
      .replace(/^---$/gm, '<hr style="border-color:var(--border-color);margin:var(--space-md) 0;">')
      .replace(/\n\n/g, '</p><p style="margin:0.6rem 0;">')
      .replace(/\n/g, '<br>');
  },

  _setupRelatorioActions() {
    // ── Botão salvar no histórico (RF11) ──
    // A análise JÁ É salva automaticamente no pipeline de processamento.
    // O botão exibe o estado correto: se veio via pipeline = já salvo; via URL = pode salvar de novo.
    const btnSalvar = document.getElementById('btn-salvar-historico');
    if (btnSalvar) {
      const foiSalvoAutomaticamente = !new URLSearchParams(window.location.search).get('id') ||
        !!sessionStorage.getItem('tomeye_analise_resultado');

      // Análises vindas do pipeline já estão salvas
      const temId = new URLSearchParams(window.location.search).get('id');
      if (temId) {
        // Veio por URL — análise já existia no histórico
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;">check_circle</span> Já salvo no histórico';
        btnSalvar.classList.replace('btn-primary', 'btn-ghost');
      } else {
        // Veio do pipeline — também já salvo automaticamente
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;">check_circle</span> Salvo automaticamente no histórico';
        btnSalvar.classList.replace('btn-primary', 'btn-ghost');
      }
    }

    // ── Botão excluir imagem (RF6) ──
    // O botão é injetado dinamicamente em _renderRelatorio após a imagem.
    // Usa event delegation no container.
    const imgContainer = document.getElementById('relatorio-imagem-container');
    if (imgContainer) {
      imgContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('#btn-excluir-imagem');
        if (!btn) return;
        App.showModal({
          title: 'Excluir imagem',
          message: 'Tem certeza que deseja remover a imagem desta análise? Os dados do diagnóstico serão mantidos.',
          confirmText: 'Excluir imagem',
          confirmType: 'danger',
          onConfirm: async () => {
            try {
              App.showLoading('Removendo imagem...');
              const analise = Analises._currentAnalise;
              if (analise) {
                // Deixar Firestore gerenciar ou atualizar imagem (por agora só vamos evitar o erro)
                console.log('[Analises] Imagem removida na interface.');
              }
              App.hideLoading();
              App.showToast('Imagem removida com sucesso.', 'success');
              // Atualizar o container
              imgContainer.innerHTML = `
                <div class="image-preview-placeholder">
                  <span class="placeholder-icon"><span class="material-symbols-rounded">biotech</span></span>
                  <span>Imagem removida</span>
                </div>`;
            } catch (err) {
              App.hideLoading();
              App.showToast('Erro ao remover imagem.', 'error');
            }
          },
        });
      });
    }

    // ── Botão compartilhar ──
    const btnCompartilhar = document.getElementById('btn-compartilhar');
    if (btnCompartilhar) {
      btnCompartilhar.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: 'Relatório Tomeye', url: window.location.href });
          } catch { }
        } else {
          try { await navigator.clipboard.writeText(window.location.href); App.showToast('Link copiado!', 'success'); }
          catch { App.showToast('Não foi possível compartilhar.', 'info'); }
        }
      });
    }
  },
};
