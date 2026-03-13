
import React, { useState, useMemo } from 'react';
import { ProjectFile, Discipline, Status, Period, ProjectPhase } from '../types';
import { X, Search, CheckSquare, Square, AlertCircle, CheckCircle2, Send, BadgeCheck, ThumbsDown, ArrowRight, Filter, Layers, Users, GitBranch } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { getRevisionNumber, calculateBusinessDaysWithHolidays, inferStatusFromDates, canTransitionTo } from '../utils';

interface BatchEditModalProps {
  projects: ProjectFile[];
  onClose: () => void;
  onApply: (ids: string[], field: keyof ProjectFile, value: any) => void;
  onWorkflow: (ids: string[], action: 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT', date: string) => void;
  holidays: string[];
}

// Fields allowed for batch editing
// Status removed to prevent inconsistent states (Status without Date)
const EDITABLE_FIELDS: { key: keyof ProjectFile; label: string; type: 'text' | 'number' | 'date' | 'select' | 'enum' }[] = [
  { key: 'client', label: 'Cliente', type: 'text' },
  { key: 'base', label: 'Base / Setor', type: 'text' }, 
  { key: 'discipline', label: 'Disciplina', type: 'enum' },
  { key: 'phase', label: 'Fase (Etapa)', type: 'enum' },
  { key: 'startDate', label: 'Data Início', type: 'date' },
  { key: 'endDate', label: 'Data Fim', type: 'date' },
  { key: 'sendDate', label: 'Data Envio', type: 'date' },
  { key: 'feedbackDate', label: 'Data Feedback', type: 'date' },
  { key: 'blockedDays', label: 'Dias Bloqueados', type: 'number' },
];

type Mode = 'EDIT' | 'WORKFLOW';
type WorkflowAction = 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT';
type RevisionFilter = 'ALL' | 'R0' | 'REVISIONS';

export const BatchEditModal: React.FC<BatchEditModalProps> = ({ projects, onClose, onApply, onWorkflow, holidays }) => {
  const [mode, setMode] = useState<Mode>('EDIT');
  
  // Edit Mode State
  const [selectedField, setSelectedField] = useState<keyof ProjectFile>('client');
  const [newValue, setNewValue] = useState<string>('');
  const [newPeriod, setNewPeriod] = useState<Period>('MANHA'); // Para campos de data

  // Workflow Mode State
  const [selectedAction, setSelectedAction] = useState<WorkflowAction>('COMPLETE');
  const [workflowDate, setWorkflowDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Selection State
  const [searchFilter, setSearchFilter] = useState('');
  const [filterClient, setFilterClient] = useState<string>('ALL');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('ALL');
  const [filterRevision, setFilterRevision] = useState<RevisionFilter>('ALL');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Helper to determine active field configuration
  const fieldConfig = EDITABLE_FIELDS.find(f => f.key === selectedField)!;

  const uniqueClients = useMemo(() => {
    const clients = new Set(projects.map(p => p.client));
    return Array.from(clients).sort();
  }, [projects]);

  // Filter projects based on search text and dropdowns
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = 
        p.filename.toLowerCase().includes(searchFilter.toLowerCase()) || 
        p.client.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (p.base && p.base.toLowerCase().includes(searchFilter.toLowerCase()));

      const matchesClient = filterClient === 'ALL' || p.client === filterClient;
      const matchesDiscipline = filterDiscipline === 'ALL' || p.discipline === filterDiscipline;
      
      let matchesRevision = true;
      const revNum = getRevisionNumber(p.filename);
      if (filterRevision === 'R0') matchesRevision = revNum === 0;
      if (filterRevision === 'REVISIONS') matchesRevision = revNum > 0;

      return matchesSearch && matchesClient && matchesDiscipline && matchesRevision;
    });
  }, [projects, searchFilter, filterClient, filterDiscipline, filterRevision]);

  // Toggle selection logic
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length && filteredProjects.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  };

  const handleApply = () => {
    if (selectedIds.size === 0) return;

    if (mode === 'WORKFLOW') {
      if (!workflowDate) {
        alert("Por favor, selecione uma data.");
        return;
      }
      onWorkflow(Array.from(selectedIds), selectedAction, workflowDate);
      onClose();
      return;
    }

    // Apply the value
    onApply(Array.from(selectedIds), selectedField, newValue);
    
    // Se for um campo de data, aplica também o período correspondente
    if (fieldConfig.type === 'date') {
        let periodField: keyof ProjectFile | null = null;
        if (selectedField === 'startDate') periodField = 'startPeriod';
        if (selectedField === 'endDate') periodField = 'endPeriod';
        if (selectedField === 'sendDate') periodField = 'sendPeriod';
        if (selectedField === 'feedbackDate') periodField = 'feedbackPeriod';

        if (periodField) {
            onApply(Array.from(selectedIds), periodField, newPeriod);
        }
    }
    
    // AUTO-UPDATE STATUS FOR BATCH DATE EDITS
    if (['startDate', 'endDate', 'sendDate', 'feedbackDate'].includes(selectedField)) {
        const projectsToUpdate = projects.filter(p => selectedIds.has(p.id));
        
        projectsToUpdate.forEach(project => {
            // Cria um objeto "futuro" para recalcular
            const updated = { ...project, [selectedField]: newValue };
            
            // Se estamos editando datas de fluxo, precisamos atualizar o período no objeto temporário
            if (selectedField === 'startDate') updated.startPeriod = newPeriod;
            if (selectedField === 'endDate') updated.endPeriod = newPeriod;
            if (selectedField === 'sendDate') updated.sendPeriod = newPeriod;
            if (selectedField === 'feedbackDate') updated.feedbackPeriod = newPeriod;

            if (selectedField === 'sendDate' || selectedField === 'feedbackDate') {
                if (updated.sendDate && updated.feedbackDate) {
                    const send = parseISO(updated.sendDate);
                    const feedback = parseISO(updated.feedbackDate);
                    if (isValid(send) && isValid(feedback) && feedback >= send) {
                        const newBlocked = calculateBusinessDaysWithHolidays(
                            send, 
                            feedback, 
                            holidays, 
                            updated.sendPeriod || 'MANHA', 
                            updated.feedbackPeriod || 'TARDE'
                        );
                        if (newBlocked !== project.blockedDays) {
                            onApply([project.id], 'blockedDays', newBlocked);
                        }
                    }
                }
            }

            const newStatus = inferStatusFromDates(updated);

            if (newStatus !== project.status) {
                onApply([project.id], 'status', newStatus);
            }
        });
    }

    onClose();
  };

  // Dynamic Input Renderer (Edit Mode)
  const renderEditInput = () => {
    const commonClasses = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all";

    if (fieldConfig.key === 'discipline') {
      return (
        <select 
          value={newValue} 
          onChange={(e) => setNewValue(e.target.value)} 
          className={commonClasses}
        >
          <option value="" disabled>Selecione a Disciplina</option>
          {Object.values(Discipline).map(d => <option key={d} value={d} className="dark:bg-slate-800">{d}</option>)}
        </select>
      );
    }

    if (fieldConfig.key === 'phase') {
      return (
        <select 
          value={newValue} 
          onChange={(e) => setNewValue(e.target.value)} 
          className={commonClasses}
        >
          <option value="" disabled>Selecione a Fase</option>
          {Object.values(ProjectPhase).map(p => <option key={p} value={p} className="dark:bg-slate-800">{p}</option>)}
        </select>
      );
    }

    if (fieldConfig.type === 'date') {
      return (
        <div className="flex gap-2">
            <input 
            type="date" 
            value={newValue} 
            onChange={(e) => setNewValue(e.target.value)} 
            className={`${commonClasses} dark:[color-scheme:dark]`}
            />
            <select 
                value={newPeriod} 
                onChange={(e) => setNewPeriod(e.target.value as Period)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
            >
                <option value="MANHA">Manhã</option>
                <option value="TARDE">Tarde</option>
            </select>
        </div>
      );
    }

    if (fieldConfig.type === 'number') {
      return (
        <input 
          type="number" 
          step="0.5"
          value={newValue} 
          onChange={(e) => setNewValue(e.target.value)} 
          className={commonClasses}
          placeholder="0"
        />
      );
    }

    // Default text
    return (
      <input 
        type="text" 
        value={newValue} 
        onChange={(e) => setNewValue(e.target.value)} 
        className={commonClasses}
        placeholder="Novo valor..."
      />
    );
  };

  const renderWorkflowConfig = () => {
    return (
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">1. Selecione a Ação</label>
          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => setSelectedAction('COMPLETE')}
              className={`flex items-center space-x-3 p-3 rounded-lg border text-left transition-all ${selectedAction === 'COMPLETE' ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              <div className={`p-2 rounded-full ${selectedAction === 'COMPLETE' ? 'bg-violet-200 text-violet-700 dark:bg-violet-800 dark:text-violet-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                <CheckCircle2 size={18} />
              </div>
              <div>
                <span className={`block text-sm font-bold ${selectedAction === 'COMPLETE' ? 'text-violet-800 dark:text-violet-200' : 'text-slate-600 dark:text-slate-400'}`}>Concluir Execução</span>
                <span className="text-xs text-slate-500">Define Status "Execução Concluída" e data fim.</span>
              </div>
            </button>

            <button 
              onClick={() => setSelectedAction('SEND')}
              className={`flex items-center space-x-3 p-3 rounded-lg border text-left transition-all ${selectedAction === 'SEND' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              <div className={`p-2 rounded-full ${selectedAction === 'SEND' ? 'bg-blue-200 text-blue-700 dark:bg-blue-800 dark:text-blue-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                <Send size={18} />
              </div>
              <div>
                <span className={`block text-sm font-bold ${selectedAction === 'SEND' ? 'text-blue-800 dark:text-blue-200' : 'text-slate-600 dark:text-slate-400'}`}>Registrar Envio</span>
                <span className="text-xs text-slate-500">Requer data de fim anterior.</span>
              </div>
            </button>

            <button 
              onClick={() => setSelectedAction('APPROVE')}
              className={`flex items-center space-x-3 p-3 rounded-lg border text-left transition-all ${selectedAction === 'APPROVE' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              <div className={`p-2 rounded-full ${selectedAction === 'APPROVE' ? 'bg-emerald-200 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                <BadgeCheck size={18} />
              </div>
              <div>
                <span className={`block text-sm font-bold ${selectedAction === 'APPROVE' ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-400'}`}>Aprovar Projetos</span>
                <span className="text-xs text-slate-500">Requer data de envio anterior.</span>
              </div>
            </button>

            <button 
              onClick={() => setSelectedAction('REJECT')}
              className={`flex items-center space-x-3 p-3 rounded-lg border text-left transition-all ${selectedAction === 'REJECT' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              <div className={`p-2 rounded-full ${selectedAction === 'REJECT' ? 'bg-rose-200 text-rose-700 dark:bg-rose-800 dark:text-rose-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                <ThumbsDown size={18} />
              </div>
              <div>
                <span className={`block text-sm font-bold ${selectedAction === 'REJECT' ? 'text-rose-800 dark:text-rose-200' : 'text-slate-600 dark:text-slate-400'}`}>Reprovar Projetos</span>
                <span className="text-xs text-slate-500">Requer data de envio anterior.</span>
              </div>
            </button>
          </div>
        </div>

        <div>
           <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">2. Data de Registro</label>
           <input 
              type="date" 
              value={workflowDate}
              onChange={(e) => setWorkflowDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none dark:[color-scheme:dark]"
           />
           <div className="flex gap-2 mt-2 bg-slate-100 dark:bg-slate-700/50 p-2 rounded text-xs text-slate-500 dark:text-slate-400">
               <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
               <p>Atenção: Ações em lote assumem o período da TARDE para conclusão.</p>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[90vh] overflow-hidden border dark:border-slate-700">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Gerenciamento em Lote</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Edite campos ou execute ações de fluxo</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500 dark:text-slate-400"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          
          {/* Left: Configuration */}
          <div className="w-full md:w-1/3 p-6 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-y-auto">
            
            {/* Mode Switcher */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg mb-6 shrink-0">
               <button 
                  onClick={() => setMode('EDIT')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${mode === 'EDIT' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
               >
                  Editar Campos
               </button>
               <button 
                  onClick={() => setMode('WORKFLOW')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${mode === 'WORKFLOW' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
               >
                  Ações de Fluxo
               </button>
            </div>

            {mode === 'EDIT' ? (
              <div className="space-y-6">
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">1. Selecione o Campo</label>
                    <select 
                      value={selectedField}
                      onChange={(e) => {
                        setSelectedField(e.target.value as keyof ProjectFile);
                        setNewValue(''); // Reset value on field change
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                    >
                      {EDITABLE_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">2. Defina o Novo Valor</label>
                    {renderEditInput()}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center">
                      <AlertCircle size={12} className="mr-1" />
                      Este valor substituirá o atual nos registros selecionados.
                    </p>
                  </div>
              </div>
            ) : (
               renderWorkflowConfig()
            )}

          </div>

          {/* Right: Selection */}
          <div className="w-full md:w-2/3 flex flex-col bg-slate-50 dark:bg-slate-900">
            
            {/* Advanced Filters */}
            <div className="p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                 <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    <Filter size={12} /> Filtros Rápidos
                 </div>
                 <div className="grid grid-cols-3 gap-2">
                    <div className="relative">
                        <Users size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select 
                            value={filterClient} 
                            onChange={(e) => setFilterClient(e.target.value)}
                            className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer"
                        >
                            <option value="ALL">Todos Clientes</option>
                            {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="relative">
                        <Layers size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select 
                            value={filterDiscipline} 
                            onChange={(e) => setFilterDiscipline(e.target.value)}
                            className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer"
                        >
                            <option value="ALL">Todas Disciplinas</option>
                            {Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>

                    <div className="relative">
                        <GitBranch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select 
                            value={filterRevision} 
                            onChange={(e) => setFilterRevision(e.target.value as RevisionFilter)}
                            className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer"
                        >
                            <option value="ALL">Todas Versões</option>
                            <option value="R0">Apenas R0</option>
                            <option value="REVISIONS">Apenas Revisões (R1+)</option>
                        </select>
                    </div>
                 </div>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center space-x-3 bg-white dark:bg-slate-800">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar arquivo..." 
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                 <span>{selectedIds.size} selecionados</span>
              </div>
            </div>

            {/* List Header (Select All) */}
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center">
              <button 
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 font-medium transition-colors"
              >
                 {filteredProjects.length > 0 && selectedIds.size === filteredProjects.length ? (
                    <CheckSquare size={18} className="text-brand-600 dark:text-brand-400" />
                 ) : (
                    <Square size={18} />
                 )}
                 <span>Selecionar Todos ({filteredProjects.length})</span>
              </button>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-10 text-slate-400">Nenhum arquivo encontrado com os filtros atuais.</div>
              ) : (
                filteredProjects.map(project => (
                  <div 
                    key={project.id}
                    onClick={() => toggleSelect(project.id)}
                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedIds.has(project.id) 
                        ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 shadow-sm' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-brand-200 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className={`mr-3 ${selectedIds.has(project.id) ? 'text-brand-600 dark:text-brand-400' : 'text-slate-300 dark:text-slate-600'}`}>
                      {selectedIds.has(project.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{project.filename}</p>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="truncate max-w-[150px]">{project.client}</span>
                        <span>•</span>
                        <span>{project.base || '-'}</span>
                        <span>•</span>
                        <span>{project.discipline}</span>
                      </div>
                    </div>
                    <div className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {mode === 'EDIT' ? String(project[selectedField] || '-') : project.status}
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-end items-center">
            
            {/* Action Buttons (Right Side) */}
            <div className="flex space-x-3">
              <button 
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleApply}
                disabled={selectedIds.size === 0}
                className={`px-6 py-2.5 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-md transition-all flex items-center gap-2 ${mode === 'WORKFLOW' ? 'bg-brand-700 hover:bg-brand-800' : 'bg-slate-700 hover:bg-slate-800'}`}
              >
                {mode === 'WORKFLOW' && <ArrowRight size={18} />}
                <span>{mode === 'WORKFLOW' ? 'Executar Ação' : 'Aplicar Edição'} em {selectedIds.size}</span>
              </button>
          </div>
        </div>

      </div>
    </div>
  );
};
