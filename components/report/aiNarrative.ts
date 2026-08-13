/**
 * Análise executiva escrita por IA (Gemini) a partir do resumo de KPIs do
 * período. A chamada vai para a API serverless em `vercel-api/api/generate-report-narrative.ts`
 * — a API key do Gemini nunca chega ao browser, e a API só aceita usuários
 * autenticados no Firebase (o ID token viaja no header Authorization).
 *
 * O payload aqui espelha `vercel-api/lib/narrativePayload.ts` (projetos de
 * TS separados, sem import cruzado entre front e a API).
 */
import { auth } from '../../firebase';
import { META_IAPR, META_OTD } from '../dashboardShared';
import { ReportSummaryInput } from './emailSummary';

// URL pública da API (protegida por login do Firebase, não pela URL em si) — fixa no
// código para não depender de um .env presente no momento do build. VITE_REPORT_API_URL
// continua funcionando como override, útil para testar contra um deploy de preview.
const DEFAULT_REPORT_API_URL = 'https://kpi-cerne-report-api.vercel.app/api/generate-report-narrative';
const REPORT_API_URL =
  (import.meta.env.VITE_REPORT_API_URL as string | undefined) || DEFAULT_REPORT_API_URL;

/** Quantos atrasados mandar como exemplo para a IA — mesmo teto usado no email. */
const MAX_ATRASADOS_NO_PROMPT = 5;

export interface NarrativePayload {
  periodoLabel: string;
  totalProjects: number;
  obras: string[];
  disciplinas: string[];
  emExecucao: number;
  arquivosEmTrabalho: number;
  aguardandoCliente: number;
  atrasados: {
    total: number;
    exemplos: { obra: string; disciplina: string; diasAtraso: number }[];
  };
  vencendoEm1Dia: number;
  entregas30d: number;
  entregas30dAnterior: number;
  otd: { percentual: number | null; meta: number; amostras: number };
  iapr: { percentual: number | null; meta: number; ciclosConcluidos: number };
  cargaTrabalho: { arquivos: number; obras: number; reemissoes: number };
  motivosRevisao: { categoria: string; quantidade: number }[];
  filtroDeStatusAtivo: boolean;
}

export function buildNarrativePayload(input: ReportSummaryInput): NarrativePayload {
  const { stats, filters, totalProjects, periodoLabel } = input;
  const atrasados = stats.alerts.filter((a) => a.slaStatus === 'ATRASADO');
  const vencendo = stats.alerts.filter((a) => a.slaStatus === 'VENCENDO');

  return {
    periodoLabel,
    totalProjects,
    obras: filters.clients,
    disciplinas: filters.disciplines,
    emExecucao: stats.groupsInProgress,
    arquivosEmTrabalho: stats.totalWipFiles,
    aguardandoCliente: stats.groupsWaiting,
    atrasados: {
      total: atrasados.length,
      exemplos: atrasados.slice(0, MAX_ATRASADOS_NO_PROMPT).map((a) => ({
        obra: a.project.client,
        disciplina: a.project.discipline,
        diasAtraso: a.daysLate,
      })),
    },
    vencendoEm1Dia: vencendo.length,
    entregas30d: stats.deliveries30,
    entregas30dAnterior: stats.deliveriesPrev30,
    otd: {
      percentual: stats.totalSlaMeasured > 0 ? stats.otdPercentage : null,
      meta: META_OTD,
      amostras: stats.totalSlaMeasured,
    },
    iapr: {
      percentual: stats.closedGroups > 0 ? stats.iaprGlobal : null,
      meta: META_IAPR,
      ciclosConcluidos: stats.closedGroups,
    },
    cargaTrabalho: stats.volumeResumo,
    motivosRevisao: Object.entries(stats.reasonCategoryTotals).map(([categoria, quantidade]) => ({
      categoria,
      quantidade,
    })),
    filtroDeStatusAtivo: filters.statuses.length > 0,
  };
}

export type NarrativeState =
  | { status: 'loading' }
  | { status: 'done'; text: string }
  | { status: 'error'; message: string };

/** Chama a API de análise e retorna o texto gerado. Lança em caso de falha. */
export async function generateNarrative(payload: NarrativePayload): Promise<string> {
  if (!auth?.currentUser) throw new Error('Usuário não autenticado.');

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(REPORT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Falha na API (HTTP ${response.status}).`);
  }
  return data.narrative as string;
}
