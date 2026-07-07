import React, { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { SupplyOrder, SupplyStatus } from '../../types';
import { SUPPLY_KANBAN_COLUMNS, canSupplyTransition, sortSupplyOrders } from './supplyUtils';
import { SupplyCard } from './SupplyCard';
import { Ban } from 'lucide-react';

interface SupplyKanbanProps {
    orders: SupplyOrder[];
    onRequestMove: (order: SupplyOrder, to: SupplyStatus) => void;
    onOpenDetails: (order: SupplyOrder) => void;
    readOnly?: boolean;
}

// Cor de destaque do cabeçalho de cada coluna
const COLUMN_ACCENT: Record<SupplyStatus, string> = {
    [SupplyStatus.PLANNING]: 'bg-slate-400',
    [SupplyStatus.READY]: 'bg-amber-500',
    [SupplyStatus.QUOTING]: 'bg-orange-500',
    [SupplyStatus.BOUGHT]: 'bg-blue-500',
    [SupplyStatus.DELIVERED]: 'bg-emerald-500',
    [SupplyStatus.CANCELED]: 'bg-slate-300 dark:bg-slate-600',
};

interface KanbanColumnProps {
    status: SupplyStatus;
    orders: SupplyOrder[];
    activeOrder: SupplyOrder | null;
    onOpenDetails: (order: SupplyOrder) => void;
    readOnly?: boolean;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, orders, activeOrder, onOpenDetails, readOnly }) => {
    const { setNodeRef, isOver } = useDroppable({ id: status });

    // Feedback visual durante o arrasto: verde/brand se o drop é válido, rose se inválido
    const dragging = !!activeOrder && activeOrder.status !== status;
    const validTarget = dragging && canSupplyTransition(activeOrder!.status, status);
    const invalidTarget = dragging && !validTarget;

    return (
        <div
            ref={setNodeRef}
            className={`flex flex-col w-[270px] flex-shrink-0 rounded-xl border transition-colors
                ${isOver && validTarget ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-900/20' : ''}
                ${isOver && invalidTarget ? 'border-rose-300 bg-rose-50/60 dark:bg-rose-900/10' : ''}
                ${!isOver ? 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40' : ''}
                ${dragging && invalidTarget ? 'opacity-50' : ''}`}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200/70 dark:border-slate-700/70">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${COLUMN_ACCENT[status]}`}></span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">{status}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full px-2 py-0.5">{orders.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar min-h-[120px] max-h-[calc(100vh-380px)]">
                {orders.map(order => (
                    <SupplyCard key={order.id} order={order} onOpenDetails={onOpenDetails} readOnly={readOnly} />
                ))}
                {orders.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-[11px] text-slate-300 dark:text-slate-600 italic border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                        {status === SupplyStatus.CANCELED ? <Ban size={14} /> : 'Vazio'}
                    </div>
                )}
            </div>
        </div>
    );
};

export const SupplyKanban: React.FC<SupplyKanbanProps> = ({ orders, onRequestMove, onOpenDetails, readOnly = false }) => {
    const [activeOrder, setActiveOrder] = useState<SupplyOrder | null>(null);

    // distance: 6 permite que o clique simples abra os detalhes sem iniciar o arrasto
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
    );

    const handleDragStart = (e: DragStartEvent) => {
        setActiveOrder(orders.find(o => o.id === e.active.id) || null);
    };

    const handleDragEnd = (e: DragEndEvent) => {
        const order = activeOrder;
        setActiveOrder(null);
        if (!order || !e.over) return;
        const to = e.over.id as SupplyStatus;
        if (to === order.status) return;
        if (!canSupplyTransition(order.status, to)) return;
        onRequestMove(order, to);
    };

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveOrder(null)}>
            <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-3">
                {SUPPLY_KANBAN_COLUMNS.map(status => (
                    <KanbanColumn
                        key={status}
                        status={status}
                        orders={orders.filter(o => o.status === status).sort(sortSupplyOrders)}
                        activeOrder={activeOrder}
                        onOpenDetails={onOpenDetails}
                        readOnly={readOnly}
                    />
                ))}
            </div>
            <DragOverlay dropAnimation={null}>
                {activeOrder && <div className="w-[254px]"><SupplyCard order={activeOrder} onOpenDetails={() => { }} isOverlay /></div>}
            </DragOverlay>
        </DndContext>
    );
};
