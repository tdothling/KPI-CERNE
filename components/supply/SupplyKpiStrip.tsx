import React, { useMemo } from 'react';
import { SupplyOrder, SupplyStatus } from '../../types';
import { isSupplyOverdue, getSupplyLeadTimeDays, isSupplyActive } from './supplyUtils';
import { ClipboardList, AlertTriangle, Timer, PackageCheck, ShoppingCart } from 'lucide-react';

interface SupplyKpiStripProps {
    orders: SupplyOrder[];   // já filtrados pelos filtros globais
    holidays: string[];
}

// Faixa de indicadores da rotina de suprimentos. Puro cálculo em memória —
// sem recharts, seguindo o estilo dos stat cards do Dashboard.
export const SupplyKpiStrip: React.FC<SupplyKpiStripProps> = ({ orders, holidays }) => {
    const stats = useMemo(() => {
        const active = orders.filter(isSupplyActive);
        const overdue = orders.filter(isSupplyOverdue);
        const delivered = orders.filter(o => o.status === SupplyStatus.DELIVERED && o.milestones?.deliveredAt);
        const inPurchase = orders.filter(o => o.status === SupplyStatus.BOUGHT);

        // Lead time médio: só pedidos efetivamente entregues (criação → entrega, dias úteis)
        const leadTimes = delivered.map(o => getSupplyLeadTimeDays(o, holidays)).filter(d => d > 0);
        const avgLeadTime = leadTimes.length > 0
            ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10
            : 0;

        const byStage = {
            [SupplyStatus.PLANNING]: orders.filter(o => o.status === SupplyStatus.PLANNING).length,
            [SupplyStatus.READY]: orders.filter(o => o.status === SupplyStatus.READY).length,
            [SupplyStatus.QUOTING]: orders.filter(o => o.status === SupplyStatus.QUOTING).length,
        };

        return { activeCount: active.length, overdueCount: overdue.length, deliveredCount: delivered.length, inPurchaseCount: inPurchase.length, avgLeadTime, byStage };
    }, [orders, holidays]);

    return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <KpiCard
                icon={<ClipboardList size={18} />}
                iconClass="bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400"
                label="Pedidos Ativos"
                value={String(stats.activeCount)}
                hint={`${stats.byStage[SupplyStatus.PLANNING]} planej. · ${stats.byStage[SupplyStatus.READY]} prontas · ${stats.byStage[SupplyStatus.QUOTING]} cotação`}
            />
            <KpiCard
                icon={<ShoppingCart size={18} />}
                iconClass="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                label="Aguardando Entrega"
                value={String(stats.inPurchaseCount)}
                hint="Comprados, ainda não entregues"
            />
            <KpiCard
                icon={<AlertTriangle size={18} />}
                iconClass={stats.overdueCount > 0 ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" : "bg-slate-50 dark:bg-slate-700/50 text-slate-400"}
                label="Atrasados"
                value={String(stats.overdueCount)}
                valueClass={stats.overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
                hint="Passaram da data necessária"
            />
            <KpiCard
                icon={<Timer size={18} />}
                iconClass="bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                label="Lead Time Médio"
                value={stats.avgLeadTime > 0 ? `${stats.avgLeadTime}d` : '-'}
                hint="Dias úteis, criação → entrega"
            />
            <KpiCard
                icon={<PackageCheck size={18} />}
                iconClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                label="Entregues"
                value={String(stats.deliveredCount)}
                hint="No período filtrado"
            />
        </div>
    );
};

function KpiCard({ icon, iconClass, label, value, hint, valueClass }: {
    icon: React.ReactNode; iconClass: string; label: string; value: string; hint?: string; valueClass?: string;
}) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${iconClass}`}>{icon}</div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-tight">{label}</span>
            </div>
            <span className={`text-2xl font-bold ${valueClass || 'text-slate-800 dark:text-slate-100'}`}>{value}</span>
            {hint && <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-tight">{hint}</span>}
        </div>
    );
}
