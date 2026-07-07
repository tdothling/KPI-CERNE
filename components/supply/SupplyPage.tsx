import React, { useState, useMemo } from 'react';
import { SupplyOrder, SupplyStatus, ClientDoc, Period } from '../../types';
import { SupplyKpiStrip } from './SupplyKpiStrip';
import { SupplyKanban } from './SupplyKanban';
import { SupplyTable } from './SupplyTable';
import { SupplyOrderModal } from './SupplyOrderModal';
import { SupplyDetailsPanel } from './SupplyDetailsPanel';
import { SupplyStatusMoveModal } from './SupplyStatusMoveModal';
import { transitionNeedsDate } from './supplyUtils';
import { Truck, Search, Plus, LayoutGrid, List as ListIcon, DatabaseZap, Loader2 } from 'lucide-react';

interface SupplyPageProps {
    orders: SupplyOrder[];               // já filtrados pelos filtros globais
    clients: ClientDoc[];
    holidays: string[];
    currentUser: string;
    isAdmin?: boolean;                   // exibe o banner de migração dos dados antigos
    readOnly?: boolean;
    onAdd: (order: Omit<SupplyOrder, 'id'>) => void;
    onUpdate: (order: SupplyOrder) => void;
    onDelete: (id: string) => void;
    onMoveStatus: (order: SupplyOrder, to: SupplyStatus, date: string, period: Period, options: { comment?: string; deliverAllItems?: boolean }) => void;
    onToggleItem: (orderId: string, itemId: string, delivered: boolean) => void;
    onMigrateLegacy?: () => Promise<{ migrated: number; skipped: number }>;
}

type ViewMode = 'KANBAN' | 'TABLE';

export const SupplyPage: React.FC<SupplyPageProps> = ({
    orders, clients, holidays, currentUser, isAdmin = false, readOnly = false,
    onAdd, onUpdate, onDelete, onMoveStatus, onToggleItem, onMigrateLegacy
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('KANBAN');
    const [search, setSearch] = useState('');
    const [editingOrder, setEditingOrder] = useState<SupplyOrder | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
    const [pendingMove, setPendingMove] = useState<{ order: SupplyOrder; to: SupplyStatus } | null>(null);
    const [migrating, setMigrating] = useState(false);
    const [migrationResult, setMigrationResult] = useState<{ migrated: number; skipped: number } | null>(null);

    const filteredOrders = useMemo(() => {
        if (!search.trim()) return orders;
        const q = search.toLowerCase();
        return orders.filter(o =>
            o.title.toLowerCase().includes(q) ||
            o.client.toLowerCase().includes(q) ||
            (o.base || '').toLowerCase().includes(q) ||
            (o.requester || '').toLowerCase().includes(q) ||
            (o.items || []).some(i => i.description.toLowerCase().includes(q))
        );
    }, [orders, search]);

    // Detalhes sempre a partir da lista viva (o onSnapshot atualiza o painel aberto)
    const detailsOrder = detailsOrderId ? orders.find(o => o.id === detailsOrderId) || null : null;

    const handleOpenCreate = () => { setEditingOrder(null); setIsModalOpen(true); };
    const handleOpenEdit = (order: SupplyOrder) => { setEditingOrder(order); setIsModalOpen(true); };

    const handleSave = (data: Omit<SupplyOrder, 'id'>, editingId: string | null) => {
        if (editingId) onUpdate({ id: editingId, ...data });
        else onAdd(data);
        setIsModalOpen(false);
        setEditingOrder(null);
    };

    const handleDelete = (id: string) => {
        onDelete(id);
        if (detailsOrderId === id) setDetailsOrderId(null);
    };

    // Movimentação: transições com dado extra abrem o modal; as demais gravam direto
    const handleRequestMove = (order: SupplyOrder, to: SupplyStatus) => {
        if (transitionNeedsDate(to) || to === SupplyStatus.CANCELED) {
            setPendingMove({ order, to });
            return;
        }
        const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';
        onMoveStatus(order, to, new Date().toISOString().split('T')[0], currentPeriod, {});
    };

    const handleConfirmMove = (date: string, period: Period, options: { comment?: string; deliverAllItems?: boolean }) => {
        if (!pendingMove) return;
        onMoveStatus(pendingMove.order, pendingMove.to, date, period, options);
        setPendingMove(null);
    };

    const handleMigrate = async () => {
        if (!onMigrateLegacy || migrating) return;
        if (!confirm("Importar os registros do módulo antigo de Compras para Suprimentos?\n\nOs dados antigos não são alterados nem apagados, e registros já importados são ignorados.")) return;
        setMigrating(true);
        try {
            const result = await onMigrateLegacy();
            setMigrationResult(result);
        } catch (e: any) {
            alert("Erro na importação: " + (e?.message || e));
        } finally {
            setMigrating(false);
        }
    };

    return (
        <div>
            {/* Cabeçalho da página */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Truck className="text-brand-600 dark:text-brand-400" /> Gestão de Suprimentos
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Do planejamento da lista à entrega na obra — tudo em um só fluxo.</p>
                </div>
                {!readOnly && (
                    <button onClick={handleOpenCreate} className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm self-start sm:self-auto">
                        <Plus size={18} /> Novo Pedido
                    </button>
                )}
            </div>

            {/* Banner de migração dos dados antigos (apenas admin) */}
            {isAdmin && onMigrateLegacy && (
                <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <DatabaseZap className="text-orange-500 flex-shrink-0" size={20} />
                        <div>
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">Importar dados antigos do módulo de Compras</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {migrationResult
                                    ? `Última execução: ${migrationResult.migrated} pedido(s) importado(s), ${migrationResult.skipped} já existiam.`
                                    : 'Converte as compras antigas em pedidos de suprimentos. Pode ser executado mais de uma vez sem duplicar.'}
                            </span>
                        </div>
                    </div>
                    <button onClick={handleMigrate} disabled={migrating} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
                        {migrating ? <Loader2 size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
                        {migrating ? 'Importando...' : 'Importar Agora'}
                    </button>
                </div>
            )}

            {/* KPIs */}
            <SupplyKpiStrip orders={orders} holidays={holidays} />

            {/* Barra de ferramentas: busca + toggle de visão */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input type="text" placeholder="Buscar por título, obra, item ou solicitante..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" />
                    </div>
                    <div className="flex items-center gap-3 justify-between sm:justify-end flex-1">
                        <span className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-800 dark:text-slate-200">{filteredOrders.length}</span> pedidos</span>
                        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                            <button onClick={() => setViewMode('KANBAN')} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'KANBAN' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                                <LayoutGrid size={14} /> Kanban
                            </button>
                            <button onClick={() => setViewMode('TABLE')} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'TABLE' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                                <ListIcon size={14} /> Tabela
                            </button>
                        </div>
                    </div>
                </div>

                {viewMode === 'KANBAN' ? (
                    <div className="p-4">
                        <SupplyKanban orders={filteredOrders} onRequestMove={handleRequestMove} onOpenDetails={o => setDetailsOrderId(o.id)} readOnly={readOnly} />
                    </div>
                ) : (
                    <SupplyTable orders={filteredOrders} onOpenDetails={o => setDetailsOrderId(o.id)} onEdit={handleOpenEdit} onDelete={handleDelete} readOnly={readOnly} />
                )}
            </div>

            {/* Modais e painel */}
            {isModalOpen && (
                <SupplyOrderModal
                    order={editingOrder}
                    clients={clients}
                    currentUser={currentUser}
                    onSave={handleSave}
                    onClose={() => { setIsModalOpen(false); setEditingOrder(null); }}
                />
            )}

            {detailsOrder && (
                <SupplyDetailsPanel
                    order={detailsOrder}
                    onClose={() => setDetailsOrderId(null)}
                    onEdit={o => { setDetailsOrderId(null); handleOpenEdit(o); }}
                    onDelete={handleDelete}
                    onRequestMove={handleRequestMove}
                    onToggleItem={onToggleItem}
                    readOnly={readOnly}
                />
            )}

            {pendingMove && (
                <SupplyStatusMoveModal
                    order={pendingMove.order}
                    to={pendingMove.to}
                    onConfirm={handleConfirmMove}
                    onClose={() => setPendingMove(null)}
                />
            )}
        </div>
    );
};
