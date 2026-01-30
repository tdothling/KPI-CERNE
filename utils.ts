
import { format, parseISO, isValid, differenceInBusinessDays, isWeekend, isWithinInterval } from 'date-fns';

export const getProjectBaseName = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
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

export const calculateBusinessDaysWithHolidays = (start: Date, end: Date, holidays: string[]) => {
    if (!isValid(start) || !isValid(end)) return 0;
    if (end < start) return 0;

    // Adicionado + 1 para tornar o cálculo inclusivo (ex: Inicio e Fim no mesmo dia = 1 dia de trabalho)
    let days = differenceInBusinessDays(end, start) + 1;
    
    // Optimization: Se não houver feriados, retorno rápido
    if (!holidays || holidays.length === 0) return Math.max(0, days);

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
    return Math.max(0, days - holidaysOnWeekdays);
};

export const getStatusColor = (status: string) => {
    switch(status) { 
        case 'Aprovado': return 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400'; 
        case 'Reprovado': return 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400'; 
        case 'Aguardando Aprovação': return 'text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400'; 
        case 'Execução Concluída': return 'text-violet-700 bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-400'; 
        case 'Em Andamento': return 'text-brand-700 bg-brand-50 border-brand-200 dark:bg-brand-900/40 dark:border-brand-800 dark:text-brand-400'; 
        case 'Revisado': return 'text-slate-500 bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 line-through decoration-slate-400 decoration-2'; 
        case 'Comprado': return 'text-blue-700 bg-blue-100 border-blue-200 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400';
        case 'Entregue': return 'text-emerald-700 bg-emerald-100 border-emerald-200 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400';
        case 'Pendente': return 'text-amber-700 bg-amber-100 border-amber-200 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-400';
        case 'Cancelado': return 'text-slate-500 bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 line-through';
        default: return 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400'; 
    }
};
