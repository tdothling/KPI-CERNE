
import React, { useState, useMemo } from 'react';
import { ProjectFile, Discipline, Status, Period, ProjectPhase } from '../types';
import { X, Search, CheckSquare, Square, AlertCircle, CheckCircle2, Send, BadgeCheck, ThumbsDown, ArrowRight, ArrowLeft, Filter, Layers, Users, GitBranch, Pencil } from 'lucide-react';
import { parseISO, isValid } from 'date-fns';
import { getRevisionNumber, calculateBusinessDaysWithHolidays, inferStatusFromDates, canTransitionTo } from '../utils';
import { ProjectBatchPatch } from '../hooks/useAppData';

type WorkflowAction = 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT';
type BatchAction = 'EDIT_FIELD' | WorkflowAction;
type RevisionFilter = 'ALL' | 'R0' | 'REVISIONS';
type Step = 'SELECT' | 'ACTION';

interface BatchEditModalProps {
  projects: ProjectFile[];
  onClose: () => void;
  onApplyPatches: (patches: ProjectBatchPatch[]) => void;
  onWorkflow: (ids: string[], action: WorkflowAction, date: string, period: Period) => void;
  holidays: string[];
}

// Campos permitidos para edição em lote
const EDITABLE_FIELDS: { key: keyof ProjectFile; label: string; type: 'text' | 'number' | 'date' | 'enum' }[] = [
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

const PERIOD_FIELD: Partial<Record<keyof ProjectFile, keyof ProjectFile>> = {
  startDate: 'startPeriod',
  endDate: 'endPeriod',
  sendDate: 'sendPeriod',
  feedbackDate: 'feedbackPeriod',
};

const ACTIONS: { key: BatchAction; label: string; desc: string; icon: React.ReactNode; activeClasses: string; iconActiveClasses: string }[] = [
  { key: 'EDIT_FIELD', label: 'Editar um campo', desc: 'Substitui o valor de um campo nos arquivos selecionados.', icon: <Pencil size={18} />, activeClasses: 'border-slate-500 bg-slate-50 dark:bg-slate-700/50', iconActiveClasses: 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200' },
  { key: 'COMPLETE', label: 'Concluir Execução', desc: 'Define status "Execução Concluída" e a data fim.', icon: <CheckCircle2 size={18} />, activeClasses: 'border-violet-500 bg-violet-50 dark:bg-violet-900/30', iconActiveClasses: 'bg-violet-200 text-violet-700 dark:bg-violet-800 dark:text-violet-300' },
  { key: 'SEND', label: 'Registrar Envio', desc: 'Define "Aguardando Aprovação". Requer execução concluída.', icon: <Send size={18} />, activeClasses: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30', iconActiveClasses: 'bg-blue-200 text-blue-700 dark:bg-blue-800 dark:text-blue-300' },
  { key: 'APPROVE', label: 'Aprovar Projetos', desc: 'Define "Aprovado" e recalcula dias bloqueados. Requer envio anterior.', icon: <BadgeCheck size={18} />, activeClasses: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30', iconActiveClasses: 'bg-emerald-200 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300' },
  { key: 'REJECT', label: 'Reprovar Projetos', desc: 'Define "Reprovado" e recalcula dias bloqueados. Requer envio anterior.', icon: <ThumbsDown size={18} />, activeClasses: 'border-rose-500 bg-rose-50 dark:bg-rose-900/30', iconActiveClasses: 'bg-rose-200 text-rose-700 dark:bg-rose-800 dark:text-rose-300' },
];

export const BatchEditModal: React.FC<BatchEditModalProps> = ({ projects, onClose, onApplyPatches, onWorkflow, holidays }) => {
  const [step, setStep] = useState<Step>('SELECT');

  // Passo 1: seleção
  const [searchFilter, setSearchFilter] = useState('');
  const [filterClient, setFilterClient] = useState<string>('ALL');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('ALL');
  const [filterRevision, setFilterRevision] = useState<RevisionFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Passo 2: ação
  const [action, setAction] = useState<BatchAction>('EDIT_FIELD');
  const [selectedField, setSelectedField] = useState<keyof ProjectFile>('client');
  const [newValue, setNewValue] = useState<string>('');
  const [newPeriod, setNewPeriod] = useState<Period>('MANHA');
  const [workflowDate, setWorkflowDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [workflowPeriod, setWorkflowPeriod] = useState<Period>('TARDE');

  const fieldConfig = EDITABLE_FIELDS.find(f => f.key === selectedField)!;

  const uniqueClients = useMemo(() => Array.from(new Set(projects.map(p => p.client))).sort(), [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const search = searchFilter.toLowerCase();
      const matchesSearch =
        p.filename.toLowerCase().includes(search) ||
        p.client.toLowerCase().includes(search) ||
        (p.base && p.base.toLowerCase().includes(search));

      const matchesClient = filterClient === 'ALL' || p.client === filterClient;
      const matchesDiscipline = filterDiscipline === 'ALL' || p.discipline === filterDiscipline;

      let matchesRevision = true;
      const revNum = getRevisionNumber(p.filename);
      if (filterRevision === 'R0') matchesRevision = revNum === 0;
      if (filterRevision === 'REVISIONS') matchesRevision = revNum > 0;

      return matchesSearch && matchesClient && matchesDiscipline && matchesRevision;
    });
  }, [projects, searchFilter, filterClient, filterDiscipline, filterRevision]);

  const selectedProjects = useMemo(() => projects.filter(p => selectedIds.has(p.id)), [projects, selectedIds]);

  // Prévia de elegibilidade: quantos dos selecionados podem receber a ação de fluxo
  const eligibleProjects = useMemo(() => {
    if (action === 'EDIT_FIELD') return selectedProjects;
    return selectedProjects.filter(p => canTransitionTo(p.status, action));
  }, [selectedProjects, action]);

  const ineligibleCount = selectedProjects.length - eligibleProjects.length;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (filteredProjects.length > 0 && filteredProjects.every(p => selectedIds.has(p.id))) {
      const next = new Set(selectedIds);
      filteredProjects.forEach(p => next.delete(p.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredProjects.forEach(p => next.add(p.id));
      setSelectedIds(next);
    }
  };

  const valueIsValid = action !== 'EDIT_FIELD' || newValue.trim() !== '';
  const canApply = eligibleProjects.length > 0 && valueIsValid && (action === 'EDIT_FIELD' || !!workflowDate);

  // Monta UM patch por projeto com TODAS as mudanças (valor + período + dias bloqueados + status),
  // gravado de uma só vez — evita a corrida de escritas que revertia campos no fluxo antigo.
  const buildEditPatches = (): ProjectBatchPatch[] => {
    return eligibleProjects.map(project => {
      const changes: Partial<ProjectFile> = {};
      (changes as any)[selectedField] = fieldConfig.type === 'number' ? Number(newValue) : newValue;

      const periodField = PERIOD_FIELD[selectedField];
      if (fieldConfig.type === 'date' && periodField) {
        (changes as any)[periodField] = newPeriod;
      }

      if (fieldConfig.type === 'date') {
        const merged = { ...project, ...changes };
        if ((selectedField === 'sendDate' || selectedField === 'feedbackDate') && merged.sendDate && merged.feedbackDate) {
          const send = parseISO(merged.sendDate);
          const feedback = parseISO(merged.feedbackDate);
          if (isValid(send) && isValid(feedback) && feedback >= send) {
            changes.blockedDays = calculateBusinessDaysWithHolidays(send, feedback, holidays, merged.sendPeriod || 'MANHA', merged.feedbackPeriod || 'TARDE');
          }
        }
        const newStatus = inferStatusFromDates({ ...project, ...changes });
        if (newStatus !== project.status) changes.status = newStatus;
      }

      return { id: project.id, changes };
    });
  };

  const handleApply = () => {
    if (!canApply) return;
    if (action === 'EDIT_FIELD') {
      onApplyPatches(buildEditPatches());
    } else {
      onWorkflow(eligibleProjects.map(p => p.id), action, workflowDate, workflowPeriod);
    }
    onClose();
  };

  const inputClasses = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all";

  const renderEditValueInput = () => {
    if (fieldConfig.key === 'discipline') {
      return (
        <select value={newValue} onChange={(e) => setNewValue(e.target.value)} className={inputClasses}>
          <option value="" disabled>Selecione a Disciplina</option>
          {Object.values(Discipline).map(d => <option key={d} value={d} className="dark:bg-slate-800">{d}</option>)}
        </select>
      );
    }
    if (fieldConfig.key === 'phase') {
      return (
        <select value={newValue} onChange={(e) => setNewValue(e.target.value)} className={inputClasses}>
          <option value="" disabled>Selecione a Fase</option>
          {Object.values(ProjectPhase).map(p => <option key={p} value={p} className="dark:bg-slate-800">{p}</option>)}
        </select>
      );
    }
    if (fieldConfig.type === 'date') {
      return (
        <div className="flex gap-2">
          <input type="date" value={newValue} onChange={(e) => setNewValue(e.target.value)} className={`${inputClasses} dark:[color-scheme:dark]`} />
          <select value={newPeriod} onChange={(e) => setNewPeriod(e.target.value as Period)} className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
            <option value="MANHA">Manhã</option>
            <option value="TARDE">Tarde</option>
          </select>
        </div>
      );
    }
    if (fieldConfig.type === 'number') {
      return <input type="number" step="0.5" value={newValue} onChange={(e) => setNewValue(e.target.value)} className={inputClasses} placeholder="0" />;
    }
    return <input type="text" value={newValue} onChange={(e) => setNewValue(e.target.value)} className={inputClasses} placeholder="Novo valor..." />;
  };

  // ---------- PASSO 1: Seleção de arquivos ----------
  const renderSelectStep = () => (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            <Filter size={12} /> Filtros Rápidos
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative">
              <Users size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer">
                <option value="ALL">Todos Clientes</option>
                {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="relative">
              <Layers size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select value={filterDiscipline} onChange={(e) => setFilterDiscipline(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer">
                <option value="ALL">Todas Disciplinas</option>
                {Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="relative">
              <GitBranch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select value={filterRevision} onChange={(e) => setFilterRevision(e.target.value as RevisionFilter)} className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer">
                <option value="ALL">Todas Versões</option>
                <option value="R0">Apenas R0</option>
                <option value="REVISIONS">Apenas Revisões (R1+)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 bg-white dark:bg-slate-800">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Buscar arquivo, cliente ou base..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
          </div>
          <button type="button" onClick={toggleSelectAll} className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 font-medium transition-colors whitespace-nowrap">
            {filteredProjects.length > 0 && filteredProjects.every(p => selectedIds.has(p.id)) ? (
              <CheckSquare size={18} className="text-brand-600 dark:text-brand-400" />
            ) : (
              <Square size={18} />
            )}
            <span>Selecionar Todos ({filteredProjects.length})</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50 dark:bg-slate-900">
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
                  {project.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-between items-center">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{selectedIds.size} arquivo(s) selecionado(s)</span>
        <div className="flex space-x-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors">Cancelar</button>
          <button
            type="button"
            onClick={() => setStep('ACTION')}
            disabled={selectedIds.size === 0}
            className="px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-md transition-all flex items-center gap-2"
          >
            <span>Continuar</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </>
  );

  // ---------- PASSO 2: Escolha da ação ----------
  const renderActionStep = () => (
    <>
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Esquerda: qual ação */}
        <div className="w-full md:w-1/2 p-6 border-r border-slate-200 dark:border-slate-700 overflow-y-auto">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">O que você deseja fazer com os {selectedProjects.length} arquivos?</label>
          <div className="grid grid-cols-1 gap-2">
            {ACTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setAction(opt.key)}
                className={`flex items-center space-x-3 p-3 rounded-lg border text-left transition-all ${action === opt.key ? opt.activeClasses : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                <div className={`p-2 rounded-full ${action === opt.key ? opt.iconActiveClasses : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                  {opt.icon}
                </div>
                <div>
                  <span className={`block text-sm font-bold ${action === opt.key ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{opt.label}</span>
                  <span className="text-xs text-slate-500">{opt.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Direita: configuração da ação + resumo */}
        <div className="w-full md:w-1/2 p-6 bg-slate-50 dark:bg-slate-900 overflow-y-auto space-y-6">
          {action === 'EDIT_FIELD' ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Campo a editar</label>
                <select
                  value={selectedField}
                  onChange={(e) => { setSelectedField(e.target.value as keyof ProjectFile); setNewValue(''); }}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  {EDITABLE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Novo valor</label>
                {renderEditValueInput()}
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Data de Registro</label>
              <div className="flex gap-2">
                <input type="date" value={workflowDate} onChange={(e) => setWorkflowDate(e.target.value)} className={`${inputClasses} dark:[color-scheme:dark]`} />
                <select value={workflowPeriod} onChange={(e) => setWorkflowPeriod(e.target.value as Period)} className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
                  <option value="MANHA">Manhã</option>
                  <option value="TARDE">Tarde</option>
                </select>
              </div>
            </div>
          )}

          {/* Resumo do que vai acontecer */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Resumo</div>
            {action === 'EDIT_FIELD' ? (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                O campo <strong>{fieldConfig.label}</strong> será alterado para{' '}
                <strong>{newValue.trim() === '' ? '(defina o novo valor)' : newValue}</strong> em <strong>{selectedProjects.length}</strong> arquivo(s).
                {fieldConfig.type === 'date' && ' O período e o status serão atualizados automaticamente.'}
              </p>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                A ação <strong>{ACTIONS.find(a => a.key === action)?.label}</strong> será aplicada em <strong>{eligibleProjects.length}</strong> de {selectedProjects.length} arquivo(s) selecionado(s).
              </p>
            )}
            {action !== 'EDIT_FIELD' && ineligibleCount > 0 && (
              <div className="flex gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2 rounded text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <p>{ineligibleCount} arquivo(s) não estão no status adequado para esta ação e serão ignorados.</p>
              </div>
            )}
            {action === 'EDIT_FIELD' && (
              <div className="flex gap-2 bg-slate-100 dark:bg-slate-700/50 p-2 rounded text-xs text-slate-500 dark:text-slate-400">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <p>O valor atual será substituído e não poderá ser recuperado automaticamente.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-between items-center">
        <button type="button" onClick={() => setStep('SELECT')} className="px-4 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors flex items-center gap-2">
          <ArrowLeft size={18} />
          <span>Voltar à seleção</span>
        </button>
        <div className="flex space-x-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors">Cancelar</button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="px-6 py-2.5 bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-md transition-all flex items-center gap-2"
          >
            <ArrowRight size={18} />
            <span>Aplicar em {eligibleProjects.length} arquivo(s)</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full flex flex-col h-[85vh] overflow-hidden border dark:border-slate-700">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Edição em Lote — Projetos</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {step === 'SELECT' ? 'Passo 1 de 2 — Selecione os arquivos' : `Passo 2 de 2 — Escolha a ação (${selectedProjects.length} selecionados)`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <X size={24} />
          </button>
        </div>

        {step === 'SELECT' ? renderSelectStep() : renderActionStep()}
      </div>
    </div>
  );
};
