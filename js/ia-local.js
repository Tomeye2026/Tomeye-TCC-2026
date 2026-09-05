/**
 * Tomeye — ia-local.js
 * Sistema Especialista Local (Offline RAG sem LLM).
 *
 * Soluciona o problema de:
 * 1. WebLLM demorar muito para baixar (900MB).
 * 2. Gemini API ter limite de uso.
 * 3. Não precisar rodar `node server.js` ou Ollama.
 *
 * Arquitetura:
 * TensorFlow (classificação) → IALocal (busca no doencas.json e formata) → Relatório
 * 
 * Tempo de resposta: < 50ms.
 * Consumo de internet: 0MB.
 */

const IALocal = {

  // ============================================================
  // ESTADO
  // ============================================================

  /** Base de conhecimento local (doencas.json) */
  _doencasDB: null,

  /** Se a base foi carregada */
  _dbCarregado: false,

  // ============================================================
  // CARREGAR BASE DE CONHECIMENTO
  // ============================================================

  async _carregarDoencasDB() {
    if (IALocal._dbCarregado) return;

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
          IALocal._doencasDB = await response.json();
          IALocal._dbCarregado = true;
          console.log(`[IALocal] Base de conhecimento carregada (${Object.keys(IALocal._doencasDB).length} doenças)`);
          return;
        }
      } catch { /* tentar próximo */ }
    }

    console.warn('[IALocal] doencas.json não encontrado.');
    IALocal._dbCarregado = true;
  },

  // ============================================================
  // FUNÇÃO PRINCIPAL: ANALISAR
  // ============================================================

  async analisar(tfResultado) {
    await IALocal._carregarDoencasDB();

    console.log('[IALocal] Gerando análise instantânea usando Sistema Especialista...');

    // Buscar dados na base local
    let dadosDoenca = null;
    if (IALocal._doencasDB) {
      if (IALocal._doencasDB[tfResultado.doenca]) {
        dadosDoenca = IALocal._doencasDB[tfResultado.doenca];
      } else {
        const chave = Object.keys(IALocal._doencasDB).find(
          k => k.toLowerCase() === tfResultado.doenca.toLowerCase()
        );
        if (chave) dadosDoenca = IALocal._doencasDB[chave];
      }
    }

    const pct = Math.round(tfResultado.confianca * 100);
    let dados;

    if (dadosDoenca) {
      dados = {
        diagnostico: dadosDoenca.descricao,
        significado: `A doença "${tfResultado.doenca}" foi identificada com ${pct}% de confiança. Gravidade: ${tfResultado.gravidade}. Área foliar afetada: ${tfResultado.areaAfetada}%.`,
        causas: dadosDoenca.causas,
        tratamento: dadosDoenca.tratamento,
        prevencao: dadosDoenca.prevencao,
        recomendacao: `${dadosDoenca.observacoes} Consulte um agrônomo para orientações específicas.`,
      };
    } else {
      dados = {
        diagnostico: `A doença "${tfResultado.doenca}" foi identificada.`,
        significado: `Confiança: ${pct}%. Gravidade: ${tfResultado.gravidade}. Área afetada: ${tfResultado.areaAfetada}%.`,
        causas: 'Informações detalhadas indisponíveis na base local.',
        tratamento: 'Consulte um engenheiro agrônomo.',
        prevencao: 'Mantenha boas práticas agrícolas.',
        recomendacao: 'Consulte um agrônomo para orientações específicas.',
      };
    }

    // Atraso artificial de 800ms apenas para efeito visual de "Processamento"
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      sucesso: true,
      dados,
      fonte: 'sistema-especialista',
      markdown: IALocal._respostaParaMarkdown(dados, 'sistema-especialista'),
    };
  },

  // ============================================================
  // CONVERTER PARA MARKDOWN
  // ============================================================

  _respostaParaMarkdown(dados, fonte) {
    let md = '';
    md += `### Diagnóstico provável\n\n${dados.diagnostico}\n\n`;
    md += `### O que isso significa\n\n${dados.significado}\n\n`;
    md += `### Causas prováveis\n\n${dados.causas}\n\n`;
    md += `### Como tratar\n\n${dados.tratamento}\n\n`;
    md += `### Prevenção\n\n${dados.prevencao}\n\n`;
    md += `### Recomendação final\n\n${dados.recomendacao}`;

    md += '\n\n> <span class="material-symbols-rounded" style="font-size:15px;vertical-align:middle;">bolt</span> Esta análise foi gerada offline instantaneamente através do Sistema Especialista Local, cruzando dados da IA visual com a base de conhecimento agrônoma.';

    return md;
  },
};
