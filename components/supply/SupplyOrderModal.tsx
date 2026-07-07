import React, { useState } from 'react';
import { SupplyOrder, SupplyItem, SupplyStatus, SupplyPriority, ClientDoc, Discipline, SiteType, Period } from '../../types';
import { SUPPLY_PRIORITIES, PRIORITY_LABELS } from './supplyUtils';
import { Plus, X, Edit2, Trash2, PackagePlus } from 'lucide-react';

interface SupplyOrderModalProps {
    order?: SupplyOrder | null;               // null/undefined = criação
    clients: ClientDoc[];
    currentUser: string;
    onSave: (data: Omit<SupplyOrder, 'id'>, editingId: string | null) => void;
    onClose: () => void;
}

interface DraftItem {
    id: string;
    description: string;
    quantity: string;   // string no formulário; convertida ao salvar
    unit: string;
    delivered: boolean;
    deliveredAt?: string;
    observation?: string;
}

const inputClass = "w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:ring-brand-500 focus:border-brand-500";

const emptyItem = (): DraftItem => ({ id: crypto.randomUUID(), description: '', quantity: '1', unit: 'un', delivered: false });

export const SupplyOrderModal: React.FC<SupplyOrderModalProps> = ({ order, clients, currentUser, onSave, onClose }) => {
    const editing = !!order;

    const [title, setTitle] = useState(order?.title || '');
    const [client, setClient] = useState(order?.client || '');
    const [base, setBase] = useState(order?.base || '');
    const [application, setApplication] = useState(order?.application || '');
    const [discipline, setDiscipline] = useState<Discipline | ''>(order?.discipline || '');
    const [requester, setRequester] = useState(order?.requester || currentUser || '');
    const [priority, setPriority] = useState<SupplyPriority>(order?.priority || 'NORMAL');
    const [neededBy, setNeededBy] = useState(order?.neededBy || '');
    const [link, setLink] = useState(order?.link || '');
    const [observation, setObservation] = useState(order?.observation || '');
    const [items, setItems] = useState<DraftItem[]>(
        order?.items?.length
            ? order.items.map(i => ({ ...i, quantity: String(i.quantity) }))
            : [emptyItem()]
    );

    const selectedClientDoc = clients.find(c => c.name === client);
    const showBaseInput = !selectedClientDoc || selectedClientDoc.type === SiteType.OPERATIONAL_BASE;

    const updateItem = (id: string, changes: Partial<DraftItem>) =>
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));

    const removeItem = (id: string) =>
        setItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !client) { alert("Título e Obra são obrigatórios."); return; }

        const cleanItems: SupplyItem[] = items
            .filter(i => i.description.trim())
            .map(i => ({
                id: i.id,
                description: i.description.trim(),
                quantity: Math.max(0, parseFloat(i.quantity.replace(',', '.')) || 0),
                unit: i.unit.trim() || 'un',
                delivered: i.delivered,
                ...(i.deliveredAt ? { deliveredAt: i.deliveredAt } : {}),
                ...(i.observation ? { observation: i.observation } : {}),
            }));

        if (cleanItems.length === 0) { alert("Adicione ao menos um item ao pedido."); return; }

        const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';
        const today = new Date().toISOString().split('T')[0];

        const data: Omit<SupplyOrder, 'id'> = {
            title: title.trim(),
            client,
            base: showBaseInput ? (base.trim() || 'Geral') : 'Geral',
            application: application.trim() || undefined,
            discipline: discipline || undefined,
            requester: requester.trim() || currentUser,
            priority,
            status: order?.status || SupplyStatus.PLANNING,
            items: cleanItems,
            createdAt: order?.createdAt || today,
            createdPeriod: order?.createdPeriod || currentPeriod,
            neededBy: neededBy || undefined,
            milestones: order?.milestones || {},
            statusHistory: order?.statusHistory || [{
                id: crypto.randomUUID(),
                status: SupplyStatus.PLANNING,
                date: today,
                period: currentPeriod,
                user: currentUser || undefined,
                comment: 'Pedido criado',
            }],
            link: link.trim() || undefined,
            observation: observation.trim() || undefined,
            ...(order?.legacy ? { legacy: order.legacy } : {}),
        };

        onSave(data, order?.id || null);
    };

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 border dark:border-slate-700 flex flex-col max-h-[92vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        {editing ? <Edit2 size={20} className="text-brand-600" /> : <PackagePlus size={20} className="text-brand-600" />}
                        {editing ? 'Editar Pedido' : 'Novo Pedido de Suprimentos'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={24} /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Título do Pedido *</label>
                        <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="Ex: Infraestrutura elétrica Bloco B" autoFocus />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Obra / Cliente *</label>
                            <select required value={client} onChange={e => setClient(e.target.value)} className={inputClass}>
                                <option value="" disabled>Selecione...</option>
                                {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base / Setor</label>
                            <input type="text" value={base} onChange={e => setBase(e.target.value)} className={inputClass} placeholder="Ex: Base 01, Galpão A" disabled={!showBaseInput} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Aplicação / Uso</label>
                            <input type="text" value={application} onChange={e => setApplication(e.target.value)} className={inputClass} placeholder="Ex: Infraestrutura de rede" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disciplina</label>
                            <select value={discipline} onChange={e => setDiscipline(e.target.value as Discipline | '')} className={inputClass}>
                                <option value="">Sem disciplina</option>
                                {Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Solicitante</label>
                            <input type="text" value={requester} onChange={e => setRequester(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Prioridade</label>
                            <select value={priority} onChange={e => setPriority(e.target.value as SupplyPriority)} className={inputClass}>
                                {SUPPLY_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Necessário até</label>
                            <input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} className={`${inputClass} dark:[color-scheme:dark]`} />
                        </div>
                    </div>

                    {/* Editor de Itens */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Itens do Pedido ({items.filter(i => i.description.trim()).length})</span>
                            <button type="button" onClick={() => setItems(prev => [...prev, emptyItem()])} className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline">
                                <Plus size={14} /> Adicionar item
                            </button>
                        </div>
                        <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                            {items.map((item, idx) => (
                                <div key={item.id} className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                                    <input type="text" value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} className={`${inputClass} flex-1`} placeholder="Descrição do material" />
                                    <input type="text" inputMode="decimal" value={item.quantity} onChange={e => updateItem(item.id, { quantity: e.target.value })} className={`${inputClass} w-20 text-center`} placeholder="Qtd" aria-label="Quantidade" />
                                    <input type="text" value={item.unit} onChange={e => updateItem(item.id, { unit: e.target.value })} className={`${inputClass} w-16 text-center`} placeholder="un" aria-label="Unidade" />
                                    <button type="button" onClick={() => removeItem(item.id)} disabled={items.length === 1} className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors disabled:opacity-30" aria-label="Remover item">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link de Referência</label>
                            <input type="url" value={link} onChange={e => setLink(e.target.value)} className={inputClass} placeholder="https://..." />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
                            <input type="text" value={observation} onChange={e => setObservation(e.target.value)} className={inputClass} placeholder="Detalhes adicionais..." />
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors">Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-md transition-all">
                            {editing ? 'Salvar Alterações' : 'Criar Pedido'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
