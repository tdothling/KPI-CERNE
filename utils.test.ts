import { describe, it, expect } from 'vitest';
import {
  calculateNetExecutionDuration,
  calculateBusinessDaysWithHolidays,
  resolveEntregavelDeadline,
  isEntregavelOverdue,
  formatNumberBR,
  formatCurrencyBR,
} from './utils';

describe('calculateNetExecutionDuration', () => {
  it('desconta uma pausa que cobre quase todo o intervalo (cenário original do test_calc.ts)', () => {
    // 25_MANHA, 25_TARDE, 26_MANHA, 26_TARDE = 4 slots (2.0d) no total.
    // Pausa cobre 25_MANHA a 26_MANHA (inclusive) = 3 slots (1.5d).
    // Sobra só 26_TARDE livre = 0.5d.
    const duration = calculateNetExecutionDuration(
      {
        startDate: '2026-03-25',
        startPeriod: 'MANHA',
        endDate: '2026-03-26',
        endPeriod: 'TARDE',
        pauses: [
          {
            id: 'pausa-1',
            startDate: '2026-03-25',
            startPeriod: 'MANHA',
            endDate: '2026-03-26',
            endPeriod: 'MANHA',
          },
        ],
      },
      [],
    );
    expect(duration).toBe(0.5);
  });

  it('sem pausas, conta os dois períodos de cada dia útil', () => {
    // Segunda a terça, dia inteiro nos dois dias = 4 slots = 2.0d
    const duration = calculateNetExecutionDuration(
      {
        startDate: '2026-03-23', // segunda
        startPeriod: 'MANHA',
        endDate: '2026-03-24', // terça
        endPeriod: 'TARDE',
      },
      [],
    );
    expect(duration).toBe(2);
  });

  it('não conta sábado e domingo mesmo dentro do intervalo', () => {
    // Sexta (MANHA) a segunda (TARDE): só sexta e segunda contam, fim de semana é pulado.
    const duration = calculateNetExecutionDuration(
      {
        startDate: '2026-03-20', // sexta
        startPeriod: 'MANHA',
        endDate: '2026-03-23', // segunda
        endPeriod: 'TARDE',
      },
      [],
    );
    expect(duration).toBe(2); // sexta inteira (1d) + segunda inteira (1d)
  });

  it('desconta um feriado no meio do intervalo', () => {
    // Segunda a quarta (3 dias úteis), com terça de feriado.
    const duration = calculateNetExecutionDuration(
      {
        startDate: '2026-03-23', // segunda
        startPeriod: 'MANHA',
        endDate: '2026-03-25', // quarta
        endPeriod: 'TARDE',
      },
      ['2026-03-24'], // terça é feriado
    );
    expect(duration).toBe(2); // segunda + quarta, terça descontada
  });

  it('retorna 0 quando não há data de início válida', () => {
    expect(calculateNetExecutionDuration({ startDate: '', endDate: '' }, [])).toBe(0);
  });
});

describe('calculateBusinessDaysWithHolidays', () => {
  it('conta um único dia útil como 1 dia', () => {
    const monday = new Date('2026-03-23T00:00:00');
    expect(calculateBusinessDaysWithHolidays(monday, monday, [])).toBe(1);
  });

  it('conta segunda a terça como 2 dias', () => {
    const monday = new Date('2026-03-23T00:00:00');
    const tuesday = new Date('2026-03-24T00:00:00');
    expect(calculateBusinessDaysWithHolidays(monday, tuesday, [])).toBe(2);
  });

  it('desconta feriado dentro do intervalo', () => {
    const monday = new Date('2026-03-23T00:00:00');
    const wednesday = new Date('2026-03-25T00:00:00');
    expect(calculateBusinessDaysWithHolidays(monday, wednesday, ['2026-03-24'])).toBe(2);
  });

  it('aplica ajuste de meio período quando começa à tarde ou termina de manhã', () => {
    const monday = new Date('2026-03-23T00:00:00');
    const tuesday = new Date('2026-03-24T00:00:00');
    // Começou à tarde (perde a manhã do 1º dia) e terminou de manhã (perde a tarde do último).
    expect(calculateBusinessDaysWithHolidays(monday, tuesday, [], 'TARDE', 'MANHA')).toBe(1);
  });

  it('retorna 0 quando a data final é anterior à inicial', () => {
    const monday = new Date('2026-03-23T00:00:00');
    const sunday = new Date('2026-03-22T00:00:00');
    expect(calculateBusinessDaysWithHolidays(monday, sunday, [])).toBe(0);
  });
});

describe('resolveEntregavelDeadline', () => {
  it('1ª entrega sem targetDate usa o prazo padrão da obra', () => {
    const result = resolveEntregavelDeadline(undefined, true, '2026-04-02');
    expect(result?.toISOString().slice(0, 10)).toBe('2026-04-02');
  });

  it('1ª entrega COM targetDate usa o targetDate, não o prazo da obra', () => {
    const result = resolveEntregavelDeadline('2026-05-10', true, '2026-04-02');
    expect(result?.toISOString().slice(0, 10)).toBe('2026-05-10');
  });

  it('revisão posterior sem targetDate não tem prazo (não é medida)', () => {
    expect(resolveEntregavelDeadline(undefined, false, '2026-04-02')).toBeNull();
  });

  it('revisão posterior COM targetDate usa o targetDate', () => {
    const result = resolveEntregavelDeadline('2026-06-15', false, '2026-04-02');
    expect(result?.toISOString().slice(0, 10)).toBe('2026-06-15');
  });

  it('retorna null quando não há prazo da obra nem targetDate', () => {
    expect(resolveEntregavelDeadline(undefined, true, undefined)).toBeNull();
  });
});

describe('isEntregavelOverdue', () => {
  const deadline = new Date('2026-04-02T00:00:00');

  it('sem prazo resolvido, nunca está atrasado', () => {
    expect(isEntregavelOverdue(null, '2026-05-01', true)).toBe(false);
  });

  it('com endDate após o prazo, está atrasado', () => {
    expect(isEntregavelOverdue(deadline, '2026-04-10', false)).toBe(true);
  });

  it('com endDate dentro do prazo, não está atrasado', () => {
    expect(isEntregavelOverdue(deadline, '2026-03-30', false)).toBe(false);
  });

  it('sem endDate, status fechado (não aberto), não está atrasado', () => {
    expect(isEntregavelOverdue(deadline, undefined, false)).toBe(false);
  });
});

describe('formatNumberBR', () => {
  it('formata com vírgula decimal e 1 casa por padrão', () => {
    expect(formatNumberBR(1234.5)).toBe('1.234,5');
  });

  it('respeita o número de casas decimais informado', () => {
    expect(formatNumberBR(8, 2)).toBe('8,00');
    expect(formatNumberBR(8.256, 0)).toBe('8');
  });
});

describe('formatCurrencyBR', () => {
  it('formata como moeda brasileira com 2 casas', () => {
    expect(formatCurrencyBR(1234.5)).toBe('R$ 1.234,50');
  });
});
