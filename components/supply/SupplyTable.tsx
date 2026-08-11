import React from 'react';
import { SupplyOrder, SupplyStatus } from '../../types';
import { getStatusColor, formatDateDisplay } from '../../utils';
import {
  getPriorityColor,
  PRIORITY_LABELS,
  isSupplyOverdue,
  deliveredItemsCount,
  sortSupplyOrders,
} from './supplyUtils';
import { Briefcase, MapPin, Edit2, Trash2, Eye, AlertTriangle, Package } from 'lucide-react';

interface SupplyTableProps {
  orders: SupplyOrder[];
  onOpenDetails: (order: SupplyOrder) => void;
  onEdit: (order: SupplyOrder) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}

export const SupplyTable: React.FC<SupplyTableProps> = ({
  orders,
  onOpenDetails,
  onEdit,
  onDelete,
  readOnly = false,
}) => {
  const sorted = [...orders].sort(sortSupplyOrders);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs border-b border-slate-200 dark:border-slate-700">
          <tr>
            <th className="px-6 py-3">Pedido</th>
            <th className="px-6 py-3">Destino</th>
            <th className="px-6 py-3 text-center">Prioridade</th>
            <th className="px-6 py-3 text-center">Itens</th>
            <th className="px-6 py-3">Criado em</th>
            <th className="px-6 py-3">Necessário até</th>
            <th className="px-6 py-3 text-center">Status</th>
            <th className="px-6 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {sorted.map((order) => {
            const overdue = isSupplyOverdue(order);
            const { done, total } = deliveredItemsCount(order);
            const canceled = order.status === SupplyStatus.CANCELED;
            return (
              <tr
                key={order.id}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                onClick={() => onOpenDetails(order)}
              >
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span
                      className={`font-semibold text-slate-800 dark:text-slate-200 ${canceled ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}
                    >
                      {order.title}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Por: {order.requester || '-'}
                      {order.application ? ` · ${order.application}` : ''}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium text-xs">
                      <Briefcase size={13} className="text-slate-400" />
                      {order.client}
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
                      <MapPin size={12} />
                      {order.base || 'Geral'}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getPriorityColor(order.priority || 'NORMAL')}`}
                  >
                    {PRIORITY_LABELS[order.priority || 'NORMAL']}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Package size={13} className="text-slate-400" />
                    <span
                      className={
                        done === total && total > 0
                          ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                          : ''
                      }
                    >
                      {done}/{total}
                    </span>
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                  {formatDateDisplay(order.createdAt)}
                </td>
                <td className="px-6 py-4 text-xs">
                  {order.neededBy ? (
                    <span
                      className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      {overdue && <AlertTriangle size={12} />}
                      {formatDateDisplay(order.neededBy)}
                    </span>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(order.status)}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end space-x-1">
                    <button
                      onClick={() => onOpenDetails(order)}
                      className="p-1.5 text-slate-400 hover:text-violet-500 rounded hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
                      aria-label="Ver Detalhes"
                    >
                      <Eye size={16} />
                    </button>
                    {!readOnly && (
                      <>
                        <button
                          onClick={() => onEdit(order)}
                          className="p-1.5 text-slate-400 hover:text-blue-500 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          aria-label="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => onDelete(order.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                          aria-label="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-10 text-center text-slate-400 italic">
                Nenhum pedido encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
