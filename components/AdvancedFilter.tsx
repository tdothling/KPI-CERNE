
import React, { useState } from 'react';
import { X, Filter, Check, RotateCcw } from 'lucide-react';
import { ClientDoc, Discipline, ProjectFilterState } from '../types';

interface AdvancedFilterProps {
  clients: ClientDoc[];
  currentFilter: ProjectFilterState;
  onApplyFilter: (filter: ProjectFilterState) => void;
  onClose: () => void;
}

export const AdvancedFilter: React.FC<AdvancedFilterProps> = ({ clients, currentFilter, onApplyFilter, onClose }) => {
  const [selectedClients, setSelectedClients] = useState<string[]>(currentFilter.clients);
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>(currentFilter.disciplines);

  const toggleClient = (clientName: string) => {
    setSelectedClients(prev => {
      if (prev.includes(clientName)) return prev.filter(c => c !== clientName);
      // Limite de segurança do Firestore 'IN' query é 10 (ou 30 em versões novas), vamos limitar a 10 para garantir
      if (prev.length >= 10) {
          alert("Por limitações de performance, selecione no máximo 10 clientes por vez.");
          return prev;
      }
      return [...prev, clientName];
    });
  };

  const toggleDiscipline = (disc: Discipline) => {
    setSelectedDisciplines(prev => prev.includes(disc) ? prev.filter(d => d !== disc) : [...prev, disc]);
  };

  const handleApply = () => {
    const isActive = selectedClients.length > 0 || selectedDisciplines.length > 0;
    onApplyFilter({
        clients: selectedClients,
        disciplines: selectedDisciplines,
        isActive
    });
    onClose();
  };

  const handleReset = () => {
      setSelectedClients([]);
      setSelectedDisciplines([]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full flex flex-col max-h-[90vh] border dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 rounded-t-xl">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Filter size={20} className="text-brand-600 dark:text-brand-400" />
            Busca Direcionada (BD)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={24} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Como funciona:</strong> Ao selecionar filtros aqui, o sistema buscará em <strong>todo o banco de dados</strong>, não apenas nos últimos 50 projetos.
                </p>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">
                    1. Clientes (Max 10)
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {clients.map(c => (
                        <div key={c.id} 
                             onClick={() => toggleClient(c.name)}
                             className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${selectedClients.includes(c.name) ? 'bg-brand-50 border-brand-200 dark:bg-brand-900/30 dark:border-brand-700' : 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700'}`}
                        >
                            <span className={`text-sm ${selectedClients.includes(c.name) ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-400'}`}>{c.name}</span>
                            {selectedClients.includes(c.name) && <Check size={16} className="text-brand-600 dark:text-brand-400" />}
                        </div>
                    ))}
                    {clients.length === 0 && <p className="text-xs text-slate-400 italic">Nenhum cliente cadastrado.</p>}
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">
                    2. Disciplinas
                </label>
                <div className="flex flex-wrap gap-2">
                    {Object.values(Discipline).map(d => (
                        <button 
                            key={d}
                            onClick={() => toggleDiscipline(d)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedDisciplines.includes(d) ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600'}`}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 rounded-b-xl flex justify-between items-center">
            <button onClick={handleReset} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-sm flex items-center gap-1 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <RotateCcw size={14} /> Limpar
            </button>
            <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                <button onClick={handleApply} className="px-6 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg shadow-sm font-semibold text-sm transition-all flex items-center gap-2">
                    <Filter size={16} /> Aplicar Filtros
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
