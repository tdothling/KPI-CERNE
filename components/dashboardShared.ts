import { Discipline, ProjectFile, RevisionReason } from '../types';

// Metas corporativas dos indicadores (ajustar aqui quando a meta mudar).
// Ficam neste módulo para o Dashboard e o Relatório lerem o mesmo número.
export const META_OTD = 85; // % de entregas dentro da SLA
export const META_IAPR = 70; // % de aprovação sem revisão

export const DISCIPLINE_COLORS: Record<string, string> = {
  [Discipline.ARCHITECTURE]: '#8e1c3e',
  [Discipline.STRUCTURE]: '#64748b',
  [Discipline.FOUNDATION]: '#94a3b8',
  [Discipline.HYDRAULIC]: '#06b6d4',
  [Discipline.ELECTRICAL]: '#eab308',
  [Discipline.DATA]: '#8b5cf6',
  [Discipline.SPDA]: '#ef4444',
  [Discipline.HVAC]: '#10b981',
  [Discipline.OTHER]: '#f472b6',
};

// Causa gerencial de cada motivo de revisão: interna (processo/equipe) x externa (cliente/escopo)
export type ReasonCategory = 'Interna' | 'Externa' | 'Outros';

export const REASON_CATEGORY: Record<string, ReasonCategory> = {
  [RevisionReason.INTERNAL_ERROR]: 'Interna',
  [RevisionReason.COMPATIBILITY]: 'Interna',
  [RevisionReason.CLIENT_REQUEST]: 'Externa',
  [RevisionReason.SCOPE_CHANGE]: 'Externa',
  [RevisionReason.PROJECT_CHANGE]: 'Externa',
  [RevisionReason.ADDENDUM]: 'Externa',
  [RevisionReason.OTHER]: 'Outros',
};

// Paleta validada (validate_palette.js) por modo; identidade acompanha a categoria, nunca a posição
export const CATEGORY_COLORS_LIGHT: Record<ReasonCategory, string> = {
  Interna: '#f43f5e',
  Externa: '#0ea5e9',
  Outros: '#f59e0b',
};

export const CATEGORY_COLORS_DARK: Record<ReasonCategory, string> = {
  Interna: '#f43f5e',
  Externa: '#0284c7',
  Outros: '#d97706',
};

export interface SlaAlert {
  project: ProjectFile;
  slaStatus: 'ATRASADO' | 'VENCENDO';
  deadline: Date;
  daysLate: number;
}

// Forma do `stats` calculado pelo Dashboard. Está escrita à mão de propósito:
// o TypeScript compara este contrato com o retorno real do useMemo no ponto onde
// o relatório é montado, então qualquer campo que mude de forma quebra o build
// em vez de sair errado no PDF enviado ao cliente.
export interface DashboardStats {
  executionData: {
    name: string;
    avgPrelim: number;
    avgExec: number;
    nPrelim: number;
    nExec: number;
  }[];
  fttData: { name: string; rate: number; n: number }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  volumeData: any[];
  volumeResumo: { files: number; obras: number; revisoes: number };
  reasonsData: { name: string; count: number; category: ReasonCategory }[];
  clientResponseData: { name: string; avgDays: number; n: number }[];
  cycleTimeData: { name: string; avgCycle: number; n: number }[];
  otdPercentage: number;
  otdChartData: { name: string; value: number; color: string }[];
  totalSlaMeasured: number;
  alerts: SlaAlert[];
  reasonCategoryTotals: Record<ReasonCategory, number>;
  totalReasons: number;
  iaprGlobal: number;
  closedGroups: number;
  groupsInProgress: number;
  groupsWaiting: number;
  deliveries30: number;
  deliveriesPrev30: number;
  monthlyData: {
    key: string;
    label: string;
    entregas: number;
    iniciados: number;
    otd: number | null;
    otdN: number;
    iapr: number | null;
    iaprN: number;
  }[];
  totalWipFiles: number;
}
