import React, { useState, useMemo } from 'react';
import { HardHat, Building2, Plus, Search } from 'lucide-react';
import { ClientDoc, ObraStatus, SiteType } from '../types';
import { getEffectiveStatus } from '../utils';
import { getSlaInfo, FormState, defaultForm, clientToForm, today } from './obras/shared';
import { StatCard } from './obras/StatCard';
import { ObraCard } from './obras/ObraCard';
import { ObraFormModal } from './obras/ObraFormModal';

type FilterTab = 'ALL' | ObraStatus;

interface ObrasPageProps {
  clients: ClientDoc[];
  projectCount: (clientName: string) => number;
  onAddClient: (client: Omit<ClientDoc, 'id'>) => void;
  onUpdateClient: (client: ClientDoc) => void;
  onDeleteClient: (id: string) => void;
}

export const ObrasPage: React.FC<ObrasPageProps> = ({
  clients,
  projectCount,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
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
    const active = clients.filter((c) => getEffectiveStatus(c) === ObraStatus.ACTIVE);
    const atRisk = active.filter((c) => {
      const sla = getSlaInfo(c);
      return sla && (sla.isOverdue || sla.isAtRisk);
    });
    return {
      total: clients.length,
      active: active.length,
      atRisk: atRisk.length,
      completed: clients.filter((c) => getEffectiveStatus(c) === ObraStatus.COMPLETED).length,
      paused: clients.filter((c) => getEffectiveStatus(c) === ObraStatus.PAUSED).length,
      cancelled: clients.filter((c) => getEffectiveStatus(c) === ObraStatus.CANCELLED).length,
    };
  }, [clients]);

  // ── filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients
      .filter((c) => {
        if (filterTab !== 'ALL' && getEffectiveStatus(c) !== filterTab) return false;
        if (q && !c.name.toLowerCase().includes(q) && !(c.location || '').toLowerCase().includes(q))
          return false;
        return true;
      })
      .sort((a, b) => {
        const order = [
          ObraStatus.ACTIVE,
          ObraStatus.PAUSED,
          ObraStatus.COMPLETED,
          ObraStatus.CANCELLED,
        ];
        const sa = order.indexOf(getEffectiveStatus(a));
        const sb = order.indexOf(getEffectiveStatus(b));
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [clients, filterTab, search]);

  // ── form helpers ───────────────────────────────────────────────────────────
  const openNew = () => {
    setFormData(defaultForm);
    setEditingId(null);
    setIsFormOpen(true);
  };
  const openEdit = (c: ClientDoc) => {
    setFormData(clientToForm(c));
    setEditingId(c.id);
    setIsFormOpen(true);
  };
  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const normalized = formData.name.trim().toLowerCase();
    const isDuplicate = clients.some((c) => {
      if (editingId && c.id === editingId) return false;
      return c.name.trim().toLowerCase() === normalized;
    });
    if (isDuplicate) {
      alert('Já existe uma obra com este nome.');
      return;
    }

    const needsCompletedAt =
      formData.obraStatus === ObraStatus.COMPLETED || formData.obraStatus === ObraStatus.CANCELLED;
    // Rodovia: bases nomeadas limpas; o número de bases deriva da lista (sem redundância)
    const cleanBases =
      formData.type === SiteType.HIGHWAY ? formData.bases.map((b) => b.trim()).filter(Boolean) : [];
    const payload: Omit<ClientDoc, 'id'> = {
      name: formData.name.trim(),
      location: formData.location,
      type: formData.type,
      numberOfBases:
        formData.type === SiteType.HIGHWAY
          ? cleanBases.length || undefined
          : formData.numberOfBases || undefined,
      bases: cleanBases.length > 0 ? cleanBases : undefined,
      obraStartDate: formData.obraStartDate || undefined,
      expectedCompletionDate: formData.obraEndDate || undefined,
      projectDeadlineDate: formData.projectDeadlineDate || undefined,
      // contractDate/deadlineDays (SLA antigo) propositalmente FORA do payload: são
      // somente-leitura no formulário, então não devem ser reescritos ao salvar — o
      // valor que já está em Firestore (se houver) é preservado pelo merge do updateDoc.
      obraStatus: formData.obraStatus,
      completedAt: needsCompletedAt ? formData.completedAt || today : '',
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
  const startCompleting = (id: string) => {
    setCompletingId(id);
    setCompletingDate(today);
  };
  const cancelCompleting = () => setCompletingId(null);
  const confirmComplete = (client: ClientDoc) => {
    onUpdateClient({
      ...client,
      obraStatus: ObraStatus.COMPLETED,
      completedAt: completingDate || today,
    });
    setCompletingId(null);
  };
  const reactivate = (client: ClientDoc) => {
    if (!confirm(`Reativar a obra "${client.name}"?\n\nOs alertas de SLA voltarão a ser exibidos.`))
      return;
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
          {(
            [
              ['ALL', `Todas (${stats.total})`],
              [ObraStatus.ACTIVE, `Ativas (${stats.active})`],
              [ObraStatus.PAUSED, `Pausadas (${stats.paused})`],
              [ObraStatus.COMPLETED, `Concluídas (${stats.completed})`],
              [ObraStatus.CANCELLED, `Canceladas (${stats.cancelled})`],
            ] as [FilterTab, string][]
          ).map(([value, label]) => (
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
            onChange={(e) => setSearch(e.target.value)}
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
          {filtered.map((client) => (
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
