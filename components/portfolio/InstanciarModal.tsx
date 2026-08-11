import { useState } from 'react';
import { X } from 'lucide-react';
import { Referencia, RefStatus, slugify, buildCodigoCompleto } from '../../domain/portfolio';

// --- Modal de instanciação: escolhe a BASE (KM) e pré-visualiza as pranchas ---

export function InstanciarModal({
  referencia,
  existingBases,
  basesRegistradas,
  onClose,
  onConfirm,
}: {
  referencia: Referencia;
  existingBases: string[];
  basesRegistradas: string[]; // bases nomeadas registradas na Obra (fonte preferencial)
  onClose: () => void;
  onConfirm: (base: string, codigoRodovia?: string) => void | Promise<void>;
}) {
  // Bases registradas na obra que ainda NÃO foram instanciadas para esta referência
  const existingSlugs = new Set(existingBases.map(slugify));
  const disponiveis = basesRegistradas.filter((b) => !existingSlugs.has(slugify(b)));

  const [base, setBase] = useState(disponiveis[0] || '');
  const [digitando, setDigitando] = useState(disponiveis.length === 0); // sem registro → digitação livre
  const [codigoRodovia, setCodigoRodovia] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Instanciar em Base</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
            {referencia.codigoCliente}
          </span>{' '}
          será replicada na base escolhida, pré-gerando{' '}
          <strong>{referencia.gabarito.length} prancha(s)</strong> do gabarito. A referência
          continua no catálogo para outras bases.
        </p>

        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
          Base (KM) *
        </label>
        {!digitando && disponiveis.length > 0 ? (
          <>
            <select
              value={base}
              onChange={(e) => setBase(e.target.value)}
              autoFocus
              className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1"
            >
              {disponiveis.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setDigitando(true);
                setBase('');
              }}
              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline mb-1"
            >
              Base não registrada? Digitar manualmente
            </button>
          </>
        ) : (
          <>
            <input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="Ex: 104+000"
              autoFocus
              className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1"
            />
            {disponiveis.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDigitando(false);
                  setBase(disponiveis[0]);
                }}
                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline mb-1"
              >
                Voltar para as bases registradas
              </button>
            )}
            {basesRegistradas.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-1">
                Dica: registre as bases desta rodovia na aba Obras para padronizar a grafia e
                habilitar a instanciação em lote.
              </p>
            )}
          </>
        )}
        {existingBases.length > 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
            Bases já instanciadas (não podem repetir): {existingBases.join(', ')}
          </p>
        )}

        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 mt-3">
          Prefixo da Codificação da Rodovia (manual, opcional)
        </label>
        <input
          value={codigoRodovia}
          onChange={(e) => setCodigoRodovia(e.target.value)}
          placeholder="Ex: ELO-040RJ-104+000-BSO-EXE"
          className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1"
        />
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
          A codificação varia por órgão regulamentador, então é digitada à mão. O prefixo + sufixo
          do gabarito apenas pré-preenchem o código de cada prancha — tudo editável depois, em
          Projetos Locais.
        </p>

        {/* Pré-visualização das pranchas que serão criadas */}
        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
            Pranchas que serão pré-geradas (status "A Fazer")
          </p>
          <ul className="space-y-1">
            {referencia.gabarito.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{g.papel}</span>
                <span className="font-mono text-slate-400 dark:text-slate-500">
                  {buildCodigoCompleto(codigoRodovia, g) || '(código manual depois)'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Nova regra: instanciar encerra o preliminar — etapas pendentes são desconsideradas */}
        {referencia.statusAprovacao !== RefStatus.APROVADO &&
          referencia.statusAprovacao !== RefStatus.SUPERSEDED && (
            <p className="text-[11px] text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-900/40 rounded-lg px-3 py-2 mb-4">
              Ao instanciar, o ciclo preliminar desta referência será encerrado como{' '}
              <b>Executivo Gerado</b> — as etapas pendentes ({referencia.statusAprovacao}) são
              desconsideradas e o trabalho segue nas pranchas de Projetos Locais.
            </p>
          )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm(base, codigoRodovia || undefined);
              } finally {
                setSaving(false);
              }
            }}
            disabled={!base.trim() || saving}
            className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm"
          >
            {saving ? 'Instanciando...' : `Criar Conjunto (${referencia.gabarito.length} pranchas)`}
          </button>
        </div>
      </div>
    </div>
  );
}
