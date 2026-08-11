import React from 'react';
import { SupplyOrder, SupplyStatus } from '../../types';
import { getStatusColor, formatDateDisplay } from '../../utils';
import {
  SUPPLY_STATUS_ORDER,
  canSupplyTransition,
  getPriorityColor,
  PRIORITY_LABELS,
  isSupplyOverdue,
  deliveredItemsCount,
} from './supplyUtils';
import {
  X,
  Briefcase,
  MapPin,
  User,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Edit2,
  Trash2,
  XCircle,
  ArrowRight,
  RotateCcw,
  History,
  ListChecks,
} from 'lucide-react';

interface SupplyDetailsPanelProps {
  order: SupplyOrder;
  onClose: () => void;
  onEdit: (order: SupplyOrder) => void;
  onDelete: (id: string) => void;
  onRequestMove: (order: SupplyOrder, to: SupplyStatus) => void;
  onToggleItem: (orderId: string, itemId: string, delivered: boolean) => void;
  readOnly?: boolean;
}

const displayDate = (date?: string, period?: string) => {
  const d = formatDateDisplay(date || '');
  if (d === '-') return d;
  return period ? `${d} (${period === 'MANHA' ? 'M' : 'T'})` : d;
};

export const SupplyDetailsPanel: React.FC<SupplyDetailsPanelProps> = ({
  order,
  onClose,
  onEdit,
  onDelete,
  onRequestMove,
  onToggleItem,
  readOnly = false,
}) => {
  const overdue = isSupplyOverdue(order);
  const { done, total } = deliveredItemsCount(order);

  // Próximo passo natural do ciclo (primeiro avanço válido na ordem canônica)
  const currentIdx = SUPPLY_STATUS_ORDER.indexOf(order.status);
  const nextStatus =
    currentIdx >= 0 && currentIdx < SUPPLY_STATUS_ORDER.length - 1
      ? SUPPLY_STATUS_ORDER[currentIdx + 1]
      : null;
  const prevStatus = currentIdx > 0 ? SUPPLY_STATUS_ORDER[currentIdx - 1] : null;

  // Histórico mais recente primeiro
  const history = [...(order.statusHistory || [])].reverse();

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]" onClick={onClose}></div>
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-800 shadow-2xl z-50 border-l border-slate-200 dark:border-slate-700 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Cabeçalho */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white leading-snug">
                {order.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}
                >
                  {order.status}
                </span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getPriorityColor(order.priority || 'NORMAL')}`}
                >
                  {PRIORITY_LABELS[order.priority || 'NORMAL']}
                </span>
                {overdue && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={11} /> Atrasado
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
              aria-label="Fechar"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          {/* Dados gerais */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <Briefcase size={14} className="text-slate-400 flex-shrink-0" />
              <span className="truncate font-medium">{order.client}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <MapPin size={14} className="flex-shrink-0" />
              <span className="truncate">{order.base || 'Geral'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <User size={14} className="flex-shrink-0" />
              <span className="truncate">{order.requester || '-'}</span>
            </div>
            {order.discipline && (
              <div className="text-slate-500 dark:text-slate-400">
                <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-slate-600">
                  {order.discipline}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase block mb-0.5">
                Criado em
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {displayDate(order.createdAt, order.createdPeriod)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase block mb-0.5">
                Necessário até
              </span>
              <span
                className={`text-sm font-semibold ${overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}
              >
                {order.neededBy ? formatDateDisplay(order.neededBy) : '-'}
              </span>
            </div>
          </div>

          {(order.application || order.link || order.observation) && (
            <div className="space-y-2 text-sm">
              {order.application && (
                <div>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase block">
                    Aplicação
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{order.application}</span>
                </div>
              )}
              {order.link && (
                <div>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase block">
                    Link
                  </span>
                  <a
                    href={order.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline break-all text-xs flex items-center gap-1"
                  >
                    {order.link} <ExternalLink size={11} />
                  </a>
                </div>
              )}
              {order.observation && (
                <div>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase block">
                    Observações
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 text-xs whitespace-pre-wrap">
                    {order.observation}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Checklist de itens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5">
                <ListChecks size={13} /> Itens ({done}/{total} entregues)
              </span>
            </div>
            <div className="space-y-1.5">
              {(order.items || []).map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${item.delivered ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30' : 'bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700'}`}
                >
                  <button
                    onClick={() => !readOnly && onToggleItem(order.id, item.id, !item.delivered)}
                    disabled={readOnly}
                    className={`flex-shrink-0 transition-colors ${item.delivered ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600 hover:text-emerald-400'}`}
                    aria-label={
                      item.delivered ? 'Desmarcar entrega do item' : 'Marcar item como entregue'
                    }
                  >
                    {item.delivered ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm block truncate ${item.delivered ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}
                    >
                      {item.description}
                    </span>
                    {item.delivered && item.deliveredAt && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-500">
                        Entregue em {formatDateDisplay(item.deliveredAt)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">
                    {item.quantity} {item.unit}
                  </span>
                </div>
              ))}
              {(order.items || []).length === 0 && (
                <p className="text-xs text-slate-400 italic">Nenhum item cadastrado.</p>
              )}
            </div>
          </div>

          {/* Timeline de status */}
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5 mb-3">
              <History size={13} /> Histórico
            </span>
            <div className="relative pl-4 border-l-2 border-slate-100 dark:border-slate-700 space-y-4">
              {history.map((ev, idx) => (
                <div key={ev.id} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${idx === 0 ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                  ></span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(ev.status)}`}
                    >
                      {ev.status}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {displayDate(ev.date, ev.period)}
                    </span>
                    {ev.user && <span className="text-[11px] text-slate-400">· {ev.user}</span>}
                  </div>
                  {ev.comment && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                      "{ev.comment}"
                    </p>
                  )}
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-xs text-slate-400 italic">Sem eventos registrados.</p>
              )}
            </div>
          </div>
        </div>

        {/* Ações */}
        {!readOnly && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 space-y-2">
            <div className="flex gap-2">
              {nextStatus && canSupplyTransition(order.status, nextStatus) && (
                <button
                  onClick={() => onRequestMove(order, nextStatus)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm text-sm transition-all"
                >
                  <ArrowRight size={15} /> Avançar: {nextStatus}
                </button>
              )}
              {order.status === SupplyStatus.CANCELED && (
                <button
                  onClick={() => onRequestMove(order, SupplyStatus.PLANNING)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm text-sm transition-all"
                >
                  <RotateCcw size={15} /> Reativar Pedido
                </button>
              )}
              {order.status === SupplyStatus.DELIVERED && (
                <button
                  onClick={() => onRequestMove(order, SupplyStatus.BOUGHT)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                >
                  <RotateCcw size={15} /> Desfazer Entrega
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {prevStatus && canSupplyTransition(order.status, prevStatus) && (
                <button
                  onClick={() => onRequestMove(order, prevStatus)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <RotateCcw size={13} /> Voltar: {prevStatus}
                </button>
              )}
              {canSupplyTransition(order.status, SupplyStatus.CANCELED) && (
                <button
                  onClick={() => onRequestMove(order, SupplyStatus.CANCELED)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                >
                  <XCircle size={13} /> Cancelar
                </button>
              )}
              <button
                onClick={() => onEdit(order)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Edit2 size={13} /> Editar
              </button>
              <button
                onClick={() => onDelete(order.id)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                aria-label="Excluir"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
