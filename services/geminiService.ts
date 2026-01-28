interface ParsedFile {
  filename: string;
  client: string;
}

// URL do Proxy (Serverless Function) hospedado na Vercel.
// Isso permite que o Firebase (Plano Spark) faça requisições de IA sem pagar pelo Blaze,
// além de proteger a API Key do Google no servidor da Vercel.
const PROXY_URL = "https://cerne-proxy.vercel.app/api/analyze";

export const predictClientsFromFilenames = async (filenames: string[]): Promise<ParsedFile[]> => {
  if (filenames.length === 0) return [];

  // Limitamos a 50 arquivos por lote para garantir performance e não estourar limites de tempo da Vercel
  const limitedFilenames = filenames.slice(0, 50);

  try {
    // Faz a chamada para o seu Proxy na Vercel
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filenames: limitedFilenames }),
    });

    if (!response.ok) {
       throw new Error(`Erro no Proxy Vercel: ${response.status} ${response.statusText}`);
    }

    // O Proxy já retorna o JSON processado
    const data = await response.json() as ParsedFile[];
    
    if (Array.isArray(data)) {
        // Garantir que todos os arquivos solicitados tenham retorno, 
        // caso a IA tenha ignorado algum ou o proxy tenha truncado
        return limitedFilenames.map(originalName => {
            const found = data.find(d => d.filename === originalName);
            return found || { filename: originalName, client: "Geral" };
        });
    }
    
    // Fallback caso o retorno não seja um array
    return limitedFilenames.map(f => ({ filename: f, client: "Geral" }));

  } catch (error) {
    console.error("Erro na chamada da IA (Via Proxy):", error);
    
    // Fallback silencioso: se der erro na IA/Rede, define tudo como "Geral" para não travar o uso
    return limitedFilenames.map(name => ({
      filename: name,
      client: "Geral"
    }));
  }
};