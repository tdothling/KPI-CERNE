import React from 'react';
import {
  Building2,
  Route,
  Warehouse,
  MapPin,
  CheckCircle2,
  RotateCcw,
  Edit2,
  Trash2,
  AlertTriangle,
  Clock,
  FileText,
} from 'lucide-react';
import { ClientDoc, SiteType, ObraStatus } from '../../types';
import { format, parseISO } from 'date-fns';
import { getEffectiveStatus } from '../../utils';
import { getSlaInfo, getScheduleInfo, today } from './shared';

// A linha da obra separa três canais de informação para não competirem entre si:
//   ícone  → o TIPO da obra (canteiro / rodovia / bases)
//   trilho → a SAÚDE do prazo (no prazo, em risco, vencido, encerrada)
//   selo   → o STATUS do ciclo de vida (em andamento, pausada, concluída, cancelada)

type Tone = 'blue' | 'amber' | 'rose' | 'emerald' | 'slate';

const TONE: Record<Tone, { rail: string; icon: string }> = {
  blue: {
    rail: 'bg-blue-500',
    icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  amber: {
    rail: 'bg-amber-500',
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  },
  rose: {
    rail: 'bg-rose-500',
    icon: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
  },
  emerald: {
    rail: 'bg-emerald-500',
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  slate: {
    rail: 'bg-slate-300 dark:bg-slate-600',
    icon: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400',
  },
};

const STATUS_BADGE: Record<ObraStatus, { label: string; className: string }> = {
  [ObraStatus.ACTIVE]: {
    label: 'Em andamento',
    className:
      'text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400',
  },
  [ObraStatus.PAUSED]: {
    label: 'Pausada',
    className:
      'text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-400',
  },
  [ObraStatus.COMPLETED]: {
    label: 'Concluída',
    className:
      'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400',
  },
  [ObraStatus.CANCELLED]: {
    label: 'Cancelada',
    className:
      'text-slate-500 bg-slate-100 border-slate-300 dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-400',
  },
};

const TYPE_CONFIG: Record<
  SiteType,
  { Icon: React.FC<{ size?: number; className?: string }>; label: string }
> = {
  [SiteType.CONSTRUCTION_SITE]: { Icon: Building2, label: 'Canteiro de obras' },
  [SiteType.HIGHWAY]: { Icon: Route, label: 'Obra de rodovia' },
  [SiteType.OPERATIONAL_BASE]: { Icon: Warehouse, label: 'Bases operacionais' },
};

const DASH = '—';

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
  const badge = STATUS_BADGE[status];
  const type = TYPE_CONFIG[client.type] ?? TYPE_CONFIG[SiteType.CONSTRUCTION_SITE];
  const sla = getSlaInfo(client);
  const schedule = getScheduleInfo(client);
  const isActive = status === ObraStatus.ACTIVE;
  const isDone = status === ObraStatus.COMPLETED || status === ObraStatus.CANCELLED;

  const tone: Tone = isActive
    ? sla?.isOverdue
      ? 'rose'
      : sla?.isAtRisk
        ? 'amber'
        : 'blue'
    : status === ObraStatus.PAUSED
      ? 'amber'
      : status === ObraStatus.COMPLETED
        ? 'emerald'
        : 'slate';

  const baseCount = client.type === SiteType.HIGHWAY ? client.bases?.length : client.numberOfBases;
  const typeLabel =
    baseCount && client.type !== SiteType.CONSTRUCTION_SITE
      ? `${type.label} · ${baseCount} base${baseCount !== 1 ? 's' : ''}`
      : type.label;

  // Preenchimento da régua: obra concluída fecha em 100%, o resto acompanha "hoje".
  const fillPct = status === ObraStatus.COMPLETED ? 100 : (schedule?.todayPct ?? 0);

  return (
    <article
      className={`group relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all overflow-hidden ${
        status === ObraStatus.CANCELLED ? 'opacity-75 hover:opacity-100' : ''
      }`}
    >
      {/* Trilho de saúde do prazo */}
      <span className={`absolute inset-y-0 left-0 w-1 ${TONE[tone].rail}`} aria-hidden="true" />

      <div className="pl-5 pr-3 py-4 sm:pr-4">
        {/* Cabeçalho: identidade à esquerda, selos e ações à direita */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${TONE[tone].icon}`}
            >
              <type.Icon size={19} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-bold text-[15px] text-slate-800 dark:text-white leading-tight truncate min-w-0">
                  {client.name}
                </h3>
                <span
                  className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${badge.className}`}
                >
                  {badge.label}
                </span>
                {isActive && sla?.isOverdue && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400">
                    <AlertTriangle size={10} /> Atraso {Math.abs(sla.remaining)}d
                  </span>
                )}
                {isActive && sla?.isAtRisk && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-400">
                    <Clock size={10} /> Em risco
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">
                <MapPin size={11} className="flex-shrink-0" />
                {client.location || 'Local não informado'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {isActive && !isCompleting && (
              <IconAction
                onClick={onStartComplete}
                label="Concluir obra"
                className="hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                <CheckCircle2 size={16} />
              </IconAction>
            )}
            {isDone && (
              <IconAction
                onClick={onReactivate}
                label="Reativar obra"
                className="hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-400"
              >
                <RotateCcw size={16} />
              </IconAction>
            )}
            <IconAction
              onClick={onEdit}
              label="Editar obra"
              className="hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-600 dark:hover:text-brand-400"
            >
              <Edit2 size={16} />
            </IconAction>
            <IconAction
              onClick={onDelete}
              label="Excluir obra"
              className="hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400"
            >
              <Trash2 size={16} />
            </IconAction>
          </div>
        </div>

        {/* Grade de campos rotulados — colunas alinham entre as linhas da lista */}
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <Field label="Tipo">{typeLabel}</Field>
          <Field label="Responsável" muted={!client.responsavel}>
            {client.responsavel || DASH}
          </Field>
          <Field label="Projetos vinculados" muted={projCount === 0}>
            {projCount > 0 ? `${projCount} projeto${projCount !== 1 ? 's' : ''}` : 'Nenhum'}
          </Field>
          {isDone ? (
            <Field
              label={status === ObraStatus.CANCELLED ? 'Cancelada em' : 'Concluída em'}
              muted={!client.completedAt}
            >
              {client.completedAt ? format(parseISO(client.completedAt), 'dd/MM/yyyy') : DASH}
            </Field>
          ) : (
            <Field
              label="Prazo dos projetos"
              muted={!client.projectDeadlineDate}
              className={
                sla?.isOverdue
                  ? 'text-rose-600 dark:text-rose-400'
                  : sla?.isAtRisk
                    ? 'text-amber-600 dark:text-amber-400'
                    : undefined
              }
            >
              {client.projectDeadlineDate
                ? format(parseISO(client.projectDeadlineDate), 'dd/MM/yyyy')
                : DASH}
            </Field>
          )}
        </dl>

        {/* Régua de cronograma */}
        {schedule && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Cronograma
              </span>
              {isActive && sla && (
                <span
                  className={`text-[11px] font-semibold ${
                    sla.isOverdue
                      ? 'text-rose-600 dark:text-rose-400'
                      : sla.isAtRisk
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {sla.isOverdue
                    ? `Prazo dos projetos vencido há ${Math.abs(sla.remaining)} dias`
                    : `Faltam ${sla.remaining} dias para o prazo dos projetos`}
                </span>
              )}
            </div>

            <div className="relative h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${TONE[tone].rail}`}
                style={{ width: `${fillPct}%` }}
              />
              {schedule.marks.map((m) => (
                <span
                  key={m.key}
                  title={`${m.label}: ${format(m.date, 'dd/MM/yyyy')}`}
                  style={{ left: `${m.pct}%` }}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-800 ${
                    m.key === 'deadline'
                      ? 'bg-brand-600 dark:bg-brand-400'
                      : 'bg-slate-300 dark:bg-slate-500'
                  }`}
                />
              ))}
              {isActive && schedule.hasStarted && !schedule.hasEnded && (
                <span
                  title="Hoje"
                  style={{ left: `${schedule.todayPct}%` }}
                  className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-slate-800 dark:bg-white"
                />
              )}
            </div>

            <div className="flex items-start justify-between gap-2 mt-2">
              {schedule.marks.map((m, i) => (
                <span
                  key={m.key}
                  className={`flex flex-col min-w-0 ${
                    i === 0
                      ? 'items-start'
                      : i === schedule.marks.length - 1
                        ? 'items-end'
                        : 'items-center'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-none truncate">
                    {m.label}
                  </span>
                  <span
                    className={`text-[11px] font-semibold tabular-nums mt-1 ${
                      m.key === 'deadline'
                        ? 'text-brand-700 dark:text-brand-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {format(m.date, 'dd/MM/yyyy')}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé: observações e o campo legado de contrato */}
        {(client.observacoes || client.contractDate) && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
            {client.observacoes && (
              <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0 flex-1">
                <FileText
                  size={12}
                  className="mt-0.5 flex-shrink-0 text-slate-300 dark:text-slate-600"
                />
                <span className="min-w-0">{client.observacoes}</span>
              </p>
            )}
            {client.contractDate && (
              <span
                className="text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0 tabular-nums"
                title="Campo do SLA antigo, mantido apenas para consulta"
              >
                Contrato (legado): {format(parseISO(client.contractDate), 'dd/MM/yyyy')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Faixa de conclusão rápida */}
      {isCompleting && (
        <div className="pl-5 pr-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
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
    </article>
  );
}

function Field({
  label,
  children,
  className,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 leading-none mb-1.5">
        {label}
      </dt>
      <dd
        className={`text-[13px] font-semibold truncate ${
          className ||
          (muted
            ? 'text-slate-400 dark:text-slate-500 font-normal'
            : 'text-slate-700 dark:text-slate-200')
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

function IconAction({
  onClick,
  label,
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg text-slate-400 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
