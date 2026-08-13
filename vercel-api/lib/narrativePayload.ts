/**
 * Formato compacto de KPIs enviado do front para a API. Espelha o nível de
 * detalhe que já vai hoje no corpo do email (emailSummary.ts no front) —
 * números agregados e no máximo alguns exemplos de atrasados, nunca a lista
 * crua de arquivos/projetos.
 */
export interface NarrativePayload {
  periodoLabel: string;
  totalProjects: number;
  obras: string[];
  disciplinas: string[];
  emExecucao: number;
  arquivosEmTrabalho: number;
  aguardandoCliente: number;
  atrasados: {
    total: number;
    exemplos: { obra: string; disciplina: string; diasAtraso: number }[];
  };
  vencendoEm1Dia: number;
  entregas30d: number;
  entregas30dAnterior: number;
  otd: { percentual: number | null; meta: number; amostras: number };
  iapr: { percentual: number | null; meta: number; ciclosConcluidos: number };
  cargaTrabalho: { arquivos: number; obras: number; reemissoes: number };
  motivosRevisao: { categoria: string; quantidade: number }[];
  filtroDeStatusAtivo: boolean;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/** Validação defensiva do payload recebido do client — nunca confiar em input externo. */
export function assertNarrativePayload(v: unknown): asserts v is NarrativePayload {
  if (typeof v !== 'object' || v === null) throw new Error('payload inválido');
  const p = v as Record<string, unknown>;

  if (!isString(p.periodoLabel)) throw new Error('periodoLabel inválido');
  if (!isFiniteNumber(p.totalProjects)) throw new Error('totalProjects inválido');
  if (!Array.isArray(p.obras) || !p.obras.every(isString)) throw new Error('obras inválido');
  if (!Array.isArray(p.disciplinas) || !p.disciplinas.every(isString)) {
    throw new Error('disciplinas inválido');
  }
  if (!isFiniteNumber(p.emExecucao)) throw new Error('emExecucao inválido');
  if (!isFiniteNumber(p.arquivosEmTrabalho)) throw new Error('arquivosEmTrabalho inválido');
  if (!isFiniteNumber(p.aguardandoCliente)) throw new Error('aguardandoCliente inválido');

  const atrasados = p.atrasados as Record<string, unknown> | undefined;
  if (
    typeof atrasados !== 'object' ||
    atrasados === null ||
    !isFiniteNumber(atrasados.total) ||
    !Array.isArray(atrasados.exemplos)
  ) {
    throw new Error('atrasados inválido');
  }
  for (const ex of atrasados.exemplos as unknown[]) {
    const e = ex as Record<string, unknown>;
    if (!isString(e?.obra) || !isString(e?.disciplina) || !isFiniteNumber(e?.diasAtraso)) {
      throw new Error('exemplo de atrasado inválido');
    }
  }

  if (!isFiniteNumber(p.vencendoEm1Dia)) throw new Error('vencendoEm1Dia inválido');
  if (!isFiniteNumber(p.entregas30d)) throw new Error('entregas30d inválido');
  if (!isFiniteNumber(p.entregas30dAnterior)) throw new Error('entregas30dAnterior inválido');

  const otd = p.otd as Record<string, unknown> | undefined;
  if (
    typeof otd !== 'object' ||
    otd === null ||
    (otd.percentual !== null && !isFiniteNumber(otd.percentual)) ||
    !isFiniteNumber(otd.meta) ||
    !isFiniteNumber(otd.amostras)
  ) {
    throw new Error('otd inválido');
  }

  const iapr = p.iapr as Record<string, unknown> | undefined;
  if (
    typeof iapr !== 'object' ||
    iapr === null ||
    (iapr.percentual !== null && !isFiniteNumber(iapr.percentual)) ||
    !isFiniteNumber(iapr.meta) ||
    !isFiniteNumber(iapr.ciclosConcluidos)
  ) {
    throw new Error('iapr inválido');
  }

  const carga = p.cargaTrabalho as Record<string, unknown> | undefined;
  if (
    typeof carga !== 'object' ||
    carga === null ||
    !isFiniteNumber(carga.arquivos) ||
    !isFiniteNumber(carga.obras) ||
    !isFiniteNumber(carga.reemissoes)
  ) {
    throw new Error('cargaTrabalho inválido');
  }

  if (!Array.isArray(p.motivosRevisao)) throw new Error('motivosRevisao inválido');
  for (const m of p.motivosRevisao as unknown[]) {
    const mm = m as Record<string, unknown>;
    if (!isString(mm?.categoria) || !isFiniteNumber(mm?.quantidade)) {
      throw new Error('motivo de revisão inválido');
    }
  }

  if (typeof p.filtroDeStatusAtivo !== 'boolean') throw new Error('filtroDeStatusAtivo inválido');
}
