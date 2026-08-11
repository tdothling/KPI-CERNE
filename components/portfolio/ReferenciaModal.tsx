import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { ClientDoc, Discipline } from '../../types';
import {
  Referencia,
  RefStatus,
  GabaritoItem,
  inferRefStatusFromDates,
  papelFolha,
  nextFolhaNumber,
  renomearPapeisAuto,
} from '../../domain/portfolio';
import { TimelineDatesEditor, TimelineDates, REF_TIMELINE_FIELDS } from './shared';

// --- Modal de cadastro/edição da Referência (molde + gabarito) ---

export function ReferenciaModal({
  referencia,
  clients,
  defaultClient,
  onClose,
  onSave,
}: {
  referencia: Referencia | null;
  clients: ClientDoc[];
  defaultClient?: string; // obra ativa do catálogo — referência nova nasce nela
  onClose: () => void;
  onSave: (data: Omit<Referencia, 'id'>) => void;
}) {
  const [codigoCliente, setCodigoCliente] = useState(referencia?.codigoCliente || '');
  const [client, setClient] = useState(
    referencia?.client || defaultClient || clients[0]?.name || '',
  );
  const [discipline, setDiscipline] = useState<Discipline>(
    referencia?.discipline || Discipline.ARCHITECTURE,
  );
  const [revisao, setRevisao] = useState(referencia?.revisao ?? 0);
  const [observacao, setObservacao] = useState(referencia?.observacao || '');
  // Todas as datas do processo, editáveis (correção de lançamentos errados)
  const [dates, setDates] = useState<TimelineDates>({
    startDate: referencia?.startDate || '',
    startPeriod: referencia?.startPeriod || 'MANHA',
    endDate: referencia?.endDate || '',
    endPeriod: referencia?.endPeriod || 'TARDE',
    sendDate: referencia?.sendDate || '',
    sendPeriod: referencia?.sendPeriod || 'MANHA',
    feedbackDate: referencia?.feedbackDate || '',
    feedbackPeriod: referencia?.feedbackPeriod || 'TARDE',
  });
  const [gabarito, setGabarito] = useState<GabaritoItem[]>(
    referencia?.gabarito?.length
      ? referencia.gabarito
      : [{ id: crypto.randomUUID(), papel: papelFolha(codigoCliente, 1), sufixoCodigo: '' }],
  );
  // Nome automático dos entregáveis: codificação + F01, F02... As linhas que
  // seguem o padrão acompanham a codificação sendo digitada/corrigida; linha
  // renomeada à mão sai do padrão e nunca mais é tocada.
  const prevCodigo = useRef(codigoCliente);
  useEffect(() => {
    const old = prevCodigo.current;
    if (old === codigoCliente) return;
    prevCodigo.current = codigoCliente;
    setGabarito((prev) => renomearPapeisAuto(prev, old, codigoCliente));
  }, [codigoCliente]);

  const addEntregavel = () =>
    setGabarito((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        papel: papelFolha(
          codigoCliente,
          nextFolhaNumber(
            codigoCliente,
            prev.map((g) => g.papel),
          ),
        ),
        sufixoCodigo: '',
      },
    ]);

  const setItem = (id: string, changes: Partial<GabaritoItem>) =>
    setGabarito((prev) => prev.map((g) => (g.id === id ? { ...g, ...changes } : g)));

  const save = () => {
    if (!codigoCliente.trim()) {
      alert('Informe a codificação do cliente (ex.: BSO-CONSTRUCAP-ARQ-R00).');
      return;
    }
    if (!client.trim()) {
      alert('Selecione a obra.');
      return;
    }
    const cleanGabarito = gabarito
      .map((g) => ({
        ...g,
        papel: g.papel.trim(),
        sufixoCodigo: g.sufixoCodigo?.trim() || undefined,
      }))
      .filter((g) => g.papel.length > 0);
    if (cleanGabarito.length === 0) {
      alert(
        'O gabarito precisa de ao menos 1 entregável (ex.: o próprio nome do projeto, Folha 101, Memorial Descritivo...).',
      );
      return;
    }
    if (dates.startDate && dates.endDate && dates.endDate < dates.startDate) {
      alert('A conclusão da execução não pode ser anterior ao início.');
      return;
    }
    if (dates.sendDate && dates.feedbackDate && dates.feedbackDate < dates.sendDate) {
      alert('O feedback não pode ser anterior ao envio ao cliente.');
      return;
    }

    // Ao editar, enviamos as datas mesmo vazias ('') para que o patch as APAGUE
    // quando o usuário limpa um lançamento errado (blockedDays é recalculado no
    // handler). Numa referência nova, só enviamos o que estiver preenchido.
    const isEdit = !!referencia;
    const datePayload: Record<string, any> = {};
    REF_TIMELINE_FIELDS.forEach((f) => {
      const date = dates[f.dateKey] as string | undefined;
      if (isEdit) {
        // envia sempre (inclusive '') para permitir apagar
        datePayload[f.dateKey] = date || '';
        if (date) datePayload[f.periodKey] = dates[f.periodKey];
      } else if (date) {
        datePayload[f.dateKey] = date;
        datePayload[f.periodKey] = dates[f.periodKey];
      }
    });

    // Aplica a lógica do fluxo: se o usuário mexeu nas datas, o status é derivado
    // da linha do tempo (apagar início/fim retroage o status; preencher avança).
    const dateChanged =
      isEdit &&
      ['startDate', 'endDate', 'sendDate', 'feedbackDate'].some(
        (k) =>
          ((dates[k as keyof TimelineDates] as string) || '') !== ((referencia as any)[k] || ''),
      );
    const nextStatus = dateChanged
      ? inferRefStatusFromDates(
          {
            startDate: dates.startDate,
            endDate: dates.endDate,
            sendDate: dates.sendDate,
            feedbackDate: dates.feedbackDate,
          },
          referencia!.statusAprovacao,
        )
      : referencia?.statusAprovacao || RefStatus.RASCUNHO;

    onSave({
      codigoCliente: codigoCliente.trim(),
      client: client.trim(),
      discipline,
      revisao,
      statusAprovacao: nextStatus,
      gabarito: cleanGabarito,
      ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
      ...datePayload,
      ...(referencia?.importada ? { importada: true } : {}),
    } as Omit<Referencia, 'id'>);
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            {referencia ? 'Editar Referência' : 'Nova Referência (Molde)'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Codificação do Cliente *
            </label>
            <input
              value={codigoCliente}
              onChange={(e) => setCodigoCliente(e.target.value)}
              placeholder="Ex: BSO-CONSTRUCAP-ARQ-R00"
              className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Obra (Rodovia) *
            </label>
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5"
            >
              {clients.length === 0 && <option value="">Nenhuma obra de rodovia cadastrada</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                Disciplina
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as Discipline)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5"
              >
                {Object.values(Discipline).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                Revisão
              </label>
              <input
                type="number"
                min={0}
                value={revisao}
                onChange={(e) => setRevisao(Math.max(0, parseInt(e.target.value || '0', 10)))}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5"
              />
            </div>
          </div>
        </div>

        {/* Gabarito: as saídas que serão PRÉ-GERADAS a cada instanciação */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Gabarito de Entregáveis *
            </label>
            <button
              onClick={addEntregavel}
              className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline"
            >
              <Plus size={12} /> Adicionar entregável
            </button>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
            Ao instanciar em uma base, cada linha vira 1 prancha. O nome de cada entregável é
            preenchido automaticamente com a codificação + F01, F02... e acompanha a codificação
            enquanto seguir esse padrão (edite à vontade se a folha tiver outro nome). O sufixo é
            opcional e apenas pré-preenche o código (a codificação final é manual — varia por órgão
            regulamentador).
          </p>
          <div className="space-y-1.5">
            {gabarito.map((g, i) => (
              <div key={g.id} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 w-5 text-right">
                  {i + 1}.
                </span>
                <input
                  value={g.papel}
                  onChange={(e) => setItem(g.id, { papel: e.target.value })}
                  placeholder="Papel (ex: Folha 101, Memorial Descritivo)"
                  className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2"
                />
                <input
                  value={g.sufixoCodigo || ''}
                  onChange={(e) => setItem(g.id, { sufixoCodigo: e.target.value })}
                  placeholder="Sufixo (ex: DE-P1-101)"
                  className="w-40 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded-lg p-2"
                />
                <button
                  onClick={() => setGabarito((prev) => prev.filter((x) => x.id !== g.id))}
                  disabled={gabarito.length <= 1}
                  className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Todas as datas do processo — editáveis para corrigir lançamentos.
                    Só aparecem ao EDITAR: numa referência nova elas são registradas pelo fluxo. */}
        {referencia && (
          <div className="mb-4">
            <TimelineDatesEditor
              fields={REF_TIMELINE_FIELDS}
              value={dates}
              onChange={(patch) => setDates((prev) => ({ ...prev, ...patch }))}
              note="Ajuste qualquer data do preliminar. O status segue a linha do tempo: apagar início/fim de elaboração retroage o status (ex.: Elaborado → Em Elaboração/Rascunho). Os dias úteis com o cliente recalculam a partir de envio e feedback."
            />
          </div>
        )}

        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
            Observações
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className="w-full h-16 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm"
          >
            {referencia ? 'Salvar Alterações' : 'Cadastrar Referência'}
          </button>
        </div>
      </div>
    </div>
  );
}
