import React from 'react';
import { differenceInDays, isValid, parseISO } from 'date-fns';
import { ClientDoc, SiteType, ObraStatus } from '../../types';
import { getEffectiveStatus } from '../../utils';

export const today = new Date().toISOString().split('T')[0];

// --- SLA (prazo de entrega dos projetos) ---

export function getSlaInfo(client: ClientDoc) {
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

    return { end, remaining, progress, isOverdue, isAtRisk: !isOverdue && remaining <= 7 };
  } catch {
    return null;
  }
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
