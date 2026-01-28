
import React, { useState, useMemo } from 'react';
import { X, Filter, Check, RotateCcw, Search, CheckSquare, Square } from 'lucide-react';
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
  const [clientSearch, setClientSearch] = useState('');

  // Filtra a lista de clientes visualmente baseada na busca interna do modal
  const filteredClientsList = useMemo(() => {
    return clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clients, clientSearch]);

  const toggleClient = (clientName: string) => {
    setSelectedClients(prev => {
      if (prev.includes(clientName)) return prev.filter(c => c !== clientName);
      
      // Limite de segurança do Firestore
      if (prev.length >= 10) {
          alert("Limite de 10 clientes por filtro para otimização de performance.");
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
      setClientSearch('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh] border dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 rounded-t-xl">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Filter size={20} className="text-brand-600 dark:text-brand-400" />
            Busca Direcionada (BD)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={24} /></button>
        </div>
        
        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                    Otimização de Banco de Dados: Esta busca consulta diretamente o servidor, trazendo apenas o necessário e economizando leituras.
                </p>
            </div>

            {/* Seção de Clientes em Lista */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                        1. Clientes ({selectedClients.length}/10)
                    </label>
                    <button 
                        onClick={() => setSelectedClients([])} 
                        className="text-xs text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
                        disabled={selectedClients.length === 0}
                    >
                        Limpar seleção
                    </button>
                </div>
                
                <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-900 flex flex-col h-60">
                    {/* Barra de Busca Interna */}
                    <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center gap-2 sticky top-0">
                        <Search size={14} className="text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar cliente na lista..." 
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            className="bg-transparent w-full text-sm outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                        />
                    </div>

                    {/* Lista Scrollável */}
                    <div className="overflow-y-auto flex-1 p-1 space-y-0.5 custom-scrollbar">
                        {filteredClientsList.length > 0 ? (
                            filteredClientsList.map(c => {
                                const isSelected = selectedClients.includes(c.name);
                                return (
                                    <div 
                                        key={c.id} 
                                        onClick={() => toggleClient(c.name)}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm ${
                                            isSelected 
                                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-medium' 
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        {isSelected ? (
                                            <CheckSquare size={16} className="text-brand-600 dark:text-brand-400 shrink-0" />
                                        ) : (
                                            <Square size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                        )}
                                        <span className="truncate">{c.name}</span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-4 text-center text-xs text-slate-400 italic">
                                {clients.length === 0 ? "Nenhum cliente cadastrado." : "Nenhum cliente encontrado."}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Seção de Disciplinas */}
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

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 rounded-b-xl flex justify-between items-center">
            <button onClick={handleReset} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-sm flex items-center gap-1 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <RotateCcw size={14} /> Resetar
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
