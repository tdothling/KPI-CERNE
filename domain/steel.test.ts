import { describe, it, expect } from 'vitest';
import {
  SteelMaterial,
  SteelRecord,
  emptyMaterials,
  MATERIAL_TARGET,
  windBandOf,
  WIND_BANDS,
  intensity,
  costPerM2,
  kgOf,
  totalKg,
  totalCost,
  fitExpectedCurve,
  expectedIntensity,
  deviations,
  bandStats,
  timeSeries,
  applySteelRevision,
  MIN_FIT_SAMPLE,
  overallIntensityMean,
  overallCostPerM2Mean,
  fabricationWindowOf,
} from './steel';
import { RevisionReason } from '../types';

// --- Fixtures ---

const materials = (overrides: Partial<Record<SteelMaterial, { kg: number; pricePerKg: number }>>) => ({
  ...emptyMaterials(),
  ...overrides,
});

let seq = 0;
const record = (overrides: Partial<SteelRecord>): SteelRecord => {
  seq += 1;
  return {
    id: `rec-${seq}`,
    client: 'Obra Teste',
    base: `Base ${seq}`,
    windSpeed: 30,
    areaLeve: 100,
    areaPesada: 0,
    areaCobertura: 0,
    materials: emptyMaterials(),
    revisao: 0,
    revisions: [],
    ...overrides,
  };
};

describe('MATERIAL_TARGET', () => {
  it('mapeia cada material para exatamente um SteelKind', () => {
    expect(MATERIAL_TARGET[SteelMaterial.GALV_ESTRUTURAL]).toBe('leve');
    expect(MATERIAL_TARGET[SteelMaterial.GALV_COMUM]).toBe('leve');
    expect(MATERIAL_TARGET[SteelMaterial.GALVALUME]).toBe('cobertura');
    expect(MATERIAL_TARGET[SteelMaterial.GALPAO]).toBe('pesada');
  });
});

describe('windBandOf', () => {
  it('classifica valores dentro de cada faixa', () => {
    expect(windBandOf(25).key).toBe('<30');
    expect(windBandOf(32).key).toBe('30-35');
    expect(windBandOf(38).key).toBe('35-40');
    expect(windBandOf(42).key).toBe('40-45');
    expect(windBandOf(50).key).toBe('>=45');
  });

  it('trata as bordas como inclusivas no início da faixa (min incluso, max exclusivo)', () => {
    expect(windBandOf(30).key).toBe('30-35');
    expect(windBandOf(35).key).toBe('35-40');
    expect(windBandOf(45).key).toBe('>=45');
  });

  it('cobre as 5 faixas declaradas', () => {
    expect(WIND_BANDS).toHaveLength(5);
  });
});

describe('intensity / costPerM2', () => {
  it('calcula kg/m² somando só os materiais do kind pedido', () => {
    const r = record({
      areaLeve: 100,
      materials: materials({
        [SteelMaterial.GALV_ESTRUTURAL]: { kg: 500, pricePerKg: 8 },
        [SteelMaterial.GALV_COMUM]: { kg: 300, pricePerKg: 7 },
        [SteelMaterial.GALVALUME]: { kg: 999, pricePerKg: 99 }, // não é 'leve' — não deve entrar
      }),
    });
    expect(intensity(r, 'leve')).toBe(8); // (500+300)/100
  });

  it('retorna null quando a área do kind é zero — nunca divide por zero', () => {
    const r = record({ areaLeve: 0, materials: materials({ [SteelMaterial.GALV_COMUM]: { kg: 100, pricePerKg: 5 } }) });
    expect(intensity(r, 'leve')).toBeNull();
  });

  it('retorna null para um kind sem área cadastrada', () => {
    const r = record({ areaPesada: 0 });
    expect(intensity(r, 'pesada')).toBeNull();
  });

  it('costPerM2 mistura consumo e preço — cresce com o preço mesmo a kg fixo', () => {
    const barato = record({ areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 100, pricePerKg: 5 } }) });
    const caro = record({ areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 100, pricePerKg: 10 } }) });
    expect(intensity(barato, 'leve')).toBe(intensity(caro, 'leve')); // mesmo kg/m² físico
    expect(costPerM2(caro, 'leve')).toBeGreaterThan(costPerM2(barato, 'leve')!); // custo diverge
  });
});

describe('kgOf / totalKg / totalCost', () => {
  it('soma corretamente por kind e no total', () => {
    const r = record({
      materials: materials({
        [SteelMaterial.GALV_ESTRUTURAL]: { kg: 100, pricePerKg: 8 },
        [SteelMaterial.GALVALUME]: { kg: 50, pricePerKg: 6 },
      }),
    });
    expect(kgOf(r, 'leve')).toBe(100);
    expect(kgOf(r, 'cobertura')).toBe(50);
    expect(totalKg(r)).toBe(150);
    expect(totalCost(r)).toBe(100 * 8 + 50 * 6);
  });
});

describe('fitExpectedCurve', () => {
  it('retorna null com menos de MIN_FIT_SAMPLE registros', () => {
    const records = Array.from({ length: MIN_FIT_SAMPLE - 1 }, (_, i) =>
      record({ windSpeed: 30 + i, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }),
    );
    expect(fitExpectedCurve(records, 'leve')).toBeNull();
  });

  it('retorna null com menos de 3 velocidades de vento distintas mesmo com muitos registros', () => {
    const records = Array.from({ length: 10 }, () =>
      record({ windSpeed: 30, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }),
    );
    expect(fitExpectedCurve(records, 'leve')).toBeNull();
  });

  it('ajusta kg/m² = a + b*v² com precisão sobre dados sintéticos exatos', () => {
    // kg/m² = 2 + 0.01 * v² exatamente, para v = 20, 25, 30, 35, 40, 45
    const a = 2;
    const b = 0.01;
    const winds = [20, 25, 30, 35, 40, 45];
    const records = winds.map((v) => {
      const kgPerM2 = a + b * v * v;
      const area = 100;
      return record({
        windSpeed: v,
        areaLeve: area,
        materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: kgPerM2 * area, pricePerKg: 8 } }),
      });
    });
    const fit = fitExpectedCurve(records, 'leve');
    expect(fit).not.toBeNull();
    expect(fit!.a).toBeCloseTo(a, 6);
    expect(fit!.b).toBeCloseTo(b, 6);
    expect(fit!.r2).toBeCloseTo(1, 6);
    expect(fit!.n).toBe(6);

    expect(expectedIntensity(fit!, 30)).toBeCloseTo(a + b * 900, 6);
  });
});

describe('deviations', () => {
  it('sem curva (amostra insuficiente), usa a mediana da faixa como esperado', () => {
    const records = [
      record({ windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }), // 8 kg/m²
      record({ windSpeed: 33, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1000, pricePerKg: 8 } }) }), // 10 kg/m²
    ];
    const devs = deviations(records, 'leve', null);
    expect(devs.every((d) => d.esperadoSource === 'band')).toBe(true);
  });

  it('marca como outlier um registro nitidamente acima dos demais na mesma faixa', () => {
    const normal = Array.from({ length: 6 }, (_, i) =>
      record({
        windSpeed: 32 + i * 0.1,
        areaLeve: 100,
        materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }), // 8 kg/m²
      }),
    );
    const outlier = record({
      windSpeed: 32.5,
      areaLeve: 100,
      materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 2000, pricePerKg: 8 } }), // 20 kg/m²
    });
    const records = [...normal, outlier];
    const devs = deviations(records, 'leve', null);
    const outlierDev = devs.find((d) => d.record.id === outlier.id)!;
    const normalDev = devs.find((d) => d.record.id === normal[0].id)!;
    expect(outlierDev.isOutlier).toBe(true);
    expect(normalDev.isOutlier).toBe(false);
    expect(outlierDev.kgExcedente).toBeGreaterThan(0);
    expect(outlierDev.custoExcedente).toBeGreaterThan(0);
  });

  it('kgExcedente é negativo quando o consumo real é menor que o esperado (ganho de eficiência)', () => {
    const normal = Array.from({ length: 6 }, (_, i) =>
      record({
        windSpeed: 32 + i * 0.1,
        areaLeve: 100,
        materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1000, pricePerKg: 8 } }), // 10 kg/m²
      }),
    );
    const eficiente = record({
      windSpeed: 32.5,
      areaLeve: 100,
      materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 500, pricePerKg: 8 } }), // 5 kg/m²
    });
    const devs = deviations([...normal, eficiente], 'leve', null);
    const dev = devs.find((d) => d.record.id === eficiente.id)!;
    expect(dev.kgExcedente).toBeLessThan(0);
  });
});

describe('overallIntensityMean / overallCostPerM2Mean', () => {
  it('calcula a média ponderada (total kg / total m²) ignorando registros sem área (null)', () => {
    const records = [
      record({ areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }), // 8 kg/m²
      record({ areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1200, pricePerKg: 8 } }) }), // 12 kg/m²
      record({ areaLeve: 0, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 999, pricePerKg: 8 } }) }), // null — ignorado
    ];
    expect(overallIntensityMean(records, 'leve')).toBe(10); // (800+1200)/(100+100)
    expect(overallCostPerM2Mean(records, 'leve')).toBe(80); // (6400+9600)/200
  });

  it('pondera pela área — um local pequeno não pesa igual a um local grande', () => {
    const records = [
      record({ areaLeve: 10, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 200, pricePerKg: 5 } }) }), // 20 kg/m², local pequeno
      record({ areaLeve: 1000, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 8000, pricePerKg: 5 } }) }), // 8 kg/m², local grande
    ];
    // média simples dos dois kg/m² seria 14; a média ponderada reflete o volume real:
    expect(overallIntensityMean(records, 'leve')).toBeCloseTo(8200 / 1010, 5);
  });

  it('retorna 0 sem nenhum registro válido', () => {
    expect(overallIntensityMean([], 'leve')).toBe(0);
  });
});

describe('bandStats', () => {
  it('calcula mediana, p25, p75 e n só para faixas com dados', () => {
    const records = [
      record({ windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }),
      record({ windSpeed: 33, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1000, pricePerKg: 8 } }) }),
      record({ windSpeed: 34, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1200, pricePerKg: 8 } }) }),
    ];
    const stats = bandStats(records, 'leve');
    expect(stats).toHaveLength(1);
    expect(stats[0].band.key).toBe('30-35');
    expect(stats[0].n).toBe(3);
    expect(stats[0].mediana).toBe(10);
  });

  it('não retorna faixas vazias', () => {
    const records = [record({ windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) })];
    const stats = bandStats(records, 'leve');
    expect(stats.every((s) => s.n > 0)).toBe(true);
  });
});

describe('fabricationWindowOf', () => {
  const clients = [
    { name: 'Obra A', fabricationStartDate: '2026-01-01', fabricationEndDate: '2026-06-01' },
    { name: 'Obra B', fabricationStartDate: '2026-02-01' },
    { name: 'Obra Sem Data', fabricationStartDate: undefined },
  ];

  it('retorna início e fim quando cadastrados', () => {
    expect(fabricationWindowOf('Obra A', clients)).toEqual({
      start: '2026-01-01',
      end: '2026-06-01',
    });
  });

  it('retorna fim undefined quando a fabricação ainda está em andamento', () => {
    expect(fabricationWindowOf('Obra B', clients)).toEqual({ start: '2026-02-01', end: undefined });
  });

  it('retorna null quando a obra não tem data de fabricação cadastrada', () => {
    expect(fabricationWindowOf('Obra Sem Data', clients)).toBeNull();
  });

  it('retorna null quando a obra não é encontrada', () => {
    expect(fabricationWindowOf('Obra Inexistente', clients)).toBeNull();
  });
});

describe('timeSeries', () => {
  it('agrupa por ano e faixa de vento, calculando a mediana, usando o início de fabricação da obra', () => {
    const records = [
      record({ client: 'Obra A', windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }),
      record({ client: 'Obra B', windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1000, pricePerKg: 8 } }) }),
      record({ client: 'Obra C', windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 600, pricePerKg: 8 } }) }),
    ];
    const clients = [
      { name: 'Obra A', fabricationStartDate: '2025-03-01' },
      { name: 'Obra B', fabricationStartDate: '2025-08-01' },
      { name: 'Obra C', fabricationStartDate: '2026-01-01' },
    ];
    const series = timeSeries(records, 'leve', 'ANO', clients);
    expect(series).toHaveLength(2);
    const y2025 = series.find((p) => p.periodKey === '2025')!;
    expect(y2025.mediana).toBe(9); // mediana de 8 e 10
    expect(y2025.n).toBe(2);
  });

  it('separa semestres dentro do mesmo ano', () => {
    const records = [
      record({ client: 'Obra A', windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }),
      record({ client: 'Obra B', windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1200, pricePerKg: 8 } }) }),
    ];
    const clients = [
      { name: 'Obra A', fabricationStartDate: '2026-02-01' },
      { name: 'Obra B', fabricationStartDate: '2026-09-01' },
    ];
    const series = timeSeries(records, 'leve', 'SEMESTRE', clients);
    expect(series.map((p) => p.periodKey).sort()).toEqual(['2026-S1', '2026-S2']);
  });

  it('ignora obras sem data de fabricação cadastrada', () => {
    const records = [
      record({ client: 'Obra A', windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }) }),
      record({ client: 'Obra Sem Data', windSpeed: 32, areaLeve: 100, materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1200, pricePerKg: 8 } }) }),
    ];
    const clients = [{ name: 'Obra A', fabricationStartDate: '2026-02-01' }];
    const series = timeSeries(records, 'leve', 'ANO', clients);
    expect(series).toHaveLength(1);
    expect(series[0].n).toBe(1);
  });
});

describe('applySteelRevision', () => {
  it('empilha o estado antigo em revisions e incrementa revisao', () => {
    const current = record({
      revisao: 0,
      revisions: [],
      windSpeed: 30,
      areaLeve: 100,
      materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 800, pricePerKg: 8 } }),
    });
    const updated = applySteelRevision(
      current,
      {
        windSpeed: 35,
        areaLeve: 120,
        areaPesada: 0,
        areaCobertura: 0,
        materials: materials({ [SteelMaterial.GALV_ESTRUTURAL]: { kg: 1000, pricePerKg: 8.5 } }),
      },
      { reason: RevisionReason.ADDENDUM, comment: 'Aditivo de área', date: '2026-06-01', user: 'joao', id: 'rev-1' },
    );

    expect(updated.revisao).toBe(1);
    expect(updated.revisions).toHaveLength(1);
    expect(updated.revisions[0].revisao).toBe(0);
    expect(updated.revisions[0].reason).toBe(RevisionReason.ADDENDUM);
    expect(updated.revisions[0].user).toBe('joao');
    // O snapshot preserva os valores ANTIGOS, não os novos
    expect(updated.revisions[0].snapshot.windSpeed).toBe(30);
    expect(updated.revisions[0].snapshot.areaLeve).toBe(100);
    expect(updated.revisions[0].snapshot.materials[SteelMaterial.GALV_ESTRUTURAL].kg).toBe(800);
    // O registro atual reflete os valores NOVOS
    expect(updated.windSpeed).toBe(35);
    expect(updated.areaLeve).toBe(120);
    expect(updated.materials[SteelMaterial.GALV_ESTRUTURAL].kg).toBe(1000);
  });
});
