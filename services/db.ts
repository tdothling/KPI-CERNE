
import { db } from "../firebase";
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  setDoc,
  query,
  orderBy,
  limit, // Importado para Otimização 2
  QuerySnapshot,
  DocumentData,
  getDoc // Importado para leitura única
} from "firebase/firestore";
import { ProjectFile, MaterialDoc, PurchaseDoc, ClientDoc } from "../types";

// Nomes das coleções no banco de dados
const COLL_PROJECTS = "projects";
const COLL_MATERIALS = "materials";
const COLL_HOLIDAYS = "settings"; 
const COLL_PURCHASES = "purchases";
const COLL_CLIENTS = "clients";
const COLL_CONFIG = "configuration"; // Coleção hipotética para configs gerais

// --- GENERIC HELPERS ---

const isDbActive = () => {
    if (!db) {
        console.warn("Operação cancelada: Banco de dados não configurado.");
        return false;
    }
    return true;
};

// --- PROJECTS ---

export const subscribeToProjects = (callback: (data: ProjectFile[]) => void) => {
  if (!isDbActive()) return () => {};

  // OTIMIZAÇÃO 2: LIMITAÇÃO DE LEITURAS
  // Limitamos a 50 projetos mais recentes (baseado na data de criação ou nome)
  // Nota: Idealmente, tenha um campo 'createdAt' para ordenar. Aqui usaremos 'filename' ou sem ordem específica se não houver campo de data confiável em todos.
  // Se quiser ordenar por data de início: orderBy("startDate", "desc")
  const q = query(
    collection(db, COLL_PROJECTS), 
    limit(50) 
  );
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const projects: ProjectFile[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id; 
      projects.push({ id: doc.id, ...data } as ProjectFile);
    });
    callback(projects);
  });

  return unsubscribe;
};

export const addProject = async (project: Omit<ProjectFile, 'id'>) => {
  if (!isDbActive()) return;
  try {
    const { id, ...cleanProject } = project as any;
    await addDoc(collection(db, COLL_PROJECTS), cleanProject);
  } catch (e) {
    console.error("Erro ao adicionar projeto:", e);
    alert("Erro ao salvar no banco de dados. Verifique o console.");
  }
};

export const updateProjectInDb = async (project: ProjectFile) => {
  if (!isDbActive()) return;
  try {
    const { id, ...data } = project;
    const docRef = doc(db, COLL_PROJECTS, id);
    await updateDoc(docRef, data);
  } catch (e) {
    console.error("Erro ao atualizar projeto:", e);
  }
};

export const deleteProjectFromDb = async (id: string) => {
  if (!isDbActive()) return;
  try {
    await deleteDoc(doc(db, COLL_PROJECTS, id));
  } catch (e) {
    console.error("Erro ao excluir projeto:", e);
  }
};

// --- MATERIALS ---

export const subscribeToMaterials = (callback: (data: MaterialDoc[]) => void) => {
  if (!isDbActive()) return () => {};

  // OTIMIZAÇÃO 2: LIMITAÇÃO DE LEITURAS
  const q = query(
      collection(db, COLL_MATERIALS),
      limit(50)
  );
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const materials: MaterialDoc[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id;
      materials.push({ id: doc.id, ...data } as MaterialDoc);
    });
    callback(materials);
  });

  return unsubscribe;
};

export const addMaterial = async (material: Omit<MaterialDoc, 'id'>) => {
  if (!isDbActive()) return;
  try {
     const { id, ...cleanMaterial } = material as any;
    await addDoc(collection(db, COLL_MATERIALS), cleanMaterial);
  } catch (e) {
    console.error("Erro ao adicionar material:", e);
  }
};

export const updateMaterialInDb = async (material: MaterialDoc) => {
  if (!isDbActive()) return;
  try {
    const { id, ...data } = material;
    const docRef = doc(db, COLL_MATERIALS, id);
    await updateDoc(docRef, data);
  } catch (e) {
    console.error("Erro ao atualizar material:", e);
  }
};

export const deleteMaterialFromDb = async (id: string) => {
  if (!isDbActive()) return;
  try {
    await deleteDoc(doc(db, COLL_MATERIALS, id));
  } catch (e) {
    console.error("Erro ao excluir material:", e);
  }
};

// --- PURCHASES ---

export const subscribeToPurchases = (callback: (data: PurchaseDoc[]) => void) => {
  if (!isDbActive()) return () => {};

  // OTIMIZAÇÃO 2: LIMITAÇÃO DE LEITURAS
  // Ordenar por data de solicitação decrescente para pegar as últimas 50
  const q = query(
      collection(db, COLL_PURCHASES), 
      orderBy("requestDate", "desc"),
      limit(50)
  );
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const purchases: PurchaseDoc[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id;
      purchases.push({ id: doc.id, ...data } as PurchaseDoc);
    });
    callback(purchases);
  });

  return unsubscribe;
};

export const addPurchase = async (purchase: Omit<PurchaseDoc, 'id'>) => {
  if (!isDbActive()) return;
  try {
    const { id, ...cleanPurchase } = purchase as any;
    await addDoc(collection(db, COLL_PURCHASES), cleanPurchase);
  } catch (e) {
    console.error("Erro ao adicionar compra:", e);
  }
};

export const updatePurchaseInDb = async (purchase: PurchaseDoc) => {
  if (!isDbActive()) return;
  try {
    const { id, ...data } = purchase;
    const docRef = doc(db, COLL_PURCHASES, id);
    await updateDoc(docRef, data);
  } catch (e) {
    console.error("Erro ao atualizar compra:", e);
  }
};

export const deletePurchaseFromDb = async (id: string) => {
  if (!isDbActive()) return;
  try {
    await deleteDoc(doc(db, COLL_PURCHASES, id));
  } catch (e) {
    console.error("Erro ao excluir compra:", e);
  }
};

// --- CLIENTS (REGISTRO DE OBRA) ---

export const subscribeToClients = (callback: (data: ClientDoc[]) => void) => {
  if (!isDbActive()) return () => {};

  // Clientes geralmente são poucos, mas é boa prática limitar se escalar
  const q = query(collection(db, COLL_CLIENTS), orderBy("name"), limit(100));
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const clients: ClientDoc[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id;
      clients.push({ id: doc.id, ...data } as ClientDoc);
    });
    callback(clients);
  });

  return unsubscribe;
};

export const addClient = async (client: Omit<ClientDoc, 'id'>) => {
  if (!isDbActive()) return;
  try {
    const { id, ...cleanClient } = client as any;
    await addDoc(collection(db, COLL_CLIENTS), cleanClient);
  } catch (e) {
    console.error("Erro ao adicionar cliente:", e);
  }
};

export const updateClientInDb = async (client: ClientDoc) => {
  if (!isDbActive()) return;
  try {
    const { id, ...data } = client;
    const docRef = doc(db, COLL_CLIENTS, id);
    await updateDoc(docRef, data);
  } catch (e) {
    console.error("Erro ao atualizar cliente:", e);
  }
};

export const deleteClientFromDb = async (id: string) => {
  if (!isDbActive()) return;
  try {
    await deleteDoc(doc(db, COLL_CLIENTS, id));
  } catch (e) {
    console.error("Erro ao excluir cliente:", e);
  }
};

// --- HOLIDAYS & SETTINGS (OTIMIZAÇÃO 4: Single Document) ---
// Em vez de ler uma coleção inteira, lemos um único documento contendo arrays.
// Ex: { dates: ['2024-01-01', ...] }

export const subscribeToHolidays = (callback: (holidays: string[]) => void) => {
    if (!isDbActive()) return () => {};

    // Lê apenas o documento 'holidays' dentro da coleção 'settings'
    const docRef = doc(db, COLL_HOLIDAYS, "holidays");
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as any;
            callback(data.dates || []);
        } else {
            callback([]);
        }
    });

    return unsubscribe;
};

export const saveHolidaysToDb = async (holidays: string[]) => {
    if (!isDbActive()) return;
    try {
        await setDoc(doc(db, COLL_HOLIDAYS, "holidays"), { dates: holidays });
    } catch (e) {
        console.error("Erro ao salvar feriados:", e);
    }
};

// Exemplo da OTIMIZAÇÃO 4 (Não usado na UI ainda, mas mostra como fazer para Dropdowns)
export const getAppConfig = async () => {
    if (!isDbActive()) return null;
    try {
        // Lê um único documento que conteria arrays de disciplinas, status, etc.
        // Custo: 1 Read (independente de ter 10 ou 1000 categorias no array)
        const docRef = doc(db, COLL_CONFIG, "general"); 
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            return snap.data(); 
        }
        return null;
    } catch (e) {
        console.error("Erro ao buscar configs:", e);
        return null;
    }
}
