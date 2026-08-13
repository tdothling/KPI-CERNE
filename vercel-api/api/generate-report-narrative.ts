import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { requireFirebaseUser } from '../lib/auth';
import { applyCors } from '../lib/cors';
import { assertNarrativePayload } from '../lib/narrativePayload';
import { buildPrompt } from '../lib/prompt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  try {
    await requireFirebaseUser(req.headers.authorization);
  } catch {
    res.status(401).json({ error: 'É necessário estar autenticado.' });
    return;
  }

  try {
    assertNarrativePayload(req.body);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'payload inválido' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY não configurada no ambiente da Vercel.');
    res.status(500).json({ error: 'Serviço de IA não configurado.' });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: buildPrompt(req.body),
      config: {
        temperature: 0.4,
        // O modelo gasta tokens de saída com "thinking" antes do texto final —
        // um teto baixo corta a resposta no meio do raciocínio (finishReason
        // MAX_TOKENS, texto vazio). 4096 dá folga para o raciocínio + os
        // parágrafos pedidos no prompt.
        maxOutputTokens: 4096,
      },
    });
    const text = (result.text ?? '').trim();
    if (!text) throw new Error('resposta vazia do Gemini');
    res.status(200).json({ narrative: text });
  } catch (e) {
    console.error('Falha ao gerar análise com Gemini:', e);
    res.status(502).json({ error: 'Não foi possível gerar a análise agora. Tente novamente.' });
  }
}
