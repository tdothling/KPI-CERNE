import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface ParsedFile {
  filename: string;
  client: string;
}

export const predictClientsFromFilenames = async (filenames: string[]): Promise<ParsedFile[]> => {
  if (filenames.length === 0) return [];

  const prompt = `
    Analyze the following engineering filenames and deduce the likely Client name.
    
    The Client name should be short and derived from the project code or prefix if visible (e.g., "PRJ-01" -> "PRJ", "ClientA-Arch" -> "ClientA", "2024-Google-Office" -> "Google"). 
    If no client pattern is found or it looks generic, use "Geral".

    Return a JSON array of objects with "filename" and "client".

    Filenames:
    ${filenames.join('\n')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              filename: { type: Type.STRING },
              client: { type: Type.STRING }
            },
            required: ["filename", "client"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return filenames.map(f => ({ filename: f, client: "Geral" }));
    
    const data = JSON.parse(text) as ParsedFile[];
    return data;

  } catch (error) {
    console.error("Gemini parsing error:", error);
    // Fallback if AI fails
    return filenames.map(name => ({
      filename: name,
      client: "Geral" // Default fallback
    }));
  }
};