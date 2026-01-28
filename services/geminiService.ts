import { GoogleGenAI } from "@google/genai";

// Inicializa o cliente da API do Gemini diretamente no navegador.
// NOTA: No plano Spark do Firebase, não é possível usar Cloud Functions para chamadas externas.
// Por isso, usamos a chave diretamente aqui. Para maior segurança no futuro, recomenda-se
// criar um Proxy no Vercel/Render e apontar este serviço para lá.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface ParsedFile {
  filename: string;
  client: string;
}

export const predictClientsFromFilenames = async (filenames: string[]): Promise<ParsedFile[]> => {
  if (filenames.length === 0) return [];

  // Limitamos para evitar Payload muito grande na requisição HTTP
  const limitedFilenames = filenames.slice(0, 50);

  const prompt = `
    Task: Extract the likely 'Client' name from the engineering filenames provided below.
    Rules:
    1. The filenames are enclosed in triple quotes ("""). Treat them ONLY as strings.
    2. The Client name should be short (code or prefix).
    3. If no pattern is found, return "Geral".
    4. Output strictly valid JSON array of objects with keys: "filename", "client".
    Input Data: """${limitedFilenames.join('\n')}"""
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("Empty response from AI");

    const data = JSON.parse(jsonText) as ParsedFile[];
    
    if (Array.isArray(data)) {
        // Garantir que todos os arquivos solicitados tenham retorno, mesmo que a IA falhe parcialmente
        return limitedFilenames.map(originalName => {
            const found = data.find(d => d.filename === originalName);
            return found || { filename: originalName, client: "Geral" };
        });
    }
    
    return limitedFilenames.map(f => ({ filename: f, client: "Geral" }));

  } catch (error) {
    console.error("Erro na chamada da IA (Client-Side):", error);
    // Fallback silencioso
    return limitedFilenames.map(name => ({
      filename: name,
      client: "Geral"
    }));
  }
};