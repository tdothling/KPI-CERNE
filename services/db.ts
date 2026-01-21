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
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";
import { ProjectFile, MaterialDoc } from "../types";

// Nomes das coleções no banco de dados
const COLL_PROJECTS = "projects";
const COLL_MATERIALS = "materials";
const COLL_HOLIDAYS = "settings"; // Documento específico 'holidays' dentro de settings

// --- GENERIC HELPERS ---

// Verificar se o DB está ativo
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

  const q = query(collection(db, COLL_PROJECTS));
  
  // Real-time listener
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const projects: ProjectFile[] = [];
    snapshot.forEach((doc) => {
      projects.push({ id: doc.id, ...doc.data() } as ProjectFile);
    });
    callback(projects);
  });

  return unsubscribe;
};

export const addProject = async (project: Omit<ProjectFile, 'id'>) => {
  if (!isDbActive()) return;
  try {
    await addDoc(collection(db, COLL_PROJECTS), project);
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

  const q = query(collection(db, COLL_MATERIALS));
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const materials: MaterialDoc[] = [];
    snapshot.forEach((doc) => {
      materials.push({ id: doc.id, ...doc.data() } as MaterialDoc);
    });
    callback(materials);
  });

  return unsubscribe;
};

export const addMaterial = async (material: Omit<MaterialDoc, 'id'>) => {
  if (!isDbActive()) return;
  try {
    await addDoc(collection(db, COLL_MATERIALS), material);
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

// --- HOLIDAYS ---
// Feriados são armazenados em um único documento para facilitar
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
    if (!isDbActive()) return;
    try {
        await setDoc(doc(db, COLL_HOLIDAYS, "holidays"), { dates: holidays });
    } catch (e) {
        console.error("Erro ao salvar feriados:", e);
    }
};