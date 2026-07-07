import { parseISO, isValid, format } from 'date-fns';
import { SupplyOrder, SupplyStatus, SupplyPriority, Period, SupplyStatusEvent } from '../../types';
import { calculateBusinessDaysWithHolidays } from '../../utils';

// Ordem canônica do ciclo (Cancelado fica fora do fluxo linear)
export const SUPPLY_STATUS_ORDER: SupplyStatus[] = [
    SupplyStatus.PLANNING,
    SupplyStatus.READY,
    SupplyStatus.QUOTING,
    SupplyStatus.BOUGHT,
    SupplyStatus.DELIVERED,
];

// Colunas exibidas no Kanban (ciclo + Cancelado ao final)
export const SUPPLY_KANBAN_COLUMNS: SupplyStatus[] = [...SUPPLY_STATUS_ORDER, SupplyStatus.CANCELED];

const stageIndex = (s: SupplyStatus) => SUPPLY_STATUS_ORDER.indexOf(s);

// Matriz de transições:
// - Avanço livre no ciclo (pode pular "Em Cotação"), mas Entregue só a partir de Comprado
// - Regressão de apenas 1 etapa (correção); Entregue→Comprado desfaz a entrega
// - Cancelado a partir de qualquer etapa não-entregue; reativação volta ao Planejamento
export const canSupplyTransition = (from: SupplyStatus, to: SupplyStatus): boolean => {
    if (from === to) return false;

    if (to === SupplyStatus.CANCELED) return from !== SupplyStatus.DELIVERED;
    if (from === SupplyStatus.CANCELED) return to === SupplyStatus.PLANNING;

    const fromIdx = stageIndex(from);
    const toIdx = stageIndex(to);
    if (fromIdx === -1 || toIdx === -1) return false;

    if (to === SupplyStatus.DELIVERED) return from === SupplyStatus.BOUGHT;
    if (toIdx > fromIdx) return true;          // avanço (pode pular etapas)
    return fromIdx - toIdx === 1;              // regressão de 1 etapa
};

// Transições que exigem confirmação de data em modal (as demais gravam data automática)
export const transitionNeedsDate = (to: SupplyStatus): boolean =>
    to === SupplyStatus.BOUGHT || to === SupplyStatus.DELIVERED;

export const isSupplyActive = (order: SupplyOrder): boolean =>
    order.status !== SupplyStatus.DELIVERED && order.status !== SupplyStatus.CANCELED;

// Atrasado = tem data-limite, ela já passou e o pedido ainda não foi entregue/cancelado
export const isSupplyOverdue = (order: SupplyOrder): boolean => {
    if (!order.neededBy || !isSupplyActive(order)) return false;
    return order.neededBy < format(new Date(), 'yyyy-MM-dd');
};

// Lead time em dias úteis da criação até a entrega (ou até hoje se em andamento)
export const getSupplyLeadTimeDays = (order: SupplyOrder, holidays: string[]): number => {
    if (!order.createdAt) return 0;
    const start = parseISO(order.createdAt);
    if (!isValid(start)) return 0;
    const delivered = order.milestones?.deliveredAt;
    const end = delivered && isValid(parseISO(delivered)) ? parseISO(delivered) : new Date();
    return calculateBusinessDaysWithHolidays(
        start, end, holidays,
        order.createdPeriod || 'MANHA',
        (delivered ? order.milestones?.deliveredPeriod : undefined) || 'TARDE'
    );
};

// Campo de milestone correspondente a cada status (usado ao gravar e ao limpar regressões)
const MILESTONE_FIELDS: Partial<Record<SupplyStatus, { at: keyof SupplyOrder['milestones']; period?: keyof SupplyOrder['milestones'] }>> = {
    [SupplyStatus.READY]: { at: 'readyAt', period: 'readyPeriod' },
    [SupplyStatus.QUOTING]: { at: 'quotingAt', period: 'quotingPeriod' },
    [SupplyStatus.BOUGHT]: { at: 'boughtAt', period: 'boughtPeriod' },
    [SupplyStatus.DELIVERED]: { at: 'deliveredAt', period: 'deliveredPeriod' },
    [SupplyStatus.CANCELED]: { at: 'canceledAt' },
};

export interface StatusChangeInput {
    order: SupplyOrder;
    to: SupplyStatus;
    date: string;       // ISO
    period: Period;
    user?: string;
    comment?: string;
    deliverAllItems?: boolean; // ao entregar, marcar itens pendentes como entregues
}

export interface StatusChangePatch {
    changes: Record<string, any>;      // dot-paths para patchSupplyOrderInDb
    event: SupplyStatusEvent;          // evento a anexar via arrayUnion
}

// Monta o patch parcial da movimentação: status novo, milestone do destino,
// limpeza de milestones desfeitos em regressão e (opcional) entrega dos itens.
// A escrita do evento no histórico é feita à parte com arrayUnion (concorrência).
export const buildStatusChangePatch = (input: StatusChangeInput): StatusChangePatch => {
    const { order, to, date, period, user, comment, deliverAllItems } = input;
    const changes: Record<string, any> = { status: to };

    // Milestone da etapa destino
    const field = MILESTONE_FIELDS[to];
    if (field) {
        changes[`milestones.${field.at}`] = date;
        if (field.period) changes[`milestones.${field.period}`] = period;
    }

    // Regressão dentro do ciclo: limpa os milestones das etapas desfeitas
    const fromIdx = stageIndex(order.status);
    const toIdx = stageIndex(to);
    if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
        for (let i = toIdx + 1; i <= fromIdx; i++) {
            const undone = MILESTONE_FIELDS[SUPPLY_STATUS_ORDER[i]];
            if (undone) {
                changes[`milestones.${undone.at}`] = null;
                if (undone.period) changes[`milestones.${undone.period}`] = null;
            }
        }
    }

    // Reativação de cancelado: limpa o marco de cancelamento
    if (order.status === SupplyStatus.CANCELED && to === SupplyStatus.PLANNING) {
        changes['milestones.canceledAt'] = null;
    }

    // Entrega: opcionalmente marca todos os itens pendentes como entregues nesta data.
    // (Desfazer entrega NÃO desmarca itens — entrega parcial permanece registrada.)
    if (to === SupplyStatus.DELIVERED && deliverAllItems) {
        changes['items'] = order.items.map(item =>
            item.delivered ? item : { ...item, delivered: true, deliveredAt: date }
        );
    }

    const event: SupplyStatusEvent = {
        id: crypto.randomUUID(),
        status: to,
        date,
        period,
        ...(user ? { user } : {}),
        ...(comment ? { comment } : {}),
    };

    return { changes, event };
};

// --- Prioridade ---

export const SUPPLY_PRIORITIES: SupplyPriority[] = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'];

export const PRIORITY_LABELS: Record<SupplyPriority, string> = {
    BAIXA: 'Baixa',
    NORMAL: 'Normal',
    ALTA: 'Alta',
    URGENTE: 'Urgente',
};

export const PRIORITY_WEIGHT: Record<SupplyPriority, number> = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 };

export const getPriorityColor = (priority: SupplyPriority): string => {
    switch (priority) {
        case 'URGENTE': return 'text-rose-700 bg-rose-100 border-rose-200 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400';
        case 'ALTA': return 'text-orange-700 bg-orange-100 border-orange-200 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-400';
        case 'NORMAL': return 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400';
        case 'BAIXA': return 'text-slate-500 bg-slate-100 border-slate-200 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-400';
    }
};

// Ordenação padrão dos cartões/linhas: prioridade → data-limite → mais recentes primeiro
export const sortSupplyOrders = (a: SupplyOrder, b: SupplyOrder): number => {
    const w = PRIORITY_WEIGHT[a.priority ?? 'NORMAL'] - PRIORITY_WEIGHT[b.priority ?? 'NORMAL'];
    if (w !== 0) return w;
    if (a.neededBy && b.neededBy && a.neededBy !== b.neededBy) return a.neededBy.localeCompare(b.neededBy);
    if (a.neededBy && !b.neededBy) return -1;
    if (!a.neededBy && b.neededBy) return 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
};

export const deliveredItemsCount = (order: SupplyOrder): { done: number; total: number } => ({
    done: (order.items || []).filter(i => i.delivered).length,
    total: (order.items || []).length,
});
