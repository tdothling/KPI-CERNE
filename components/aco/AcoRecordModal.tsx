import React from 'react';
import { Factory, X, ChevronDown, Save, History } from 'lucide-react';
import { ClientDoc } from '../../types';
import { RevisionReason } from '../../types';
import { inputCls, Label, Section } from '../obras/shared';
import {
  ALL_MATERIALS,
  MATERIAL_TARGET,
  SteelMaterial,
  SteelRecord,
  totalCost,
  totalKg,
} from '../../domain/steel';
import { formatCurrencyBR, formatNumberBR } from '../../utils';
import { SteelFormState, numbersChanged } from './acoShared';

const REVISION_REASON_LABEL: Record<RevisionReason, string> = {
  [RevisionReason.INTERNAL_ERROR]: 'Erro Interno',
  [RevisionReason.CLIENT_REQUEST]: 'Solicitação Cliente',
  [RevisionReason.SCOPE_CHANGE]: 'Mudança de Escopo',
  [RevisionReason.PROJECT_CHANGE]: 'Mudança de Projeto',
  [RevisionReason.ADDENDUM]: 'Aditivo',
  [RevisionReason.COMPATIBILITY]: 'Compatibilização',
  [RevisionReason.OTHER]: 'Outros',
};

const MATERIAL_KIND_LABEL: Record<'leve' | 'pesada' | 'cobertura', string> = {
  leve: 'Estrutura Leve',
  pesada: 'Estrutura Pesada',
  cobertura: 'Cobertura',
};

interface AcoRecordModalProps {
  form: SteelFormState;
  onChange: React.Dispatch<React.SetStateAction<SteelFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isEditing: boolean;
  clients: ClientDoc[];
  original?: SteelRecord | null;
  baseSuggestions: string[];
}

export function AcoRecordModal({
  form,
  onChange,
  onSubmit,
  onClose,
  isEditing,
  clients,
  original,
  baseSuggestions,
}: AcoRecordModalProps) {
  const set = (patch: Partial<SteelFormState>) => onChange((prev) => ({ ...prev, ...patch }));
  const setMaterial = (m: SteelMaterial, patch: Partial<{ kg: number; pricePerKg: number }>) =>
    onChange((prev) => ({
      ...prev,
      materials: { ...prev.materials, [m]: { ...prev.materials[m], ...patch } },
    }));

  const total = totalKg({ materials: form.materials });
  const totalR$ = totalCost({ materials: form.materials });
  const changed = original ? numbersChanged(original, form) : false;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Factory className="text-brand-600 dark:text-brand-400" size={20} />
            {isEditing ? 'Editar Consumo de Aço' : 'Novo Consumo de Aço'}
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
            {/* Local */}
            <Section title="Local">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Obra *</Label>
                  <div className="relative">
                    <select
                      required
                      value={form.client}
                      onChange={(e) => set({ client: e.target.value })}
                      disabled={isEditing}
                      className={inputCls + ' appearance-none pr-8 disabled:opacity-60'}
                    >
                      <option value="">Selecione...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                  </div>
                </div>
                <div>
                  <Label>Local / Base *</Label>
                  <input
                    required
                    type="text"
                    list="aco-base-suggestions"
                    value={form.base}
                    onChange={(e) => set({ base: e.target.value })}
                    placeholder="Ex: Base 1, Galpão A, KM 104"
                    className={inputCls}
                  />
                  <datalist id="aco-base-suggestions">
                    {baseSuggestions.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label>Data de Referência</Label>
                  <input
                    type="date"
                    value={form.referenceDate}
                    onChange={(e) => set({ referenceDate: e.target.value })}
                    className={inputCls + ' dark:[color-scheme:dark]'}
                  />
                </div>
                <div>
                  <Label>Vento da Localidade (m/s)</Label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.windSpeed || ''}
                    onChange={(e) => set({ windSpeed: parseFloat(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </div>
              </div>
            </Section>

            {/* Áreas */}
            <Section title="Informações da Obra (m²)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Área de Estrutura Leve</Label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.areaLeve || ''}
                    onChange={(e) => set({ areaLeve: parseFloat(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label>Área de Estrutura Pesada</Label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.areaPesada || ''}
                    onChange={(e) => set({ areaPesada: parseFloat(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label>Área de Cobertura (Telhas)</Label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.areaCobertura || ''}
                    onChange={(e) => set({ areaCobertura: parseFloat(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </div>
              </div>
            </Section>

            {/* Materiais */}
            <Section title="Materiais (kg e R$/kg)">
              <div className="space-y-3">
                {ALL_MATERIALS.map((m) => (
                  <div
                    key={m}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:items-end border border-slate-100 dark:border-slate-700 rounded-lg p-3"
                  >
                    <div>
                      <Label>{m}</Label>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 -mt-1">
                        {MATERIAL_KIND_LABEL[MATERIAL_TARGET[m]]}
                      </p>
                    </div>
                    <div className="sm:w-28">
                      <Label>Kg</Label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={form.materials[m]?.kg || ''}
                        onChange={(e) => setMaterial(m, { kg: parseFloat(e.target.value) || 0 })}
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:w-28">
                      <Label>R$/Kg</Label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.materials[m]?.pricePerKg || ''}
                        onChange={(e) =>
                          setMaterial(m, { pricePerKg: parseFloat(e.target.value) || 0 })
                        }
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:w-28 text-right sm:text-left">
                      <Label>Subtotal</Label>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums px-1">
                        {formatCurrencyBR(
                          (form.materials[m]?.kg || 0) * (form.materials[m]?.pricePerKg || 0),
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 px-1">
                <span>Total: {formatNumberBR(total, 1)} kg</span>
                <span>{formatCurrencyBR(totalR$)}</span>
              </div>
            </Section>

            {/* Revisão — só na edição */}
            {isEditing && (
              <Section title="Revisão">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.reviseChange}
                    onChange={(e) => set({ reviseChange: e.target.checked })}
                    className="text-brand-600 focus:ring-brand-500 rounded"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Registrar esta mudança como revisão (entra no histórico)
                  </span>
                </label>
                {!changed && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <History size={11} /> Nenhum número foi alterado ainda.
                  </p>
                )}
                {form.reviseChange && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <Label>Motivo</Label>
                      <div className="relative">
                        <select
                          value={form.reviseReason}
                          onChange={(e) =>
                            set({ reviseReason: e.target.value as RevisionReason })
                          }
                          className={inputCls + ' appearance-none pr-8'}
                        >
                          {Object.values(RevisionReason).map((r) => (
                            <option key={r} value={r}>
                              {REVISION_REASON_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Comentário</Label>
                      <input
                        type="text"
                        value={form.reviseComment}
                        onChange={(e) => set({ reviseComment: e.target.value })}
                        placeholder="Ex: Aditivo de área aprovado em..."
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </Section>
            )}
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
              <Save size={15} /> {isEditing ? 'Salvar Alterações' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
