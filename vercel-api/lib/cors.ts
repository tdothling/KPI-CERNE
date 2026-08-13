import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Origens autorizadas a chamar a API — hosts onde o app roda em produção + dev local. */
const ALLOWED_ORIGINS = [
  'https://kpi---engenharia-cerne.web.app',
  'https://kpi---engenharia-cerne.firebaseapp.com',
  'https://kpi-cerne.vercel.app',
  'http://localhost:3000',
];

/** Aplica CORS restrito às origens do app. Retorna true se a requisição já foi respondida (preflight). */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
