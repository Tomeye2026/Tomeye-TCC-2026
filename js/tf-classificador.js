/**
 * Tomeye — tf-classificador.js
 * Módulo TensorFlow + Teachable Machine para classificação de doenças.
 *
 * Usa a biblioteca @teachablemachine/image para carregar e inferir
 * o modelo treinado com imagens de folhas de tomateiro.
 *
 * Uso:
 *   await TFClassificador.init();                       // carrega o modelo
 *   const resultado = await TFClassificador.classificar(canvasElement);
 *   // → { doenca, confianca, gravidade, areaAfetada, todasClasses }
 *
 * ─────────────────────────────────────────────────────────
 * ⚠️  CONFIGURAÇÃO OBRIGATÓRIA:
 *     Substitua MODEL_URL abaixo pela URL do seu modelo
 *     exportado no Teachable Machine.
 *
 *     Exemplo:
 *     "https://teachablemachine.withgoogle.com/models/XXXXXXXX/"
 *
 *     Para obter:
 *     1. Acesse https://teachablemachine.withgoogle.com
 *     2. Abra seu projeto de imagem
 *     3. Clique em "Export Model" → "Upload (Shareable link)"
 *     4. Copie a URL gerada e cole aqui
 * ─────────────────────────────────────────────────────────
 */

const TFClassificador = {

  // ============================================================
  // ⚠️  SUBSTITUA AQUI PELA URL DO SEU MODELO
  // ============================================================
  MODEL_URL: 'https://teachablemachine.withgoogle.com/models/wlVSA5l3P/',

  /** Instância do modelo Teachable Machine (tmImage.CustomMobileNet) */
  _modelo: null,

  /** Indica se o modelo está carregado e pronto */
  _pronto: false,

  /** Promise de carregamento para evitar chamadas duplicadas */
  _carregandoPromise: null,

  // ============================================================
  // MAPEAMENTO DE NOMES — Classes do modelo → nomes exibidos
  // ============================================================
  /**
   * Mapeamento das classes do modelo para nomes e dados de gravidade.
   * Nomes extraídos do metadata.json do modelo wlVSA5l3P.
   * ⚠️  As chaves DEVEM ser idênticas (case-sensitive) aos labels do modelo.
   *
   * Labels reais do modelo wlVSA5l3P:
   * "Mancha Bacteriana", "Saudável", "Requeima", "Mofo das folhas",
   * "Septoria", "Vírus do enrolamento amarelo", "Desconhecido"
   */
  MAPA_CLASSES: {
    // ── Classes reais do modelo wlVSA5l3P (case-sensitive) ──
    'Requeima': { nome: 'Requeima', gravidadePadrao: 'Moderada' },
    'Septoria': { nome: 'Septoriose (Septoria)', gravidadePadrao: 'Leve' },
    'Mofo das folhas': { nome: 'Mofo das folhas', gravidadePadrao: 'Moderada' },
    'Mancha Bacteriana': { nome: 'Mancha bacteriana', gravidadePadrao: 'Leve' }, // ← B maiúsculo, igual ao modelo
    'Vírus do enrolamento amarelo': { nome: 'Vírus do enrolamento amarelo', gravidadePadrao: 'Grave' },
    'Saudável': { nome: 'Planta saudável', gravidadePadrao: 'Nenhuma' },
    'Desconhecido': { nome: 'Imagem não reconhecida', gravidadePadrao: 'Nenhuma' },
    // ── Aliases alternativos (caso o modelo seja atualizado) ──
    'Mancha bacteriana': { nome: 'Mancha bacteriana', gravidadePadrao: 'Leve' }, // b minúsculo
    'Healthy': { nome: 'Planta saudável', gravidadePadrao: 'Nenhuma' },
    'Unknown': { nome: 'Imagem não reconhecida', gravidadePadrao: 'Nenhuma' },
  },

  // ============================================================
  // CARREGAMENTO DOS SCRIPTS E DO MODELO
  // ============================================================

  /**
   * Inicializa o classificador: carrega as bibliotecas TF + TM
   * e o modelo treinado.
   *
   * @returns {Promise<void>}
   */
  async init() {
    if (TFClassificador._pronto) return;
    if (TFClassificador._carregandoPromise) return TFClassificador._carregandoPromise;

    TFClassificador._carregandoPromise = TFClassificador._inicializar();
    return TFClassificador._carregandoPromise;
  },

  async _inicializar() {
    // ── 1. Carregar bibliotecas TF e Teachable Machine ──
    await TFClassificador._carregarScripts();

    // ── 2. Verificar URL do modelo ──
    if (TFClassificador.MODEL_URL.includes('COLE_SUA_URL_AQUI')) {
      console.warn('[TF] ⚠️  MODEL_URL não configurada! Usando modo simulação.');
      TFClassificador._pronto = true;
      return;
    }

    // ── 3. Carregar modelo Teachable Machine ──
    console.log('[TF] Carregando modelo:', TFClassificador.MODEL_URL);

    const modelURL = TFClassificador.MODEL_URL + 'model.json';
    const metadataURL = TFClassificador.MODEL_URL + 'metadata.json';

    TFClassificador._modelo = await tmImage.load(modelURL, metadataURL);
    TFClassificador._pronto = true;

    console.log('[TF] Modelo carregado. Classes:', TFClassificador._modelo.getClassLabels());
  },

  /**
   * Carrega os scripts TF.js e Teachable Machine via CDN
   * (apenas se não estiverem já presentes na página).
   */
  _carregarScripts() {
    const scripts = [
      {
        id: 'tf-script',
        src: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js',
      },
      {
        id: 'tm-script',
        src: 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js',
      },
    ];

    const promises = scripts
      .filter(s => !document.getElementById(s.id))
      .map(s => new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.id = s.id;
        el.src = s.src;
        el.onload = resolve;
        el.onerror = () => reject(new Error(`Falha ao carregar: ${s.src}`));
        document.head.appendChild(el);
      }));

    return Promise.all(promises);
  },

  // ============================================================
  // CLASSIFICAÇÃO
  // ============================================================

  /**
   * Classifica uma imagem e retorna o resultado da doença.
   *
   * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} elemento
   * @returns {Promise<{doenca, confianca, gravidade, areaAfetada, todasClasses}>}
   */
  async classificar(elemento) {
    if (!TFClassificador._pronto) {
      await TFClassificador.init();
    }

    // Modo simulação (modelo não configurado)
    if (!TFClassificador._modelo) {
      console.warn('[TF] Usando modo simulação (sem modelo configurado).');
      return TFClassificador._simular();
    }

    try {
      // Executar inferência
      const predicoes = await TFClassificador._modelo.predict(elemento);

      console.log('[TF] Predições:', predicoes.map(p =>
        `${p.className}: ${(p.probability * 100).toFixed(1)}%`
      ).join(', '));

      // Ordenar por confiança (maior primeiro)
      const ordenadas = [...predicoes].sort((a, b) => b.probability - a.probability);
      const melhor = ordenadas[0];

      // Busca exata primeiro, depois case-insensitive como fallback seguro
      let classeInfo = TFClassificador.MAPA_CLASSES[melhor.className];
      if (!classeInfo) {
        const chaveInsensivel = Object.keys(TFClassificador.MAPA_CLASSES).find(
          k => k.toLowerCase() === melhor.className.toLowerCase()
        );
        if (chaveInsensivel) {
          classeInfo = TFClassificador.MAPA_CLASSES[chaveInsensivel];
          console.warn(`[TF] Classe '${melhor.className}' encontrada via case-insensitive → '${chaveInsensivel}'.`);
        } else {
          // Classe completamente desconhecida — usar o nome cru sem atribuir doença
          classeInfo = { nome: melhor.className, gravidadePadrao: 'Leve' };
          console.warn(`[TF] Classe '${melhor.className}' não encontrada no MAPA_CLASSES. Adicione-a para evitar erros.`);
        }
      }

      const confianca = parseFloat((melhor.probability).toFixed(4)); // 0.0–1.0
      const confiancaPct = Math.round(confianca * 100);
      const gravidade = TFClassificador._calcularGravidade(confianca, classeInfo.gravidadePadrao);

      return {
        doenca: classeInfo.nome,
        confianca,
        confiancaPct,
        gravidade,
        areaAfetada: TFClassificador._estimarAreaAfetada(confianca, gravidade),
        todasClasses: ordenadas.map(p => ({
          classe: p.className,
          nome: (TFClassificador.MAPA_CLASSES[p.className] || {}).nome || p.className,
          confianca: parseFloat(p.probability.toFixed(4)),
          percentual: Math.round(p.probability * 100),
        })),
      };

    } catch (error) {
      console.error('[TF] Erro na classificação:', error);
      throw new Error('Falha ao classificar imagem com TensorFlow.');
    }
  },

  // ============================================================
  // LÓGICA DE GRAVIDADE E ÁREA AFETADA
  // ============================================================

  /**
   * Calcula a gravidade com base na confiança e no tipo de doença.
   *
   * @param {number} confianca — 0.0 a 1.0
   * @param {string} gravidadePadrao — gravidade base da doença
   * @returns {'Nenhuma'|'Leve'|'Moderada'|'Grave'}
   */
  _calcularGravidade(confianca, gravidadePadrao) {
    if (gravidadePadrao === 'Nenhuma') return 'Nenhuma';

    // Alta confiança → mantém ou eleva a gravidade padrão
    // Baixa confiança → reduz um nível (incerteza)
    const escalas = ['Nenhuma', 'Leve', 'Moderada', 'Grave'];
    let idx = escalas.indexOf(gravidadePadrao);

    if (confianca >= 0.90) {
      // Alta confiança — manter gravidade padrão
    } else if (confianca >= 0.75) {
      // Confiança moderada — manter
    } else if (confianca >= 0.60) {
      // Confiança baixa — reduz 1 nível
      idx = Math.max(1, idx - 1);
    } else {
      // Confiança muito baixa
      idx = 1; // Leve (incerto)
    }

    return escalas[idx];
  },

  /**
   * Estima a área afetada com base na confiança e gravidade.
   * (Complementado pela análise de pixels quando disponível)
   *
   * @param {number} confianca — 0.0 a 1.0
   * @param {string} gravidade
   * @returns {number} — percentual estimado 0–100
   */
  _estimarAreaAfetada(confianca, gravidade) {
    if (gravidade === 'Nenhuma') return 0;

    const faixas = {
      'Leve': { min: 3, max: 20 },
      'Moderada': { min: 15, max: 45 },
      'Grave': { min: 35, max: 75 },
    };

    const faixa = faixas[gravidade] || { min: 5, max: 30 };
    const range = faixa.max - faixa.min;

    // Confiança mais alta → mais próximo do máximo da faixa
    return Math.round(faixa.min + range * confianca);
  },

  // ============================================================
  // SIMULAÇÃO (quando modelo não está configurado)
  // ============================================================

  /**
   * Modo simulação — retorna erro explícito em vez de resultado aleatório.
   * Resultados aleatórios causam confusão: podem exibir "Saudável" quando
   * o modelo detectou doença, ou vice-versa. Preferimos falhar visivelmente.
   */
  _simular() {
    console.error('[TF] Modelo não carregado. Verifique MODEL_URL e a conexão com a internet.');
    throw new Error(
      'Modelo de IA não está carregado. Verifique sua conexão com a internet e recarregue a página.'
    );
  },
};

