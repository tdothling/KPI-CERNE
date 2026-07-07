import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { SupplyOrder } from '../../types';
import { formatDateDisplay } from '../../utils';
import { getPriorityColor, PRIORITY_LABELS, isSupplyOverdue, deliveredItemsCount } from './supplyUtils';
import { Briefcase, MapPin, AlertTriangle, CalendarClock, GripVertical } from 'lucide-react';

interface SupplyCardProps {
    order: SupplyOrder;
    onOpenDetails: (order: SupplyOrder) => void;
    readOnly?: boolean;
    isOverlay?: boolean; // versão renderizada dentro do DragOverlay
}

export const SupplyCard: React.FC<SupplyCardProps> = ({ order, onOpenDetails, readOnly = false, isOverlay = false }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: order.id,
        disabled: readOnly || isOverlay,
    });

    const overdue = isSupplyOverdue(order);
    const { done, total } = deliveredItemsCount(order);
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
        <div
            ref={isOverlay ? undefined : setNodeRef}
            {...(isOverlay ? {} : { ...listeners, ...attributes })}
            onClick={() => { if (!isDragging) onOpenDetails(order); }}
            className={`bg-white dark:bg-slate-800 rounded-lg border p-3 select-none transition-shadow
                ${isOverlay ? 'shadow-2xl rotate-1 border-brand-300 dark:border-brand-700' : 'shadow-sm border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-brand-200 dark:hover:border-brand-800'}
                ${isDragging ? 'opacity-30' : ''}
                ${readOnly ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">{order.title}</span>
                {!readOnly && <GripVertical size={14} className="text-slate-300 dark:text-slate-600 flex-shrink-0 mt-0.5" />}
            </div>

            <div className="flex flex-col gap-1 mb-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                    <Briefcase size={11} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{order.client}</span>
                </div>
                {order.base && order.base !== 'Geral' && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <MapPin size={11} className="flex-shrink-0" />
                        <span className="truncate">{order.base}</span>
                    </div>
                )}
            </div>

            {/* Progresso de itens entregues */}
            {total > 0 && (
                <div className="mb-2.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                        <span>Itens entregues</span>
                        <span className={done === total ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}>{done}/{total}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${done === total ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${getPriorityColor(order.priority || 'NORMAL')}`}>
                    {PRIORITY_LABELS[order.priority || 'NORMAL']}
                </span>
                {overdue ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                        <AlertTriangle size={11} /> {formatDateDisplay(order.neededBy!)}
                    </span>
                ) : order.neededBy ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <CalendarClock size={11} /> {formatDateDisplay(order.neededBy)}
                    </span>
                ) : null}
            </div>
        </div>
    );
};
