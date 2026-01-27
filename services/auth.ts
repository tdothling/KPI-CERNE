import { auth } from "../firebase";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  User 
} from "firebase/auth";

// Domain suffix to make emails valid for Firebase
const INVISIBLE_DOMAIN = "@cerne.internal";

// Configurações de Segurança
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 5 * 60 * 1000; // 5 minutos em milissegundos

// Funções auxiliares para Rate Limiting local
const checkRateLimit = () => {
  const storedData = localStorage.getItem('login_attempts');
  if (!storedData) return true;

  const { attempts, lockoutStart } = JSON.parse(storedData);

  if (lockoutStart) {
    const timePassed = Date.now() - lockoutStart;
    if (timePassed < LOCKOUT_TIME) {
      const minutesLeft = Math.ceil((LOCKOUT_TIME - timePassed) / 60000);
      throw new Error(`Muitas tentativas falhas. Tente novamente em ${minutesLeft} minutos.`);
    } else {
      // Bloqueio expirou, resetar
      localStorage.removeItem('login_attempts');
      return true;
    }
  }
  return true;
};

const recordFailedAttempt = () => {
  const storedData = localStorage.getItem('login_attempts');
  let currentAttempts = 0;
  
  if (storedData) {
    const data = JSON.parse(storedData);
    if (!data.lockoutStart) {
        currentAttempts = data.attempts || 0;
    }
  }

  currentAttempts++;

  if (currentAttempts >= MAX_ATTEMPTS) {
    localStorage.setItem('login_attempts', JSON.stringify({
      attempts: currentAttempts,
      lockoutStart: Date.now()
    }));
    throw new Error("Muitas tentativas. Acesso bloqueado temporariamente.");
  } else {
    localStorage.setItem('login_attempts', JSON.stringify({
      attempts: currentAttempts,
      lockoutStart: null
    }));
  }
};

const resetRateLimit = () => {
  localStorage.removeItem('login_attempts');
};

export const loginWithUsername = async (username: string, password: string, remember: boolean = false) => {
  if (!auth) throw new Error("Firebase Auth not initialized");
  
  // 1. Verificar Rate Limit antes de chamar a API
  checkRateLimit();

  // 2. Sanitização Rigorosa do Username (Security)
  // Permite apenas letras (a-z), números e pontos. Remove espaços e caracteres especiais.
  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9.]/g, '');
  
  if (!cleanUsername || cleanUsername.length < 3) {
      throw new Error("Formato de usuário inválido.");
  }

  const email = `${cleanUsername}${INVISIBLE_DOMAIN}`;

  try {
    // Set persistence based on user preference
    const persistenceType = remember ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistenceType);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Sucesso: Resetar contador de falhas
    resetRateLimit();
    
    return userCredential.user;
  } catch (error: any) {
    console.error("Login error:", error);
    
    // Registrar falha apenas para erros de credencial, não erros de rede
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        try {
            recordFailedAttempt();
        } catch (rateLimitError: any) {
            throw rateLimitError; // Relança o erro de bloqueio se atingir o limite
        }
    }
    
    throw error;
  }
};

export const logoutUser = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
    localStorage.removeItem('login_attempts'); // Limpa tentativas ao sair (opcional, mas boa prática UX)
  } catch (error) {
    console.error("Logout error:", error);
  }
};

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

export const formatUsername = (email: string | null) => {
    if (!email) return 'Convidado';
    // Remove the invisible domain and format the name
    const rawName = email.replace(INVISIBLE_DOMAIN, '');
    // Split by dot if exists (thiago.dothling -> Thiago Dothling)
    // Sanitização visual extra para prevenir XSS via stored username
    const safeName = rawName.replace(/[^a-zA-Z0-9. ]/g, ''); 
    
    return safeName
        .split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};