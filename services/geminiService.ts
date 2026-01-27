import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

interface ParsedFile {
  filename: string;
  client: string;
}

export const predictClientsFromFilenames = async (filenames: string[]): Promise<ParsedFile[]> => {
  if (filenames.length === 0) return [];

  // Mantemos o limite de arquivos para economizar banda e processamento no backend
  const limitedFilenames = filenames.slice(0, 50);

  // Verificação de segurança: Se o Firebase Functions não carregou, falha segura.
  if (!functions) {
      console.error("Security Alert: Firebase Functions service not initialized.");
      return limitedFilenames.map(f => ({ filename: f, client: "Geral" }));
  }

  try {
    // SECURITY FIX: Chamada Backend-for-Frontend (BFF)
    // A chave da API agora reside apenas no servidor do Firebase, inacessível ao cliente.
    // Invocamos a função 'analyzeFilenames' que deve estar implantada no seu Cloud Functions.
    const analyzeFilenames = httpsCallable(functions, 'analyzeFilenames');
    
    const response = await analyzeFilenames({ filenames: limitedFilenames });
    
    const data = response.data as ParsedFile[];
    
    // Validação básica do retorno
    if (Array.isArray(data)) {
        return data;
    }
    
    console.warn("Formato de resposta inesperado do backend.");
    return limitedFilenames.map(f => ({ filename: f, client: "Geral" }));

  } catch (error) {
    console.error("Erro seguro na chamada da IA (Backend):", error);
    // Fallback silencioso em caso de erro no servidor
    return limitedFilenames.map(name => ({
      filename: name,
      client: "Geral"
    }));
  }
};