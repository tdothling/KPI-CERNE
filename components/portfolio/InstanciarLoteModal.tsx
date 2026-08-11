import { useMemo, useState } from 'react';
import { CopyPlus, X, CheckCircle2, CheckSquare, Square, MapPin, Loader2 } from 'lucide-react';
import { ClientDoc } from '../../types';
import { Referencia, Conjunto, planInstanciacaoLote } from '../../domain/portfolio';
import { SelHeader } from './shared';

// --- Modal de instanciação em LOTE: matriz referências × bases da MESMA obra ---
//
// O escopo por obra evita a inconsistência de instanciar referência de uma rodovia
// na base de outra. O preview usa o MESMO planejador puro que será executado, então
// o que aparece na tela é exatamente o que será criado/pulado.

export function InstanciarLoteModal({
  referencias,
  conjuntos,
  clients,
  onClose,
  onConfirm,
}: {
  referencias: Referencia[];
  conjuntos: Conjunto[];
  clients: ClientDoc[];
  onClose: () => void;
  onConfirm: (
    refs: Referencia[],
    bases: string[],
    onProgress?: (done: number, total: number) => void,
    codigoPorBase?: Record<string, string>,
  ) => Promise<{ criados: number; puladas: number; semGabarito: string[]; erros: string[] } | null>;
}) {
  const obrasComRefs = useMemo(
    () => clients.filter((c) => referencias.some((r) => r.client === c.name)),
    [clients, referencias],
  );
  const [obra, setObra] = useState(obrasComRefs[0]?.name || '');
  const [selRefs, setSelRefs] = useState<Set<string>>(new Set());
  const [selBases, setSelBases] = useState<Set<string>>(new Set());
  // Prefixo manual da codificação POR BASE (opcional; pré-preenche o código das pranchas)
  const [prefixos, setPrefixos] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{
    criados: number;
    puladas: number;
    semGabarito: string[];
    erros: string[];
  } | null>(null);

  const obraDoc = obrasComRefs.find((c) => c.name === obra);
  const refsDaObra = useMemo(
    () => referencias.filter((r) => r.client === obra),
    [referencias, obra],
  );
  const basesRegistradas = obraDoc?.bases || [];

  const trocarObra = (nome: string) => {
    setObra(nome);
    setSelRefs(new Set());
    setSelBases(new Set());
    setPrefixos({});
    setResult(null);
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setter(next);
  };

  const refsEscolhidas = refsDaObra.filter((r) => selRefs.has(r.id));
  const basesEscolhidas = basesRegistradas.filter((b) => selBases.has(b));

  // Preview com o mesmo planejador da execução (pula existentes, deduplica bases)
  const preview = useMemo(
    () =>
      planInstanciacaoLote({
        referencias: refsEscolhidas,
        bases: basesEscolhidas,
        existingConjuntos: conjuntos,
        today: new Date().toISOString().split('T')[0],
        codigoPorBase: prefixos,
      }),
    [refsEscolhidas, basesEscolhidas, conjuntos, prefixos],
  );

  const executar = async () => {
    setProgress({ done: 0, total: preview.items.length });
    const r = await onConfirm(
      refsEscolhidas,
      basesEscolhidas,
      (done, total) => setProgress({ done, total }),
      prefixos,
    );
    setProgress(null);
    if (r) setResult(r);
  };

  const rodando = progress !== null;

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <CopyPlus size={18} className="text-violet-600 dark:text-violet-400" /> Instanciar em
            Lote
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
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Selecione as referências e as bases: cada combinação vira 1 conjunto com as pranchas do
          gabarito. Combinações já instanciadas são <strong>puladas automaticamente</strong> — rodar
          de novo não duplica nada. Ao instanciar, o ciclo preliminar de cada referência é encerrado
          como <strong>Executivo Gerado</strong> (etapas pendentes são desconsideradas; referências
          já Aprovadas mantêm o veredito).
        </p>

        {/* Resultado da execução */}
        {result ? (
          <div className="space-y-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={16} /> {result.criados} conjunto(s) criado(s)
              </p>
              {result.puladas > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  {result.puladas} combinação(ões) já existia(m) e foi(ram) pulada(s).
                </p>
              )}
              {result.semGabarito.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Sem gabarito (ignoradas): {result.semGabarito.join(', ')}
                </p>
              )}
            </div>
            {result.erros.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                <p className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">
                  {result.erros.length} falha(s):
                </p>
                <ul className="text-xs text-rose-700 dark:text-rose-400 space-y-0.5">
                  {result.erros.map((e, i) => (
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
            {/* Obra (escopo do lote — referências e bases sempre da MESMA rodovia) */}
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Obra (Rodovia)
            </label>
            <select
              value={obra}
              onChange={(e) => trocarObra(e.target.value)}
              disabled={rodando}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4"
            >
              {obrasComRefs.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Coluna 1: referências */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <SelHeader
                  label={`Referências (${selRefs.size}/${refsDaObra.length})`}
                  allSelected={
                    refsDaObra.length > 0 &&
                    refsDaObra.every((r) => selRefs.has(r.id) || r.gabarito.length === 0)
                  }
                  disabled={rodando}
                  onToggleAll={() => {
                    const selecionaveis = refsDaObra.filter((r) => r.gabarito.length > 0);
                    const allSel = selecionaveis.every((r) => selRefs.has(r.id));
                    setSelRefs(allSel ? new Set() : new Set(selecionaveis.map((r) => r.id)));
                  }}
                />
                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/60">
                  {refsDaObra.length === 0 && (
                    <p className="p-3 text-xs text-slate-400 italic">
                      Nenhuma referência nesta obra.
                    </p>
                  )}
                  {refsDaObra.map((r) => {
                    const semGab = r.gabarito.length === 0;
                    return (
                      <button
                        key={r.id}
                        disabled={semGab || rodando}
                        onClick={() => toggle(selRefs, setSelRefs, r.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ${semGab ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {selRefs.has(r.id) ? (
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
                        <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0">
                          {semGab ? 'sem gabarito' : `${r.gabarito.length} prancha(s)`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Coluna 2: bases registradas na Obra */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <SelHeader
                  label={`Bases (${selBases.size}/${basesRegistradas.length})`}
                  allSelected={
                    basesRegistradas.length > 0 && basesRegistradas.every((b) => selBases.has(b))
                  }
                  disabled={rodando}
                  onToggleAll={() => {
                    const allSel = basesRegistradas.every((b) => selBases.has(b));
                    setSelBases(allSel ? new Set() : new Set(basesRegistradas));
                  }}
                />
                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/60">
                  {basesRegistradas.length === 0 && (
                    <p className="p-3 text-xs text-amber-600 dark:text-amber-400">
                      Esta obra não tem bases registradas. Cadastre as bases (KM) na aba{' '}
                      <strong>Obras</strong> para habilitar o lote.
                    </p>
                  )}
                  {basesRegistradas.map((b) => (
                    <button
                      key={b}
                      disabled={rodando}
                      onClick={() => toggle(selBases, setSelBases, b)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      {selBases.has(b) ? (
                        <CheckSquare size={15} className="text-violet-600 flex-shrink-0" />
                      ) : (
                        <Square
                          size={15}
                          className="text-slate-300 dark:text-slate-600 flex-shrink-0"
                        />
                      )}
                      <MapPin
                        size={11}
                        className="text-brand-600 dark:text-brand-400 flex-shrink-0"
                      />
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                        {b}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Prefixo da codificação POR BASE: cada base instanciada pode ter o seu
                            (prefixo + sufixo do gabarito pré-preenchem o código de cada prancha) */}
            {basesEscolhidas.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Prefixo da codificação por base (manual, opcional)
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                  O prefixo de cada base + o sufixo do gabarito pré-preenchem o código das pranchas
                  daquela base (ex.: <span className="font-mono">WRS-153MG-081+430-SAU-EXE</span>).
                  Base sem prefixo fica só com o sufixo — tudo editável depois, em Projetos Locais.
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {basesEscolhidas.map((b) => (
                    <div key={b} className="flex items-center gap-2">
                      <span className="flex items-center gap-1 w-32 flex-shrink-0 font-mono text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                        <MapPin
                          size={11}
                          className="text-brand-600 dark:text-brand-400 flex-shrink-0"
                        />{' '}
                        {b}
                      </span>
                      <input
                        value={prefixos[b] || ''}
                        disabled={rodando}
                        onChange={(e) => setPrefixos((prev) => ({ ...prev, [b]: e.target.value }))}
                        placeholder="Ex: WRS-153MG-081+430-SAU-EXE"
                        className="flex-1 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded-lg p-2"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview: exatamente o que o planejador vai criar/pular */}
            {refsEscolhidas.length > 0 && basesEscolhidas.length > 0 && (
              <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 mb-4 text-xs text-violet-800 dark:text-violet-300">
                <p className="font-bold">
                  {refsEscolhidas.length} referência(s) × {basesEscolhidas.length} base(s) → criará{' '}
                  <strong>{preview.items.length} conjunto(s)</strong> com{' '}
                  <strong>{preview.totalPranchas} prancha(s)</strong>
                </p>
                {preview.puladas.length > 0 && (
                  <p className="mt-1 text-violet-600 dark:text-violet-400">
                    {preview.puladas.length} combinação(ões) já instanciada(s) será(ão) pulada(s):{' '}
                    {preview.puladas
                      .slice(0, 5)
                      .map((p) => `${p.codigoCliente} @ ${p.base}`)
                      .join('; ')}
                    {preview.puladas.length > 5 ? '…' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Progresso da execução */}
            {rodando && progress && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  <Loader2 size={13} className="animate-spin" /> Instanciando... {progress.done}/
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
                onClick={executar}
                disabled={rodando || preview.items.length === 0}
                className="px-5 py-2 text-sm bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm"
              >
                {rodando ? 'Instanciando...' : `Instanciar ${preview.items.length} conjunto(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
