
import React, { useState, useMemo } from 'react';
import { Trash2, Edit2, Package, Search, Save, X, FileText, CheckCircle2, Clock, CheckSquare, GitBranch, CornerDownRight } from 'lucide-react';
import { Discipline, RevisionReason, MaterialDoc, MaterialStatus } from '../types';
import { format, parseISO, isValid } from 'date-fns';

interface MaterialListProps {
    materials: MaterialDoc[];
    onUpdate: (updated: MaterialDoc) => void;
    onDelete: (id: string) => void;
    onAddRevision: (id: string, reason: RevisionReason, comment: string) => void;
}

// Helper to get base name (filename without revision tag)
const getMaterialBaseName = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const match = nameWithoutExt.match(/^(.*?)\s\[R\d+\]$/);
  return match ? match[1] : nameWithoutExt;
};

const getRevisionNumber = (filename: string): number => {
  const match = filename.match(/\[R(\d+)\]/);
  return match ? parseInt(match[1], 10) : 0;
};

export const MaterialList: React.FC<MaterialListProps> = ({ materials, onUpdate, onDelete, onAddRevision }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Flow State
  const [pendingCompletion, setPendingCompletion] = useState<{ id: string, date: string } | null>(null);
  const [activeRevModal, setActiveRevModal] = useState<string | null>(null);
  
  // Revision Form State
  const [revReason, setRevReason] = useState<RevisionReason>(RevisionReason.INTERNAL_ERROR);
  const [revComment, setRevComment] = useState('');

  // Form State (Edit Only now)
  const [formData, setFormData] = useState<Partial<MaterialDoc>>({
    client: '',
    filename: '',
    base: '', // Adicionado base
    discipline: Discipline.ARCHITECTURE,
    startDate: '',
    endDate: '',
    status: 'IN_PROGRESS'
  });

  // Sort and Filter with Grouping Logic
  const filteredDocs = useMemo(() => {
    // 1. Filter
    const filtered = materials.filter(doc => 
      doc.client.toLowerCase().includes(search.toLowerCase()) || 
      doc.filename.toLowerCase().includes(search.toLowerCase()) ||
      doc.discipline.toLowerCase().includes(search.toLowerCase()) ||
      (doc.base && doc.base.toLowerCase().includes(search.toLowerCase()))
    );

    // 2. Group by Base Name
    const groups: Record<string, MaterialDoc[]> = {};
    filtered.forEach(doc => {
        const base = getMaterialBaseName(doc.filename).toLowerCase();
        if (!groups[base]) groups[base] = [];
        groups[base].push(doc);
    });

    // 3. Sort within groups (Revision Number Ascending)
    Object.values(groups).forEach(group => {
        group.sort((a, b) => getRevisionNumber(a.filename) - getRevisionNumber(b.filename));
    });

    // 4. Sort Groups (Alphabetically by Base Name of the first item)
    const sortedGroups = Object.values(groups).sort((a, b) => {
        return a[0].filename.localeCompare(b[0].filename);
    });

    // 5. Flatten
    return sortedGroups.flat();
  }, [materials, search]);

  const handleOpenEditModal = (doc: MaterialDoc) => {
    setEditingId(doc.id);
    setFormData({ ...doc });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.client || !formData.filename) {
      alert("Preencha os campos obrigatórios (Cliente e Arquivo)");
      return;
    }

    if (editingId) {
       // Find original to make sure we keep revisions and ID intact if needed, though onUpdate replaces it.
       const original = materials.find(m => m.id === editingId);
       if(original) {
           onUpdate({ ...original, ...formData } as MaterialDoc);
       }
    } 
    // Create Mode removed as per request (Button removed)
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Deseja excluir este registro?')) {
      onDelete(id);
    }
  };

  // --- Actions Logic ---

  const handleConfirmCompletion = () => {
    if (!pendingCompletion) return;
    
    const doc = materials.find(d => d.id === pendingCompletion.id);
    if(doc) {
         if (doc.startDate && pendingCompletion.date < doc.startDate) {
            alert("A data de conclusão não pode ser anterior ao início.");
         } else {
             onUpdate({ ...doc, status: 'DONE', endDate: pendingCompletion.date });
         }
    }
    setPendingCompletion(null);
  };

  const handleOpenRevisionModal = (doc: MaterialDoc) => {
    setActiveRevModal(doc.id);
    setRevReason(RevisionReason.INTERNAL_ERROR);
    setRevComment('');
  };

  const handleConfirmRevision = () => {
    if (!activeRevModal) return;
    onAddRevision(activeRevModal, revReason, revComment);
    setActiveRevModal(null);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, 'dd/MM/yyyy') : '-';
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-6">
        <div>
           <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
             <Package className="text-brand-600 dark:text-brand-400" />
             Controle de Listas de Materiais
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400">Controle de Elaboração e Conclusão das listas de materiais.</p>
        </div>
        {/* Button REMOVED as requested */}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex items-center gap-4">
           <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar por cliente, arquivo ou disciplina..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
           </div>
           <div className="text-sm text-slate-500 dark:text-slate-400">
             Total: <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredDocs.length} registros</span>
           </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3">Arquivo</th>
                <th className="px-6 py-3">Cliente</th>
                <th className="px-6 py-3">Base</th> {/* Nova Coluna */}
                <th className="px-6 py-3">Disciplina</th>
                <th className="px-6 py-3">Início</th>
                <th className="px-6 py-3">Fim</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-center">Ações de Fluxo</th>
                <th className="px-6 py-3 text-right">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredDocs.map(doc => {
                 const revNum = getRevisionNumber(doc.filename);
                 const isRevision = revNum > 0;
                 return (
                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-2">
                       {isRevision && <CornerDownRight size={14} className="text-slate-400" />}
                       <FileText size={16} className="text-slate-400" />
                       <span className={doc.status === 'REVISED' ? 'line-through text-slate-400' : ''}>
                         {doc.filename}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                    {doc.client}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                    {doc.base || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                    <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-xs">{doc.discipline}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-xs">
                    {formatDateDisplay(doc.startDate)}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-xs">
                    {formatDateDisplay(doc.endDate)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      doc.status === 'DONE' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400' 
                        : doc.status === 'REVISED'
                          ? 'text-slate-500 bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 line-through decoration-slate-400 decoration-2'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400'
                    }`}>
                      {doc.status === 'DONE' && <CheckCircle2 size={12} />}
                      {doc.status === 'IN_PROGRESS' && <Clock size={12} />}
                      {doc.status === 'DONE' ? 'Concluído' : doc.status === 'REVISED' ? 'Revisado' : 'Em Elaboração'}
                    </span>
                  </td>
                  
                  {/* Workflow Actions */}
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {doc.status === 'IN_PROGRESS' && (
                        <button 
                          onClick={() => setPendingCompletion({ id: doc.id, date: new Date().toISOString().split('T')[0] })}
                          title="Concluir Lista"
                          className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors border border-emerald-200"
                        >
                          <CheckSquare size={16} />
                        </button>
                      )}
                      
                      {doc.status !== 'REVISED' && (
                        <button 
                          onClick={() => handleOpenRevisionModal(doc)}
                          title="Gerar Revisão"
                          className="p-1.5 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-brand-600 rounded-md transition-colors border border-slate-200"
                        >
                          <GitBranch size={16} />
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button onClick={() => handleOpenEditModal(doc)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(doc.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400 italic">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Completion Modal */}
      {pendingCompletion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700">
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full text-emerald-600 dark:text-emerald-400">
                <CheckSquare size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Concluir Lista</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Confirme a data de conclusão da lista de materiais.</p>
            <input 
              type="date" 
              value={pendingCompletion.date} 
              onChange={(e) => setPendingCompletion(prev => prev ? { ...prev, date: e.target.value } : null)} 
              className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-6 dark:[color-scheme:dark]" 
            />
            <div className="flex justify-end space-x-3">
              <button onClick={() => setPendingCompletion(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button>
              <button onClick={handleConfirmCompletion} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-medium">Concluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Revision Modal */}
      {activeRevModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border dark:border-slate-700">
            <div className="flex items-center space-x-3 mb-4">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full text-amber-600 dark:text-amber-400">
                    <GitBranch size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Gerar Nova Versão</h3>
            </div>
            
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
              Isso criará um novo registro (Ex: [R1]) para correção, mantendo o histórico.
            </p>
            
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Motivo da Nova Versão</label>
            <select value={revReason} onChange={(e) => setRevReason(e.target.value as RevisionReason)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-4">
              {Object.values(RevisionReason).map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Comentários</label>
            <textarea value={revComment} onChange={(e) => setRevComment(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-6 h-24 resize-none" placeholder="O que será alterado?" />

            <div className="flex justify-end space-x-3">
              <button onClick={() => setActiveRevModal(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button>
              <button onClick={handleConfirmRevision} className="px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 shadow-md">Gerar Nova Versão</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal (Removed Create Logic) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
               <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                 Editar Lista de Materiais
               </h3>
               <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                 <X size={24} />
               </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cliente</label>
                <input 
                  type="text" 
                  value={formData.client}
                  onChange={e => setFormData({ ...formData, client: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2"
                  placeholder="Nome do Cliente"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Arquivo / Nome da Lista</label>
                <input 
                  type="text" 
                  value={formData.filename}
                  onChange={e => setFormData({ ...formData, filename: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2"
                  placeholder="Ex: LM-TorreA-V1.xlsx"
                />
              </div>

               <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base / Setor</label>
                <input 
                  type="text" 
                  value={formData.base}
                  onChange={e => setFormData({ ...formData, base: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2"
                  placeholder="Ex: Torre A, Térreo"
                />
              </div>

              <div>
                 <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disciplina</label>
                 <select 
                   value={formData.discipline}
                   onChange={e => setFormData({ ...formData, discipline: e.target.value as Discipline })}
                   className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2"
                 >
                   {Object.values(Discipline).map(d => <option key={d} value={d} className="dark:bg-slate-800">{d}</option>)}
                 </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Início</label>
                    <input 
                      type="date" 
                      value={formData.startDate}
                      onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 dark:[color-scheme:dark]"
                    />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Fim</label>
                    <input 
                      type="date" 
                      value={formData.endDate}
                      onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 dark:[color-scheme:dark]"
                    />
                 </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="status"
                      value="IN_PROGRESS"
                      checked={formData.status === 'IN_PROGRESS'}
                      onChange={() => setFormData({ ...formData, status: 'IN_PROGRESS' })}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Em Elaboração</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="status"
                      value="DONE"
                      checked={formData.status === 'DONE'}
                      onChange={() => setFormData({ ...formData, status: 'DONE' })}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Concluído</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg shadow-sm font-medium flex items-center gap-2">
                <Save size={18} /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
