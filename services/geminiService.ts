import { auth } from "../firebase";

interface ParsedFile {
  filename: string;
  client: string;
}

export interface KPIReportPayload {
  totalFiles: number;
  fttData: { name: string; rate: number }[];
  executionData: { name: string; avgPrelim: number; avgExec: number }[];
  clientResponseData: { name: string; avgDays: number }[];
  otdPercentage: number;
  cycleTimeData: { name: string; avgCycle: number }[];
  topRevisionReasons: { name: string; count: number }[];
}

// URL do Proxy (Serverless Function) hospedado na Vercel.
const PROXY_URL = "https://cerne-proxy.vercel.app/api/analyze";

export const predictClientsFromFilenames = async (filenames: string[]): Promise<ParsedFile[]> => {
  if (filenames.length === 0) return [];

  if (!auth || !auth.currentUser) {
      console.warn("Tentativa de uso da IA sem autenticação bloqueada.");
      return filenames.map(f => ({ filename: f, client: "Geral" }));
  }

  const limitedFilenames = filenames.slice(0, 50);

  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ filenames: limitedFilenames }),
    });

    if (!response.ok) throw new Error(`Erro no Proxy Vercel: ${response.status} ${response.statusText}`);

    const data = await response.json() as ParsedFile[];
    if (Array.isArray(data)) {
        return limitedFilenames.map(originalName => {
            const found = data.find(d => d.filename === originalName);
            return found || { filename: originalName, client: "Geral" };
        });
    }
    return limitedFilenames.map(f => ({ filename: f, client: "Geral" }));
  } catch (error) {
    console.error("Erro na chamada da IA (Via Proxy):", error);
    return limitedFilenames.map(name => ({ filename: name, client: "Geral" }));
  }
};

/**
 * Gera um relatório executivo em Markdown analisando os KPIs do dashboard.
 * Utiliza o proxy Vercel existente com type='report'.
 */
export const generateDashboardReport = async (kpis: KPIReportPayload): Promise<string> => {
  if (!auth || !auth.currentUser) {
    throw new Error("Autenticação necessária para gerar relatório.");
  }

  const token = await auth.currentUser.getIdToken();

  const prompt = `Você é um analista sênior de projetos de engenharia. Analise os KPIs abaixo e gere um relatório executivo em português.

## Dados dos KPIs (JSON)
${JSON.stringify(kpis, null, 2)}

## Instruções
Gere um relatório com exatamente estas seções em Markdown:
### Visão Geral
(2-3 frases resumindo o estado geral dos projetos)

### Pontos de Atenção
(bullet points com as disciplinas ou clientes com pior desempenho e por quê)

### Oportunidades de Melhoria
(bullet points com ações concretas e priorizadas)

### Conclusão
(1-2 frases finais)

Seja direto, use dados do JSON para embasar cada afirmação. Use **negrito** para destacar números e nomes importantes.`;

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type: 'report', prompt }),
  });

  if (!response.ok) {
    throw new Error(`Erro ao gerar relatório: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  // Accept both { report: string } and plain string response shapes
  if (typeof data === 'string') return data;
  if (data?.report) return data.report;
  if (data?.text) return data.text;
  if (data?.result) return data.result;
  throw new Error("Formato de resposta inesperado do proxy.");
};