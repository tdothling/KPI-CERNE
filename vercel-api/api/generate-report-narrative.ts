import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { requireFirebaseUser } from '../lib/auth';
import { applyCors } from '../lib/cors';
import { assertNarrativePayload } from '../lib/narrativePayload';
import { buildPrompt } from '../lib/prompt';

/**
 * Modelos tentados em ordem. O primeiro é o flash mais recente; o lite entra
 * como reserva porque costuma ter capacidade sobrando quando o principal está
 * congestionado (503 UNAVAILABLE).
 */
const MODELOS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

/** Tentativas por modelo antes de passar para o próximo. */
const TENTATIVAS_POR_MODELO = 2;

/** 503 (sobrecarga) e 429 (limite de taxa) são temporários — vale repetir. */
function ehFalhaTemporaria(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  return status === 503 || status === 429;
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gera o texto tentando cada modelo, repetindo enquanto a falha for temporária.
 * Lança o último erro se nenhuma combinação funcionar.
 */
async function gerarComRetentativa(ai: GoogleGenAI, prompt: string): Promise<string> {
  let ultimoErro: unknown = new Error('nenhuma tentativa executada');

  for (const model of MODELOS) {
    for (let tentativa = 1; tentativa <= TENTATIVAS_POR_MODELO; tentativa++) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: prompt,
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
        return text;
      } catch (e) {
        ultimoErro = e;
        if (!ehFalhaTemporaria(e)) break; // erro real deste modelo: vai para o próximo
        console.warn(`Modelo ${model} indisponível (tentativa ${tentativa}).`);
        await espera(800 * tentativa);
      }
    }
  }

  throw ultimoErro;
}

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

  // A variável está cadastrada como GEMINI no projeto da Vercel; GEMINI_API_KEY é
  // aceita também para o caso de ela ser renomeada para o nome mais descritivo.
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI;
  if (!apiKey) {
    console.error('Chave do Gemini (GEMINI ou GEMINI_API_KEY) não configurada na Vercel.');
    res.status(500).json({ error: 'Serviço de IA não configurado.' });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const narrative = await gerarComRetentativa(ai, buildPrompt(req.body));
    res.status(200).json({ narrative });
  } catch (e) {
    console.error('Falha ao gerar análise com Gemini:', e);
    // Sobrecarga do modelo é temporária: a mensagem precisa dizer isso, senão o
    // usuário fica caçando erro de configuração que não existe.
    if (ehFalhaTemporaria(e)) {
      res.status(503).json({
        error: 'O modelo de IA está sobrecarregado no momento. Tente novamente em instantes.',
      });
      return;
    }
    res.status(502).json({ error: 'Não foi possível gerar a análise agora. Tente novamente.' });
  }
}
