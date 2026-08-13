// --- CONSUMO DE AÇO (Estruturas) ---
//
// Módulo de domínio PURO: nenhuma dependência de Firestore ou React, para que todo o
// cálculo (intensidade, curva esperada por vento, outliers) seja testável isoladamente.
//
// Um SteelRecord é o consumo de aço de UM LOCAL de uma obra (ex.: "Base 1" da Austra).
// Uma obra com N locais tem N registros — nunca um agregado só, porque cada local pode
// ter vento e configuração de edificação diferentes (ver types.ts ClientDoc.bases).
//
// Ponto central do módulo: comparar kg/m² entre obras só é honesto dentro do MESMO regime
// de vento, porque a pressão dinâmica do vento cresce com o quadrado da velocidade (NBR
// 6123) — por isso a curva esperada é ajustada em função de v², não de v.

import { ClientDoc, RevisionReason } from '../types';

// --- MATERIAIS ---

export enum SteelMaterial {
  GALV_ESTRUTURAL = 'Aço Galvanizado Estrutural',
  GALV_COMUM = 'Aço Galvanizado Comum',
  GALVALUME = 'Bobinas/Chapa Galvalume',
  GALPAO = 'Aço para Estrutura do Galpão',
}

export const ALL_MATERIALS: SteelMaterial[] = [
  SteelMaterial.GALV_ESTRUTURAL,
  SteelMaterial.GALV_COMUM,
  SteelMaterial.GALVALUME,
  SteelMaterial.GALPAO,
];

// Estrutura que cada material alimenta — é o denominador do kg/m². Um kg/m² único
// somando galvalume de cobertura com perfil de galpão não significaria nada: cada
// material só é dividido pela área que ele efetivamente compõe.
export type SteelKind = 'leve' | 'pesada' | 'cobertura';

export const MATERIAL_TARGET: Record<SteelMaterial, SteelKind> = {
  [SteelMaterial.GALV_ESTRUTURAL]: 'leve',
  [SteelMaterial.GALV_COMUM]: 'leve',
  [SteelMaterial.GALVALUME]: 'cobertura',
  [SteelMaterial.GALPAO]: 'pesada',
};

export const KIND_LABEL: Record<SteelKind, string> = {
  leve: 'Estrutura Leve',
  pesada: 'Estrutura Pesada',
  cobertura: 'Cobertura',
};

export const materialsOfKind = (kind: SteelKind): SteelMaterial[] =>
  ALL_MATERIALS.filter((m) => MATERIAL_TARGET[m] === kind);

export interface SteelMaterialEntry {
  kg: number;
  pricePerKg: number;
}

export type SteelMaterials = Record<SteelMaterial, SteelMaterialEntry>;

export const emptyMaterialEntry = (): SteelMaterialEntry => ({ kg: 0, pricePerKg: 0 });

export const emptyMaterials = (): SteelMaterials => ({
  [SteelMaterial.GALV_ESTRUTURAL]: emptyMaterialEntry(),
  [SteelMaterial.GALV_COMUM]: emptyMaterialEntry(),
  [SteelMaterial.GALVALUME]: emptyMaterialEntry(),
  [SteelMaterial.GALPAO]: emptyMaterialEntry(),
});

// --- FAIXAS DE VENTO ---

export interface WindBand {
  key: string;
  label: string;
  min: number; // inclusive
  max: number; // exclusive (Infinity na última faixa)
}

export const WIND_BANDS: WindBand[] = [
  { key: '<30', label: '< 30 m/s', min: -Infinity, max: 30 },
  { key: '30-35', label: '30–35 m/s', min: 30, max: 35 },
  { key: '35-40', label: '35–40 m/s', min: 35, max: 40 },
  { key: '40-45', label: '40–45 m/s', min: 40, max: 45 },
  { key: '>=45', label: '≥ 45 m/s', min: 45, max: Infinity },
];

export const windBandOf = (windSpeed: number): WindBand =>
  WIND_BANDS.find((b) => windSpeed >= b.min && windSpeed < b.max) || WIND_BANDS[WIND_BANDS.length - 1];

// --- REVISÕES (histórico simples, mesmo padrão de types.ts Revision/RevisionCycleSnapshot) ---

// Fotografia dos valores ANTES de uma revisão — o registro pode mudar (aditivo, área
// corrigida, novo levantamento) e o histórico precisa preservar o que valia antes.
export interface SteelSnapshot {
  windSpeed: number;
  areaLeve: number;
  areaPesada: number;
  areaCobertura: number;
  materials: SteelMaterials;
}

export interface SteelRevision {
  id: string;
  revisao: number; // número da revisão ENCERRADA por este snapshot (R00, R01...)
  date: string; // ISO — quando a revisão foi registrada
  reason: RevisionReason;
  comment: string;
  user?: string;
  snapshot: SteelSnapshot;
}

export interface SteelRecord {
  id: string;
  client: string; // obra — nome denormalizado, igual às demais coleções
  base: string; // local dentro da obra (ex.: "Base 1", "Galpão A", "KM 104")
  windSpeed: number; // m/s
  areaLeve: number; // m²
  areaPesada: number; // m²
  areaCobertura: number; // m²
  materials: SteelMaterials;
  revisao: number;
  revisions: SteelRevision[];
  observacao?: string;
}

const snapshotOf = (r: SteelRecord): SteelSnapshot => ({
  windSpeed: r.windSpeed,
  areaLeve: r.areaLeve,
  areaPesada: r.areaPesada,
  areaCobertura: r.areaCobertura,
  materials: r.materials,
});

// Aplica uma revisão: empilha o estado ANTIGO em `revisions` (com o motivo/comentário desta
// mudança) e devolve o registro com os campos novos e `revisao` incrementada. Espelha
// `handleAbrirRevisaoPrancha` (hooks/useAppData.ts) — o snapshot descreve o que estava
// valendo ANTES, não depois.
export const applySteelRevision = (
  current: SteelRecord,
  next: Omit<SteelRecord, 'id' | 'client' | 'base' | 'revisao' | 'revisions'>,
  meta: { reason: RevisionReason; comment: string; date: string; user?: string; id: string },
): SteelRecord => {
  const revision: SteelRevision = {
    id: meta.id,
    revisao: current.revisao,
    date: meta.date,
    reason: meta.reason,
    comment: meta.comment,
    ...(meta.user ? { user: meta.user } : {}),
    snapshot: snapshotOf(current),
  };
  return {
    ...current,
    ...next,
    revisao: current.revisao + 1,
    revisions: [...current.revisions, revision],
  };
};

// --- CÁLCULO POR REGISTRO ---

export const areaOf = (r: Pick<SteelRecord, 'areaLeve' | 'areaPesada' | 'areaCobertura'>, kind: SteelKind): number =>
  kind === 'leve' ? r.areaLeve : kind === 'pesada' ? r.areaPesada : r.areaCobertura;

export const kgOf = (r: Pick<SteelRecord, 'materials'>, kind: SteelKind): number =>
  materialsOfKind(kind).reduce((sum, m) => sum + (r.materials[m]?.kg || 0), 0);

export const costOf = (r: Pick<SteelRecord, 'materials'>, kind: SteelKind): number =>
  materialsOfKind(kind).reduce((sum, m) => sum + (r.materials[m]?.kg || 0) * (r.materials[m]?.pricePerKg || 0), 0);

export const totalKg = (r: Pick<SteelRecord, 'materials'>): number =>
  ALL_MATERIALS.reduce((sum, m) => sum + (r.materials[m]?.kg || 0), 0);

export const totalCost = (r: Pick<SteelRecord, 'materials'>): number =>
  ALL_MATERIALS.reduce((sum, m) => sum + (r.materials[m]?.kg || 0) * (r.materials[m]?.pricePerKg || 0), 0);

// kg/m² — null quando a área é 0 (nunca dividir por zero, nunca contar como 0 nas medianas:
// um 0 espúrio puxaria a mediana para baixo e mascararia consumo real).
export const intensity = (
  r: Pick<SteelRecord, 'materials' | 'areaLeve' | 'areaPesada' | 'areaCobertura'>,
  kind: SteelKind,
): number | null => {
  const area = areaOf(r, kind);
  if (!area || area <= 0) return null;
  return kgOf(r, kind) / area;
};

// R$/m² — gasto, não eficiência. Mistura consumo físico com preço de mercado do material;
// serve para "quanto estamos gastando", não como prova de melhoria da equipe ao longo do
// tempo (isso é papel do kg/m²).
export const costPerM2 = (
  r: Pick<SteelRecord, 'materials' | 'areaLeve' | 'areaPesada' | 'areaCobertura'>,
  kind: SteelKind,
): number | null => {
  const area = areaOf(r, kind);
  if (!area || area <= 0) return null;
  return costOf(r, kind) / area;
};

// --- CURVA ESPERADA (regressão em função de vento²) ---

export interface SteelFit {
  a: number; // intercepto
  b: number; // coeficiente de v²
  r2: number;
  n: number;
}

// Amostra mínima para que uma curva faça sentido estatístico. Abaixo disso a UI deve cair
// para mediana de faixa e avisar — um ranking construído sobre poucos pontos é pior do que
// nenhum ranking.
export const MIN_FIT_SAMPLE = 5;
export const MIN_FIT_DISTINCT_WINDS = 3;

// Mínimos quadrados de kg/m² = a + b·v². Usa v² (não v) porque a pressão dinâmica do vento
// cresce com o quadrado da velocidade — a curva fica fisicamente coerente e continua sendo
// uma regressão linear simples nessa variável transformada.
export const fitExpectedCurve = (records: SteelRecord[], kind: SteelKind): SteelFit | null => {
  const points = records
    .map((r) => ({ x: r.windSpeed * r.windSpeed, y: intensity(r, kind) }))
    .filter((p): p is { x: number; y: number } => p.y !== null && Number.isFinite(p.x));

  const distinctWinds = new Set(records.map((r) => r.windSpeed)).size;
  if (points.length < MIN_FIT_SAMPLE || distinctWinds < MIN_FIT_DISTINCT_WINDS) return null;

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // todos os pontos com o mesmo x (não deveria acontecer com >=3 ventos distintos)

  const b = (n * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / n;

  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (a + b * p.x)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { a, b, r2, n };
};

export const expectedIntensity = (fit: SteelFit, windSpeed: number): number =>
  fit.a + fit.b * windSpeed * windSpeed;

// --- ESTATÍSTICAS DE FAIXA (fallback quando não há amostra para curva, e complemento sempre) ---

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

// Média de kg/m² (ou R$/m²) entre TODOS os registros filtrados, sem segmentar por faixa
// de vento — visão geral para o KPI strip (não é "esperado", é "observado"). É a razão
// ponderada total(kg)/total(m²), não a média simples dos kg/m² de cada local: um local de
// 50 m² e outro de 5.000 m² não podem pesar igual, senão o local pequeno distorce a leitura
// (é exatamente o problema de uma obra com poucos locais grandes vs. muitos locais pequenos).
export const overallIntensityMean = (records: SteelRecord[], kind: SteelKind): number => {
  let kgSum = 0;
  let areaSum = 0;
  records.forEach((r) => {
    const area = areaOf(r, kind);
    if (!area || area <= 0) return;
    kgSum += kgOf(r, kind);
    areaSum += area;
  });
  return areaSum > 0 ? kgSum / areaSum : 0;
};

export const overallCostPerM2Mean = (records: SteelRecord[], kind: SteelKind): number => {
  let costSum = 0;
  let areaSum = 0;
  records.forEach((r) => {
    const area = areaOf(r, kind);
    if (!area || area <= 0) return;
    costSum += costOf(r, kind);
    areaSum += area;
  });
  return areaSum > 0 ? costSum / areaSum : 0;
};

export interface BandStats {
  band: WindBand;
  n: number;
  mediana: number;
  p25: number;
  p75: number;
  media: number;
}

export const bandStats = (records: SteelRecord[], kind: SteelKind): BandStats[] =>
  WIND_BANDS.map((band) => {
    const values = records
      .filter((r) => windBandOf(r.windSpeed).key === band.key)
      .map((r) => intensity(r, kind))
      .filter((v): v is number => v !== null);
    return {
      band,
      n: values.length,
      mediana: median(values),
      p25: percentile(values, 0.25),
      p75: percentile(values, 0.75),
      media: values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0,
    };
  }).filter((s) => s.n > 0);

// --- DESVIOS E OUTLIERS ---

export interface RecordDeviation {
  record: SteelRecord;
  real: number; // kg/m² real
  esperado: number; // kg/m² esperado (curva ou mediana da faixa)
  esperadoSource: 'curve' | 'band';
  desvio: number; // real - esperado (kg/m²)
  desvioPct: number; // desvio / esperado, em fração (0.18 = 18%)
  z: number; // z-score robusto do resíduo (mediana + MAD)
  isOutlier: boolean;
  kgExcedente: number; // desvio * área — quanto aço a mais/menos que o esperado
  custoExcedente: number; // kgExcedente * preço médio ponderado do kind neste registro
}

const OUTLIER_Z = 2.5;
const OUTLIER_BAND_FALLBACK_PCT = 0.25; // sem curva: 25% acima da mediana da faixa já é outlier

// z-score robusto: mediana + MAD (median absolute deviation) × 1.4826 (fator que torna o MAD
// comparável ao desvio-padrão sob normalidade). Preferido a média/desvio-padrão comuns porque
// esses são distorcidos justamente pelos outliers que este cálculo tenta encontrar.
const robustZScores = (residuals: number[]): number[] => {
  const med = median(residuals);
  const absDevs = residuals.map((r) => Math.abs(r - med));
  const mad = median(absDevs);
  const scale = mad * 1.4826;
  if (scale === 0) return residuals.map(() => 0);
  return residuals.map((r) => (r - med) / scale);
};

export const deviations = (
  records: SteelRecord[],
  kind: SteelKind,
  fit: SteelFit | null,
): RecordDeviation[] => {
  const bands = bandStats(records, kind);
  const bandMedianOf = (windSpeed: number): number =>
    bands.find((b) => b.band.key === windBandOf(windSpeed).key)?.mediana ?? 0;

  const withReal = records
    .map((r) => ({ record: r, real: intensity(r, kind) }))
    .filter((x): x is { record: SteelRecord; real: number } => x.real !== null);

  const raw = withReal.map(({ record, real }) => {
    const esperado = fit ? expectedIntensity(fit, record.windSpeed) : bandMedianOf(record.windSpeed);
    const esperadoSource: 'curve' | 'band' = fit ? 'curve' : 'band';
    const desvio = real - esperado;
    const desvioPct = esperado !== 0 ? desvio / esperado : 0;
    return { record, real, esperado, esperadoSource, desvio, desvioPct };
  });

  const zScores = robustZScores(raw.map((r) => r.desvio));

  return raw.map((r, i) => {
    const z = zScores[i];
    const isOutlier = fit
      ? Math.abs(z) >= OUTLIER_Z
      : Math.abs(r.desvioPct) >= OUTLIER_BAND_FALLBACK_PCT;
    const area = areaOf(r.record, kind);
    const kgExcedente = r.desvio * area;
    const kgReal = kgOf(r.record, kind);
    const custoReal = costOf(r.record, kind);
    const precoMedioPonderado = kgReal > 0 ? custoReal / kgReal : 0;
    return {
      ...r,
      z,
      isOutlier,
      kgExcedente,
      custoExcedente: kgExcedente * precoMedioPonderado,
    };
  });
};

// --- SÉRIE TEMPORAL ---

export type TimeSeriesGranularity = 'MES' | 'ANO' | 'SEMESTRE';

const MONTH_LABEL = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export interface TimeSeriesPoint {
  periodKey: string; // '2026' ou '2026-S1'
  periodLabel: string;
  bandKey: string;
  bandLabel: string;
  mediana: number;
  n: number;
}

const periodKeyOf = (isoDate: string, granularity: TimeSeriesGranularity): { key: string; label: string } | null => {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  if (!year || !month) return null;
  if (granularity === 'ANO') return { key: String(year), label: String(year) };
  if (granularity === 'MES') {
    return { key: `${year}-${String(month).padStart(2, '0')}`, label: `${MONTH_LABEL[month - 1]}/${String(year).slice(2)}` };
  }
  const semester = month <= 6 ? 1 : 2;
  return { key: `${year}-S${semester}`, label: `${year} S${semester}` };
};

// Janela de fabricação da obra (contrato) — usada tanto para filtrar por período quanto
// para exibir a data ao lado dos registros de um cliente na aba Estruturas. null quando a
// obra não tem a data cadastrada (o cadastro fica na aba Obras, não aqui).
export const fabricationWindowOf = (
  clientName: string,
  clients: Pick<ClientDoc, 'name' | 'fabricationStartDate' | 'fabricationEndDate'>[],
): { start: string; end?: string } | null => {
  const c = clients.find((c) => c.name === clientName);
  if (!c?.fabricationStartDate) return null;
  return { start: c.fabricationStartDate, end: c.fabricationEndDate };
};

// Mediana de kg/m² por período × faixa de vento — o gráfico de "a equipe vem reduzindo o
// consumo", segmentado por faixa para não misturar obras de ventos diferentes na mesma linha.
// O período é o do INÍCIO da fabricação — informação do CONTRATO (ClientDoc), não do
// registro: é quando o consumo daquela obra passa a contar, sem supor como o kg se
// distribui ao longo da janela. Obras sem a data cadastrada ficam de fora da série (não
// há como posicioná-las no tempo).
export const timeSeries = (
  records: SteelRecord[],
  kind: SteelKind,
  granularity: TimeSeriesGranularity,
  clients: Pick<ClientDoc, 'name' | 'fabricationStartDate'>[],
): TimeSeriesPoint[] => {
  const startByClient = new Map(clients.map((c) => [c.name, c.fabricationStartDate]));
  const groups = new Map<string, { periodKey: string; periodLabel: string; band: WindBand; values: number[] }>();

  records.forEach((r) => {
    const fabricationStart = startByClient.get(r.client);
    const period = fabricationStart ? periodKeyOf(fabricationStart, granularity) : null;
    const value = intensity(r, kind);
    if (!period || value === null) return;
    const band = windBandOf(r.windSpeed);
    const groupKey = `${period.key}|${band.key}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.values.push(value);
    } else {
      groups.set(groupKey, { periodKey: period.key, periodLabel: period.label, band, values: [value] });
    }
  });

  return Array.from(groups.values())
    .map((g) => ({
      periodKey: g.periodKey,
      periodLabel: g.periodLabel,
      bandKey: g.band.key,
      bandLabel: g.band.label,
      mediana: median(g.values),
      n: g.values.length,
    }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
};
