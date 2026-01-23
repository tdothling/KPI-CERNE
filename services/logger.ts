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
  // 1. Verificação de Segurança do Banco de Dados
  if (!db) {
    console.error("Logger Erro: Banco de dados (Firestore) não inicializado.");
    return;
  }

  // 2. Verificação de Usuário (Evita tentar logar 'null')
  const currentUser = auth?.currentUser;
  
  // Se não houver usuário logado e a ação não for de Login, ignoramos ou avisamos.
  if (!currentUser) {
    console.warn(`Logger Aviso: Tentativa de log '${acao}' ignorada pois não há usuário logado.`);
    return;
  }

  try {
    const logData = {
      acao,
      alvo,
      detalhes: detalhes || {},
      usuario_email: currentUser.email || "desconhecido",
      usuario_uid: currentUser.uid,
      data: serverTimestamp(),
      user_agent: navigator.userAgent
    };

    await addDoc(collection(db, COLL_LOGS), logData);
    
    // Feedback no console para o desenvolvedor saber que funcionou
    console.log(`[Log Sistema] Registrado: ${acao} - ${alvo}`);

  } catch (error) {
    // Agora mostramos o erro real no console em vez de silenciar
    console.error("Logger Falha Crítica: Não foi possível salvar o log.", error);
  }
};
