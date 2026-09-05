/**
 * Tomeye — firebase-config.js
 * Inicialização do Firebase (SDK compat via CDN — sem bundler necessário).
 * Carregado antes de api.js em todas as páginas HTML.
 */

// ── Credenciais do projeto Firebase ──────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBxKS34NSqxLxgRUDLyfGudiEcVz-WokM8",
  authDomain: "tomeye-tcc.firebaseapp.com",
  projectId: "tomeye-tcc",
  storageBucket: "tomeye-tcc.firebasestorage.app",
  messagingSenderId: "97888102019",
  appId: "1:97888102019:web:e7b0b9ae5c60aca9661db6",
  measurementId: "G-5P83L7WB8G",
};

// ── Inicializar Firebase (evitar duplicação) ──────────────────
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// ── Referências globais ───────────────────────────────────────
const db = firebase.firestore();
const auth = firebase.auth();

// Persistência de sessão — mantém login mesmo ao fechar o navegador
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
  console.warn('[Firebase] Não foi possível definir persistência:', err.message);
});

console.log('[Firebase] Inicializado — projeto:', firebaseConfig.projectId);
