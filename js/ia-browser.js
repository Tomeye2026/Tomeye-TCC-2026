/**
 * Tomeye — ia-browser.js
 * Módulo de IA local no browser usando WebLLM (WebGPU).
 *
 * Substitui a necessidade de rodar `ollama serve` + `node server.js`.
 * O modelo LLM roda 100% no browser via WebGPU, sem servidor.
 *
 * Arquitetura:
 *   TensorFlow (classificação) → IABrowser.analisar(tfResultado) → Relatório
 *
 * Pré-requisitos:
 *   - Browser com suporte a WebGPU (Chrome/Edge modernos)
 *   - Primeiro uso baixa o modelo (~700MB), depois fica em cache
 *
 * Uso:
 *   await IABrowser.init();                          // carrega o modelo
 *   const resultado = await IABrowser.analisar(tf);  // gera análise
 */

const IABrowser = {

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  /**
   * Nome do modelo WebLLM a ser utilizado.
   * Llama 3.2 1B é leve (~879MB VRAM) e está disponível na lista oficial do WebLLM.
   * Alternativa maior: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' (~2.2GB VRAM)
   */
  MODEL_ID: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',

  /**
   * CDN para importar o WebLLM como ES Module.
   */
  WEBLLM_CDN: 'https://esm.run/@mlc-ai/web-llm',

  /**
   * Timeout máximo para geração de resposta (ms).
   */
  TIMEOUT: 90_000,

  // ============================================================
  // ESTADO INTERNO
  // ============================================================

  /** Engine do WebLLM (instância de MLCEngine) */
  _engine: null,

  /** Se o WebLLM está pronto para uso */
  _pronto: false,

  /** Se está carregando o modelo */
  _carregando: false,

  /** Promise de inicialização (evita chamadas duplicadas) */
  _initPromise: null,

  /** Se o browser suporta WebGPU */
  _webgpuSuportado: null,

  /** Referência ao módulo WebLLM importado */
  _webllmModule: null,

  /** Base de conhecimento local (doencas.json) */
  _doencasDB: null,

  /** Callback de progresso (pode ser sobrescrito) */
  _onProgress: null,

  /** Último erro ocorrido durante a inicialização (para diagnóstico) */
  _lastError: null,

  // ============================================================
  // SYSTEM PROMPT (idêntico ao ia.ts)
  // ============================================================

  SYSTEM_PROMPT: `Você é um engenheiro agrônomo especializado em doenças do tomateiro.

REGRAS ABSOLUTAS:
- Você NUNCA analisa imagens.
- Você recebe EXCLUSIVAMENTE o resultado produzido por um modelo TensorFlow.
- Sua função é explicar esse resultado para agricultores de forma clara e simples.
- Sempre responda em português do Brasil.
- NUNCA invente doenças ou diagnósticos diferentes dos recebidos.
- NUNCA diga que analisou uma imagem.
- NUNCA recomende doses específicas de produtos químicos.
- Sempre oriente o agricultor a consultar um engenheiro agrônomo.

FORMATO DE RESPOSTA:
Retorne SOMENTE um JSON válido, sem markdown, sem explicações, sem blocos de código.
A estrutura OBRIGATÓRIA é:
{"diagnostico":"","significado":"","causas":"","tratamento":"","prevencao":"","recomendacao":""}`,

  // ============================================================
  // VERIFICAÇÃO DE SUPORTE
  // ============================================================

  /**
   * Verifica se o browser suporta WebGPU.
   * @returns {boolean}
   */
  isWebGPUSuportado() {
    if (IABrowser._webgpuSuportado !== null) return IABrowser._webgpuSuportado;
    IABrowser._webgpuSuportado = typeof navigator !== 'undefined' && 'gpu' in navigator;
    return IABrowser._webgpuSuportado;
  },

  /**
   * Verifica se o WebLLM está pronto para uso.
   * @returns {boolean}
   */
  isDisponivel() {
    return IABrowser._pronto && IABrowser._engine !== null;
  },

  /**
   * Retorna o status atual do módulo.
   * @returns {'pronto'|'carregando'|'indisponivel'|'sem-webgpu'}
   */
  getStatus() {
    if (!IABrowser.isWebGPUSuportado()) return 'sem-webgpu';
    if (IABrowser._pronto) return 'pronto';
    if (IABrowser._carregando) return 'carregando';
    return 'indisponivel';
  },

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  /**
   * Inicializa o WebLLM: importa o módulo, carrega o modelo.
   * Na primeira vez, baixa o modelo (~700MB). Depois usa cache.
   *
   * @param {Function} [onProgress] — callback(report) para progresso
   * @returns {Promise<boolean>} — true se inicializou com sucesso
   */
  async init(onProgress) {
    // Já pronto
    if (IABrowser._pronto) return true;

    // Já carregando — aguardar
    if (IABrowser._initPromise) return IABrowser._initPromise;

    // Verificar WebGPU
    if (!IABrowser.isWebGPUSuportado()) {
      console.warn('[IABrowser] WebGPU não suportado neste browser.');
      return false;
    }

    if (onProgress) IABrowser._onProgress = onProgress;

    IABrowser._initPromise = IABrowser._inicializar();
    return IABrowser._initPromise;
  },

  /**
   * Processo interno de inicialização.
   * @returns {Promise<boolean>}
   */
  async _inicializar() {
    IABrowser._carregando = true;
    IABrowser._atualizarUI('carregando', 'Preparando IA no browser...');

    try {
      // 1. Importar WebLLM via CDN
      console.log('[IABrowser] Importando WebLLM...');
      IABrowser._webllmModule = await import(IABrowser.WEBLLM_CDN);
      console.log('[IABrowser] WebLLM importado com sucesso.');

      // 2. Carregar base de conhecimento (doencas.json)
      await IABrowser._carregarDoencasDB();

      // 3. Criar engine do WebLLM
      console.log(`[IABrowser] Carregando modelo: ${IABrowser.MODEL_ID}`);
      console.log('[IABrowser] Primeiro uso? O modelo será baixado (~900MB). Próximas vezes será instantâneo.');

      const { CreateMLCEngine } = IABrowser._webllmModule;

      IABrowser._engine = await CreateMLCEngine(IABrowser.MODEL_ID, {
        initProgressCallback: (report) => {
          console.log(`[IABrowser] ${report.text}`);
          IABrowser._atualizarUI('carregando', report.text);

          if (IABrowser._onProgress) {
            IABrowser._onProgress(report);
          }
        },
      });

      IABrowser._pronto = true;
      IABrowser._carregando = false;
      IABrowser._initPromise = null;

      console.log('[IABrowser] ✅ Modelo carregado e pronto!');
      IABrowser._atualizarUI('pronto', 'IA pronta no browser!');

      return true;

    } catch (error) {
      IABrowser._carregando = false;
      IABrowser._initPromise = null;
      IABrowser._lastError = error.message || String(error);

      console.error('[IABrowser] ❌ Erro ao inicializar WebLLM:', error);
      IABrowser._atualizarUI('erro', `Erro: ${IABrowser._lastError}`);

      return false;
    }
  },

  /**
   * Carrega o doencas.json via fetch (para RAG local).
   */
  async _carregarDoencasDB() {
    try {
      // Tentar diferentes caminhos (depende da página atual)
      const caminhos = [
        '../js/doencas.json',
        './js/doencas.json',
        '/js/doencas.json',
        'doencas.json',
      ];

      for (const caminho of caminhos) {
        try {
          const response = await fetch(caminho);
          if (response.ok) {
            IABrowser._doencasDB = await response.json();
            console.log('[IABrowser] Base de conhecimento carregada:', Object.keys(IABrowser._doencasDB).length, 'doenças');
            return;
          }
        } catch { /* tentar próximo */ }
      }

      console.warn('[IABrowser] doencas.json não encontrado — IA funcionará sem RAG.');
    } catch (error) {
      console.warn('[IABrowser] Erro ao carregar doencas.json:', error);
    }
  },

  // ============================================================
  // BUSCAR DOENÇA NA BASE (RAG)
  // ============================================================

  /**
   * Busca informações técnicas de uma doença na base local.
   * Mesma lógica do buscarDoenca() em ia.ts.
   *
   * @param {string} nomeDoenca
   * @returns {object|null}
   */
  buscarDoenca(nomeDoenca) {
    if (!IABrowser._doencasDB) return null;

    // Busca direta
    if (IABrowser._doencasDB[nomeDoenca]) {
      return IABrowser._doencasDB[nomeDoenca];
    }

    // Busca case-insensitive
    const chave = Object.keys(IABrowser._doencasDB).find(
      k => k.toLowerCase() === nomeDoenca.toLowerCase()
    );

    if (chave) return IABrowser._doencasDB[chave];

    console.warn(`[IABrowser] Doença "${nomeDoenca}" não encontrada em doencas.json`);
    return null;
  },

  // ============================================================
  // MONTAR PROMPT (idêntico ao ia.ts)
  // ============================================================

  /**
   * Monta as mensagens (system + user) para o LLM.
   * Inclui dados do TensorFlow + RAG da base de conhecimento.
   *
   * @param {object} tfResultado — { doenca, confianca, gravidade, areaAfetada }
   * @param {object|null} dadosDoenca — dados da base local
   * @returns {Array<{role, content}>}
   */
  montarPrompt(tfResultado, dadosDoenca) {
    const confiancaPct = Math.round(tfResultado.confianca * 100);

    let promptUsuario = `Resultado do TensorFlow:
Doença: ${tfResultado.doenca}
Confiança: ${confiancaPct}%
Gravidade: ${tfResultado.gravidade}
Área afetada: ${tfResultado.areaAfetada}%`;

    // RAG: incluir dados verificados da base
    if (dadosDoenca) {
      promptUsuario += `

INFORMAÇÕES TÉCNICAS VERIFICADAS (utilize exclusivamente estas informações para explicar ao agricultor):
Descrição: ${dadosDoenca.descricao}
Causas: ${dadosDoenca.causas}
Tratamento: ${dadosDoenca.tratamento}
Prevenção: ${dadosDoenca.prevencao}
Observações: ${dadosDoenca.observacoes}`;
    }

    promptUsuario += `

Responda SOMENTE com o JSON no formato especificado. Sem texto antes ou depois.`;

    return [
      { role: 'system', content: IABrowser.SYSTEM_PROMPT },
      { role: 'user', content: promptUsuario },
    ];
  },

  // ============================================================
  // EXTRAIR JSON (idêntico ao ia.ts)
  // ============================================================

  /**
   * Extrai e valida um objeto JSON da resposta do LLM.
   * Tenta múltiplas estratégias de extração.
   *
   * @param {string} texto — resposta bruta do modelo
   * @returns {object|null} — objeto RespostaIA ou null
   */
  extrairJSON(texto) {
    const camposObrigatorios = [
      'diagnostico', 'significado', 'causas',
      'tratamento', 'prevencao', 'recomendacao',
    ];

    function tentarParsear(str) {
      try {
        const obj = JSON.parse(str);
        const temTodos = camposObrigatorios.every(c => typeof obj[c] === 'string');
        if (temTodos) return obj;
      } catch { /* JSON inválido */ }
      return null;
    }

    // Estratégia 1: texto inteiro é JSON
    const t1 = tentarParsear(texto.trim());
    if (t1) return t1;

    // Estratégia 2: remover blocos ```json ... ```
    const regexCode = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
    const matchCode = texto.match(regexCode);
    if (matchCode) {
      const t2 = tentarParsear(matchCode[1].trim());
      if (t2) return t2;
    }

    // Estratégia 3: encontrar { ... } no texto
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio !== -1 && fim > inicio) {
      const t3 = tentarParsear(texto.substring(inicio, fim + 1));
      if (t3) return t3;
    }

    return null;
  },

  // ============================================================
  // FUNÇÃO PRINCIPAL: ANALISAR
  // ============================================================

  /**
   * Analisa o resultado do TensorFlow usando WebLLM no browser.
   *
   * Fluxo:
   * 1. Verificar se o engine está pronto (init se necessário)
   * 2. Buscar doença na base de conhecimento (RAG)
   * 3. Montar prompt com dados do TF + base
   * 4. Enviar ao modelo via WebLLM
   * 5. Extrair e validar JSON da resposta
   *
   * @param {object} tfResultado — { doenca, confianca, gravidade, areaAfetada }
   * @returns {Promise<{sucesso, dados, fonte, markdown}>}
   */
  async analisar(tfResultado) {
    console.log(`[IABrowser] Iniciando análise para: ${tfResultado.doenca}`);

    // Verificar se está pronto
    if (!IABrowser.isDisponivel()) {
      console.warn('[IABrowser] Engine não disponível. Tentando inicializar...');

      const ok = await IABrowser.init();
      if (!ok) {
        throw new Error('WebLLM não disponível neste browser.');
      }
    }

    // 1. Buscar dados da doença na base local (RAG)
    const dadosDoenca = IABrowser.buscarDoenca(tfResultado.doenca);
    if (dadosDoenca) {
      console.log(`[IABrowser] Dados RAG encontrados para "${tfResultado.doenca}"`);
    }

    // 2. Montar prompt
    const mensagens = IABrowser.montarPrompt(tfResultado, dadosDoenca);

    // 3. Consultar o modelo via WebLLM
    console.log('[IABrowser] Consultando modelo...');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: modelo demorou demais para responder.')), IABrowser.TIMEOUT)
    );

    const resposta = await Promise.race([
      IABrowser._engine.chat.completions.create({
        messages: mensagens,
        temperature: 0.3,
        max_tokens: 1024,
      }),
      timeoutPromise,
    ]);

    const textoResposta = resposta.choices[0]?.message?.content;

    if (!textoResposta) {
      throw new Error('Modelo não retornou conteúdo na resposta.');
    }

    console.log(`[IABrowser] Resposta recebida — ${textoResposta.length} caracteres`);

    // 4. Extrair JSON
    const dados = IABrowser.extrairJSON(textoResposta);

    if (!dados) {
      console.warn('[IABrowser] Não foi possível extrair JSON. Resposta bruta:', textoResposta);
      // Usar fallback com dados da base
      const fallback = IABrowser._gerarFallback(tfResultado, dadosDoenca);
      return {
        sucesso: true,
        dados: fallback,
        fonte: 'webllm-fallback',
        markdown: IABrowser._respostaParaMarkdown(fallback, 'webllm-fallback'),
      };
    }

    console.log('[IABrowser] ✅ Análise concluída via WebLLM no browser!');

    return {
      sucesso: true,
      dados,
      fonte: 'webllm',
      markdown: IABrowser._respostaParaMarkdown(dados, 'webllm'),
    };
  },

  // ============================================================
  // FALLBACK LOCAL (igual ao ia.ts)
  // ============================================================

  /**
   * Gera resposta de fallback quando o modelo não gera JSON válido.
   * Usa dados da base de conhecimento local.
   */
  _gerarFallback(tfResultado, dadosDoenca) {
    const confiancaPct = Math.round(tfResultado.confianca * 100);

    if (dadosDoenca) {
      return {
        diagnostico: dadosDoenca.descricao,
        significado: `A doença "${tfResultado.doenca}" foi identificada pelo TensorFlow com ${confiancaPct}% de confiança. Gravidade estimada: ${tfResultado.gravidade}. Área foliar afetada: ${tfResultado.areaAfetada}%.`,
        causas: dadosDoenca.causas,
        tratamento: dadosDoenca.tratamento,
        prevencao: dadosDoenca.prevencao,
        recomendacao: `${dadosDoenca.observacoes} Consulte um engenheiro agrônomo para orientações específicas.`,
      };
    }

    return {
      diagnostico: `A doença "${tfResultado.doenca}" foi identificada pelo modelo TensorFlow.`,
      significado: `Confiança da classificação: ${confiancaPct}%. Gravidade: ${tfResultado.gravidade}. Área afetada: ${tfResultado.areaAfetada}%.`,
      causas: 'Informações detalhadas indisponíveis no momento.',
      tratamento: 'Consulte um engenheiro agrônomo para recomendações de tratamento.',
      prevencao: 'Mantenha boas práticas agrícolas e monitore a lavoura regularmente.',
      recomendacao: 'Consulte um engenheiro agrônomo para orientações específicas.',
    };
  },

  // ============================================================
  // CONVERTER RespostaIA → Markdown (igual ao ia.ts)
  // ============================================================

  /**
   * Converte resposta da IA em Markdown formatado.
   * Compatível com o frontend (campo geminiAnalise).
   */
  _respostaParaMarkdown(dados, fonte) {
    let md = '';

    md += `### Diagnóstico provável\n\n${dados.diagnostico}\n\n`;
    md += `### O que isso significa\n\n${dados.significado}\n\n`;
    md += `### Causas prováveis\n\n${dados.causas}\n\n`;
    md += `### Como tratar\n\n${dados.tratamento}\n\n`;
    md += `### Prevenção\n\n${dados.prevencao}\n\n`;
    md += `### Recomendação final\n\n${dados.recomendacao}`;

    if (fonte === 'webllm') {
      md += '\n\n> <span class="material-symbols-rounded" style="font-size:15px;vertical-align:middle;">psychology</span> Esta análise foi gerada pela IA rodando diretamente no seu browser (WebLLM + WebGPU). Nenhum servidor foi utilizado.';
    } else if (fonte === 'webllm-fallback') {
      md += '\n\n> <span class="material-symbols-rounded" style="font-size:15px;vertical-align:middle;">warning</span> A IA no browser não gerou JSON válido. Esta análise foi gerada com dados da base de conhecimento local.';
    }

    return md;
  },

  // ============================================================
  // UI — Indicadores de progresso
  // ============================================================

  /**
   * Atualiza elementos de UI com o status do WebLLM.
   * Busca elementos opcionais na página (não quebra se não existirem).
   *
   * @param {'carregando'|'pronto'|'erro'|'sem-webgpu'} status
   * @param {string} mensagem
   */
  _atualizarUI(status, mensagem) {
    // Badge de status (qualquer página que tenha)
    const badge = document.getElementById('ia-browser-status');
    if (badge) {
      const statusMap = {
        'carregando': { text: 'Carregando IA...', class: 'badge-warning' },
        'pronto': { text: 'IA Local Ativa', class: 'badge-success' },
        'erro': { text: 'IA Indisponível', class: 'badge-error' },
        'sem-webgpu': { text: 'WebGPU Ausente', class: 'badge-warning' },
      };
      const info = statusMap[status] || statusMap['erro'];
      badge.textContent = info.text;
      badge.className = `badge ${info.class}`;
    }

    // Texto de progresso detalhado
    const progressEl = document.getElementById('ia-browser-progress');
    if (progressEl) {
      progressEl.textContent = mensagem;
      progressEl.style.display = status === 'carregando' ? 'block' : 'none';
    }

    // Step 3 do processamento — atualizar label quando usando WebLLM
    const step3Label = document.querySelector('#step-3 span');
    if (step3Label && status === 'carregando') {
      step3Label.textContent = `${mensagem}`;
    } else if (step3Label && status === 'pronto') {
      step3Label.textContent = 'Gerando análise (IA no browser)...';
    }
  },

  // ============================================================
  // DESCARREGAR (liberar memória)
  // ============================================================

  /**
   * Descarrega o modelo e libera memória GPU.
   */
  async unload() {
    if (IABrowser._engine) {
      try {
        await IABrowser._engine.unload();
      } catch (e) {
        console.warn('[IABrowser] Erro ao descarregar:', e);
      }
      IABrowser._engine = null;
    }
    IABrowser._pronto = false;
    IABrowser._carregando = false;
    IABrowser._initPromise = null;
    console.log('[IABrowser] Modelo descarregado.');
  },
};
