import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Send,
  BadgeCheck,
  ThumbsDown,
  FileEdit,
  Trash2,
  Layers,
  ChevronDown,
  ChevronRight,
  MapPin,
  GripVertical,
  PencilLine,
  Play,
  CheckCircle2,
  Timer,
  CopyPlus,
  Wand2,
  FastForward,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { useObraAtiva, ObraSelectScreen, ObraAtivaBar, ObraCardStat } from '../ObraGate';
import { ClientDoc, Discipline, Period, RevisionReason } from '../../types';
import {
  Referencia,
  Conjunto,
  RefStatus,
  canRefTransition,
  catalogoKpis,
  planMoverReferenciasLote,
} from '../../domain/portfolio';
import {
  KpiCard,
  StatusBadge,
  REF_STATUS_STYLE,
  DateActionModal,
  DateActionRequest,
  RevisionHistoryModal,
  execDaysOf,
} from './shared';
import { formatDateDisplay } from '../../utils';
import { ReferenciaModal } from './ReferenciaModal';
import { InstanciarModal } from './InstanciarModal';
import { InstanciarLoteModal } from './InstanciarLoteModal';
import { GerarDisciplinasModal } from './GerarDisciplinasModal';
import { GerarDisciplinasLoteModal } from './GerarDisciplinasLoteModal';

interface CatalogoPageProps {
  referencias: Referencia[];
  conjuntos: Conjunto[];
  clients: ClientDoc[]; // apenas obras de rodovia
  holidays: string[];
  readOnly: boolean;
  onAdd: (ref: Omit<Referencia, 'id'>) => void;
  onUpdate: (id: string, changes: Partial<Referencia>) => void;
  onDelete: (id: string) => void;
  onMove: (
    ref: Referencia,
    to: RefStatus,
    date: string,
    period: Period,
    options?: { reason?: RevisionReason; comment?: string },
  ) => void;
  onMoveLote: (
    refs: Referencia[],
    to: RefStatus,
    date: string,
    period: Period,
    options?: { reason?: RevisionReason; comment?: string },
  ) => Promise<{ movidas: number; puladas: number; erros: string[] }>;
  onInstanciar: (ref: Referencia, base: string, codigoRodovia?: string) => Promise<boolean>;
  onInstanciarLote: (
    refs: Referencia[],
    bases: string[],
    onProgress?: (done: number, total: number) => void,
    codigoPorBase?: Record<string, string>,
  ) => Promise<{ criados: number; puladas: number; semGabarito: string[]; erros: string[] } | null>;
  onAddMany: (
    refs: Omit<Referencia, 'id'>[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<{ criadas: number; erros: string[] }>;
  onDeleteMany: (ids: string[]) => Promise<{ excluidas: number; erros: string[] }>;
}

type RefFilter = 'ALL' | RefStatus;

export const CatalogoPage: React.FC<CatalogoPageProps> = ({
  referencias,
  conjuntos,
  clients,
  holidays,
  readOnly,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
  onMoveLote,
  onInstanciar,
  onInstanciarLote,
  onAddMany,
  onDeleteMany,
}) => {
  const [statusFilter, setStatusFilter] = useState<RefFilter>('ALL');
  const [editing, setEditing] = useState<Referencia | 'NEW' | null>(null);
  const [instanciando, setInstanciando] = useState<Referencia | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  const [gerarLoteAberto, setGerarLoteAberto] = useState(false);
  // Origem da geração de disciplinas (a ref de ARQ; sem id quando recém-cadastrada)
  const [gerandoDe, setGerandoDe] = useState<Pick<
    Referencia,
    'codigoCliente' | 'client' | 'discipline' | 'gabarito' | 'observacao'
  > | null>(null);

  // Navegação por obra (gate compartilhado com a Carteira — mesma obra ativa)
  const obraNames = useMemo(() => clients.map((c) => c.name), [clients]);
  const {
    obraAtiva,
    selecionarObra: selecionarObraRaw,
    trocarObra: trocarObraRaw,
  } = useObraAtiva('kpicerne.rodovia.obraAtiva', obraNames, ['kpicerne.catalogo.obraAtiva']);
  const selecionarObra = (name: string) => {
    selecionarObraRaw(name);
    setStatusFilter('ALL');
    setSelecionadas(new Set());
  };
  const trocarObra = () => {
    trocarObraRaw();
    setStatusFilter('ALL');
    setSelecionadas(new Set());
  };

  // TODA a página (KPIs, lista, lotes, exclusão de disciplina) enxerga só a obra ativa
  const refsDaObra = useMemo(
    () => referencias.filter((r) => r.client === obraAtiva),
    [referencias, obraAtiva],
  );

  const temArquitetura = useMemo(
    () => refsDaObra.some((r) => r.discipline === Discipline.ARCHITECTURE),
    [refsDaObra],
  );
  const [dateAction, setDateAction] = useState<DateActionRequest | null>(null);
  const [historicoDe, setHistoricoDe] = useState<Referencia | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set()); // referências marcadas p/ lote

  const kpis = useMemo(() => catalogoKpis(refsDaObra), [refsDaObra]);

  const conjuntosByRef = useMemo(() => {
    const map = new Map<string, Conjunto[]>();
    conjuntos.forEach((c) => {
      if (!map.has(c.referenciaId)) map.set(c.referenciaId, []);
      map.get(c.referenciaId)!.push(c);
    });
    return map;
  }, [conjuntos]);

  const grouped = useMemo(() => {
    const filtered = refsDaObra.filter(
      (r) => statusFilter === 'ALL' || r.statusAprovacao === statusFilter,
    );
    const byDiscipline = new Map<Discipline, Referencia[]>();
    filtered.forEach((r) => {
      if (!byDiscipline.has(r.discipline)) byDiscipline.set(r.discipline, []);
      byDiscipline.get(r.discipline)!.push(r);
    });
    byDiscipline.forEach((list) =>
      list.sort((a, b) => a.codigoCliente.localeCompare(b.codigoCliente)),
    );
    return [...byDiscipline.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [refsDaObra, statusFilter]);

  const toggleCollapsed = (d: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  // --- Seleção multi-referência para ações em lote (mesmo padrão da Carteira) ---
  const refById = useMemo(() => new Map(refsDaObra.map((r) => [r.id, r])), [refsDaObra]);
  // Ids de referências excluídas/de outra obra caem fora aqui automaticamente
  const selRefs = useMemo(
    () => [...selecionadas].map((id) => refById.get(id)).filter((r): r is Referencia => !!r),
    [selecionadas, refById],
  );

  const toggleSelecionada = (id: string) =>
    setSelecionadas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Marca/desmarca uma lista inteira de referências (disciplina toda)
  const toggleTodasDaDisciplina = (list: Referencia[]) =>
    setSelecionadas((prev) => {
      const next = new Set(prev);
      const all = list.length > 0 && list.every((r) => next.has(r.id));
      list.forEach((r) => (all ? next.delete(r.id) : next.add(r.id)));
      return next;
    });

  const countMovable = (list: Referencia[], to: RefStatus) =>
    list.filter((r) => canRefTransition(r.statusAprovacao, to)).length;

  // Ação em LOTE: mesma data/período (e motivo, quando houver revisões) para
  // todas as referências elegíveis; as demais são puladas — o preview do modal
  // diz exatamente quantas movem e quantas ficam (mesma dinâmica da Carteira).
  const LOTE_ACTION: Partial<
    Record<RefStatus, { verbo: string; confirmLabel: string; tone: DateActionRequest['tone'] }>
  > = {
    [RefStatus.EM_ELABORACAO]: { verbo: 'Iniciar', confirmLabel: 'Iniciar Elaboração', tone: 'brand' },
    [RefStatus.ELABORADO]: { verbo: 'Concluir', confirmLabel: 'Concluir', tone: 'violet' },
    [RefStatus.ENVIADO]: { verbo: 'Enviar', confirmLabel: 'Registrar Envio', tone: 'blue' },
    [RefStatus.APROVADO]: { verbo: 'Aprovar', confirmLabel: 'Aprovar', tone: 'emerald' },
    [RefStatus.REPROVADO]: { verbo: 'Reprovar', confirmLabel: 'Reprovar', tone: 'rose' },
  };

  const askMoveLote = (alvo: Referencia[], to: RefStatus, origem: string) => {
    const plan = planMoverReferenciasLote(alvo, to);
    const a = LOTE_ACTION[to]!;
    if (plan.moviveis.length === 0) {
      alert(
        `Nenhuma das referências ${origem} pode ir para "${to}" (transição não permitida pelo status atual).`,
      );
      return;
    }
    const temRevisao =
      to === RefStatus.EM_ELABORACAO &&
      plan.moviveis.some((r) => r.statusAprovacao === RefStatus.REPROVADO);
    setDateAction({
      title: `${a.verbo} ${plan.moviveis.length} referência(s)`,
      confirmLabel: a.confirmLabel,
      tone: a.tone,
      withReason: temRevisao,
      withComment: temRevisao,
      description:
        `${plan.moviveis.length} de ${alvo.length} referência(s) ${origem} será(ão) movida(s) para "${to}".` +
        (plan.puladas.length > 0
          ? ` ${plan.puladas.length} será(ão) pulada(s) por status incompatível.`
          : '') +
        (temRevisao
          ? ' As reprovadas reabrem como nova revisão — o mesmo motivo/comentário vale para todas.'
          : ''),
      onConfirm: async (date, period, comment, reason) => {
        const r = await onMoveLote(
          plan.moviveis,
          to,
          date,
          period,
          temRevisao ? { reason, comment } : undefined,
        );
        if (r.erros.length > 0) alert(`Falha ao mover as referências:\n${r.erros.join('\n')}`);
        setSelecionadas(new Set());
      },
    });
  };

  // Exclui TODAS as referências de uma disciplina DA OBRA ATIVA (nunca de outras
  // obras). Dupla proteção: referências com conjuntos instanciados são bloqueadas
  // (aqui e de novo no banco) e a confirmação exige DIGITAR o nome da disciplina.
  const excluirDisciplina = async (discipline: Discipline) => {
    const daDisciplina = refsDaObra.filter((r) => r.discipline === discipline);
    if (daDisciplina.length === 0) return;
    const comConjuntos = daDisciplina.filter((r) => (conjuntosByRef.get(r.id) || []).length > 0);
    const excluiveis = daDisciplina.filter((r) => (conjuntosByRef.get(r.id) || []).length === 0);

    if (excluiveis.length === 0) {
      alert(
        `Todas as ${daDisciplina.length} referência(s) de ${discipline} possuem conjuntos instanciados em Projetos Locais. Exclua os conjuntos antes.`,
      );
      return;
    }

    const aviso =
      comConjuntos.length > 0
        ? `\n\nATENÇÃO: ${comConjuntos.length} referência(s) com conjuntos instanciados NÃO serão excluídas:\n${comConjuntos.map((r) => `  • ${r.codigoCliente}`).join('\n')}`
        : '';
    const digitado = prompt(
      `Excluir ${excluiveis.length} referência(s) da disciplina ${discipline} na obra "${obraAtiva}":\n${excluiveis.map((r) => `  • ${r.codigoCliente}`).join('\n')}${aviso}\n\nEsta ação NÃO pode ser desfeita. Para confirmar, digite o nome da disciplina:`,
    );
    if (digitado === null) return;
    if (digitado.trim().toLowerCase() !== discipline.toLowerCase()) {
      alert('Nome da disciplina não confere — exclusão cancelada.');
      return;
    }
    const { excluidas, erros } = await onDeleteMany(excluiveis.map((r) => r.id));
    alert(
      `${excluidas} referência(s) de ${discipline} excluída(s).${erros.length > 0 ? `\n\nFalhas:\n${erros.join('\n')}` : ''}`,
    );
  };

  const askMove = (ref: Referencia, to: RefStatus) => {
    // Reprovado → Em Elaboração é a abertura de REVISÃO: pede motivo + comentário,
    // que entram no histórico do molde (mesma dinâmica da aba Projetos).
    const isRevisao = to === RefStatus.EM_ELABORACAO && ref.statusAprovacao === RefStatus.REPROVADO;
    const cfg: Record<
      string,
      {
        title: string;
        confirmLabel: string;
        tone: DateActionRequest['tone'];
        withReason?: boolean;
        withComment?: boolean;
      }
    > = {
      [RefStatus.EM_ELABORACAO]: isRevisao
        ? {
            title: `Revisar "${ref.codigoCliente}"`,
            confirmLabel: 'Iniciar Revisão',
            tone: 'brand',
            withReason: true,
            withComment: true,
          }
        : {
            title: `Iniciar elaboração de "${ref.codigoCliente}"`,
            confirmLabel: 'Iniciar Elaboração',
            tone: 'brand',
          },
      [RefStatus.ELABORADO]: {
        title: `Concluir elaboração de "${ref.codigoCliente}"`,
        confirmLabel: 'Concluir',
        tone: 'violet',
      },
      [RefStatus.ENVIADO]: {
        title: `Enviar "${ref.codigoCliente}" ao cliente`,
        confirmLabel: 'Registrar Envio',
        tone: 'blue',
      },
      [RefStatus.APROVADO]: {
        title: `Aprovar "${ref.codigoCliente}"`,
        confirmLabel: 'Aprovar',
        tone: 'emerald',
      },
      [RefStatus.REPROVADO]: {
        title: `Reprovar "${ref.codigoCliente}"`,
        confirmLabel: 'Reprovar',
        tone: 'rose',
      },
    };
    const c = cfg[to];
    const descriptions: Partial<Record<RefStatus, string>> = {
      [RefStatus.EM_ELABORACAO]: isRevisao
        ? `O molde reprovado volta para elaboração como R${String((ref.revisao || 0) + 1).padStart(2, '0')}. O motivo fica no histórico e as datas de conclusão/envio/feedback são reiniciadas.`
        : 'A partir desta data o tempo de execução do preliminar passa a ser medido.',
      [RefStatus.ELABORADO]:
        'Fecha a medição do tempo de execução (dias úteis entre início e conclusão).',
    };
    setDateAction({
      ...c,
      description: descriptions[to],
      onConfirm: (date, period, comment, reason) =>
        onMove(ref, to, date, period, isRevisao ? { reason, comment } : undefined),
    });
  };

  // --- Tela de seleção de obra (antes da lista do catálogo) ---
  if (!obraAtiva) {
    return (
      <ObraSelectScreen
        obras={clients}
        subtitle="O catálogo é navegado por obra. A escolha fica salva — nas próximas visitas você entra direto nela."
        emptyTitle="Nenhuma obra de rodovia cadastrada"
        emptyHint='Cadastre uma obra do tipo "Obra de Rodovia" na aba Obras para começar o catálogo.'
        onSelect={selecionarObra}
        statsOf={(name) => {
          const k = catalogoKpis(referencias.filter((r) => r.client === name));
          const nBases = (clients.find((c) => c.name === name)?.bases || []).length;
          const stats: ObraCardStat[] = [
            { value: k.total, label: 'projeto(s) no catálogo' },
            { value: nBases, label: 'base(s) registrada(s)' },
          ];
          if (k.emElaboracao > 0)
            stats.push({
              value: k.emElaboracao,
              label: 'em elaboração',
              tone: 'text-amber-600 dark:text-amber-400 font-semibold',
            });
          if (k.enviado > 0)
            stats.push({
              value: k.enviado,
              label: 'com o cliente',
              tone: 'text-blue-600 dark:text-blue-400 font-semibold',
            });
          if (k.aprovado > 0)
            stats.push({
              value: k.aprovado,
              label: 'aprovado(s)',
              tone: 'text-emerald-600 dark:text-emerald-400 font-semibold',
            });
          if (k.reprovado > 0)
            stats.push({
              value: k.reprovado,
              label: 'reprovado(s)',
              tone: 'text-rose-600 dark:text-rose-400 font-semibold',
            });
          if (k.total === 0)
            stats.push({
              value: '',
              label: 'Nenhuma referência — comece por aqui',
              tone: 'italic col-span-2',
            });
          return stats;
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Obra ativa: todo o catálogo abaixo é SÓ desta obra */}
      <ObraAtivaBar obra={obraAtiva} canTrocar={clients.length > 1} onTrocar={trocarObra} />

      {/* KPIs nível Referência: elaboração + validação dos TIPOS (nunca mistura com pranchas) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <KpiCard
          color="slate"
          icon={<BookOpen size={16} />}
          label="Todos os Tipos"
          value={kpis.total}
          active={statusFilter === 'ALL'}
          onClick={() => setStatusFilter('ALL')}
        />
        <KpiCard
          color="slate"
          icon={<FileEdit size={16} />}
          label="Rascunho"
          value={kpis.rascunho}
          active={statusFilter === RefStatus.RASCUNHO}
          onClick={() =>
            setStatusFilter((f) => (f === RefStatus.RASCUNHO ? 'ALL' : RefStatus.RASCUNHO))
          }
        />
        <KpiCard
          color="amber"
          icon={<Play size={16} />}
          label="Em Elaboração"
          value={kpis.emElaboracao}
          active={statusFilter === RefStatus.EM_ELABORACAO}
          onClick={() =>
            setStatusFilter((f) =>
              f === RefStatus.EM_ELABORACAO ? 'ALL' : RefStatus.EM_ELABORACAO,
            )
          }
        />
        <KpiCard
          color="violet"
          icon={<CheckCircle2 size={16} />}
          label="Elaborados"
          value={kpis.elaborado}
          active={statusFilter === RefStatus.ELABORADO}
          onClick={() =>
            setStatusFilter((f) => (f === RefStatus.ELABORADO ? 'ALL' : RefStatus.ELABORADO))
          }
        />
        <KpiCard
          color="blue"
          icon={<Send size={16} />}
          label="Com o Cliente"
          value={kpis.enviado}
          active={statusFilter === RefStatus.ENVIADO}
          onClick={() =>
            setStatusFilter((f) => (f === RefStatus.ENVIADO ? 'ALL' : RefStatus.ENVIADO))
          }
        />
        <KpiCard
          color="emerald"
          icon={<BadgeCheck size={16} />}
          label="Tipos Aprovados"
          value={kpis.aprovado}
          active={statusFilter === RefStatus.APROVADO}
          onClick={() =>
            setStatusFilter((f) => (f === RefStatus.APROVADO ? 'ALL' : RefStatus.APROVADO))
          }
        />
        <KpiCard
          color="rose"
          icon={<ThumbsDown size={16} />}
          label="Reprovados"
          value={kpis.reprovado}
          active={statusFilter === RefStatus.REPROVADO}
          onClick={() =>
            setStatusFilter((f) => (f === RefStatus.REPROVADO ? 'ALL' : RefStatus.REPROVADO))
          }
        />
        <KpiCard
          color="cyan"
          icon={<FastForward size={16} />}
          label="Executivo Gerado"
          value={kpis.executivoGerado}
          active={statusFilter === RefStatus.SUPERSEDED}
          onClick={() =>
            setStatusFilter((f) => (f === RefStatus.SUPERSEDED ? 'ALL' : RefStatus.SUPERSEDED))
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Moldes por tipo de obra. Uma referência nunca é consumida: instancie-a em quantas bases
          (KM) precisar.
        </p>
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => setGerarLoteAberto(true)}
              disabled={!temArquitetura}
              className="flex items-center gap-2 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-40 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all"
              title="Gerar as disciplinas de várias Arquiteturas de uma vez"
            >
              <Wand2 size={14} /> Gerar Disciplinas
            </button>
            <button
              onClick={() => setLoteAberto(true)}
              disabled={refsDaObra.length === 0}
              className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all"
              title="Instanciar várias referências em várias bases de uma vez"
            >
              <CopyPlus size={14} /> Instanciar em Lote
            </button>
            <button
              onClick={() => setEditing('NEW')}
              className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all"
            >
              <Plus size={14} /> Nova Referência
            </button>
          </div>
        )}
      </div>

      {refsDaObra.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
          <BookOpen className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Nenhuma referência no catálogo de {obraAtiva}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Cadastre o projeto básico de cada TIPO de edificação (ex.: BSO, PSP) com seu gabarito de
            pranchas.
          </p>
        </div>
      )}

      {grouped.map(([discipline, refs]) => (
        <div
          key={discipline}
          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        >
          <div className="flex items-center bg-slate-50/60 dark:bg-slate-900/30">
            <button
              onClick={() => toggleCollapsed(discipline)}
              className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                {collapsed.has(discipline) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <Layers size={15} className="text-brand-600 dark:text-brand-400" />
                {discipline}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {refs.length} tipo(s)
              </span>
            </button>
            {!readOnly && (
              <button
                onClick={() => excluirDisciplina(discipline)}
                className="p-2 mx-2 rounded-lg text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 transition-colors flex-shrink-0"
                title={`Excluir TODAS as referências de ${discipline} (com confirmação)`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {!collapsed.has(discipline) && (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {!readOnly && (
                <div className="px-4 py-1.5 flex items-center justify-between bg-slate-50/40 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-700/40">
                  <button
                    onClick={() => toggleTodasDaDisciplina(refs)}
                    disabled={refs.length === 0}
                    className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-40"
                  >
                    {refs.length > 0 && refs.every((r) => selecionadas.has(r.id))
                      ? 'Desmarcar todas'
                      : 'Selecionar todas'}{' '}
                    ({refs.length})
                  </button>
                </div>
              )}
              {refs.map((ref) => {
                const bases = conjuntosByRef.get(ref.id) || [];
                const exec = execDaysOf(
                  ref,
                  ref.statusAprovacao === RefStatus.EM_ELABORACAO,
                  holidays,
                );
                return (
                  <div
                    key={ref.id}
                    className="px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3"
                  >
                    {!readOnly && (
                      <button
                        onClick={() => toggleSelecionada(ref.id)}
                        className="flex-shrink-0"
                        title="Selecionar para ação em lote"
                        aria-label={`Selecionar ${ref.codigoCliente}`}
                      >
                        {selecionadas.has(ref.id) ? (
                          <CheckSquare size={15} className="text-violet-600" />
                        ) : (
                          <Square size={15} className="text-slate-300 dark:text-slate-600" />
                        )}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                          {ref.codigoCliente}
                        </span>
                        {(ref.revisao ?? 0) > 0 || (ref.revisions?.length ?? 0) > 0 ? (
                          <button
                            onClick={() => setHistoricoDe(ref)}
                            className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                            title="Ver histórico de revisões (motivos e comentários)"
                            aria-label={`Ver histórico de revisões de ${ref.codigoCliente}`}
                          >
                            R{String(ref.revisao ?? 0).padStart(2, '0')}
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">
                            R00
                          </span>
                        )}
                        <StatusBadge
                          label={ref.statusAprovacao}
                          className={REF_STATUS_STYLE[ref.statusAprovacao]}
                        />
                        {bases.length > 0 && ref.statusAprovacao !== RefStatus.SUPERSEDED && (
                          <StatusBadge
                            label={RefStatus.SUPERSEDED}
                            className={REF_STATUS_STYLE[RefStatus.SUPERSEDED]}
                            title={`Já instanciada em ${bases.length} base(s) — o veredito "${ref.statusAprovacao}" é mantido, mas o trabalho segue no executivo (Projetos Locais)`}
                          />
                        )}
                        {ref.importada && (
                          <span
                            className="text-[10px] font-bold text-amber-600 dark:text-amber-400"
                            title="Criada pela migração a partir de executivos sem preliminar"
                          >
                            importada
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <GripVertical size={11} /> {ref.gabarito.length} entregável(is) no
                          gabarito
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin size={11} /> {bases.length} base(s) instanciada(s)
                        </span>
                        {ref.startDate && <span>Início: {formatDateDisplay(ref.startDate)}</span>}
                        {ref.endDate && <span>Conclusão: {formatDateDisplay(ref.endDate)}</span>}
                        {ref.sendDate && <span>Envio: {formatDateDisplay(ref.sendDate)}</span>}
                        {ref.feedbackDate && (
                          <span>Feedback: {formatDateDisplay(ref.feedbackDate)}</span>
                        )}
                        {exec && (
                          <span
                            className={`flex items-center gap-1 font-semibold ${exec.running ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400'}`}
                          >
                            <Timer size={11} />{' '}
                            {exec.running
                              ? `Em elaboração há ${exec.days}d úteis`
                              : `Execução: ${exec.days}d úteis`}
                          </span>
                        )}
                        {(ref.blockedDays || 0) > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {ref.blockedDays}d com o cliente
                          </span>
                        )}
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {ref.discipline === Discipline.ARCHITECTURE && (
                          <ActionBtn
                            title="Gerar referências das outras disciplinas a partir desta (troca a sigla no código)"
                            tone="text-violet-600"
                            onClick={() => setGerandoDe(ref)}
                          >
                            <Wand2 size={15} />
                          </ActionBtn>
                        )}
                        {canRefTransition(ref.statusAprovacao, RefStatus.EM_ELABORACAO) && (
                          <ActionBtn
                            title={
                              ref.statusAprovacao === RefStatus.REPROVADO
                                ? 'Retrabalhar (nova revisão do molde)'
                                : 'Iniciar elaboração (começa a medir o tempo de execução)'
                            }
                            tone="text-amber-600"
                            onClick={() => askMove(ref, RefStatus.EM_ELABORACAO)}
                          >
                            <Play size={15} />
                          </ActionBtn>
                        )}
                        {canRefTransition(ref.statusAprovacao, RefStatus.ELABORADO) && (
                          <ActionBtn
                            title="Concluir elaboração (fecha o tempo de execução)"
                            tone="text-violet-600"
                            onClick={() => askMove(ref, RefStatus.ELABORADO)}
                          >
                            <CheckCircle2 size={15} />
                          </ActionBtn>
                        )}
                        {canRefTransition(ref.statusAprovacao, RefStatus.ENVIADO) && (
                          <ActionBtn
                            title="Registrar envio ao cliente"
                            tone="text-blue-600"
                            onClick={() => askMove(ref, RefStatus.ENVIADO)}
                          >
                            <Send size={15} />
                          </ActionBtn>
                        )}
                        {canRefTransition(ref.statusAprovacao, RefStatus.APROVADO) && (
                          <ActionBtn
                            title="Aprovar"
                            tone="text-emerald-600"
                            onClick={() => askMove(ref, RefStatus.APROVADO)}
                          >
                            <BadgeCheck size={15} />
                          </ActionBtn>
                        )}
                        {canRefTransition(ref.statusAprovacao, RefStatus.REPROVADO) && (
                          <ActionBtn
                            title="Reprovar"
                            tone="text-rose-600"
                            onClick={() => askMove(ref, RefStatus.REPROVADO)}
                          >
                            <ThumbsDown size={15} />
                          </ActionBtn>
                        )}
                        <ActionBtn
                          title="Editar referência e gabarito"
                          onClick={() => setEditing(ref)}
                        >
                          <PencilLine size={15} />
                        </ActionBtn>
                        <ActionBtn
                          title="Excluir"
                          tone="text-rose-600"
                          onClick={() => onDelete(ref.id)}
                        >
                          <Trash2 size={15} />
                        </ActionBtn>
                        {/* Instanciar é a ÚLTIMA ação do fluxo (não exige aprovação) — fica mais à direita */}
                        <button
                          onClick={() => setInstanciando(ref)}
                          className="flex items-center gap-1.5 bg-brand-700 hover:bg-brand-800 text-white px-3 py-2 rounded-lg text-[11px] font-bold shadow-sm"
                          title="Criar um Conjunto em uma base (KM), pré-gerando as pranchas do gabarito"
                        >
                          <MapPin size={13} /> Instanciar em Base
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Barra flutuante da seleção: transições em lote das referências marcadas
          (pode misturar disciplinas — cada referência só move se puder) */}
      {!readOnly && selRefs.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-2 flex-wrap justify-center animate-in fade-in slide-in-from-bottom-2 print:hidden">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {selRefs.length} selecionada(s)
          </span>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700"></span>
          <LoteBtn
            label="Iniciar"
            count={countMovable(selRefs, RefStatus.EM_ELABORACAO)}
            tone="text-amber-600 dark:text-amber-400"
            onClick={() => askMoveLote(selRefs, RefStatus.EM_ELABORACAO, 'selecionada(s)')}
          />
          <LoteBtn
            label="Concluir"
            count={countMovable(selRefs, RefStatus.ELABORADO)}
            tone="text-violet-600 dark:text-violet-400"
            onClick={() => askMoveLote(selRefs, RefStatus.ELABORADO, 'selecionada(s)')}
          />
          <LoteBtn
            label="Enviar"
            count={countMovable(selRefs, RefStatus.ENVIADO)}
            tone="text-blue-600 dark:text-blue-400"
            onClick={() => askMoveLote(selRefs, RefStatus.ENVIADO, 'selecionada(s)')}
          />
          <LoteBtn
            label="Aprovar"
            count={countMovable(selRefs, RefStatus.APROVADO)}
            tone="text-emerald-600 dark:text-emerald-400"
            onClick={() => askMoveLote(selRefs, RefStatus.APROVADO, 'selecionada(s)')}
          />
          <LoteBtn
            label="Reprovar"
            count={countMovable(selRefs, RefStatus.REPROVADO)}
            tone="text-rose-600 dark:text-rose-400"
            onClick={() => askMoveLote(selRefs, RefStatus.REPROVADO, 'selecionada(s)')}
          />
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700"></span>
          <button
            onClick={() => setLoteAberto(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 hover:border-brand-300 transition-colors text-brand-700 dark:text-brand-400"
            title={`Instanciar ${selRefs.length} referência(s) selecionada(s) em uma ou mais bases`}
          >
            <MapPin size={13} /> Instanciar
          </button>
          <button
            onClick={async () => {
              if (
                !confirm(
                  `Excluir ${selRefs.length} referência(s) selecionada(s)?\n\nReferências com conjuntos instanciados em Projetos Locais não serão excluídas.\n\nEsta ação não pode ser desfeita.`,
                )
              )
                return;
              const { excluidas, erros } = await onDeleteMany(selRefs.map((r) => r.id));
              alert(
                `${excluidas} referência(s) excluída(s).${erros.length > 0 ? `\n\nFalhas:\n${erros.join('\n')}` : ''}`,
              );
              setSelecionadas(new Set());
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 hover:border-rose-300 transition-colors text-rose-600 dark:text-rose-400"
            title="Excluir as referências selecionadas (bloqueadas as que têm conjuntos instanciados)"
          >
            <Trash2 size={13} /> Excluir
          </button>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700"></span>
          <button
            onClick={() => setSelecionadas(new Set())}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Limpar seleção"
          >
            <X size={13} /> Limpar
          </button>
        </div>
      )}

      {editing && (
        <ReferenciaModal
          referencia={editing === 'NEW' ? null : editing}
          clients={clients}
          defaultClient={obraAtiva}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'NEW') {
              onAdd(data);
              // Arquitetura cadastrada → oferece gerar as demais disciplinas na hora
              if (data.discipline === Discipline.ARCHITECTURE) setGerandoDe(data);
            } else {
              onUpdate(editing.id, data);
            }
            setEditing(null);
          }}
        />
      )}

      {instanciando && (
        <InstanciarModal
          referencia={instanciando}
          existingBases={(conjuntosByRef.get(instanciando.id) || []).map((c) => c.base)}
          basesRegistradas={clients.find((c) => c.name === instanciando.client)?.bases || []}
          onClose={() => setInstanciando(null)}
          onConfirm={async (base, codigo) => {
            const ok = await onInstanciar(instanciando, base, codigo);
            if (ok) setInstanciando(null);
          }}
        />
      )}

      {loteAberto && (
        <InstanciarLoteModal
          referencias={refsDaObra}
          conjuntos={conjuntos}
          clients={clients}
          initialSelRefs={selecionadas}
          onClose={() => {
            setLoteAberto(false);
            setSelecionadas(new Set());
          }}
          onConfirm={onInstanciarLote}
        />
      )}

      {gerandoDe && (
        <GerarDisciplinasModal
          origem={gerandoDe}
          referencias={referencias}
          onClose={() => setGerandoDe(null)}
          onConfirm={onAddMany}
        />
      )}

      {gerarLoteAberto && (
        <GerarDisciplinasLoteModal
          referencias={refsDaObra}
          clients={clients}
          onClose={() => setGerarLoteAberto(false)}
          onConfirm={onAddMany}
        />
      )}

      {dateAction && <DateActionModal request={dateAction} onClose={() => setDateAction(null)} />}

      {historicoDe && (
        <RevisionHistoryModal
          title={historicoDe.codigoCliente}
          revisions={historicoDe.revisions || []}
          readOnly={readOnly}
          holidays={holidays}
          onSave={(updated) => {
            onUpdate(historicoDe.id, { revisions: updated });
            setHistoricoDe({ ...historicoDe, revisions: updated });
          }}
          onClose={() => setHistoricoDe(null)}
        />
      )}
    </div>
  );
};

function ActionBtn({
  children,
  title,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-brand-300 transition-colors ${tone || 'text-slate-500 dark:text-slate-400'}`}
    >
      {children}
    </button>
  );
}

// Botão da barra de seleção: mostra quantas das selecionadas PODEM ir ao destino
function LoteBtn({
  label,
  count,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={count === 0}
      title={count === 0 ? `Nenhuma selecionada pode "${label}"` : `${label} ${count} referência(s)`}
      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 hover:border-brand-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${tone || 'text-slate-600 dark:text-slate-300'}`}
    >
      {label} ({count})
    </button>
  );
}
