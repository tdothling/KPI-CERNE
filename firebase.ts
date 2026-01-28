import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDVlKOB6hr2Q_ORpq0A7gWZz6qw2sNo4ds",
  authDomain: "kpi---engenharia-cerne.firebaseapp.com",
  projectId: "kpi---engenharia-cerne",
  storageBucket: "kpi---engenharia-cerne.firebasestorage.app",
  messagingSenderId: "81314764675",
  appId: "1:81314764675:web:d7e90c37bc4b3e34b888b6",
  measurementId: "G-8HQE7D67R4"
};

let db: any = null;
let auth: any = null;

try {
    const app = initializeApp(firebaseConfig);
    
    // Inicialização moderna do Firestore com cache persistente
    db = initializeFirestore(app, {
      localCache: persistentLocalCache()
    });

    auth = getAuth(app);
} catch (e) {
    console.error("Erro ao inicializar Firebase:", e);
}

export { db, auth };