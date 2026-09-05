/**
 * Tomeye — filtros.js
 * Módulo de pré-processamento de imagens via Canvas API.
 *
 * Pipeline de filtros aplicados antes de enviar ao TensorFlow:
 * 1. Redimensionar para 224×224 (padrão MobileNet/EfficientNet)
 * 2. Normalizar brilho e contraste
 * 3. Aplicar nitidez (unsharp mask)
 * 4. Retorna imagem de exibição (UI) e imagem processada (TF)
 */

const ImageFilters = {

  /**
   * Pré-processa uma imagem completa para análise.
   *
   * @param {File|Blob|string} fonte — arquivo ou base64
   * @param {object} opcoes
   * @param {number} [opcoes.tamanhoTF=224]  — dimensão do canvas para o TF
   * @param {number} [opcoes.tamanhoUI=600]  — dimensão max do canvas de exibição
   * @param {boolean} [opcoes.nitidez=true]  — aplicar filtro de nitidez
   * @param {boolean} [opcoes.normalizar=true] — normalizar brilho/contraste
   * @returns {Promise<{imagemUI: string, imagemTF: string, largura: number, altura: number}>}
   */
  async preprocessar(fonte, opcoes = {}) {
    const {
      tamanhoTF = 224,
      tamanhoUI = 600,
      nitidez = true,
      normalizar = true,
    } = opcoes;

    // Carregar imagem no elemento <img>
    const img = await ImageFilters._carregarImagem(fonte);

    console.log(`[Filtros] Imagem original: ${img.naturalWidth}×${img.naturalHeight}px`);

    // --- Canvas de EXIBIÇÃO (UI) ---
    // Redimensionar mantendo proporção, máximo tamanhoUI
    const escalaUI = Math.min(1, tamanhoUI / Math.max(img.naturalWidth, img.naturalHeight));
    const canvasUI = ImageFilters._criarCanvas(
      Math.round(img.naturalWidth * escalaUI),
      Math.round(img.naturalHeight * escalaUI)
    );
    const ctxUI = canvasUI.getContext('2d');
    ctxUI.drawImage(img, 0, 0, canvasUI.width, canvasUI.height);

    // --- Canvas do TensorFlow (224×224 ou tamanhoTF×tamanhoTF) ---
    // Crop centralizado + resize para tamanho quadrado
    const canvasTF = ImageFilters._criarCanvas(tamanhoTF, tamanhoTF);
    const ctxTF = canvasTF.getContext('2d');

    // Crop centralizado (preservar maior área possível)
    const ladoMenor = Math.min(img.naturalWidth, img.naturalHeight);
    const offsetX = (img.naturalWidth - ladoMenor) / 2;
    const offsetY = (img.naturalHeight - ladoMenor) / 2;
    ctxTF.drawImage(img, offsetX, offsetY, ladoMenor, ladoMenor, 0, 0, tamanhoTF, tamanhoTF);

    // Aplicar filtros no canvas TF
    if (normalizar) ImageFilters._normalizarContraste(ctxTF, tamanhoTF, tamanhoTF);
    if (nitidez) ImageFilters._aplicarNitidez(ctxTF, tamanhoTF, tamanhoTF);

    const imagemUI = canvasUI.toDataURL('image/jpeg', 0.92);
    const imagemTF = canvasTF.toDataURL('image/jpeg', 0.95);

    console.log(`[Filtros] Canvas UI: ${canvasUI.width}×${canvasUI.height}px`);
    console.log(`[Filtros] Canvas TF: ${canvasTF.width}×${canvasTF.height}px`);

    return {
      imagemUI,
      imagemTF,
      largura: img.naturalWidth,
      altura: img.naturalHeight,
    };
  },

  // ============================================================
  // FILTROS INTERNOS
  // ============================================================

  /**
   * Normaliza brilho e contraste da imagem (auto-levels).
   * Melhora a detecção de sintomas em diferentes condições de luz.
   */
  _normalizarContraste(ctx, largura, altura) {
    const imageData = ctx.getImageData(0, 0, largura, altura);
    const dados = imageData.data;

    // Encontrar min/max de cada canal RGB
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;

    for (let i = 0; i < dados.length; i += 4) {
      rMin = Math.min(rMin, dados[i]); rMax = Math.max(rMax, dados[i]);
      gMin = Math.min(gMin, dados[i + 1]); gMax = Math.max(gMax, dados[i + 1]);
      bMin = Math.min(bMin, dados[i + 2]); bMax = Math.max(bMax, dados[i + 2]);
    }

    // Estiramento de histograma (stretch) por canal
    const escala = (val, min, max) => {
      if (max === min) return val;
      return Math.round(((val - min) / (max - min)) * 255);
    };

    for (let i = 0; i < dados.length; i += 4) {
      dados[i] = escala(dados[i], rMin, rMax);
      dados[i + 1] = escala(dados[i + 1], gMin, gMax);
      dados[i + 2] = escala(dados[i + 2], bMin, bMax);
    }

    ctx.putImageData(imageData, 0, 0);
  },

  /**
   * Aplica filtro de nitidez (Unsharp Mask 3×3).
   * Realça bordas e texturas — melhora detecção de manchas/lesões.
   */
  _aplicarNitidez(ctx, largura, altura) {
    const imageData = ctx.getImageData(0, 0, largura, altura);
    const dados = imageData.data;
    const saida = new Uint8ClampedArray(dados);

    // Kernel de Unsharp Mask 3×3
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0,
    ];

    const aplicarKernel = (x, y, canal) => {
      let soma = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.min(Math.max(x + kx, 0), largura - 1);
          const py = Math.min(Math.max(y + ky, 0), altura - 1);
          soma += dados[(py * largura + px) * 4 + canal] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      return Math.min(255, Math.max(0, soma));
    };

    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const i = (y * largura + x) * 4;
        saida[i] = aplicarKernel(x, y, 0);
        saida[i + 1] = aplicarKernel(x, y, 1);
        saida[i + 2] = aplicarKernel(x, y, 2);
        saida[i + 3] = dados[i + 3]; // manter alpha
      }
    }

    ctx.putImageData(new ImageData(saida, largura, altura), 0, 0);
  },

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  /**
   * Cria um elemento canvas com as dimensões especificadas.
   */
  _criarCanvas(largura, altura) {
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    return canvas;
  },

  /**
   * Carrega uma imagem a partir de um File, Blob ou string base64.
   * @returns {Promise<HTMLImageElement>}
   */
  _carregarImagem(fonte) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar imagem.'));

      if (typeof fonte === 'string') {
        img.src = fonte;
      } else if (fonte instanceof File || fonte instanceof Blob) {
        const url = URL.createObjectURL(fonte);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.src = url;
      } else {
        reject(new Error('Fonte de imagem inválida.'));
      }
    });
  },

  /**
   * Estima a porcentagem de área afetada pela doença na imagem.
   * Analisa pixels com coloração anormal (marrons, amarelados).
   * Complementa os dados do TensorFlow.
   *
   * @param {string} imagemBase64
   * @returns {Promise<number>} — percentual de 0 a 100
   */
  async estimarAreaAfetada(imagemBase64) {
    const img = await ImageFilters._carregarImagem(imagemBase64);
    const canvas = ImageFilters._criarCanvas(img.naturalWidth || 224, img.naturalHeight || 224);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dados = imageData.data;
    let afetados = 0;
    const total = dados.length / 4;

    for (let i = 0; i < dados.length; i += 4) {
      const r = dados[i], g = dados[i + 1], b = dados[i + 2];
      // Pixels marrons/amarelos = tecido necrótico/doente
      const eMarrom = r > 120 && g < 100 && b < 80;
      const eAmarelo = r > 180 && g > 150 && b < 80;
      const eNecrose = r > 100 && g < 80 && b < 60;
      if (eMarrom || eAmarelo || eNecrose) afetados++;
    }

    return Math.min(100, Math.round((afetados / total) * 100));
  },
};
