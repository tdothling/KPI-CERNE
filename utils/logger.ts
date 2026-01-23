import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface LogEntry {
  id?: string;
  action: string;
  target: string;
  details?: any;
  user_email: string;
  user_uid: string;
  created_at: any; // Timestamp do Firestore
}

/**
 * Registra uma ação no sistema de auditoria.
 * @param action Nome da ação (ex: 'CRIAR_PROJETO', 'EXCLUIR_ITEM')
 * @param target Identificador do alvo (ex: Nome do arquivo ou ID)
 * @param details Objeto opcional com detalhes (ex: { antes: ..., depois: ... })
 */
export const registerLog = async (action: string, target: string, details?: any) => {
  // Se não houver usuário logado ou banco não iniciado, aborta (ou loga como anônimo se preferir)
  if (!auth || !auth.currentUser || !db) return;

  try {
    const logData = {
      action,
      target: target || 'Desconhecido',
      details: details ? JSON.parse(JSON.stringify(details)) : {}, // Garante que seja um objeto puro
      user_email: auth.currentUser.email,
      user_uid: auth.currentUser.uid,
      created_at: serverTimestamp()
    };

    await addDoc(collection(db, 'logs_sistema'), logData);
  } catch (error) {
    // Falha silenciosa para não travar a experiência do usuário, mas loga no console
    console.error("Falha ao registrar audit log:", error);
  }
};