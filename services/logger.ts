import { db, auth } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const COLL_LOGS = "logs_sistema";

export type LogAction = 
  | "CRIACAO" 
  | "EDICAO" 
  | "EXCLUSAO" 
  | "EDICAO_LOTE" 
  | "WORKFLOW_LOTE" 
  | "IMPORTACAO" 
  | "LOGIN" 
  | "OUTRO";

export const registrarLog = async (
  acao: LogAction | string,
  alvo: string,
  detalhes?: Record<string, any>
) => {
  // Fail-safe: If DB is not connected or no user, we try not to crash the app
  if (!db || !auth.currentUser) {
    console.warn("Logger: Tentativa de log sem DB ou Usuário logado.");
    return;
  }

  try {
    const user = auth.currentUser;
    
    await addDoc(collection(db, COLL_LOGS), {
      acao,
      alvo,
      detalhes: detalhes || {},
      usuario_email: user.email,
      usuario_uid: user.uid,
      data: serverTimestamp(),
      user_agent: navigator.userAgent // Optional: good for debugging context
    });

  } catch (error) {
    // Silent catch to prevent blocking the main thread interaction
    console.error("Erro ao registrar log de auditoria:", error);
  }
};
