import React, { useState } from 'react';
import { X, Building2, MapPin, Plus, Trash2, Edit2, Save, HardHat } from 'lucide-react';
import { ClientDoc, SiteType } from '../types';

interface ClientManagerModalProps {
  clients: ClientDoc[];
  onAddClient: (client: Omit<ClientDoc, 'id'>) => void;
  onUpdateClient: (client: ClientDoc) => void;
  onDeleteClient: (id: string) => void;
  onClose: () => void;
}

export const ClientManagerModal: React.FC<ClientManagerModalProps> = ({ clients, onAddClient, onUpdateClient, onDeleteClient, onClose }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Omit<ClientDoc, 'id'>>({ name: '', location: '', type: SiteType.CONSTRUCTION_SITE, numberOfBases: 0 });

  const resetForm = () => { setFormData({ name: '', location: '', type: SiteType.CONSTRUCTION_SITE, numberOfBases: 0 }); setEditingId(null); };
  const handleEdit = (client: ClientDoc) => { setEditingId(client.id); const { id, ...data } = client; setFormData(data); };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!formData.name) return; if (editingId) { onUpdateClient({ id: editingId, ...formData }); } else { onAddClient(formData); } resetForm(); };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full flex flex-col h-[80vh] border dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
          <div><h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><HardHat className="text-brand-600 dark:text-brand-400" size={24} /> Registro de Obra</h3><p className="text-sm text-slate-500 dark:text-slate-400">Padronização de clientes e locais para o sistema.</p></div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-slate-500 dark:text-slate-400" aria-label="Fechar"><X size={24} /></button>
        </div>
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <div className="w-full md:w-1/3 p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-y-auto">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-4">{editingId ? 'Editar Cadastro' : 'Novo Cadastro'}</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Nome do Cliente *</label><input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500" placeholder="Ex: Construtora ABC" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Local / Obra</label><div className="relative"><MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-brand-500" placeholder="Ex: São Paulo - SP" /></div></div>
              <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase">Tipo de Instalação</label><div className="flex flex-col gap-2"><label className="flex items-center gap-2 cursor-pointer p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"><input type="radio" name="siteType" value={SiteType.CONSTRUCTION_SITE} checked={formData.type === SiteType.CONSTRUCTION_SITE} onChange={() => setFormData({ ...formData, type: SiteType.CONSTRUCTION_SITE, numberOfBases: 0 })} className="text-brand-600 focus:ring-brand-500" /><div className="flex flex-col"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Canteiro de Obras</span><span className="text-xs text-slate-400">Obra única centralizada</span></div></label><label className="flex items-center gap-2 cursor-pointer p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"><input type="radio" name="siteType" value={SiteType.OPERATIONAL_BASE} checked={formData.type === SiteType.OPERATIONAL_BASE} onChange={() => setFormData({ ...formData, type: SiteType.OPERATIONAL_BASE })} className="text-brand-600 focus:ring-brand-500" /><div className="flex flex-col"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Bases Operacionais</span><span className="text-xs text-slate-400">Múltiplos pontos de atendimento</span></div></label></div></div>
              {formData.type === SiteType.OPERATIONAL_BASE && (<div className="animate-in fade-in slide-in-from-top-2 duration-200"><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Número de Bases</label><input type="number" min="1" value={formData.numberOfBases || ''} onChange={(e) => setFormData({ ...formData, numberOfBases: parseInt(e.target.value) || 0 })} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500" placeholder="Qtd." /></div>)}
              <div className="pt-2 flex gap-2">
                  {editingId && (<button type="button" onClick={resetForm} className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium">Cancelar</button>)}
                  <button type="submit" className="flex-1 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg shadow-sm transition-colors text-sm font-medium flex items-center justify-center gap-2">{editingId ? <Save size={16} /> : <Plus size={16} />}{editingId ? 'Salvar' : 'Adicionar'}</button>
              </div>
            </form>
          </div>
          <div className="w-full md:w-2/3 flex flex-col bg-slate-50 dark:bg-slate-900">
             <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800"><span className="text-sm font-medium text-slate-500 dark:text-slate-400">{clients.length} registros encontrados</span></div>
             <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {clients.length === 0 ? (<div className="text-center py-20 text-slate-400"><Building2 size={48} className="mx-auto mb-3 opacity-50" /><p>Nenhum cliente cadastrado.</p></div>) : (clients.map(client => (
                        <div key={client.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-center group hover:border-brand-300 dark:hover:border-brand-700 transition-all">
                            <div className="flex items-start gap-3">
                                <div className={`mt-1 p-2 rounded-full ${client.type === SiteType.CONSTRUCTION_SITE ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>{client.type === SiteType.CONSTRUCTION_SITE ? <HardHat size={18} /> : <Building2 size={18} />}</div>
                                <div><h4 className="font-bold text-slate-800 dark:text-white">{client.name}</h4><div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1"><span className="flex items-center gap-1"><MapPin size={12} /> {client.location || 'Local não informado'}</span><span>•</span><span>{client.type}</span>{client.type === SiteType.OPERATIONAL_BASE && (<><span>•</span><span className="font-semibold text-slate-700 dark:text-slate-300">{client.numberOfBases} Bases</span></>)}</div></div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(client)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors" aria-label="Editar"><Edit2 size={16} /></button>
                                <button onClick={() => onDeleteClient(client.id)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-rose-600 transition-colors" aria-label="Excluir"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};