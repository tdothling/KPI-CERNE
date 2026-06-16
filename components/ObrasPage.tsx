import React, { useState, useMemo } from 'react';
import {
  HardHat, Building2, MapPin, Plus, X, Save, CheckCircle2, RotateCcw,
  Edit2, Trash2, Search, AlertTriangle, XCircle, PauseCircle,
  User, Calendar, ChevronDown, FileText, Clock
} from 'lucide-react';
import { ClientDoc, SiteType, ObraStatus } from '../types';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';

// ─── helpers ────────────────────────────────────────────────────────────────

export function getEffectiveStatus(client: ClientDoc): ObraStatus {
  if (client.obraStatus) return client.obraStatus;
  if (client.completedAt) return ObraStatus.COMPLETED;
  return ObraStatus.ACTIVE;
}

function getSlaInfo(client: ClientDoc) {
  if (!client.contractDate || client.deadlineDays === undefined) return null;
  try {
    const start = parseISO(client.contractDate);
    const end = addDays(start, client.deadlineDays);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const elapsed = Math.max(0, differenceInDays(today, start));
    const remaining = differenceInDays(end, today);
    const progress = Math.min(100, Math.max(0, (elapsed / client.deadlineDays) * 100));
    const isOverdue = today > end;
    return { end, elapsed, remaining, progress, isOverdue, isAtRisk: !isOverdue && remaining <= 7 };
  } catch { return null; }
}

const STATUS_CONFIG: Record<ObraStatus, {
  label: string;
  Icon: React.FC<{ size?: number; className?: string }>;
  badge: string;
  iconWrap: string;
  cardBorder: string;
}> = {
  [ObraStatus.ACTIVE]: {
    label: 'Em andamento',
    Icon: HardHat,
    badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    iconWrap: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    cardBorder: 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700',
  },
  [ObraStatus.PAUSED]: {
    label: 'Pausada',
    Icon: PauseCircle,
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    iconWrap: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    cardBorder: 'border-amber-200 dark:border-amber-800/50',
  },
  [ObraStatus.COMPLETED]: {
    label: 'Concluída',
    Icon: CheckCircle2,
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    iconWrap: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    cardBorder: 'border-emerald-200 dark:border-emerald-800/50',
  },
  [ObraStatus.CANCELLED]: {
    label: 'Cancelada',
    Icon: XCircle,
    badge: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600',
    iconWrap: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400',
    cardBorder: 'border-slate-200 dark:border-slate-700 opacity-70',
  },
};

const today = new Date().toISOString().split('T')[0];

// ─── form types ─────────────────────────────────────────────────────────────

type FilterTab = 'ALL' | ObraStatus;

interface FormState {
  name: string;
  location: string;
  type: SiteType;
  numberOfBases: number;
  contractDate: string;
  deadlineDays: number | undefined;
  obraStatus: ObraStatus;
  completedAt: string;
  expectedCompletionDate: string;
  responsavel: string;
  observacoes: string;
}

const defaultForm: FormState = {
  name: '', location: '', type: SiteType.CONSTRUCTION_SITE, numberOfBases: 0,
  contractDate: '', deadlineDays: undefined, obraStatus: ObraStatus.ACTIVE,
  completedAt: '', expectedCompletionDate: '', responsavel: '', observacoes: '',
};

function clientToForm(c: ClientDoc): FormState {
  return {
    name: c.name,
    location: c.location || '',
    type: c.type,
    numberOfBases: c.numberOfBases || 0,
    contractDate: c.contractDate || '',
    deadlineDays: c.deadlineDays,
    obraStatus: getEffectiveStatus(c),
    completedAt: c.completedAt || '',
    expectedCompletionDate: c.expectedCompletionDate || '',
    responsavel: c.responsavel || '',
    observacoes: c.observacoes || '',
  };
}

// ─── props ───────────────────────────────────────────────────────────────────

interface ObrasPageProps {
  clients: ClientDoc[];
  projectCount: (clientName: string) => number;
  onAddClient: (client: Omit<ClientDoc, 'id'>) => void;
  onUpdateClient: (client: ClientDoc) => void;
  onDeleteClient: (id: string) => void;
}

// ─── main component ──────────────────────────────────────────────────────────

export const ObrasPage: React.FC<ObrasPageProps> = ({
  clients, projectCount, onAddClient, onUpdateClient, onDeleteClient,
}) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormState>(defaultForm);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completingDate, setCompletingDate] = useState(today);

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = clients.filter(c => getEffectiveStatus(c) === ObraStatus.ACTIVE);
    const atRisk = active.filter(c => {
      const sla = getSlaInfo(c);
      return sla && (sla.isOverdue || sla.isAtRisk);
    });
    return {
      total: clients.length,
      active: active.length,
      atRisk: atRisk.length,
      completed: clients.filter(c => getEffectiveStatus(c) === ObraStatus.COMPLETED).length,
      paused: clients.filter(c => getEffectiveStatus(c) === ObraStatus.PAUSED).length,
      cancelled: clients.filter(c => getEffectiveStatus(c) === ObraStatus.CANCELLED).length,
    };
  }, [clients]);

  // ── filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients
      .filter(c => {
        if (filterTab !== 'ALL' && getEffectiveStatus(c) !== filterTab) return false;
        if (q && !c.name.toLowerCase().includes(q) && !(c.location || '').toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const order = [ObraStatus.ACTIVE, ObraStatus.PAUSED, ObraStatus.COMPLETED, ObraStatus.CANCELLED];
        const sa = order.indexOf(getEffectiveStatus(a));
        const sb = order.indexOf(getEffectiveStatus(b));
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [clients, filterTab, search]);

  // ── form helpers ───────────────────────────────────────────────────────────
  const openNew = () => { setFormData(defaultForm); setEditingId(null); setIsFormOpen(true); };
  const openEdit = (c: ClientDoc) => { setFormData(clientToForm(c)); setEditingId(c.id); setIsFormOpen(true); };
  const closeForm = () => { setIsFormOpen(false); setEditingId(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const normalized = formData.name.trim().toLowerCase();
    const isDuplicate = clients.some(c => {
      if (editingId && c.id === editingId) return false;
      return c.name.trim().toLowerCase() === normalized;
    });
    if (isDuplicate) { alert('Já existe uma obra com este nome.'); return; }

    const needsCompletedAt = formData.obraStatus === ObraStatus.COMPLETED || formData.obraStatus === ObraStatus.CANCELLED;
    const payload: Omit<ClientDoc, 'id'> = {
      name: formData.name.trim(),
      location: formData.location,
      type: formData.type,
      numberOfBases: formData.numberOfBases || undefined,
      contractDate: formData.contractDate || undefined,
      deadlineDays: formData.deadlineDays,
      obraStatus: formData.obraStatus,
      completedAt: needsCompletedAt ? (formData.completedAt || today) : '',
      expectedCompletionDate: formData.expectedCompletionDate || undefined,
      responsavel: formData.responsavel || undefined,
      observacoes: formData.observacoes || undefined,
    };

    if (editingId) {
      onUpdateClient({ id: editingId, ...payload });
    } else {
      onAddClient(payload);
    }
    closeForm();
  };

  // ── quick-complete helpers ─────────────────────────────────────────────────
  const startCompleting = (id: string) => { setCompletingId(id); setCompletingDate(today); };
  const cancelCompleting = () => setCompletingId(null);
  const confirmComplete = (client: ClientDoc) => {
    onUpdateClient({ ...client, obraStatus: ObraStatus.COMPLETED, completedAt: completingDate || today });
    setCompletingId(null);
  };
  const reactivate = (client: ClientDoc) => {
    if (!confirm(`Reativar a obra "${client.name}"?\n\nOs alertas de SLA voltarão a ser exibidos.`)) return;
    onUpdateClient({ ...client, obraStatus: ObraStatus.ACTIVE, completedAt: '' });
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <HardHat className="text-brand-600 dark:text-brand-400" size={28} />
            Controle de Obras
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Gestão do ciclo de vida das obras e contratos
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all"
        >
          <Plus size={16} /> Nova Obra
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total de Obras" value={stats.total} color="slate" />
        <StatCard label="Ativas" value={stats.active} color="blue" />
        <StatCard label="Em Risco (SLA)" value={stats.atRisk} color="rose" alert />
        <StatCard label="Concluídas" value={stats.completed} color="emerald" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 overflow-x-auto">
          {([
            ['ALL', `Todas (${stats.total})`],
            [ObraStatus.ACTIVE, `Ativas (${stats.active})`],
            [ObraStatus.PAUSED, `Pausadas (${stats.paused})`],
            [ObraStatus.COMPLETED, `Concluídas (${stats.completed})`],
            [ObraStatus.CANCELLED, `Canceladas (${stats.cancelled})`],
          ] as [FilterTab, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilterTab(value)}
              className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap transition-all ${
                filterTab === value
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar obra ou local..."
            className="pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-700 dark:text-slate-200 w-56"
          />
        </div>
      </div>

      {/* Obra list */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-slate-400">
          <Building2 size={48} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhuma obra encontrada</p>
          <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre uma nova obra</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(client => (
            <ObraCard
              key={client.id}
              client={client}
              projCount={projectCount(client.name)}
              isCompleting={completingId === client.id}
              completingDate={completingDate}
              onCompletingDateChange={setCompletingDate}
              onStartComplete={() => startCompleting(client.id)}
              onConfirmComplete={() => confirmComplete(client)}
              onCancelComplete={cancelCompleting}
              onReactivate={() => reactivate(client)}
              onEdit={() => openEdit(client)}
              onDelete={() => onDeleteClient(client.id)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {isFormOpen && (
        <ObraFormModal
          form={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          onClose={closeForm}
          isEditing={!!editingId}
        />
      )}
    </div>
  );
};

// ─── StatCard ────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  slate:   'text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  blue:    'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30',
  rose:    'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-900/30',
  emerald: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30',
};

function StatCard({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${COLOR_MAP[color]}`}>
      <div className={`text-3xl font-black ${alert && value > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>{value}</div>
      <div className="text-xs font-semibold mt-1 opacity-70">{label}</div>
    </div>
  );
}

// ─── ObraCard ────────────────────────────────────────────────────────────────

interface ObraCardProps {
  client: ClientDoc;
  projCount: number;
  isCompleting: boolean;
  completingDate: string;
  onCompletingDateChange: (d: string) => void;
  onStartComplete: () => void;
  onConfirmComplete: () => void;
  onCancelComplete: () => void;
  onReactivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ObraCard({
  client, projCount, isCompleting, completingDate, onCompletingDateChange,
  onStartComplete, onConfirmComplete, onCancelComplete, onReactivate, onEdit, onDelete,
}: ObraCardProps) {
  const status = getEffectiveStatus(client);
  const cfg = STATUS_CONFIG[status];
  const sla = getSlaInfo(client);
  const isActive = status === ObraStatus.ACTIVE;
  const isDone = status === ObraStatus.COMPLETED || status === ObraStatus.CANCELLED;

  const slaBarColor = !sla ? '' :
    sla.isOverdue ? 'bg-rose-500' :
    sla.progress > 85 ? 'bg-amber-500' :
    sla.progress > 65 ? 'bg-yellow-400' : 'bg-emerald-500';

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-4 transition-all ${cfg.cardBorder}`}>
      <div className="flex items-start justify-between gap-3">

        {/* Left: icon + info */}
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 p-2.5 rounded-xl flex-shrink-0 ${cfg.iconWrap}`}>
            <cfg.Icon size={18} />
          </div>

          <div className="min-w-0">
            {/* Name + status badge */}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-800 dark:text-white">{client.name}</h3>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                {cfg.label}
              </span>
              {sla?.isOverdue && isActive && (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800 flex items-center gap-1">
                  <AlertTriangle size={10} /> SLA Vencido
                </span>
              )}
              {sla?.isAtRisk && isActive && !sla.isOverdue && (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 flex items-center gap-1">
                  <Clock size={10} /> Em Risco
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {client.location || 'Local não informado'}
              </span>
              <span>•</span>
              <span>{client.type === SiteType.CONSTRUCTION_SITE ? 'Canteiro de Obras' : `Bases Operacionais${client.numberOfBases ? ` (${client.numberOfBases})` : ''}`}</span>
              {projCount > 0 && (
                <><span>•</span><span className="font-semibold text-brand-600 dark:text-brand-400">{projCount} projeto{projCount !== 1 ? 's' : ''}</span></>
              )}
              {client.responsavel && (
                <><span>•</span><span className="flex items-center gap-1"><User size={11} />{client.responsavel}</span></>
              )}
            </div>

            {/* SLA / dates row */}
            {(client.contractDate || client.deadlineDays !== undefined || client.expectedCompletionDate || client.completedAt) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                {client.contractDate && (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} /> Contrato: {format(parseISO(client.contractDate), 'dd/MM/yyyy')}
                  </span>
                )}
                {client.deadlineDays !== undefined && (
                  <span className="font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded border border-brand-100 dark:border-brand-900/30">
                    SLA: {client.deadlineDays} dias
                  </span>
                )}
                {sla && (
                  <span className={`font-medium ${sla.isOverdue ? 'text-rose-600 dark:text-rose-400' : sla.isAtRisk ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {sla.isOverdue
                      ? `Venceu há ${Math.abs(sla.remaining)} dias`
                      : `${sla.remaining} dias restantes`}
                  </span>
                )}
                {client.expectedCompletionDate && (
                  <span className="flex items-center gap-1">
                    Previsto: {format(parseISO(client.expectedCompletionDate), 'dd/MM/yyyy')}
                  </span>
                )}
                {client.completedAt && isDone && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {status === ObraStatus.CANCELLED ? 'Cancelada' : 'Concluída'} em {format(parseISO(client.completedAt), 'dd/MM/yyyy')}
                  </span>
                )}
              </div>
            )}

            {/* SLA progress bar */}
            {sla && isActive && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${slaBarColor}`}
                    style={{ width: `${Math.min(100, sla.progress)}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold tabular-nums ${
                  sla.isOverdue ? 'text-rose-600 dark:text-rose-400' :
                  sla.progress > 85 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                }`}>
                  {Math.round(sla.progress)}%
                </span>
              </div>
            )}

            {/* Observações */}
            {client.observacoes && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic flex items-start gap-1">
                <FileText size={11} className="mt-0.5 flex-shrink-0" />
                {client.observacoes}
              </p>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive && !isCompleting && (
            <button
              onClick={onStartComplete}
              className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              title="Concluir Obra"
            >
              <CheckCircle2 size={16} />
            </button>
          )}
          {isDone && (
            <button
              onClick={onReactivate}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              title="Reativar Obra"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            title="Editar"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600 transition-colors"
            title="Excluir"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Inline quick-complete row */}
      {isCompleting && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Data de conclusão:</span>
          <input
            type="date"
            value={completingDate}
            onChange={e => onCompletingDateChange(e.target.value)}
            max={today}
            className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500 dark:[color-scheme:dark]"
          />
          <button
            onClick={onConfirmComplete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <CheckCircle2 size={13} /> Confirmar
          </button>
          <button
            onClick={onCancelComplete}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ObraFormModal ────────────────────────────────────────────────────────────

interface ObraFormModalProps {
  form: FormState;
  onChange: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isEditing: boolean;
}

function ObraFormModal({ form, onChange, onSubmit, onClose, isEditing }: ObraFormModalProps) {
  const set = (patch: Partial<FormState>) => onChange(prev => ({ ...prev, ...patch }));
  const needsDate = form.obraStatus === ObraStatus.COMPLETED || form.obraStatus === ObraStatus.CANCELLED;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <HardHat className="text-brand-600 dark:text-brand-400" size={20} />
            {isEditing ? 'Editar Obra' : 'Nova Obra'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-slate-400" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* Informações Básicas */}
            <Section title="Informações Básicas">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Nome da Obra *</Label>
                  <input
                    required type="text" value={form.name}
                    onChange={e => set({ name: e.target.value })}
                    placeholder="Ex: Construtora ABC – Sede"
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label>Local / Cidade</Label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" value={form.location}
                      onChange={e => set({ location: e.target.value })}
                      placeholder="Ex: São Paulo - SP"
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </div>
                <div>
                  <Label>Responsável</Label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" value={form.responsavel}
                      onChange={e => set({ responsavel: e.target.value })}
                      placeholder="Nome do responsável técnico"
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Tipo de Instalação</Label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {[
                    { value: SiteType.CONSTRUCTION_SITE, title: 'Canteiro de Obras', sub: 'Obra única centralizada' },
                    { value: SiteType.OPERATIONAL_BASE, title: 'Bases Operacionais', sub: 'Múltiplos pontos de atendimento' },
                  ].map(opt => (
                    <label key={opt.value} className={`flex items-center gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${form.type === opt.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                      <input type="radio" name="siteType" value={opt.value} checked={form.type === opt.value}
                        onChange={() => set({ type: opt.value, numberOfBases: 0 })}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{opt.title}</p>
                        <p className="text-xs text-slate-400">{opt.sub}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {form.type === SiteType.OPERATIONAL_BASE && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label>Número de Bases</Label>
                  <input type="number" min="1" value={form.numberOfBases || ''}
                    onChange={e => set({ numberOfBases: parseInt(e.target.value) || 0 })}
                    placeholder="Qtd." className={inputCls + ' w-32'}
                  />
                </div>
              )}
            </Section>

            {/* SLA */}
            <Section title="Configuração de SLA (Opcional)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Data Assinatura Contrato</Label>
                  <input type="date" value={form.contractDate}
                    onChange={e => set({ contractDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
                <div>
                  <Label>Dias Corridos (SLA)</Label>
                  <input type="number" min="0" value={form.deadlineDays ?? ''}
                    onChange={e => set({ deadlineDays: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="Ex: 90"
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label>Prazo Previsto de Conclusão</Label>
                  <input type="date" value={form.expectedCompletionDate}
                    onChange={e => set({ expectedCompletionDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
              </div>
            </Section>

            {/* Status */}
            <Section title="Status da Obra">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Status atual</Label>
                  <div className="relative">
                    <select
                      value={form.obraStatus}
                      onChange={e => {
                        const s = e.target.value as ObraStatus;
                        const autoDate = s === ObraStatus.COMPLETED || s === ObraStatus.CANCELLED
                          ? (form.completedAt || today) : '';
                        set({ obraStatus: s, completedAt: autoDate });
                      }}
                      className={inputCls + ' appearance-none pr-8'}
                    >
                      {Object.values(ObraStatus).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {needsDate && (
                  <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                    <Label>Data de {form.obraStatus === ObraStatus.CANCELLED ? 'Cancelamento' : 'Conclusão'}</Label>
                    <input type="date" value={form.completedAt || today}
                      onChange={e => set({ completedAt: e.target.value })}
                      max={today}
                      className={inputCls + ' dark:[color-scheme:dark]'}
                    />
                  </div>
                )}
              </div>
            </Section>

            {/* Observações */}
            <Section title="Observações (Opcional)">
              <textarea
                rows={3} value={form.observacoes}
                onChange={e => set({ observacoes: e.target.value })}
                placeholder="Informações adicionais sobre a obra..."
                className={inputCls + ' resize-none'}
              />
            </Section>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-700/30 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-5 py-2 bg-brand-700 hover:bg-brand-800 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
            >
              <Save size={15} /> {isEditing ? 'Salvar Alterações' : 'Cadastrar Obra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── micro helpers ────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-shadow';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">{children}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-1">{title}</h4>
      {children}
    </div>
  );
}
