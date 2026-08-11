import React from 'react';
import {
  HardHat,
  MapPin,
  CheckCircle2,
  RotateCcw,
  Edit2,
  Trash2,
  AlertTriangle,
  PauseCircle,
  User,
  Calendar,
  FileText,
  Clock,
  XCircle,
} from 'lucide-react';
import { ClientDoc, SiteType, ObraStatus } from '../../types';
import { format, parseISO } from 'date-fns';
import { getEffectiveStatus } from '../../utils';
import { getSlaInfo, today } from './shared';

const STATUS_CONFIG: Record<
  ObraStatus,
  {
    label: string;
    Icon: React.FC<{ size?: number; className?: string }>;
    badge: string;
    iconWrap: string;
    cardBorder: string;
  }
> = {
  [ObraStatus.ACTIVE]: {
    label: 'Em andamento',
    Icon: HardHat,
    badge:
      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    iconWrap: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    cardBorder:
      'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700',
  },
  [ObraStatus.PAUSED]: {
    label: 'Pausada',
    Icon: PauseCircle,
    badge:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    iconWrap: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    cardBorder: 'border-amber-200 dark:border-amber-800/50',
  },
  [ObraStatus.COMPLETED]: {
    label: 'Concluída',
    Icon: CheckCircle2,
    badge:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    iconWrap: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    cardBorder: 'border-emerald-200 dark:border-emerald-800/50',
  },
  [ObraStatus.CANCELLED]: {
    label: 'Cancelada',
    Icon: XCircle,
    badge:
      'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600',
    iconWrap: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400',
    cardBorder: 'border-slate-200 dark:border-slate-700 opacity-70',
  },
};

interface ObraCardProps {
  key?: string; // sem @types/react instalado, o TS não injeta o atributo especial "key" automaticamente
  client: ClientDoc;
  projCount: number;
  isCompleting: boolean;
  completingDate: string;
  onCompletingDateChange: (d: string) => void;
  onStartComplete: () => void;
  onConfirmComplete: () => void;
  onCancelComplete: () => void;
  onReactivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ObraCard({
  client,
  projCount,
  isCompleting,
  completingDate,
  onCompletingDateChange,
  onStartComplete,
  onConfirmComplete,
  onCancelComplete,
  onReactivate,
  onEdit,
  onDelete,
}: ObraCardProps) {
  const status = getEffectiveStatus(client);
  const cfg = STATUS_CONFIG[status];
  const sla = getSlaInfo(client);
  const isActive = status === ObraStatus.ACTIVE;
  const isDone = status === ObraStatus.COMPLETED || status === ObraStatus.CANCELLED;

  const slaBarColor = !sla
    ? ''
    : sla.isOverdue
      ? 'bg-rose-500'
      : sla.progress > 85
        ? 'bg-amber-500'
        : sla.progress > 65
          ? 'bg-yellow-400'
          : 'bg-emerald-500';

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-4 transition-all ${cfg.cardBorder}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + info */}
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 p-2.5 rounded-xl flex-shrink-0 ${cfg.iconWrap}`}>
            <cfg.Icon size={18} />
          </div>

          <div className="min-w-0">
            {/* Name + status badge */}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-800 dark:text-white">{client.name}</h3>
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${cfg.badge}`}
              >
                {cfg.label}
              </span>
              {sla?.isOverdue && isActive && (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800 flex items-center gap-1">
                  <AlertTriangle size={10} /> SLA Vencido
                </span>
              )}
              {sla?.isAtRisk && isActive && !sla.isOverdue && (
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 flex items-center gap-1">
                  <Clock size={10} /> Em Risco
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {client.location || 'Local não informado'}
              </span>
              <span>•</span>
              <span>
                {client.type === SiteType.CONSTRUCTION_SITE
                  ? 'Canteiro de Obras'
                  : `${client.type === SiteType.HIGHWAY ? 'Obra de Rodovia' : 'Bases Operacionais'}${client.numberOfBases ? ` (${client.numberOfBases})` : ''}`}
              </span>
              {projCount > 0 && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-brand-600 dark:text-brand-400">
                    {projCount} projeto{projCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {client.responsavel && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <User size={11} />
                    {client.responsavel}
                  </span>
                </>
              )}
            </div>

            {/* SLA / dates row */}
            {(client.contractDate ||
              client.deadlineDays !== undefined ||
              client.expectedCompletionDate ||
              client.completedAt) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                {client.contractDate && (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} /> Contrato:{' '}
                    {format(parseISO(client.contractDate), 'dd/MM/yyyy')}
                  </span>
                )}
                {client.deadlineDays !== undefined && (
                  <span className="font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded border border-brand-100 dark:border-brand-900/30">
                    SLA: {client.deadlineDays} dias
                  </span>
                )}
                {sla && !isDone && (
                  <span
                    className={`font-medium ${sla.isOverdue ? 'text-rose-600 dark:text-rose-400' : sla.isAtRisk ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {sla.isOverdue
                      ? `Venceu há ${Math.abs(sla.remaining)} dias`
                      : `${sla.remaining} dias restantes`}
                  </span>
                )}
                {client.expectedCompletionDate && (
                  <span className="flex items-center gap-1">
                    Previsto: {format(parseISO(client.expectedCompletionDate), 'dd/MM/yyyy')}
                  </span>
                )}
                {client.completedAt && isDone && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {status === ObraStatus.CANCELLED ? 'Cancelada' : 'Concluída'} em{' '}
                    {format(parseISO(client.completedAt), 'dd/MM/yyyy')}
                  </span>
                )}
              </div>
            )}

            {/* SLA progress bar */}
            {sla && isActive && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${slaBarColor}`}
                    style={{ width: `${Math.min(100, sla.progress)}%` }}
                  />
                </div>
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    sla.isOverdue
                      ? 'text-rose-600 dark:text-rose-400'
                      : sla.progress > 85
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-400'
                  }`}
                >
                  {Math.round(sla.progress)}%
                </span>
              </div>
            )}

            {/* Observações */}
            {client.observacoes && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic flex items-start gap-1">
                <FileText size={11} className="mt-0.5 flex-shrink-0" />
                {client.observacoes}
              </p>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive && !isCompleting && (
            <button
              onClick={onStartComplete}
              className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              title="Concluir Obra"
            >
              <CheckCircle2 size={16} />
            </button>
          )}
          {isDone && (
            <button
              onClick={onReactivate}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              title="Reativar Obra"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            title="Editar"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600 transition-colors"
            title="Excluir"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Inline quick-complete row */}
      {isCompleting && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Data de conclusão:
          </span>
          <input
            type="date"
            value={completingDate}
            onChange={(e) => onCompletingDateChange(e.target.value)}
            max={today}
            className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500 dark:[color-scheme:dark]"
          />
          <button
            onClick={onConfirmComplete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <CheckCircle2 size={13} /> Confirmar
          </button>
          <button
            onClick={onCancelComplete}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
