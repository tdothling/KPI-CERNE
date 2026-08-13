import React from 'react';
import { History, X } from 'lucide-react';
import { formatDateDisplay } from '../../utils';
import { formatNumberBR } from '../../utils';
import { SteelRecord, SteelSnapshot, totalKg } from '../../domain/steel';

const REVISION_REASON_LABEL: Record<string, string> = {
  'Erro Interno': 'Erro Interno',
  'Solicitação Cliente': 'Solicitação Cliente',
  'Mudança de Escopo': 'Mudança de Escopo',
  'Mudança de Projeto': 'Mudança de Projeto',
  Aditivo: 'Aditivo',
  Compatibilização: 'Compatibilização',
  Outros: 'Outros',
};

// Compara dois snapshots e devolve só os campos que mudaram — a revisão só interessa
// pelo que foi alterado, não pelo estado inteiro repetido.
function diffFields(before: SteelSnapshot, after: SteelSnapshot): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = [];
  if (before.windSpeed !== after.windSpeed) {
    out.push({ label: 'Vento', from: `${formatNumberBR(before.windSpeed, 1)} m/s`, to: `${formatNumberBR(after.windSpeed, 1)} m/s` });
  }
  if (before.areaLeve !== after.areaLeve) {
    out.push({ label: 'Área Leve', from: `${formatNumberBR(before.areaLeve, 1)} m²`, to: `${formatNumberBR(after.areaLeve, 1)} m²` });
  }
  if (before.areaPesada !== after.areaPesada) {
    out.push({ label: 'Área Pesada', from: `${formatNumberBR(before.areaPesada, 1)} m²`, to: `${formatNumberBR(after.areaPesada, 1)} m²` });
  }
  if (before.areaCobertura !== after.areaCobertura) {
    out.push({ label: 'Área Cobertura', from: `${formatNumberBR(before.areaCobertura, 1)} m²`, to: `${formatNumberBR(after.areaCobertura, 1)} m²` });
  }
  const kgBefore = totalKg({ materials: before.materials });
  const kgAfter = totalKg({ materials: after.materials });
  if (kgBefore !== kgAfter) {
    out.push({ label: 'Aço total', from: `${formatNumberBR(kgBefore, 0)} kg`, to: `${formatNumberBR(kgAfter, 0)} kg` });
  }
  return out;
}

export function AcoHistoryModal({
  record,
  onClose,
}: {
  record: SteelRecord;
  onClose: () => void;
}) {
  // Cada entrada de revisions[i].snapshot é o estado ANTES daquela revisão; o estado
  // DEPOIS é o snapshot da revisão seguinte ou, para a última, o próprio registro atual.
  const entries = record.revisions.map((rev, i) => {
    const afterSnapshot: SteelSnapshot =
      i + 1 < record.revisions.length
        ? record.revisions[i + 1].snapshot
        : {
            windSpeed: record.windSpeed,
            areaLeve: record.areaLeve,
            areaPesada: record.areaPesada,
            areaCobertura: record.areaCobertura,
            materials: record.materials,
          };
    return { rev, diffs: diffFields(rev.snapshot, afterSnapshot) };
  });

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <History size={18} className="text-amber-500" /> Histórico de Revisões
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 truncate">
          {record.client} — {record.base}
        </p>

        <div className="overflow-y-auto space-y-3 pr-1 relative pl-4 border-l-2 border-slate-100 dark:border-slate-700">
          {entries.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-6">
              Nenhuma revisão registrada — este é o cadastro original (R00).
            </p>
          )}
          {[...entries].reverse().map(({ rev, diffs }, idx) => (
            <div key={rev.id} className="relative">
              <span
                className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${idx === 0 ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                  R{String(rev.revisao).padStart(2, '0')} → R{String(rev.revisao + 1).padStart(2, '0')}
                </span>
                <span className="text-[11px] text-slate-400">{formatDateDisplay(rev.date)}</span>
                <span className="text-[11px] text-slate-400">
                  · {REVISION_REASON_LABEL[rev.reason] || rev.reason}
                </span>
                {rev.user && <span className="text-[11px] text-slate-400">· {rev.user}</span>}
              </div>
              {rev.comment && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                  "{rev.comment}"
                </p>
              )}
              {diffs.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {diffs.map((d) => (
                    <span key={d.label} className="text-[11px] text-slate-500 dark:text-slate-400">
                      <strong className="text-slate-600 dark:text-slate-300">{d.label}:</strong>{' '}
                      {d.from} <span className="text-slate-300 dark:text-slate-600">→</span> {d.to}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
