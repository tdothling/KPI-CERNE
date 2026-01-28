
import { db, auth } from "../firebase";
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc, query, orderBy, limit, QuerySnapshot, DocumentData, getDoc, where } from "firebase/firestore";
import { ProjectFile, MaterialDoc, PurchaseDoc, ClientDoc, ProjectFilterState } from "../types";

const COLL_PROJECTS = "projects";
const COLL_MATERIALS = "materials";
const COLL_HOLIDAYS = "settings"; 
const COLL_PURCHASES = "purchases";
const COLL_CLIENTS = "clients";
const COLL_CONFIG = "configuration"; 

const isDbActive = () => {
    if (!db) return false;
    return true;
};

// Security Hardening: Verificação estrita
const checkAuth = () => {
    if (!auth) {
        console.error("Security Error: Auth service not initialized.");
        return false;
    }
    if (!auth.currentUser) {
        console.warn("Security Alert: Tentativa de escrita não autorizada bloqueada.");
        return false;
    }
    return true;
};

// Security Helper: Remove campos undefined que podem quebrar o Firestore ou causar inconsistência
const sanitizeData = (data: any) => {
    const clean: any = {};
    Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
            clean[key] = data[key];
        }
    });
    return clean;
};

export const subscribeToProjects = (callback: (data: ProjectFile[]) => void, filter?: ProjectFilterState) => {
  if (!isDbActive()) return () => {};
  
  let q;

  // Lógica de Filtro Avançado (Server-Side)
  if (filter && filter.isActive) {
      const constraints: any[] = [];
      
      // Filtro de Clientes (Usa operador 'in' para permitir múltipla escolha)
      if (filter.clients.length > 0) {
          // Firestore limita o operador 'in' a 10 valores (em versões antigas) ou 30 (novas).
          // Por segurança e performance, pegamos os primeiros 10 se houver muitos.
          const safeClients = filter.clients.slice(0, 10);
          constraints.push(where("client", "in", safeClients));
      }

      // Nota: Não adicionamos 'discipline' na query do Firestore para evitar erros de índice composto.
      // O Firestore exige índices específicos para queries com múltiplos campos diferentes.
      // Estratégia: Filtramos Clientes no Servidor (Redução drástica de leituras) e Disciplinas no Cliente (Memória).
      
      // Se tiver filtro, aumentamos o limite para garantir que o usuário ache o que procura,
      // mas mantemos um teto para segurança de cota.
      constraints.push(limit(150)); 
      
      // Queries com 'where' muitas vezes não suportam 'orderBy' sem índice criado. 
      // Removemos 'orderBy' aqui e ordenamos no callback.
      q = query(collection(db, COLL_PROJECTS), ...constraints);

  } else {
      // Padrão: 50 últimos projetos (Monitoramento Diário)
      q = query(collection(db, COLL_PROJECTS), limit(50));
  }

  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    let projects: ProjectFile[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if ('id' in data) delete data.id; 
      projects.push({ id: doc.id, ...data } as ProjectFile);
    });

    // Se estiver filtrando, aplicamos a filtragem de memória secundária (ex: disciplina) e ordenação
    if (filter && filter.isActive) {
        if (filter.disciplines.length > 0) {
            projects = projects.filter(p => filter.disciplines.includes(p.discipline));
        }
        // Ordenação manual pois removemos o orderBy da query filtrada
        projects.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    }

    callback(projects);
  });
  return unsubscribe;
};

export const addProject = async (project: Omit<ProjectFile, 'id'>) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...cleanProject } = project as any;
    await addDoc(collection(db, COLL_PROJECTS), sanitizeData(cleanProject));
  } catch (e) { console.error("Erro ao adicionar projeto:", e); throw e; }
};

export const updateProjectInDb = async (project: ProjectFile) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...data } = project;
    const docRef = doc(db, COLL_PROJECTS, id);
    await updateDoc(docRef, sanitizeData(data));
  } catch (e) { console.error("Erro ao atualizar projeto:", e); throw e; }
};

export const deleteProjectFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await deleteDoc(doc(db, COLL_PROJECTS, id)); } catch (e) { console.error("Erro ao excluir projeto:", e); throw e; }
};

export const subscribeToMaterials = (callback: (data: MaterialDoc[]) => void) => {
  if (!isDbActive()) return () => {};
  const q = query(collection(db, COLL_MATERIALS), limit(50));
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
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
     const { id, ...cleanMaterial } = material as any;
    await addDoc(collection(db, COLL_MATERIALS), sanitizeData(cleanMaterial));
  } catch (e) { console.error("Erro ao adicionar material:", e); throw e; }
};

export const updateMaterialInDb = async (material: MaterialDoc) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...data } = material;
    const docRef = doc(db, COLL_MATERIALS, id);
    await updateDoc(docRef, sanitizeData(data));
  } catch (e) { console.error("Erro ao atualizar material:", e); throw e; }
};

export const deleteMaterialFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await deleteDoc(doc(db, COLL_MATERIALS, id)); } catch (e) { console.error("Erro ao excluir material:", e); throw e; }
};

export const subscribeToPurchases = (callback: (data: PurchaseDoc[]) => void) => {
  if (!isDbActive()) return () => {};
  const q = query(collection(db, COLL_PURCHASES), orderBy("requestDate", "desc"), limit(50));
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
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...cleanPurchase } = purchase as any;
    await addDoc(collection(db, COLL_PURCHASES), sanitizeData(cleanPurchase));
  } catch (e) { console.error("Erro ao adicionar compra:", e); throw e; }
};

export const updatePurchaseInDb = async (purchase: PurchaseDoc) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...data } = purchase;
    const docRef = doc(db, COLL_PURCHASES, id);
    await updateDoc(docRef, sanitizeData(data));
  } catch (e) { console.error("Erro ao atualizar compra:", e); throw e; }
};

export const deletePurchaseFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await deleteDoc(doc(db, COLL_PURCHASES, id)); } catch (e) { console.error("Erro ao excluir compra:", e); throw e; }
};

export const subscribeToClients = (callback: (data: ClientDoc[]) => void) => {
  if (!isDbActive()) return () => {};
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
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...cleanClient } = client as any;
    await addDoc(collection(db, COLL_CLIENTS), sanitizeData(cleanClient));
  } catch (e) { console.error("Erro ao adicionar cliente:", e); throw e; }
};

export const updateClientInDb = async (client: ClientDoc) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try {
    const { id, ...data } = client;
    const docRef = doc(db, COLL_CLIENTS, id);
    await updateDoc(docRef, sanitizeData(data));
  } catch (e) { console.error("Erro ao atualizar cliente:", e); throw e; }
};

export const deleteClientFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
  try { await deleteDoc(doc(db, COLL_CLIENTS, id)); } catch (e) { console.error("Erro ao excluir cliente:", e); throw e; }
};

export const subscribeToHolidays = (callback: (holidays: string[]) => void) => {
    if (!isDbActive()) return () => {};
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
    if (!isDbActive() || !checkAuth()) throw new Error("Acesso negado.");
    try { await setDoc(doc(db, COLL_HOLIDAYS, "holidays"), { dates: holidays }); } catch (e) { console.error("Erro ao salvar feriados:", e); throw e; }
};

export const getAppConfig = async () => {
    if (!isDbActive()) return null;
    try {
        const docRef = doc(db, COLL_CONFIG, "general"); 
        const snap = await getDoc(docRef);
        if (snap.exists()) { return snap.data(); }
        return null;
    } catch (e) { console.error("Erro ao buscar configs:", e); return null; }
}
