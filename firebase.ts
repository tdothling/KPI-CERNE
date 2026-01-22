
import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// --- CONFIGURAÇÃO DO FIREBASE ---
// Conectado ao projeto: kpi---engenharia-cerne

const firebaseConfig = {
  apiKey: "AIzaSyDVlKOB6hr2Q_ORpq0A7gWZz6qw2sNo4ds",
  authDomain: "kpi---engenharia-cerne.firebaseapp.com",
  projectId: "kpi---engenharia-cerne",
  storageBucket: "kpi---engenharia-cerne.firebasestorage.app",
  messagingSenderId: "81314764675",
  appId: "1:81314764675:web:d7e90c37bc4b3e34b888b6",
  measurementId: "G-8HQE7D67R4"
};

// Inicialização
let db: any = null;
let auth: any = null;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    // OTIMIZAÇÃO 1: ATIVAÇÃO DE CACHE (Persistência)
    // Isso permite que o app leia do cache local antes de bater no servidor.
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            // Falha: Múltiplas abas abertas. A persistência só pode ser ativada em uma aba por vez.
            console.warn("Persistência do Firestore: Múltiplas abas abertas. Persistência habilitada apenas na primeira.");
        } else if (err.code == 'unimplemented') {
            // Falha: O navegador atual não suporta todos os recursos necessários.
            console.warn("Persistência do Firestore: Navegador não suportado.");
        }
    });

    console.log("Firebase conectado com sucesso ao projeto:", firebaseConfig.projectId);
} catch (e) {
    console.error("Erro ao inicializar Firebase:", e);
}

export { db, auth };
