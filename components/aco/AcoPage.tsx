import React, { useMemo, useState } from 'react';
import {
  Factory,
  Plus,
  Search,
  Edit2,
  History,
  Trash2,
  LayoutList,
  BarChart3,
} from 'lucide-react';
import { ClientDoc, RevisionReason } from '../../types';
import { formatCurrencyBR, formatDateDisplay, formatNumberBR } from '../../utils';
import {
  ALL_MATERIALS,
  KIND_LABEL,
  MATERIAL_TARGET,
  SteelKind,
  SteelRecord,
  WIND_BANDS,
  bandStats,
  deviations,
  fitExpectedCurve,
  timeSeries,
  totalCost,
  totalKg,
  windBandOf,
} from '../../domain/steel';
import {
  KIND_TABS,
  SteelFormState,
  WIND_BAND_BADGE_CLASS,
  defaultSteelForm,
  numbersChanged,
  steelRecordToForm,
} from './acoShared';
import { AcoRecordModal } from './AcoRecordModal';
import { AcoHistoryModal } from './AcoHistoryModal';
import { AcoKpiStrip } from './AcoKpiStrip';
import { AcoRecordsTable } from './AcoRecordsTable';
import { SteelBandChart, SteelScatterChart, SteelTimeSeriesChart } from './AcoCharts';

interface AcoPageProps {
  clients: ClientDoc[];
  steelRecords: SteelRecord[];
  isDarkMode: boolean;
  readOnly?: boolean;
  onAdd: (record: Omit<SteelRecord, 'id'>) => void;
  onUpdate: (id: string, changes: Record<string, any>) => void;
  onRevise: (
    current: SteelRecord,
    next: Omit<SteelRecord, 'id' | 'client' | 'base' | 'revisao' | 'revisions'>,
    reason: RevisionReason,
    comment: string,
  ) => void;
  onDelete: (record: SteelRecord) => void;
}

const validateAreas = (form: SteelFormState): string | null => {
  for (const m of ALL_MATERIALS) {
    const kg = form.materials[m]?.kg || 0;
    if (kg > 0) {
      const kind = MATERIAL_TARGET[m];
      const area =
        kind === 'leve' ? form.areaLeve : kind === 'pesada' ? form.areaPesada : form.areaCobertura;
      if (!area || area <= 0) {
        return `Para lançar kg de "${m}", informe a área de ${KIND_LABEL[kind]} correspondente (> 0).`;
      }
    }
  }
  return null;
};

export const AcoPage: React.FC<AcoPageProps> = ({
  clients,
  steelRecords,
  isDarkMode,
  readOnly = false,
  onAdd,
  onUpdate,
  onRevise,
  onDelete,
}) => {
  const [subView, setSubView] = useState<'dados' | 'indicadores'>('dados');

  // --- Cadastro ---
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SteelRecord | null>(null);
  const [formData, setFormData] = useState<SteelFormState>(defaultSteelForm());
  const [historyRecord, setHistoryRecord] = useState<SteelRecord | null>(null);

  const openNew = (client = '') => {
    setFormData(defaultSteelForm(client));
    setEditingRecord(null);
    setIsFormOpen(true);
  };
  const openEdit = (record: SteelRecord) => {
    setFormData(steelRecordToForm(record));
    setEditingRecord(record);
    setIsFormOpen(true);
  };
  const closeForm = () => {
    setIsFormOpen(false);
    setEditingRecord(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const client = formData.client.trim();
    const base = formData.base.trim();
    if (!client || !base) {
      alert('Selecione a obra e informe o local.');
      return;
    }
    const normalizedBase = base.toLowerCase();
    const isDuplicate = steelRecords.some((r) => {
      if (editingRecord && r.id === editingRecord.id) return false;
      return r.client === client && r.base.trim().toLowerCase() === normalizedBase;
    });
    if (isDuplicate) {
      alert(`Já existe um registro de aço para "${base}" nesta obra.`);
      return;
    }
    const areaError = validateAreas(formData);
    if (areaError) {
      alert(areaError);
      return;
    }

    const nextFields = {
      referenceDate: formData.referenceDate,
      windSpeed: formData.windSpeed,
      areaLeve: formData.areaLeve,
      areaPesada: formData.areaPesada,
      areaCobertura: formData.areaCobertura,
      materials: formData.materials,
      ...(formData.observacao ? { observacao: formData.observacao } : {}),
    };

    if (!editingRecord) {
      onAdd({ client, base, revisao: 0, revisions: [], ...nextFields });
    } else {
      // Renomear o local é uma correção, não uma revisão do consumo — segue à parte.
      if (base !== editingRecord.base) {
        onUpdate(editingRecord.id, { base });
      }
      if (formData.reviseChange && numbersChanged(editingRecord, formData)) {
        onRevise(editingRecord, nextFields, formData.reviseReason, formData.reviseComment);
      } else {
        onUpdate(editingRecord.id, nextFields);
      }
    }
    closeForm();
  };

  const baseSuggestions = useMemo(() => {
    const client = clients.find((c) => c.name === formData.client);
    const used = steelRecords.filter((r) => r.client === formData.client).map((r) => r.base);
    return Array.from(new Set([...(client?.bases || []), ...used]));
  }, [clients, steelRecords, formData.client]);

  // --- Agrupamento por obra (sub-view Dados) ---
  const groupedByClient = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, SteelRecord[]>();
    steelRecords.forEach((r) => {
      const arr = map.get(r.client) || [];
      arr.push(r);
      map.set(r.client, arr);
    });
    return Array.from(map.entries())
      .map(([client, records]) => ({
        client,
        records: [...records].sort((a, b) => a.base.localeCompare(b.base, 'pt-BR')),
      }))
      .filter(
        (g) =>
          !q ||
          g.client.toLowerCase().includes(q) ||
          g.records.some((r) => r.base.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.client.localeCompare(b.client, 'pt-BR'));
  }, [steelRecords, search]);

  // --- Filtros e cálculo (sub-view Indicadores) ---
  const [kind, setKind] = useState<SteelKind>('leve');
  const [filterClients, setFilterClients] = useState<string[]>([]);
  const [filterBands, setFilterBands] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [granularity, setGranularity] = useState<'ANO' | 'SEMESTRE'>('ANO');

  const availableClients = useMemo(
    () =>
      Array.from(new Set(steelRecords.map((r) => r.client))).sort((a: string, b: string) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [steelRecords],
  );

  const filteredRecords = useMemo(
    () =>
      steelRecords.filter((r) => {
        if (filterClients.length > 0 && !filterClients.includes(r.client)) return false;
        if (filterBands.length > 0 && !filterBands.includes(windBandOf(r.windSpeed).key)) return false;
        if (dateFrom && r.referenceDate < dateFrom) return false;
        if (dateTo && r.referenceDate > dateTo) return false;
        return true;
      }),
    [steelRecords, filterClients, filterBands, dateFrom, dateTo],
  );

  const fit = useMemo(() => fitExpectedCurve(filteredRecords, kind), [filteredRecords, kind]);
  const devs = useMemo(() => deviations(filteredRecords, kind, fit), [filteredRecords, kind, fit]);
  const bands = useMemo(() => bandStats(filteredRecords, kind), [filteredRecords, kind]);
  const series = useMemo(
    () => timeSeries(filteredRecords, kind, granularity),
    [filteredRecords, kind, granularity],
  );

  const byId = useMemo(() => new Map(steelRecords.map((r) => [r.id, r])), [steelRecords]);

  const toggleFilter = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <Factory className="text-brand-600 dark:text-brand-400" size={28} />
            Consumo de Aço
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Registro histórico e indicadores de custo por estrutura
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setSubView('dados')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                subView === 'dados'
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <LayoutList size={14} /> Dados
            </button>
            <button
              onClick={() => setSubView('indicadores')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                subView === 'indicadores'
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <BarChart3 size={14} /> Indicadores
            </button>
          </div>
          {!readOnly && (
            <button
              onClick={() => openNew()}
              className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all"
            >
              <Plus size={16} /> Novo Registro
            </button>
          )}
        </div>
      </div>

      {subView === 'dados' ? (
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar obra ou local..."
              className="pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-700 dark:text-slate-200 w-full"
            />
          </div>

          {groupedByClient.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
              <Factory size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="font-semibold text-slate-500 dark:text-slate-400">
                Nenhum registro de aço ainda
              </p>
              <p className="text-xs mt-1 text-slate-400 dark:text-slate-500">
                Cadastre o consumo de cada local para começar a medir os indicadores
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedByClient.map((group) => {
                const kgTotal = group.records.reduce((s, r) => s + totalKg(r), 0);
                const costTotal = group.records.reduce((s, r) => s + totalCost(r), 0);
                return (
                  <div
                    key={group.client}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-bold text-sm text-slate-800 dark:text-white">
                          {group.client}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {group.records.length} local(is) · {formatNumberBR(kgTotal / 1000, 1)} t ·{' '}
                          {formatCurrencyBR(costTotal)}
                        </p>
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => openNew(group.client)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                        >
                          <Plus size={13} /> Novo local
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                      {group.records.map((r) => {
                        const band = windBandOf(r.windSpeed);
                        return (
                          <div
                            key={r.id}
                            className="px-4 py-3 flex items-center justify-between flex-wrap gap-3"
                          >
                            <div className="min-w-0 flex items-center gap-3">
                              <div>
                                <p className="font-semibold text-sm text-slate-700 dark:text-slate-200">
                                  {r.base}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {formatDateDisplay(r.referenceDate)} · Leve{' '}
                                  {formatNumberBR(r.areaLeve, 0)}m² · Pesada{' '}
                                  {formatNumberBR(r.areaPesada, 0)}m² · Cobertura{' '}
                                  {formatNumberBR(r.areaCobertura, 0)}m²
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${WIND_BAND_BADGE_CLASS[band.key]}`}
                              >
                                {formatNumberBR(r.windSpeed, 1)} m/s
                              </span>
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                {formatNumberBR(totalKg(r), 0)} kg
                              </span>
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                {formatCurrencyBR(totalCost(r))}
                              </span>
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                                R{String(r.revisao).padStart(2, '0')}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => setHistoryRecord(r)}
                                  title="Histórico de revisões"
                                  aria-label="Histórico de revisões"
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                >
                                  <History size={15} />
                                </button>
                                {!readOnly && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openEdit(r)}
                                      title="Editar"
                                      aria-label="Editar"
                                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                    >
                                      <Edit2 size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDelete(r)}
                                      title="Excluir"
                                      aria-label="Excluir"
                                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Filtros locais */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mr-1">
                Estrutura:
              </span>
              {KIND_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setKind(t.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                    kind === t.value
                      ? 'bg-brand-700 border-brand-700 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {availableClients.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mr-1">
                  Obra:
                </span>
                {availableClients.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleFilter(filterClients, setFilterClients, c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterClients.includes(c)
                        ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-400'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mr-1">
                Vento:
              </span>
              {WIND_BANDS.map((b) => (
                <button
                  key={b.key}
                  onClick={() => toggleFilter(filterBands, setFilterBands, b.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterBands.includes(b.key)
                      ? WIND_BAND_BADGE_CLASS[b.key]
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Período (data de referência):
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-500/30 dark:[color-scheme:dark]"
              />
              <span className="text-xs text-slate-400">até</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-500/30 dark:[color-scheme:dark]"
              />
              {(filterClients.length > 0 || filterBands.length > 0 || dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setFilterClients([]);
                    setFilterBands([]);
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-xs font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          <AcoKpiStrip records={filteredRecords} kind={kind} devs={devs} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                Consumo × Vento
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                kg/m² de {KIND_LABEL[kind].toLowerCase()} em função do vento da localidade
              </p>
              <div className="h-72">
                <SteelScatterChart records={filteredRecords} kind={kind} fit={fit} isDarkMode={isDarkMode} />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                Mediana por Faixa de Vento
              </h3>
              <p className="text-xs text-slate-400 mb-4">Barra = mediana · traço = p25–p75</p>
              <div className="h-72">
                <SteelBandChart bands={bands} isDarkMode={isDarkMode} />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 lg:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Evolução no Tempo
                </h3>
                <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
                  {(['ANO', 'SEMESTRE'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                        granularity === g
                          ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {g === 'ANO' ? 'Anual' : 'Semestral'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Mediana de kg/m² por período, segmentada por faixa de vento
              </p>
              <div className="h-72">
                <SteelTimeSeriesChart points={series} isDarkMode={isDarkMode} />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Desvio e Outliers
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Ordenado do maior excedente para o maior ganho de eficiência
              </p>
            </div>
            <AcoRecordsTable
              devs={devs}
              onEdit={(id) => {
                const r = byId.get(id);
                if (r) openEdit(r);
              }}
              onHistory={(id) => {
                const r = byId.get(id);
                if (r) setHistoryRecord(r);
              }}
              onDelete={(id) => {
                const r = byId.get(id);
                if (r) onDelete(r);
              }}
            />
          </div>
        </div>
      )}

      {isFormOpen && (
        <AcoRecordModal
          form={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          onClose={closeForm}
          isEditing={!!editingRecord}
          clients={clients}
          original={editingRecord}
          baseSuggestions={baseSuggestions}
        />
      )}

      {historyRecord && (
        <AcoHistoryModal record={historyRecord} onClose={() => setHistoryRecord(null)} />
      )}
    </div>
  );
};
