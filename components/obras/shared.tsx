import React from 'react';
import { differenceInDays, addDays, parseISO } from 'date-fns';
import { ClientDoc, SiteType, ObraStatus } from '../../types';
import { getEffectiveStatus } from '../../utils';

export const today = new Date().toISOString().split('T')[0];

// --- SLA (prazo contratual) ---

export function getSlaInfo(client: ClientDoc) {
  if (!client.contractDate || client.deadlineDays === undefined) return null;
  try {
    const start = parseISO(client.contractDate);
    const end = addDays(start, client.deadlineDays);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsed = Math.max(0, differenceInDays(today, start));
    const remaining = differenceInDays(end, today);
    const progress = Math.min(100, Math.max(0, (elapsed / client.deadlineDays) * 100));
    const isOverdue = today > end;
    return { end, elapsed, remaining, progress, isOverdue, isAtRisk: !isOverdue && remaining <= 7 };
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
  contractDate: string;
  deadlineDays: number | undefined;
  obraStatus: ObraStatus;
  completedAt: string;
  expectedCompletionDate: string;
  responsavel: string;
  observacoes: string;
}

export const defaultForm: FormState = {
  name: '',
  location: '',
  type: SiteType.CONSTRUCTION_SITE,
  numberOfBases: 0,
  bases: [],
  contractDate: '',
  deadlineDays: undefined,
  obraStatus: ObraStatus.ACTIVE,
  completedAt: '',
  expectedCompletionDate: '',
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
    contractDate: c.contractDate || '',
    deadlineDays: c.deadlineDays,
    obraStatus: getEffectiveStatus(c),
    completedAt: c.completedAt || '',
    expectedCompletionDate: c.expectedCompletionDate || '',
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
