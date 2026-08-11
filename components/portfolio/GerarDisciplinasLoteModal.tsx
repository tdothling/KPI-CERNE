import { useMemo, useState } from 'react';
import { Wand2, X, CheckCircle2, CheckSquare, Square, Loader2 } from 'lucide-react';
import { ClientDoc, Discipline } from '../../types';
import { Referencia, planGerarDisciplinasLote } from '../../domain/portfolio';
import { SelHeader } from './shared';
import { DISCIPLINAS_GERAVEIS } from './GerarDisciplinasModal';

// --- Modal de geração de disciplinas EM LOTE (várias Arquiteturas de uma vez) ---
//
// Seleciona múltiplas referências de ARQ (agrupadas por obra) e as disciplinas a
// gerar. O planejador de lote reaproveita a mesma lógica por origem e deduplica
// dentro do próprio lote, então o preview reflete exatamente o que será criado.

export function GerarDisciplinasLoteModal({
  referencias,
  clients: _clients,
  onClose,
  onConfirm,
}: {
  referencias: Referencia[];
  clients: ClientDoc[];
  onClose: () => void;
  onConfirm: (
    refs: Omit<Referencia, 'id'>[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<{ criadas: number; erros: string[] }>;
}) {
  const arquiteturas = useMemo(
    () =>
      referencias
        .filter((r) => r.discipline === Discipline.ARCHITECTURE)
        .sort((a, b) =>
          `${a.client}|${a.codigoCliente}`.localeCompare(`${b.client}|${b.codigoCliente}`),
        ),
    [referencias],
  );

  const [selArq, setSelArq] = useState<Set<string>>(new Set(arquiteturas.map((r) => r.id)));
  const [marcadas, setMarcadas] = useState<Set<Discipline>>(
    new Set(DISCIPLINAS_GERAVEIS.map((d) => d.discipline)),
  );
  const [outrosSigla, setOutrosSigla] = useState('');
  const [outrosMarcada, setOutrosMarcada] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{
    criadas: number;
    erros: string[];
    puladas: number;
  } | null>(null);

  const destinos = useMemo(() => {
    const d = DISCIPLINAS_GERAVEIS.filter((x) => marcadas.has(x.discipline)).map((x) => ({ ...x }));
    if (outrosMarcada && outrosSigla.trim())
      d.push({ discipline: Discipline.OTHER, sigla: outrosSigla.trim().toUpperCase() });
    return d;
  }, [marcadas, outrosMarcada, outrosSigla]);

  const origens = useMemo(
    () => arquiteturas.filter((r) => selArq.has(r.id)),
    [arquiteturas, selArq],
  );

  const plano = useMemo(
    () =>
      planGerarDisciplinasLote({
        origens,
        destinos,
        existingReferencias: referencias,
      }),
    [origens, destinos, referencias],
  );

  // ARQ agrupadas por obra (só visual)
  const porObra = useMemo(() => {
    const map = new Map<string, Referencia[]>();
    arquiteturas.forEach((r) => {
      if (!map.has(r.client)) map.set(r.client, []);
      map.get(r.client)!.push(r);
    });
    return [...map.entries()];
  }, [arquiteturas]);

  const toggleArq = (id: string) =>
    setSelArq((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleDisc = (d: Discipline) =>
    setMarcadas((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  const rodando = progress !== null;

  const gerar = async () => {
    setProgress({ done: 0, total: plano.novas.length });
    const r = await onConfirm(plano.novas, (done, total) => setProgress({ done, total }));
    setProgress(null);
    setResultado({ ...r, puladas: plano.puladas.length });
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Wand2 size={18} className="text-violet-600 dark:text-violet-400" /> Gerar Disciplinas
            em Lote
          </h3>
          <button
            onClick={onClose}
            disabled={rodando}
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
                <CheckCircle2 size={16} /> {resultado.criadas} referência(s) criada(s)
              </p>
              {resultado.puladas > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  {resultado.puladas} já existia(m) e foi(ram) pulada(s).
                </p>
              )}
            </div>
            {resultado.erros.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                <p className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">
                  {resultado.erros.length} falha(s):
                </p>
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
              Selecione as <strong>Arquiteturas</strong> e as disciplinas: para cada ARQ escolhida,
              as disciplinas marcadas são cadastradas trocando a sigla no código. Códigos já
              existentes são pulados.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Coluna 1: Arquiteturas (agrupadas por obra) */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <SelHeader
                  label={`Arquiteturas (${selArq.size}/${arquiteturas.length})`}
                  allSelected={
                    arquiteturas.length > 0 && arquiteturas.every((r) => selArq.has(r.id))
                  }
                  disabled={rodando}
                  onToggleAll={() => {
                    const all = arquiteturas.every((r) => selArq.has(r.id));
                    setSelArq(all ? new Set() : new Set(arquiteturas.map((r) => r.id)));
                  }}
                />
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {arquiteturas.length === 0 && (
                    <p className="p-3 text-xs text-slate-400 italic">
                      Nenhuma referência de Arquitetura no catálogo.
                    </p>
                  )}
                  {porObra.map(([obra, refs]) => (
                    <div key={obra}>
                      <p className="px-3 py-1 bg-slate-50 dark:bg-slate-900/40 text-[10px] font-bold text-slate-400 uppercase sticky top-0">
                        {obra}
                      </p>
                      {refs.map((r) => (
                        <button
                          key={r.id}
                          disabled={rodando}
                          onClick={() => toggleArq(r.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors border-b border-slate-100 dark:border-slate-700/40 last:border-b-0"
                        >
                          {selArq.has(r.id) ? (
                            <CheckSquare size={15} className="text-violet-600 flex-shrink-0" />
                          ) : (
                            <Square
                              size={15}
                              className="text-slate-300 dark:text-slate-600 flex-shrink-0"
                            />
                          )}
                          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                            {r.codigoCliente}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna 2: disciplinas a gerar */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <SelHeader
                  label={`Disciplinas (${destinos.length})`}
                  allSelected={DISCIPLINAS_GERAVEIS.every((d) => marcadas.has(d.discipline))}
                  disabled={rodando}
                  onToggleAll={() => {
                    const all = DISCIPLINAS_GERAVEIS.every((d) => marcadas.has(d.discipline));
                    setMarcadas(
                      all ? new Set() : new Set(DISCIPLINAS_GERAVEIS.map((d) => d.discipline)),
                    );
                  }}
                />
                <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/40">
                  {DISCIPLINAS_GERAVEIS.map(({ discipline, sigla }) => (
                    <button
                      key={discipline}
                      disabled={rodando}
                      onClick={() => toggleDisc(discipline)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      {marcadas.has(discipline) ? (
                        <CheckSquare size={15} className="text-violet-600 flex-shrink-0" />
                      ) : (
                        <Square
                          size={15}
                          className="text-slate-300 dark:text-slate-600 flex-shrink-0"
                        />
                      )}
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {discipline}
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-slate-400">{sigla}</span>
                    </button>
                  ))}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      onClick={() => setOutrosMarcada((v) => !v)}
                      disabled={rodando}
                      className="flex-shrink-0"
                    >
                      {outrosMarcada ? (
                        <CheckSquare size={15} className="text-violet-600" />
                      ) : (
                        <Square size={15} className="text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      Outros
                    </span>
                    <input
                      value={outrosSigla}
                      onChange={(e) => {
                        setOutrosSigla(e.target.value);
                        if (e.target.value.trim()) setOutrosMarcada(true);
                      }}
                      placeholder="sigla"
                      disabled={rodando}
                      className="ml-auto w-24 bg-transparent border-b border-slate-200 dark:border-slate-600 text-[11px] font-mono text-slate-600 dark:text-slate-300 outline-none focus:border-violet-400 py-0.5 text-right"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 mb-4 text-xs text-violet-800 dark:text-violet-300">
              <p className="font-bold">
                {origens.length} arquitetura(s) × {destinos.length} disciplina(s) → criará{' '}
                <strong>{plano.novas.length} referência(s)</strong> em Rascunho.
              </p>
              {plano.puladas.length > 0 && (
                <p className="mt-0.5 text-violet-600 dark:text-violet-400">
                  {plano.puladas.length} já existe(m) e será(ão) pulada(s).
                </p>
              )}
            </div>

            {rodando && progress && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  <Loader2 size={13} className="animate-spin" /> Gerando... {progress.done}/
                  {progress.total}
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-600 rounded-full transition-all"
                    style={{
                      width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={rodando}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={gerar}
                disabled={rodando || plano.novas.length === 0}
                className="px-5 py-2 text-sm bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm"
              >
                {rodando ? 'Gerando...' : `Gerar ${plano.novas.length} referência(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
