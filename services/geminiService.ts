import { auth } from "../firebase";

interface ParsedFile {
  filename: string;
  client: string;
}

// URL do Proxy (Serverless Function) hospedado na Vercel.
const PROXY_URL = "https://cerne-proxy.vercel.app/api/analyze";

export const predictClientsFromFilenames = async (filenames: string[]): Promise<ParsedFile[]> => {
  if (filenames.length === 0) return [];

  // Security Check: Impede chamadas se o usuário não estiver autenticado no Frontend
  if (!auth || !auth.currentUser) {
      console.warn("Tentativa de uso da IA sem autenticação bloqueada.");
      return filenames.map(f => ({ filename: f, client: "Geral" }));
  }

  // Limitamos a 50 arquivos por lote para garantir performance
  const limitedFilenames = filenames.slice(0, 50);

  try {
    // Obtém o token JWT atual do usuário para enviar ao Proxy
    // Isso permite que o backend (Vercel) verifique quem está chamando
    const token = await auth.currentUser.getIdToken();

    // Faz a chamada para o seu Proxy na Vercel
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Envia o token para validação
      },
      body: JSON.stringify({ filenames: limitedFilenames }),
    });

    if (!response.ok) {
       throw new Error(`Erro no Proxy Vercel: ${response.status} ${response.statusText}`);
    }

    // O Proxy já retorna o JSON processado
    const data = await response.json() as ParsedFile[];
    
    if (Array.isArray(data)) {
        return limitedFilenames.map(originalName => {
            const found = data.find(d => d.filename === originalName);
            return found || { filename: originalName, client: "Geral" };
        });
    }
    
    // Fallback caso o retorno não seja um array
    return limitedFilenames.map(f => ({ filename: f, client: "Geral" }));

  } catch (error) {
    console.error("Erro na chamada da IA (Via Proxy):", error);
    
    // Fallback silencioso
    return limitedFilenames.map(name => ({
      filename: name,
      client: "Geral"
    }));
  }
};