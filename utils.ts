import {
  format,
  parseISO,
  isValid,
  differenceInBusinessDays,
  isWeekend,
  isWithinInterval,
  addDays,
} from 'date-fns';
import { Period, Discipline, Status, ProjectFile, ClientDoc, ObraStatus } from './types';

// Status efetivo da obra: respeita o status explícito; obras antigas sem o campo
// são inferidas pelo completedAt (retrocompatibilidade)
export const getEffectiveStatus = (client: ClientDoc): ObraStatus => {
  if (client.obraStatus) return client.obraStatus;
  if (client.completedAt) return ObraStatus.COMPLETED;
  return ObraStatus.ACTIVE;
};

export const getProjectBaseName = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  const match = nameWithoutExt.match(/^(.*?)\s\[R\d+\]$/);
  return match ? match[1] : nameWithoutExt;
};

export const getRevisionNumber = (filename: string): number => {
  const match = filename.match(/\[R(\d+)\]/);
  return match ? parseInt(match[1], 10) : 0;
};

export const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = parseISO(dateStr);
  return isValid(date) ? format(date, 'dd/MM/yyyy') : '-';
};

export const calculateBusinessDaysWithHolidays = (
  start: Date,
  end: Date,
  holidays: string[],
  startPeriod: Period = 'MANHA',
  endPeriod: Period = 'TARDE',
) => {
  if (!isValid(start) || !isValid(end)) return 0;
  if (end < start) return 0;

  // Cálculo base de dias úteis inteiros (inclusivo)
  // Ex: Seg a Seg = 1 dia
  // Ex: Seg a Ter = 2 dias
  let days = differenceInBusinessDays(end, start) + 1;

  // Subtração de feriados
  if (holidays && holidays.length > 0) {
    let holidaysOnWeekdays = 0;
    // Itera apenas sobre feriados relevantes (dentro do intervalo)
    for (const h of holidays) {
      const hDate = parseISO(h);
      if (isValid(hDate) && isWithinInterval(hDate, { start, end })) {
        if (!isWeekend(hDate)) {
          holidaysOnWeekdays++;
        }
      }
    }
    days -= holidaysOnWeekdays;
  }

  // Se dias base for <= 0 (devido a feriados ou erro), retorna 0
  if (days <= 0) return 0;

  // Ajuste de Frações de Dia com base no Período
  // Lógica:
  // Se começou a TARDE, "perdeu" a manhã do primeiro dia (-0.5)
  // Se terminou de MANHA, "perdeu" a tarde do último dia (-0.5)

  let adjustment = 0;

  if (startPeriod === 'TARDE') {
    adjustment -= 0.5;
  }

  if (endPeriod === 'MANHA') {
    adjustment -= 0.5;
  }

  const finalDays = days + adjustment;

  // Garante que não retorne negativo
  return Math.max(0, finalDays);
};

export const calculateNetExecutionDuration = (
  project: Pick<ProjectFile, 'startDate' | 'endDate' | 'startPeriod' | 'endPeriod' | 'pauses'>,
  holidays: string[],
): number => {
  if (!project.startDate || !isValid(parseISO(project.startDate))) return 0;

  const start = parseISO(project.startDate);
  const end =
    project.endDate && isValid(parseISO(project.endDate)) ? parseISO(project.endDate) : new Date();

  if (start > end) return 0;

  const holidaySet = new Set(holidays);
  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Project boundary slots
  const projStartSlot = `${startStr}_${project.startPeriod || 'MANHA'}`;
  const projEndSlot = `${endStr}_${project.endPeriod || 'TARDE'}`;

  // Pre-compute pause boundary slots
  const pauseSlots = (project.pauses ?? [])
    .filter((p) => !!p.startDate)
    .map((p) => ({
      start: `${p.startDate}_${p.startPeriod || 'MANHA'}`,
      end: `${p.endDate || todayStr}_${p.endPeriod || 'TARDE'}`,
    }));

  let cursorDate = start;
  let netSlots = 0;
  const periods: Period[] = ['MANHA', 'TARDE'];

  while (cursorDate <= end) {
    const dateStr = format(cursorDate, 'yyyy-MM-dd');

    if (!isWeekend(cursorDate) && !holidaySet.has(dateStr)) {
      for (const p of periods) {
        const currentSlot = `${dateStr}_${p}`;

        // Project window check
        if (currentSlot < projStartSlot || currentSlot > projEndSlot) {
          continue;
        }

        // Pause check (INCLUSIVE)
        const inPause = pauseSlots.some((ps) => currentSlot >= ps.start && currentSlot <= ps.end);

        if (!inPause) {
          netSlots++;
        }
      }
    }

    cursorDate = addDays(cursorDate, 1);
  }

  return netSlots * 0.5;
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'Aprovado':
      return 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400';
    case 'Reprovado':
      return 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400';
    case 'Aguardando Aprovação':
      return 'text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400';
    case 'Execução Concluída':
      return 'text-violet-700 bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-400';
    case 'Em Andamento':
      return 'text-brand-700 bg-brand-50 border-brand-200 dark:bg-brand-900/40 dark:border-brand-800 dark:text-brand-400';
    case 'Revisado':
      return 'text-slate-500 bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 line-through decoration-slate-400 decoration-2';
    case 'Executivo Gerado':
      return 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-400';
    case 'Planejamento':
      return 'text-slate-600 bg-slate-100 border-slate-300 dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-300';
    case 'Lista Pronta':
      return 'text-amber-700 bg-amber-100 border-amber-200 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-400';
    case 'Em Cotação':
      return 'text-orange-700 bg-orange-100 border-orange-200 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-400';
    case 'Comprado':
      return 'text-blue-700 bg-blue-100 border-blue-200 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400';
    case 'Entregue':
      return 'text-emerald-700 bg-emerald-100 border-emerald-200 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400';
    case 'Cancelado':
      return 'text-slate-500 bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 line-through';
    default:
      return 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400';
  }
};

export const detectDiscipline = (text: string): Discipline | null => {
  const normalized = text.toLowerCase();
  if (normalized.includes('arq')) return Discipline.ARCHITECTURE;
  if (normalized.includes('estrut')) return Discipline.STRUCTURE;
  if (normalized.includes('fund')) return Discipline.FOUNDATION;
  if (normalized.includes('hidr')) return Discipline.HYDRAULIC;
  if (normalized.includes('eletr') || normalized.includes('elétr')) return Discipline.ELECTRICAL;
  if (normalized.includes('dados') || normalized.includes('logica')) return Discipline.DATA;
  if (normalized.includes('spda')) return Discipline.SPDA;
  if (normalized.includes('clima') || normalized.includes('hvac') || normalized.includes('ar cond'))
    return Discipline.HVAC;
  return null;
};

// Security: Whitelist de extensões permitidas
export const ALLOWED_EXTENSIONS = ['.dwg', '.rvt', '.pln', '.pdf', '.dxf', '.csv', '.xlsx', '.xls'];

// Security: Verificação básica de arquivo
export const validateFile = (file: File): boolean => {
  const lowerName = file.name.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasValidExt) {
    console.warn(`Arquivo bloqueado (extensão não permitida): ${file.name}`);
    return false;
  }
  return true;
};

// --- STATUS MACHINE (Centralizado) ---

// Infere o status correto a partir das datas preenchidas.
// Preserva REVISED, APPROVED e REJECTED se já estiverem definidos.
export const inferStatusFromDates = (project: Partial<ProjectFile>): Status => {
  const currentStatus = project.status;

  // Status terminais: REVISED e SUPERSEDED nunca devem ser sobrescritos automaticamente
  if (currentStatus === Status.REVISED) return Status.REVISED;
  if (currentStatus === Status.SUPERSEDED) return Status.SUPERSEDED;

  if (project.feedbackDate) {
    // Se tem feedback, preserva APPROVED ou REJECTED; caso contrário, assume APPROVED
    if (currentStatus === Status.REJECTED) return Status.REJECTED;
    if (currentStatus === Status.APPROVED) return Status.APPROVED;
    return Status.APPROVED;
  }
  if (project.sendDate) return Status.WAITING_APPROVAL;
  if (project.endDate) return Status.DONE;
  return Status.IN_PROGRESS;
};

// Valida se uma transição de workflow é permitida a partir do status atual.
// Retorna true se a ação pode ser executada no status dado.
export const canTransitionTo = (
  currentStatus: Status,
  action: 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT',
): boolean => {
  switch (action) {
    case 'COMPLETE':
      return currentStatus === Status.IN_PROGRESS;
    case 'SEND':
      return currentStatus === Status.DONE;
    case 'APPROVE':
    case 'REJECT':
      return currentStatus === Status.WAITING_APPROVAL;
    default:
      return false;
  }
};

// Identifica se um status é terminal (não deveria receber mais edições automáticas)
export const isTerminalStatus = (status: Status): boolean => {
  return status === Status.REVISED || status === Status.SUPERSEDED;
};

// Chave para casar Preliminar ↔ Executivo do mesmo entregável:
// Cliente + Disciplina + nome base limpo (sem _EXEC e sem [Rn])
export const getExecutiveMatchKey = (
  p: Pick<ProjectFile, 'groupId' | 'filename' | 'client' | 'discipline'>,
): string => {
  const baseName =
    p.groupId ||
    getProjectBaseName(p.filename)
      .replace(/_EXEC/gi, '')
      .replace(/\s*\[R\d+\]/gi, '')
      .trim()
      .toLowerCase();
  return `${p.client}|${p.discipline}|${baseName}`;
};

// Soma N dias úteis a uma data, pulando fins de semana e feriados
export const addBusinessDaysWithHolidays = (
  from: Date,
  businessDays: number,
  holidays: string[],
): Date => {
  const holidaySet = new Set(holidays);
  let date = from;
  let remaining = businessDays;
  let guard = 0;
  while (remaining > 0 && guard < 3650) {
    date = addDays(date, 1);
    guard++;
    if (!isWeekend(date) && !holidaySet.has(format(date, 'yyyy-MM-dd'))) remaining--;
  }
  return date;
};

// Prazo efetivo de UMA entrega (registro), já resolvido para Date | null.
// targetDate no próprio registro sempre vence; senão, só a 1ª entrega (isFirstCycle)
// herda o prazo padrão da obra (projectDeadlineDate); entregas posteriores sem targetDate
// próprio ficam sem prazo — não são medidas por SLA (evita reabrir "atrasado" numa revisão
// pós-certificadora combinada à parte com o cliente).
export const resolveEntregavelDeadline = (
  targetDate: string | undefined,
  isFirstCycle: boolean,
  projectDeadlineDate: string | undefined,
): Date | null => {
  if (targetDate && isValid(parseISO(targetDate))) return parseISO(targetDate);
  if (isFirstCycle && projectDeadlineDate && isValid(parseISO(projectDeadlineDate))) {
    return parseISO(projectDeadlineDate);
  }
  return null;
};

// Está atrasado hoje, dado um prazo já resolvido? Mesma régua usada em Canteiro e Carteira:
// se já tem endDate, compara a entrega em si; se ainda está em aberto, compara com hoje.
export const isEntregavelOverdue = (
  deadline: Date | null,
  endDate: string | undefined,
  isOpenStatus: boolean,
): boolean => {
  if (!deadline) return false;
  const deadlineStr = format(deadline, 'yyyy-MM-dd');
  if (endDate) return endDate > deadlineStr;
  if (isOpenStatus) return new Date().toISOString().split('T')[0] > deadlineStr;
  return false;
};
