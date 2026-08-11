const COLOR_MAP: Record<string, string> = {
  slate:
    'text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  blue: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30',
  rose: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-900/30',
  emerald:
    'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30',
};

export function StatCard({
  label,
  value,
  color,
  alert,
}: {
  label: string;
  value: number;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${COLOR_MAP[color]}`}>
      <div
        className={`text-3xl font-black ${alert && value > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}
      >
        {value}
      </div>
      <div className="text-xs font-semibold mt-1 opacity-70">{label}</div>
    </div>
  );
}
