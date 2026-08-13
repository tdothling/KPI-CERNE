import React from 'react';
import { HardHat, X, MapPin, User, ChevronDown, Save, Factory } from 'lucide-react';
import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import { SiteType, ObraStatus } from '../../types';
import { FormState, inputCls, Label, Section, today } from './shared';
import { BasesEditor } from './BasesEditor';

interface ObraFormModalProps {
  form: FormState;
  onChange: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isEditing: boolean;
}

export function ObraFormModal({
  form,
  onChange,
  onSubmit,
  onClose,
  isEditing,
}: ObraFormModalProps) {
  const set = (patch: Partial<FormState>) => onChange((prev) => ({ ...prev, ...patch }));
  const needsDate =
    form.obraStatus === ObraStatus.COMPLETED || form.obraStatus === ObraStatus.CANCELLED;

  // Prévia do veredito de SLA: comparação fixa entrega x prazo (não muda mais com o tempo).
  const deliveryVerdict = (() => {
    if (!form.projectsDeliveredAt || !isValid(parseISO(form.projectsDeliveredAt))) return null;
    if (!form.projectDeadlineDate || !isValid(parseISO(form.projectDeadlineDate))) {
      return {
        late: false,
        text: 'Entrega marcada. Cadastre a "Data Estipulada" acima para calcular se foi no prazo.',
      };
    }
    const days = differenceInCalendarDays(
      parseISO(form.projectsDeliveredAt),
      parseISO(form.projectDeadlineDate),
    );
    if (days <= 0) {
      return {
        late: false,
        text:
          days === 0
            ? 'Entregue no prazo (no próprio dia do vencimento).'
            : `Entregue no prazo, ${Math.abs(days)} dia${Math.abs(days) !== 1 ? 's' : ''} antes do vencimento.`,
      };
    }
    return { late: true, text: `Entregue com ${days} dia${days !== 1 ? 's' : ''} de atraso.` };
  })();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <HardHat className="text-brand-600 dark:text-brand-400" size={20} />
            {isEditing ? 'Editar Obra' : 'Nova Obra'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-slate-400"
            aria-label="Fechar"
          >
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
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="Ex: Construtora ABC – Sede"
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label>Local / Cidade</Label>
                  <div className="relative">
                    <MapPin
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => set({ location: e.target.value })}
                      placeholder="Ex: São Paulo - SP"
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </div>
                <div>
                  <Label>Responsável</Label>
                  <div className="relative">
                    <User
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={form.responsavel}
                      onChange={(e) => set({ responsavel: e.target.value })}
                      placeholder="Nome do responsável técnico"
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Tipo de Instalação</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
                  {[
                    {
                      value: SiteType.CONSTRUCTION_SITE,
                      title: 'Canteiro de Obras',
                      sub: 'Obra única centralizada',
                    },
                    {
                      value: SiteType.OPERATIONAL_BASE,
                      title: 'Bases Operacionais',
                      sub: 'Múltiplos pontos de atendimento',
                    },
                    {
                      value: SiteType.HIGHWAY,
                      title: 'Obra de Rodovia',
                      sub: 'Bases replicadas ao longo do traçado (usa Projetos Referências/Projetos Locais)',
                    },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 cursor-pointer p-3 rounded-lg border transition-colors ${form.type === opt.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      <input
                        type="radio"
                        name="siteType"
                        value={opt.value}
                        checked={form.type === opt.value}
                        onChange={() => set({ type: opt.value, numberOfBases: 0, bases: [] })}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {opt.title}
                        </p>
                        <p className="text-xs text-slate-400">{opt.sub}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {form.type === SiteType.OPERATIONAL_BASE && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label>Número de Bases</Label>
                  <input
                    type="number"
                    min="1"
                    value={form.numberOfBases || ''}
                    onChange={(e) => set({ numberOfBases: parseInt(e.target.value) || 0 })}
                    placeholder="Qtd."
                    className={inputCls + ' w-32'}
                  />
                </div>
              )}

              {/* Rodovia: bases NOMEADAS — fonte única de seleção ao instanciar no Catálogo */}
              {form.type === SiteType.HIGHWAY && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label>Bases da Rodovia (KM / trecho) — {form.bases.length} registrada(s)</Label>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                    Estas bases aparecem para seleção ao instanciar referências na aba Projetos
                    Referências. Registre aqui para padronizar a grafia (evita duplicidade como "KM
                    104" e "104+000"). Cole uma lista ou use "Gerar" para criar várias de uma vez, e
                    arraste os cartões para colocá-los na ordem de prioridade da obra.
                  </p>
                  <BasesEditor bases={form.bases} onChange={(bases) => set({ bases })} />
                </div>
              )}
            </Section>

            {/* SLA */}
            <Section title="Cronograma da Obra (Opcional)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Início da Obra</Label>
                  <input
                    type="date"
                    value={form.obraStartDate}
                    onChange={(e) => set({ obraStartDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
                <div>
                  <Label>Fim da Obra</Label>
                  <input
                    type="date"
                    value={form.obraEndDate}
                    onChange={(e) => set({ obraEndDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
                <div>
                  <Label>Data Estipulada p/ Finalizar os Projetos</Label>
                  <input
                    type="date"
                    value={form.projectDeadlineDate}
                    onChange={(e) => set({ projectDeadlineDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                A "Data Estipulada" é o prazo que alimenta o SLA/OTD dos Indicadores e o ERP
                industrial. Entregas posteriores (revisão pós-certificadora) não usam esta data —
                configure a meta de cada uma no próprio arquivo, na Carteira ou no Canteiro.
              </p>

              <div className="bg-brand-50/60 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-900/30 rounded-lg p-3">
                <Label>Entrega dos Projetos (fecha o SLA)</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="date"
                    value={form.projectsDeliveredAt}
                    onChange={(e) => set({ projectsDeliveredAt: e.target.value })}
                    max={today}
                    className={inputCls + ' dark:[color-scheme:dark] w-auto'}
                  />
                  {form.projectsDeliveredAt && (
                    <button
                      type="button"
                      onClick={() => set({ projectsDeliveredAt: '' })}
                      className="text-xs font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      Remover marcação
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  {deliveryVerdict ? (
                    <span
                      className={
                        deliveryVerdict.late
                          ? 'text-amber-700 dark:text-amber-400 font-medium'
                          : 'text-emerald-700 dark:text-emerald-400 font-medium'
                      }
                    >
                      {deliveryVerdict.text}
                    </span>
                  ) : (
                    'Marque quando o pacote completo de projetos foi entregue ao cliente. A ' +
                    'partir dessa data, Canteiro/Catálogo/Carteira param de contar atraso de ' +
                    'SLA — o que roda depois é fluxo de revisão.'
                  )}
                </p>
              </div>

              {(form.contractDate || form.deadlineDays !== undefined) && (
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    SLA antigo (referência — não utilizado no cálculo)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {form.contractDate &&
                      `Contrato: ${new Date(form.contractDate + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                    {form.contractDate && form.deadlineDays !== undefined && ' · '}
                    {form.deadlineDays !== undefined && `${form.deadlineDays} dias corridos`}
                  </p>
                </div>
              )}
            </Section>

            {/* Fabricação do Aço */}
            <Section title="Fabricação do Aço (Opcional)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Início da Fabricação</Label>
                  <input
                    type="date"
                    value={form.fabricationStartDate}
                    onChange={(e) => set({ fabricationStartDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
                <div>
                  <Label>Fim da Fabricação</Label>
                  <input
                    type="date"
                    value={form.fabricationEndDate}
                    min={form.fabricationStartDate || undefined}
                    onChange={(e) => set({ fabricationEndDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
                <Factory size={12} className="mt-0.5 flex-shrink-0" />
                Período contratual de fabricação do aço. A aba Estruturas usa esta data para
                posicionar o consumo na série temporal — não precisa redigitar por local.
              </p>
            </Section>

            {/* Status */}
            <Section title="Status da Obra">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Status atual</Label>
                  <div className="relative">
                    <select
                      value={form.obraStatus}
                      onChange={(e) => {
                        const s = e.target.value as ObraStatus;
                        const autoDate =
                          s === ObraStatus.COMPLETED || s === ObraStatus.CANCELLED
                            ? form.completedAt || today
                            : '';
                        set({ obraStatus: s, completedAt: autoDate });
                      }}
                      className={inputCls + ' appearance-none pr-8'}
                    >
                      {Object.values(ObraStatus).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                  </div>
                </div>

                {needsDate && (
                  <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                    <Label>
                      Data de{' '}
                      {form.obraStatus === ObraStatus.CANCELLED ? 'Cancelamento' : 'Conclusão'}
                    </Label>
                    <input
                      type="date"
                      value={form.completedAt || today}
                      onChange={(e) => set({ completedAt: e.target.value })}
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
                rows={3}
                value={form.observacoes}
                onChange={(e) => set({ observacoes: e.target.value })}
                placeholder="Informações adicionais sobre a obra..."
                className={inputCls + ' resize-none'}
              />
            </Section>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-700/30 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
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
