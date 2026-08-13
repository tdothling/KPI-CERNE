import { useMemo, useState } from 'react';
import { Wand2, X, CheckCircle2, CheckSquare, Square } from 'lucide-react';
import { Discipline } from '../../types';
import {
  Referencia,
  DISCIPLINA_SIGLA,
  gerarReferenciasDisciplinas,
  swapDisciplinaSigla,
} from '../../domain/portfolio';

// --- Modal de geração de disciplinas a partir da Arquitetura ---
//
// A nomenclatura "Edificação-Cliente-Disciplina" permite derivar os códigos das
// demais disciplinas trocando a sigla. O gabarito da ARQ é copiado como ponto de
// partida; disciplinas fora do contrato basta desmarcar (ou excluir depois).

export const DISCIPLINAS_GERAVEIS: { discipline: Discipline; sigla: string }[] = [
  { discipline: Discipline.STRUCTURE, sigla: DISCIPLINA_SIGLA[Discipline.STRUCTURE]! },
  { discipline: Discipline.FOUNDATION, sigla: DISCIPLINA_SIGLA[Discipline.FOUNDATION]! },
  { discipline: Discipline.ELECTRICAL, sigla: DISCIPLINA_SIGLA[Discipline.ELECTRICAL]! },
  { discipline: Discipline.DATA, sigla: DISCIPLINA_SIGLA[Discipline.DATA]! },
  { discipline: Discipline.HYDRAULIC, sigla: DISCIPLINA_SIGLA[Discipline.HYDRAULIC]! },
  { discipline: Discipline.SPDA, sigla: DISCIPLINA_SIGLA[Discipline.SPDA]! },
  { discipline: Discipline.FIRE, sigla: DISCIPLINA_SIGLA[Discipline.FIRE]! },
  { discipline: Discipline.HVAC, sigla: DISCIPLINA_SIGLA[Discipline.HVAC]! },
];

export function GerarDisciplinasModal({
  origem,
  referencias,
  onClose,
  onConfirm,
}: {
  origem: Pick<Referencia, 'codigoCliente' | 'client' | 'discipline' | 'gabarito' | 'observacao'>;
  referencias: Referencia[];
  onClose: () => void;
  onConfirm: (refs: Omit<Referencia, 'id'>[]) => Promise<{ criadas: number; erros: string[] }>;
}) {
  // Todas marcadas por padrão ("é só apagar e boa" — a exceção é Outros, que exige sigla)
  const [marcadas, setMarcadas] = useState<Set<Discipline>>(
    new Set(DISCIPLINAS_GERAVEIS.map((d) => d.discipline)),
  );
  const [outrosSigla, setOutrosSigla] = useState('');
  const [outrosMarcada, setOutrosMarcada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{
    criadas: number;
    erros: string[];
    puladas: string[];
  } | null>(null);

  const siglaOrigem = DISCIPLINA_SIGLA[origem.discipline] || 'ARQ';

  const destinos = useMemo(() => {
    const d = DISCIPLINAS_GERAVEIS.filter((x) => marcadas.has(x.discipline)).map((x) => ({ ...x }));
    if (outrosMarcada && outrosSigla.trim())
      d.push({ discipline: Discipline.OTHER, sigla: outrosSigla.trim().toUpperCase() });
    return d;
  }, [marcadas, outrosMarcada, outrosSigla]);

  // Preview com a MESMA função que gera (o que aparece é o que será criado)
  const plano = useMemo(
    () =>
      gerarReferenciasDisciplinas({
        origem,
        destinos,
        existingReferencias: referencias,
      }),
    [origem, destinos, referencias],
  );

  const toggle = (d: Discipline) =>
    setMarcadas((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  const gerar = async () => {
    setSalvando(true);
    try {
      const r = await onConfirm(plano.novas);
      setResultado({ ...r, puladas: plano.puladas });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Wand2 size={18} className="text-violet-600 dark:text-violet-400" /> Gerar Disciplinas
          </h3>
          <button
            onClick={onClose}
            disabled={salvando}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {resultado ? (
          <div className="space-y-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={16} /> {resultado.criadas} referência(s) criada(s) no catálogo
              </p>
              {resultado.puladas.length > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  Já existiam (puladas): {resultado.puladas.join(', ')}
                </p>
              )}
            </div>
            {resultado.erros.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                <p className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">Falhas:</p>
                <ul className="text-xs text-rose-700 dark:text-rose-400 space-y-0.5">
                  {resultado.erros.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              A partir de{' '}
              <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                {origem.codigoCliente}
              </span>
              , as disciplinas abaixo serão cadastradas trocando a sigla{' '}
              <strong>{siglaOrigem}</strong> no código. O gabarito ({origem.gabarito.length}{' '}
              entregável(is)) é copiado como ponto de partida — edite depois se precisar. Disciplina
              fora do contrato? É só desmarcar.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
              {DISCIPLINAS_GERAVEIS.map(({ discipline, sigla }) => {
                const codigo = swapDisciplinaSigla(origem.codigoCliente, siglaOrigem, sigla);
                const jaExiste = plano.puladas.includes(codigo);
                return (
                  <button
                    key={discipline}
                    onClick={() => toggle(discipline)}
                    disabled={salvando}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${marcadas.has(discipline) && !jaExiste ? 'border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700'} ${jaExiste ? 'opacity-50' : 'hover:border-violet-300'}`}
                  >
                    {marcadas.has(discipline) && !jaExiste ? (
                      <CheckSquare size={15} className="text-violet-600 flex-shrink-0" />
                    ) : (
                      <Square
                        size={15}
                        className="text-slate-300 dark:text-slate-600 flex-shrink-0"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                        {discipline} <span className="text-slate-400 font-mono">({sigla})</span>
                      </span>
                      <span
                        className={`block text-[10px] font-mono truncate ${jaExiste ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}
                      >
                        {jaExiste ? `${codigo} — já existe` : codigo}
                      </span>
                    </span>
                  </button>
                );
              })}

              {/* Outros: sigla a preencher */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${outrosMarcada ? 'border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <button
                  onClick={() => setOutrosMarcada((v) => !v)}
                  disabled={salvando}
                  className="flex-shrink-0"
                >
                  {outrosMarcada ? (
                    <CheckSquare size={15} className="text-violet-600" />
                  ) : (
                    <Square size={15} className="text-slate-300 dark:text-slate-600" />
                  )}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    Outros
                  </span>
                  <input
                    value={outrosSigla}
                    onChange={(e) => {
                      setOutrosSigla(e.target.value);
                      if (e.target.value.trim()) setOutrosMarcada(true);
                    }}
                    placeholder="Sigla (ex: PAISAG)"
                    disabled={salvando}
                    className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 text-[11px] font-mono text-slate-600 dark:text-slate-300 outline-none focus:border-violet-400 py-0.5"
                  />
                </span>
              </div>
            </div>

            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 mb-4 text-xs text-violet-800 dark:text-violet-300">
              <p className="font-bold">
                Serão criadas {plano.novas.length} referência(s) em Rascunho.
              </p>
              {plano.puladas.length > 0 && (
                <p className="mt-0.5 text-violet-600 dark:text-violet-400">
                  {plano.puladas.length} já existe(m) e será(ão) pulada(s).
                </p>
              )}
              {outrosMarcada && !outrosSigla.trim() && (
                <p className="mt-0.5 text-amber-600 dark:text-amber-400">
                  "Outros" está marcado sem sigla — será ignorado.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={salvando}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium disabled:opacity-40"
              >
                Agora não
              </button>
              <button
                onClick={gerar}
                disabled={salvando || plano.novas.length === 0}
                className="px-5 py-2 text-sm bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm"
              >
                {salvando ? 'Gerando...' : `Gerar ${plano.novas.length} referência(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
