import React, { useState } from 'react';
import { SupplyOrder, SupplyStatus, Period } from '../../types';
import { deliveredItemsCount } from './supplyUtils';
import { CreditCard, CheckSquare, XCircle, ArrowRightCircle } from 'lucide-react';

interface SupplyStatusMoveModalProps {
    order: SupplyOrder;
    to: SupplyStatus;
    onConfirm: (date: string, period: Period, options: { comment?: string; deliverAllItems?: boolean }) => void;
    onClose: () => void;
}

// Modal de confirmação de movimentação de status.
// Usado pelo drag do Kanban e pelos botões do painel de detalhes nas transições
// que precisam de dado extra (data da compra, data da entrega, motivo do cancelamento).
export const SupplyStatusMoveModal: React.FC<SupplyStatusMoveModalProps> = ({ order, to, onConfirm, onClose }) => {
    const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [period, setPeriod] = useState<Period>(currentPeriod);
    const [comment, setComment] = useState('');
    const [deliverAllItems, setDeliverAllItems] = useState(true);

    const isDelivery = to === SupplyStatus.DELIVERED;
    const isCancel = to === SupplyStatus.CANCELED;
    const { done, total } = deliveredItemsCount(order);
    const pendingItems = total - done;

    const config = isCancel
        ? { icon: <XCircle size={24} />, color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400', title: 'Cancelar Pedido', text: `Confirma o cancelamento de "${order.title}"?`, confirmClass: 'bg-rose-600 hover:bg-rose-700', confirmLabel: 'Confirmar Cancelamento' }
        : isDelivery
            ? { icon: <CheckSquare size={24} />, color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', title: 'Registrar Entrega', text: 'Quando o material chegou na obra/base?', confirmClass: 'bg-emerald-600 hover:bg-emerald-700', confirmLabel: 'Confirmar Entrega' }
            : to === SupplyStatus.BOUGHT
                ? { icon: <CreditCard size={24} />, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', title: 'Registrar Compra', text: 'Quando o pedido foi realizado no fornecedor?', confirmClass: 'bg-blue-600 hover:bg-blue-700', confirmLabel: 'Confirmar Compra' }
                : { icon: <ArrowRightCircle size={24} />, color: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400', title: `Mover para ${to}`, text: 'Confirme a data do movimento.', confirmClass: 'bg-brand-700 hover:bg-brand-800', confirmLabel: 'Confirmar' };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center space-x-3 mb-4">
                    <div className={`p-2 rounded-full ${config.color}`}>{config.icon}</div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">{config.title}</h3>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{config.text}</p>

                {!isCancel && (
                    <div className="flex mb-4">
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" />
                        <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="ml-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs px-1 py-1.5 focus:outline-none focus:border-brand-500">
                            <option value="MANHA">Manhã</option>
                            <option value="TARDE">Tarde</option>
                        </select>
                    </div>
                )}

                {isDelivery && pendingItems > 0 && (
                    <label className="flex items-start gap-2 mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 rounded-lg cursor-pointer">
                        <input type="checkbox" checked={deliverAllItems} onChange={e => setDeliverAllItems(e.target.checked)} className="mt-0.5 text-emerald-600 focus:ring-emerald-500 rounded" />
                        <span className="text-xs text-slate-600 dark:text-slate-300">Marcar os <b>{pendingItems} itens pendentes</b> como entregues nesta data</span>
                    </label>
                )}

                {isCancel && (
                    <textarea value={comment} onChange={e => setComment(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-4 h-20 resize-none text-sm" placeholder="Motivo do cancelamento (opcional)..." />
                )}

                <div className="flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Voltar</button>
                    <button onClick={() => onConfirm(date, period, { comment: comment.trim() || undefined, deliverAllItems: isDelivery ? deliverAllItems : undefined })} className={`px-4 py-2 text-white rounded-lg shadow-md font-medium ${config.confirmClass}`}>
                        {config.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
