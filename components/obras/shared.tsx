import React from 'react';
import { differenceInDays, isValid, parseISO } from 'date-fns';
import { ClientDoc, SiteType, ObraStatus } from '../../types';
import { getEffectiveStatus } from '../../utils';

export const today = new Date().toISOString().split('T')[0];

// --- SLA (prazo de entrega dos projetos) ---
//
// Duas formas de resultado:
//   - "em aberto" (resolved: false): SLA vivo, cresce contra o dia de hoje — é o que existia
//     antes. isOverdue/isAtRisk/progress fazem sentido aqui.
//   - "resolvido" (resolved: true): a entrega dos projetos foi marcada (projectsDeliveredAt).
//     O veredito fica fixo na data da entrega — não cresce mais contra "hoje". isOverdue/
//     isAtRisk somem (o prazo contratual foi cumprido ou não NAQUELE dia, ponto final); o que
//     roda depois é revisão.

export interface SlaOpen {
  resolved: false;
  end: Date;
  remaining: number;
  progress: number | null;
  isOverdue: boolean;
  isAtRisk: boolean;
}

export interface SlaResolved {
  resolved: true;
  end: Date | null; // prazo contratual, se cadastrado (pode faltar em obras antigas)
  deliveredAt: Date;
  isLate: boolean; // só é significativo quando `end` existe
  daysLate: number; // >0 = dias de atraso na entrega; <=0 = entregue no prazo (0 = no dia)
}

export type SlaInfo = SlaOpen | SlaResolved;

export function getSlaInfo(client: ClientDoc): SlaInfo | null {
  if (client.projectsDeliveredAt && isValid(parseISO(client.projectsDeliveredAt))) {
    const deliveredAt = parseISO(client.projectsDeliveredAt);
    const end =
      client.projectDeadlineDate && isValid(parseISO(client.projectDeadlineDate))
        ? parseISO(client.projectDeadlineDate)
        : null;
    const daysLate = end ? differenceInDays(deliveredAt, end) : 0;
    return { resolved: true, end, deliveredAt, isLate: daysLate > 0, daysLate };
  }

  if (!client.projectDeadlineDate || !isValid(parseISO(client.projectDeadlineDate))) return null;
  try {
    const end = parseISO(client.projectDeadlineDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const remaining = differenceInDays(end, now);
    const isOverdue = now > end;

    // Progresso só é computável se soubermos o início da obra; sem ele, mostra
    // apenas "faltam N dias"/"venceu há N dias", sem barra de progresso.
    const start =
      client.obraStartDate && isValid(parseISO(client.obraStartDate))
        ? parseISO(client.obraStartDate)
        : null;
    const totalSpan = start ? differenceInDays(end, start) : 0;
    const progress =
      start && totalSpan > 0
        ? Math.min(100, Math.max(0, (differenceInDays(now, start) / totalSpan) * 100))
        : null;

    return {
      resolved: false,
      end,
      remaining,
      progress,
      isOverdue,
      isAtRisk: !isOverdue && remaining <= 7,
    };
  } catch {
    return null;
  }
}

// --- Régua de cronograma (Início da obra → Prazo dos projetos → Fim da obra) ---
//
// Diferente do SLA (que mede só Início → Prazo dos projetos), a régua posiciona os
// três marcos numa mesma linha do tempo e marca onde "hoje" cai. A escala vai do
// marco mais antigo ao mais recente entre os que existirem — com menos de dois
// marcos não há linha do tempo para desenhar e a função devolve null.

export interface ScheduleMark {
  key: 'start' | 'deadline' | 'delivered' | 'end';
  label: string;
  date: Date;
  pct: number; // 0-100 na escala da régua
}

export interface ScheduleInfo {
  marks: ScheduleMark[]; // em ordem cronológica
  todayPct: number; // já limitado a 0-100
  hasStarted: boolean;
  hasEnded: boolean;
}

export function getScheduleInfo(client: ClientDoc): ScheduleInfo | null {
  const parse = (v?: string) => (v && isValid(parseISO(v)) ? parseISO(v) : null);
  const candidates: { key: ScheduleMark['key']; label: string; date: Date | null }[] = [
    { key: 'start', label: 'Início da obra', date: parse(client.obraStartDate) },
    { key: 'deadline', label: 'Prazo dos projetos', date: parse(client.projectDeadlineDate) },
    { key: 'delivered', label: 'Entrega dos projetos', date: parse(client.projectsDeliveredAt) },
    { key: 'end', label: 'Fim da obra', date: parse(client.expectedCompletionDate) },
  ];

  const present = candidates.filter(
    (m): m is { key: ScheduleMark['key']; label: string; date: Date } => m.date !== null,
  );
  if (present.length < 2) return null;

  present.sort((a, b) => a.date.getTime() - b.date.getTime());
  const min = present[0].date.getTime();
  const max = present[present.length - 1].date.getTime();
  if (max <= min) return null; // datas coincidentes: sem escala possível

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nowMs = now.getTime();
  const pctOf = (ms: number) => ((ms - min) / (max - min)) * 100;

  return {
    marks: present.map((m) => ({ ...m, pct: pctOf(m.date.getTime()) })),
    todayPct: Math.min(100, Math.max(0, pctOf(nowMs))),
    hasStarted: nowMs >= min,
    hasEnded: nowMs > max,
  };
}

// --- Formulário de cadastro/edição de obra ---

export interface FormState {
  name: string;
  location: string;
  type: SiteType;
  numberOfBases: number;
  bases: string[]; // rodovia: bases nomeadas (fonte da instanciação no Catálogo)
  obraStartDate: string;
  obraEndDate: string; // mapeia para ClientDoc.expectedCompletionDate (mesma propriedade, rótulo novo)
  projectDeadlineDate: string;
  projectsDeliveredAt: string; // data em que o pacote de projetos foi entregue — fecha o SLA
  fabricationStartDate: string; // início da fabricação do aço — alimenta a aba Estruturas
  fabricationEndDate: string; // '' = fabricação ainda em andamento
  // SLA antigo (legado) — somente leitura no formulário; nenhum input escreve nestes campos,
  // então eles nunca entram no payload de salvar e o valor em Firestore é preservado.
  contractDate: string;
  deadlineDays: number | undefined;
  obraStatus: ObraStatus;
  completedAt: string;
  responsavel: string;
  observacoes: string;
}

export const defaultForm: FormState = {
  name: '',
  location: '',
  type: SiteType.CONSTRUCTION_SITE,
  numberOfBases: 0,
  bases: [],
  obraStartDate: '',
  obraEndDate: '',
  projectDeadlineDate: '',
  projectsDeliveredAt: '',
  fabricationStartDate: '',
  fabricationEndDate: '',
  contractDate: '',
  deadlineDays: undefined,
  obraStatus: ObraStatus.ACTIVE,
  completedAt: '',
  responsavel: '',
  observacoes: '',
};

export function clientToForm(c: ClientDoc): FormState {
  return {
    name: c.name,
    location: c.location || '',
    type: c.type,
    numberOfBases: c.numberOfBases || 0,
    bases: c.bases || [],
    obraStartDate: c.obraStartDate || '',
    obraEndDate: c.expectedCompletionDate || '',
    projectDeadlineDate: c.projectDeadlineDate || '',
    projectsDeliveredAt: c.projectsDeliveredAt || '',
    fabricationStartDate: c.fabricationStartDate || '',
    fabricationEndDate: c.fabricationEndDate || '',
    contractDate: c.contractDate || '',
    deadlineDays: c.deadlineDays,
    obraStatus: getEffectiveStatus(c),
    completedAt: c.completedAt || '',
    responsavel: c.responsavel || '',
    observacoes: c.observacoes || '',
  };
}

// --- Primitivos visuais do formulário ---

export const inputCls =
  'w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-shadow';

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
      {children}
    </label>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-1">
        {title}
      </h4>
      {children}
    </div>
  );
}
