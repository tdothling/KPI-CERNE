
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
    console.log("Firebase conectado com sucesso ao projeto:", firebaseConfig.projectId);
} catch (e) {
    console.error("Erro ao inicializar Firebase:", e);
}

export { db, auth };
