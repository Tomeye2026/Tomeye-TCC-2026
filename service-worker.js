/**
 * Tomeye Service Worker v2.0.0
 * Gerencia cache e suporte offline para o PWA
 *
 * Estratégias por tipo de recurso:
 *  - HTML:          Stale-While-Revalidate (serve do cache, atualiza em background)
 *  - CSS / JS:      Cache First (serve do cache, salvo durante instalação)
 *  - Fontes Google: Cache First (cache imutável por 1 ano)
 *  - Firebase/API:  Network Only (dados em tempo real, nunca cacheados)
 */

const CACHE_VERSION = 'tomeye-v2.0.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_PAGES = `${CACHE_VERSION}-pages`;
const CACHE_FONTS = `${CACHE_VERSION}-fonts`;

const STATIC_ASSETS = [
  '/css/style.css',
  '/css/components.css',
  '/css/layout.css',
  '/css/login.css',
  '/css/cadastro.css',
  '/css/nova-senha.css',
  '/css/recuperar-senha.css',
  '/css/processamento.css',
  '/css/relatorio.css',
  '/css/admin.css',
  '/css/termos.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/firebase-config.js',
  '/js/dashboard.js',
  '/js/perfil.js',
  '/js/fazendas.js',
  '/js/funcionarios.js',
  '/js/analises.js',
  '/js/historico.js',
  '/js/assinaturas.js',
  '/js/notificacoes.js',
  '/assets/imagens/logo.png',
  '/assets/imagens/logo2.png',
];

const PAGE_ASSETS = [
  '/index.html',
  '/pages/login.html',
  '/pages/cadastro.html',
  '/pages/recuperar-senha.html',
  '/pages/dashboard.html',
  '/pages/perfil.html',
  '/pages/fazendas.html',
  '/pages/funcionarios.html',
  '/pages/analise.html',
  '/pages/processamento.html',
  '/pages/relatorio.html',
  '/pages/historico.html',
  '/pages/assinatura.html',
  '/pages/notificacoes.html',
];

// Helper: tenta cachear um asset individualmente (não trava no erro)
async function tryCacheAdd(cache, url) {
  try {
    await cache.add(url);
  } catch (err) {
    console.warn(`[SW] Falha ao cachear ${url}:`, err.message);
  }
}

// ── INSTALAÇÃO ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando v2.0.0');
  event.waitUntil(
    (async () => {
      const [staticCache, pageCache] = await Promise.all([
        caches.open(CACHE_STATIC),
        caches.open(CACHE_PAGES),
      ]);

      // Cachear assets estáticos um a um para não travar no erro
      await Promise.all(STATIC_ASSETS.map(url => tryCacheAdd(staticCache, url)));
      await Promise.all(PAGE_ASSETS.map(url => tryCacheAdd(pageCache, url)));

      console.log('[SW] Assets cacheados.');
    })()
  );
  self.skipWaiting();
});

// ── ATIVAÇÃO ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando v2.0.0');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_PAGES && k !== CACHE_FONTS)
          .map((k) => {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignorar requisições não-GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ── Network Only: Firebase, Firestore, APIs externas ──
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.pathname.includes('/api/')
  ) {
    return; // Deixar passar sem interceptar
  }

  // ── Cache First: fontes Google ──
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(req, CACHE_FONTS));
    return;
  }

  // ── Cache First: Firebase SDK (scripts do gstatic) ──
  if (url.hostname.includes('www.gstatic.com')) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // ── Cache First: assets estáticos locais (CSS, JS, imagens) ──
  if (
    url.pathname.match(/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/)
  ) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // ── Stale-While-Revalidate: páginas HTML ──
  if (req.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(staleWhileRevalidate(req, CACHE_PAGES));
    return;
  }

  // ── Fallback: Network com cache de backup ──
  event.respondWith(networkWithFallback(req));
});

// ── Estratégia: Cache First ─────────────────────────────────
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const networkRes = await fetch(req);
    if (networkRes.ok) {
      cache.put(req, networkRes.clone());
    }
    return networkRes;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// ── Estratégia: Stale-While-Revalidate ─────────────────────
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  // Atualizar em background independente de estar no cache ou não
  const networkPromise = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  // Se tem cache, serve imediatamente e atualiza em background
  if (cached) return cached;

  // Sem cache: aguarda rede
  const networkRes = await networkPromise;
  if (networkRes) return networkRes;

  // Fallback offline: index.html
  const fallback = await cache.match('/index.html');
  return fallback || new Response('Offline', { status: 503 });
}

// ── Estratégia: Network com fallback de cache ───────────────
async function networkWithFallback(req) {
  try {
    return await fetch(req);
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ── Mensagens do cliente ────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
