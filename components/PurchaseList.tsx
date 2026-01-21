
import React, { useState, useMemo } from 'react';
import { PurchaseDoc, PurchaseStatus } from '../types';
import { Trash2, Edit2, ShoppingCart, Search, Plus, ExternalLink, CheckCircle2, Clock, Truck, XCircle, Tag, MapPin, Briefcase, Calendar, ArrowRight, CreditCard, CheckSquare } from 'lucide-react';
import { format, parseISO, isValid, differenceInBusinessDays, isWeekend, isWithinInterval } from 'date-fns';
import { subscribeToClients } from '../services/db'; // Direct subscribe if needed, or pass via props

interface PurchaseListProps {
  purchases: PurchaseDoc[];
  onAdd: (purchase: Omit<PurchaseDoc, 'id'>) => void;
  onUpdate: (updated: PurchaseDoc) => void;
  onDelete: (id: string) => void;
  currentUser: string; 
  holidays: string[];
}

const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, 'dd/MM/yyyy') : '-';
};

const calculateBusinessDays = (start: Date, end: Date, holidays: string[]) => {
    if (!isValid(start) || !isValid(end)) return 0;
    if (end < start) return 0;
    let days = differenceInBusinessDays(end, start);
    let holidaysOnWeekdays = 0;
    holidays.forEach(h => {
        const hDate = parseISO(h);
        if (isValid(hDate) && isWithinInterval(hDate, { start, end })) {
            if (!isWeekend(hDate)) {
                holidaysOnWeekdays++;
            }
        }
    });
    return Math.max(0, days - holidaysOnWeekdays);
};

export const PurchaseList: React.FC<PurchaseListProps> = ({ purchases, onAdd, onUpdate, onDelete, currentUser, holidays }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  // Clients state for dropdown (fetched locally or passed down)
  // Ideally passed down, but to keep changes localized, fetching here is safe for now
  const [clientsList, setClientsList] = useState<{id: string, name: string}[]>([]);

  // Fetch clients when modal opens
  React.useEffect(() => {
      if (isModalOpen) {
          const unsub = subscribeToClients((data) => {
              setClientsList(data.map(c => ({ id: c.id, name: c.name })));
          });
          return () => unsub();
      }
  }, [isModalOpen]);

  const [pendingBuy, setPendingBuy] = useState<{ id: string, date: string } | null>(null);
  const [pendingDelivery, setPendingDelivery] = useState<{ id: string, date: string } | null>(null);

  const [formData, setFormData] = useState<Omit<PurchaseDoc, 'id'>>({
    description: '',
    client: '',
    base: '',
    application: '',
    requester: currentUser || '',
    requestDate: new Date().toISOString().split('T')[0],
    arrivalDate: '',
    status: PurchaseStatus.PENDING,
    link: '',
    observation: ''
  });

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => 
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        p.client.toLowerCase().includes(search.toLowerCase()) ||
        p.base.toLowerCase().includes(search.toLowerCase()) ||
        p.requester.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => {
        return b.requestDate.localeCompare(a.requestDate);
    });
  }, [purchases, search]);

  const handleOpenModal = (purchase?: PurchaseDoc) => {
      if (purchase) {
          setEditingId(purchase.id);
          const { id, ...data } = purchase;
          setFormData(data);
      } else {
          setEditingId(null);
          setFormData({
            description: '',
            client: '',
            base: '',
            application: '',
            requester: currentUser || '',
            requestDate: new Date().toISOString().split('T')[0],
            arrivalDate: '',
            status: PurchaseStatus.PENDING,
            link: '',
            observation: ''
          });
      }
      setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.description || !formData.client) {
          alert("Descrição e Cliente são obrigatórios.");
          return;
      }

      let finalData = { ...formData };
      if (finalData.status === PurchaseStatus.DELIVERED && !finalData.arrivalDate) {
          finalData.arrivalDate = new Date().toISOString().split('T')[0];
      }
      if (finalData.status !== PurchaseStatus.DELIVERED) {
          finalData.arrivalDate = '';
      }

      if (editingId) {
          onUpdate({ id: editingId, ...finalData });
      } else {
          onAdd(finalData);
      }
      setIsModalOpen(false);
  };

  const handleConfirmBuy = () => {
    if (!pendingBuy) return;
    const item = purchases.find(p => p.id === pendingBuy.id);
    if (item) onUpdate({ ...item, status: PurchaseStatus.BOUGHT });
    setPendingBuy(null);
  };

  const handleConfirmDelivery = () => {
    if (!pendingDelivery) return;
    const item = purchases.find(p => p.id === pendingDelivery.id);
    if (item) {
        if (item.requestDate && pendingDelivery.date < item.requestDate) {
            alert("A data de entrega não pode ser anterior à data do pedido.");
            return;
        }
        onUpdate({ ...item, status: PurchaseStatus.DELIVERED, arrivalDate: pendingDelivery.date });
    }
    setPendingDelivery(null);
  };

  const getStatusColor = (status: PurchaseStatus) => {
      switch(status) {
          case PurchaseStatus.DELIVERED: return 'text-emerald-700 bg-emerald-100 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400';
          case PurchaseStatus.BOUGHT: return 'text-blue-700 bg-blue-100 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400';
          case PurchaseStatus.PENDING: return 'text-amber-700 bg-amber-100 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400';
          case PurchaseStatus.CANCELED: return 'text-slate-500 bg-slate-200 border-slate-300 dark:bg-slate-700 dark:text-slate-400 line-through';
          default: return 'text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
      }
  };

  const getLeadTime = (start: string, end: string) => {
      if (!start) return null;
      const startDate = parseISO(start);
      const endDate = end ? parseISO(end) : new Date();
      return calculateBusinessDays(startDate, endDate, holidays);
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
            <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <ShoppingCart className="text-brand-600 dark:text-brand-400" />
                    Controle de Compras
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Rastreamento de solicitações, destino e recebimento de materiais.</p>
            </div>
            <button onClick={() => handleOpenModal()} className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                <Plus size={18} /> Registrar Solicitação
            </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input type="text" placeholder="Buscar por descrição, cliente ou base..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredPurchases.length}</span> registros
                </div>
            </div>

             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs border-b border-slate-200 dark:border-slate-700">
                        <tr>
                            <th className="px-6 py-3 w-[25%]">Solicitação</th>
                            <th className="px-6 py-3 w-[20%]">Destino</th>
                            <th className="px-6 py-3 w-[15%]">Aplicação</th>
                            <th className="px-6 py-3 w-[20%]">Ciclo (Dias Úteis)</th>
                            <th className="px-6 py-3 w-[10%] text-center">Status</th>
                            <th className="px-6 py-3 w-[5%] text-center">Fluxo</th>
                            <th className="px-6 py-3 w-[5%] text-right">Editar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredPurchases.map(p => {
                            const leadTime = getLeadTime(p.requestDate, p.arrivalDate);
                            return (
                            <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-base">{p.description}</span>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            <span>Por: {p.requester}</span>
                                            {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1"><ExternalLink size={10} /> Link</a>}
                                        </div>
                                        {p.observation && <span className="text-xs text-slate-400 mt-1 italic max-w-[300px] truncate" title={p.observation}>Obs: {p.observation}</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium"><Briefcase size={14} className="text-slate-400" />{p.client}</div>
                                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs"><MapPin size={12} />{p.base || 'Base Geral'}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400"><span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-xs border border-slate-200 dark:border-slate-600">{p.application || '-'}</span></td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span title="Data do Pedido">{formatDateDisplay(p.requestDate)}</span><ArrowRight size={10} className="text-slate-300" /><span title="Data de Chegada" className={p.arrivalDate ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}>{p.arrivalDate ? formatDateDisplay(p.arrivalDate) : '...'}</span></div>
                                        {p.status === PurchaseStatus.DELIVERED && p.arrivalDate && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded self-start">Lead Time: {leadTime} dias úteis</span>}
                                        {p.status !== PurchaseStatus.DELIVERED && p.status !== PurchaseStatus.CANCELED && <span className="text-[10px] text-amber-600 dark:text-amber-500 px-1.5 py-0.5 self-start flex items-center gap-1"><Clock size={10} /> Aguardando há {leadTime} dias</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(p.status)}`}>{p.status === PurchaseStatus.PENDING && <Clock size={12} />}{p.status === PurchaseStatus.BOUGHT && <Truck size={12} />}{p.status === PurchaseStatus.DELIVERED && <CheckCircle2 size={12} />}{p.status === PurchaseStatus.CANCELED && <XCircle size={12} />}{p.status}</span></td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        {p.status === PurchaseStatus.PENDING && <button onClick={() => setPendingBuy({ id: p.id, date: new Date().toISOString().split('T')[0] })} title="Registrar Compra" className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition-colors border border-blue-200"><CreditCard size={16} /></button>}
                                        {p.status === PurchaseStatus.BOUGHT && <button onClick={() => setPendingDelivery({ id: p.id, date: new Date().toISOString().split('T')[0] })} title="Registrar Chegada (Entrega)" className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors border border-emerald-200"><CheckSquare size={16} /></button>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end space-x-2">
                                        <button onClick={() => handleOpenModal(p)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => onDelete(p.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </td>
                            </tr>
                        );
                        })}
                         {filteredPurchases.length === 0 && (<tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400 italic">Nenhuma solicitação encontrada.</td></tr>)}
                    </tbody>
                </table>
             </div>
        </div>

        {isModalOpen && (
             <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 flex flex-col max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            {editingId ? <Edit2 size={20} className="text-brand-600" /> : <Plus size={20} className="text-brand-600" />}
                            {editingId ? 'Editar Solicitação' : 'Nova Solicitação de Compra'}
                        </h3>
                        <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><Tag size={24} /></button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição da Solicitação *</label>
                            <input type="text" required value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2" placeholder="Ex: Material elétrico para o quadro QGBT" autoFocus />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cliente *</label>
                                <select 
                                    required 
                                    value={formData.client} 
                                    onChange={(e) => setFormData({...formData, client: e.target.value})} 
                                    className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2"
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {clientsList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base / Setor</label>
                                <input type="text" value={formData.base} onChange={(e) => setFormData({...formData, base: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2" placeholder="Ex: Obra A, Galpão 1" />
                             </div>
                        </div>

                        {/* ... rest of the form (application, requester, dates, link, observation) ... */}
                        <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Aplicação / Uso</label><input type="text" value={formData.application} onChange={(e) => setFormData({...formData, application: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2" placeholder="Ex: Infraestrutura de rede, Manutenção predial..." /></div>
                        <div className="grid grid-cols-2 gap-4">
                             <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Solicitante</label><input type="text" value={formData.requester} onChange={(e) => setFormData({...formData, requester: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2" /></div>
                             <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status Atual</label><select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value as PurchaseStatus})} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2">{Object.values(PurchaseStatus).map(s => <option key={s} value={s} className="dark:bg-slate-800">{s}</option>)}</select></div>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block flex items-center gap-2"><Calendar size={12} /> Controle de Datas</span>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data Pedido</label><input type="date" value={formData.requestDate} onChange={(e) => setFormData({...formData, requestDate: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm dark:[color-scheme:dark]" /></div>
                                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data Chegada</label><input type="date" value={formData.arrivalDate} onChange={(e) => setFormData({...formData, arrivalDate: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm dark:[color-scheme:dark]" placeholder="Se vazio, não chegou" /></div>
                            </div>
                        </div>
                        <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link de Referência (Opcional)</label><input type="url" value={formData.link || ''} onChange={(e) => setFormData({...formData, link: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2" placeholder="https://..." /></div>
                         <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label><textarea value={formData.observation || ''} onChange={(e) => setFormData({...formData, observation: e.target.value})} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 h-20 resize-none" placeholder="Detalhes adicionais..." /></div>

                        <div className="flex justify-end space-x-3 pt-2 border-t border-slate-100 dark:border-slate-700 mt-2">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors">Cancelar</button>
                            <button type="submit" className="px-6 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-md transition-all">{editingId ? 'Salvar Alterações' : 'Registrar Solicitação'}</button>
                        </div>
                    </form>
                 </div>
             </div>
        )}
        
        {/* ... Buy/Delivery Modals ... */}
        {pendingBuy && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full text-blue-600 dark:text-blue-400"><CreditCard size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Compra</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">A compra já foi realizada no fornecedor?</p><div className="flex justify-end space-x-3"><button onClick={() => setPendingBuy(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmBuy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md font-medium">Confirmar</button></div></div></div> )}
        {pendingDelivery && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full text-emerald-600 dark:text-emerald-400"><CheckSquare size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Entrega</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Quando o material chegou na base?</p><input type="date" value={pendingDelivery.date} onChange={(e) => setPendingDelivery(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-6 dark:[color-scheme:dark]" /><div className="flex justify-end space-x-3"><button onClick={() => setPendingDelivery(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmDelivery} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-medium">Confirmar Chegada</button></div></div></div> )}
    </div>
  );
};
