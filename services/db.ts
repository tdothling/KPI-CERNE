import { db, auth } from "../firebase";
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc, query, orderBy, limit, QuerySnapshot, DocumentData, getDoc } from "firebase/firestore";
import { ProjectFile, MaterialDoc, PurchaseDoc, ClientDoc } from "../types";
import { registerLog } from "../utils/logger";

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

const checkAuth = () => {
    if (!auth || !auth.currentUser) {
        alert("Acesso Negado: Você precisa estar logado para realizar esta ação.");
        return false;
    }
    return true;
};

export const subscribeToProjects = (callback: (data: ProjectFile[]) => void) => {
  if (!isDbActive()) return () => {};
  const q = query(collection(db, COLL_PROJECTS), limit(50));
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
  if (!isDbActive() || !checkAuth()) return;
  try {
    const { id, ...cleanProject } = project as any;
    await addDoc(collection(db, COLL_PROJECTS), cleanProject);
    await registerLog('CRIAR_PROJETO', cleanProject.filename, cleanProject);
  } catch (e) { console.error("Erro ao adicionar projeto:", e); }
};

export const updateProjectInDb = async (project: ProjectFile) => {
  if (!isDbActive() || !checkAuth()) return;
  try {
    const { id, ...data } = project;
    const docRef = doc(db, COLL_PROJECTS, id);
    await updateDoc(docRef, data);
    await registerLog('EDITAR_PROJETO', data.filename, data);
  } catch (e) { console.error("Erro ao atualizar projeto:", e); }
};

export const deleteProjectFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) return;
  try { 
    // Tenta buscar o nome antes de deletar para o log
    let filename = id;
    const snap = await getDoc(doc(db, COLL_PROJECTS, id));
    if (snap.exists()) filename = snap.data().filename;

    await deleteDoc(doc(db, COLL_PROJECTS, id));
    await registerLog('EXCLUIR_PROJETO', filename, { id });
  } catch (e) { console.error("Erro ao excluir projeto:", e); }
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
  if (!isDbActive() || !checkAuth()) return;
  try {
     const { id, ...cleanMaterial } = material as any;
    await addDoc(collection(db, COLL_MATERIALS), cleanMaterial);
    await registerLog('CRIAR_MATERIAL', cleanMaterial.filename, cleanMaterial);
  } catch (e) { console.error("Erro ao adicionar material:", e); }
};

export const updateMaterialInDb = async (material: MaterialDoc) => {
  if (!isDbActive() || !checkAuth()) return;
  try {
    const { id, ...data } = material;
    const docRef = doc(db, COLL_MATERIALS, id);
    await updateDoc(docRef, data);
    await registerLog('EDITAR_MATERIAL', data.filename, data);
  } catch (e) { console.error("Erro ao atualizar material:", e); }
};

export const deleteMaterialFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) return;
  try { 
    await deleteDoc(doc(db, COLL_MATERIALS, id)); 
    await registerLog('EXCLUIR_MATERIAL', id, {});
  } catch (e) { console.error("Erro ao excluir material:", e); }
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
  if (!isDbActive() || !checkAuth()) return;
  try {
    const { id, ...cleanPurchase } = purchase as any;
    await addDoc(collection(db, COLL_PURCHASES), cleanPurchase);
    await registerLog('CRIAR_COMPRA', cleanPurchase.description, cleanPurchase);
  } catch (e) { console.error("Erro ao adicionar compra:", e); }
};

export const updatePurchaseInDb = async (purchase: PurchaseDoc) => {
  if (!isDbActive() || !checkAuth()) return;
  try {
    const { id, ...data } = purchase;
    const docRef = doc(db, COLL_PURCHASES, id);
    await updateDoc(docRef, data);
    await registerLog('EDITAR_COMPRA', data.description, data);
  } catch (e) { console.error("Erro ao atualizar compra:", e); }
};

export const deletePurchaseFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) return;
  try { 
    await deleteDoc(doc(db, COLL_PURCHASES, id)); 
    await registerLog('EXCLUIR_COMPRA', id, {});
  } catch (e) { console.error("Erro ao excluir compra:", e); }
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
  if (!isDbActive() || !checkAuth()) return;
  try {
    const { id, ...cleanClient } = client as any;
    await addDoc(collection(db, COLL_CLIENTS), cleanClient);
    await registerLog('ADICIONAR_CLIENTE', cleanClient.name, cleanClient);
  } catch (e) { console.error("Erro ao adicionar cliente:", e); }
};

export const updateClientInDb = async (client: ClientDoc) => {
  if (!isDbActive() || !checkAuth()) return;
  try {
    const { id, ...data } = client;
    const docRef = doc(db, COLL_CLIENTS, id);
    await updateDoc(docRef, data);
    await registerLog('EDITAR_CLIENTE', data.name, data);
  } catch (e) { console.error("Erro ao atualizar cliente:", e); }
};

export const deleteClientFromDb = async (id: string) => {
  if (!isDbActive() || !checkAuth()) return;
  try { 
    await deleteDoc(doc(db, COLL_CLIENTS, id)); 
    await registerLog('EXCLUIR_CLIENTE', id, {});
  } catch (e) { console.error("Erro ao excluir cliente:", e); }
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
    if (!isDbActive() || !checkAuth()) return;
    try { 
        await setDoc(doc(db, COLL_HOLIDAYS, "holidays"), { dates: holidays }); 
        await registerLog('ATUALIZAR_FERIADOS', 'Calendário Geral', { count: holidays.length });
    } catch (e) { console.error("Erro ao salvar feriados:", e); }
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