
import { format, parseISO, isValid, differenceInBusinessDays, isWeekend, isWithinInterval } from 'date-fns';
import { Period, Discipline } from './types';

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

export const calculateBusinessDaysWithHolidays = (
    start: Date,
    end: Date,
    holidays: string[],
    startPeriod: Period = 'MANHA',
    endPeriod: Period = 'TARDE'
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

export const getStatusColor = (status: string) => {
    switch (status) {
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

export const detectDiscipline = (text: string): Discipline | null => {
    const normalized = text.toLowerCase();
    if (normalized.includes('arq')) return Discipline.ARCHITECTURE;
    if (normalized.includes('estrut')) return Discipline.STRUCTURE;
    if (normalized.includes('fund')) return Discipline.FOUNDATION;
    if (normalized.includes('hidr')) return Discipline.HYDRAULIC;
    if (normalized.includes('eletr') || normalized.includes('elétr')) return Discipline.ELECTRICAL;
    if (normalized.includes('dados') || normalized.includes('logica')) return Discipline.DATA;
    if (normalized.includes('spda')) return Discipline.SPDA;
    if (normalized.includes('clima') || normalized.includes('hvac') || normalized.includes('ar cond')) return Discipline.HVAC;
    return null;
};

export const extractMetadataFromMaterialFilename = (filename: string, defaultClient: string) => {
    const discipline = detectDiscipline(filename) || Discipline.OTHER;
    return { discipline, client: defaultClient };
};

export const generateRevisionFilename = (name: string): string => {
    const regex = /^(.*)\s\[R(\d+)\](\.[^.]*)?$/;
    const match = name.match(regex);
    if (match) {
        const base = match[1];
        const num = parseInt(match[2], 10) + 1;
        const ext = match[3] || '';
        return `${base} [R${num}]${ext}`;
    } else {
        const lastDotIndex = name.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            const base = name.substring(0, lastDotIndex);
            const ext = name.substring(lastDotIndex);
            return `${base} [R1]${ext}`;
        }
        return `${name} [R1]`;
    }
};

// Security: Whitelist de extensões permitidas
export const ALLOWED_EXTENSIONS = ['.dwg', '.rvt', '.pln', '.pdf', '.dxf', '.csv', '.xlsx', '.xls'];

// Security: Verificação básica de arquivo
export const validateFile = (file: File): boolean => {
    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    if (!hasValidExt) {
        console.warn(`Arquivo bloqueado (extensão não permitida): ${file.name}`);
        return false;
    }
    return true;
};
