import {
  SteelKind,
  SteelMaterial,
  SteelMaterials,
  SteelRecord,
  WIND_BANDS,
  emptyMaterials,
} from '../../domain/steel';
import { RevisionReason } from '../../types';

// Metas de referência mostradas nos KPIs — ajustáveis conforme o histórico da empresa
// amadurece. Não bloqueiam nada, só colorem o card (mesmo espírito de META_OTD/META_IAPR
// em components/dashboardShared.ts).
export const KIND_TABS: { value: SteelKind; label: string }[] = [
  { value: 'leve', label: 'Estrutura Leve' },
  { value: 'pesada', label: 'Estrutura Pesada' },
  { value: 'cobertura', label: 'Cobertura' },
];

// Paleta por faixa de vento — cresce de verde (ventos baixos) a vermelho (ventos altos),
// na ordem de WIND_BANDS. Duas versões (badge Tailwind + hex para recharts), no mesmo
// padrão de DISCIPLINE_COLORS / CATEGORY_COLORS_LIGHT/DARK em components/dashboardShared.ts.
const BAND_TONE = ['emerald', 'sky', 'amber', 'orange', 'rose'] as const;

export const WIND_BAND_BADGE: Record<string, string> = {
  emerald:
    'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400',
  sky: 'text-sky-700 bg-sky-100 border-sky-300 dark:bg-sky-900/40 dark:border-sky-700 dark:text-sky-400',
  amber:
    'text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-400',
  orange:
    'text-orange-700 bg-orange-100 border-orange-300 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-400',
  rose: 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400',
};

export const WIND_BAND_BADGE_CLASS: Record<string, string> = Object.fromEntries(
  WIND_BANDS.map((b, i) => [b.key, WIND_BAND_BADGE[BAND_TONE[i]]]),
);

const WIND_BAND_HEX_LIGHT = ['#10b981', '#0ea5e9', '#f59e0b', '#f97316', '#f43f5e'];
const WIND_BAND_HEX_DARK = ['#10b981', '#38bdf8', '#fbbf24', '#fb923c', '#fb7185'];

export const windBandColor = (bandKey: string, isDarkMode: boolean): string => {
  const idx = WIND_BANDS.findIndex((b) => b.key === bandKey);
  const palette = isDarkMode ? WIND_BAND_HEX_DARK : WIND_BAND_HEX_LIGHT;
  return palette[idx >= 0 ? idx : 0];
};

// --- Formulário de cadastro/edição de registro de aço ---

export interface SteelFormState {
  client: string;
  base: string;
  referenceDate: string;
  windSpeed: number;
  areaLeve: number;
  areaPesada: number;
  areaCobertura: number;
  materials: SteelMaterials;
  observacao: string;
  // Só é lido quando o registro está sendo EDITADO — decide se a mudança vira uma
  // revisão (entra no histórico) ou uma correção simples (sobrescreve sem rastro).
  reviseChange: boolean;
  reviseReason: RevisionReason;
  reviseComment: string;
}

export const defaultSteelForm = (client = ''): SteelFormState => ({
  client,
  base: '',
  referenceDate: new Date().toISOString().split('T')[0],
  windSpeed: 30,
  areaLeve: 0,
  areaPesada: 0,
  areaCobertura: 0,
  materials: emptyMaterials(),
  observacao: '',
  reviseChange: true,
  reviseReason: RevisionReason.ADDENDUM,
  reviseComment: '',
});

export const steelRecordToForm = (r: SteelRecord): SteelFormState => ({
  client: r.client,
  base: r.base,
  referenceDate: r.referenceDate,
  windSpeed: r.windSpeed,
  areaLeve: r.areaLeve,
  areaPesada: r.areaPesada,
  areaCobertura: r.areaCobertura,
  materials: r.materials,
  observacao: r.observacao || '',
  reviseChange: true,
  reviseReason: RevisionReason.ADDENDUM,
  reviseComment: '',
});

// Os números realmente relevantes mudaram? Usado para decidir o default do toggle de
// revisão ao abrir a edição — observação e reviseChange/reviseReason não contam.
export const numbersChanged = (original: SteelRecord, form: SteelFormState): boolean => {
  if (
    original.referenceDate !== form.referenceDate ||
    original.windSpeed !== form.windSpeed ||
    original.areaLeve !== form.areaLeve ||
    original.areaPesada !== form.areaPesada ||
    original.areaCobertura !== form.areaCobertura
  )
    return true;
  return (Object.keys(form.materials) as SteelMaterial[]).some(
    (m) =>
      original.materials[m]?.kg !== form.materials[m]?.kg ||
      original.materials[m]?.pricePerKg !== form.materials[m]?.pricePerKg,
  );
};
