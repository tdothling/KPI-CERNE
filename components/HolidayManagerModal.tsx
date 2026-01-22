import React, { useState, useMemo } from 'react';
import { X, Calendar, Plus, AlertCircle, CalendarRange, ChevronDown, ChevronRight, CalendarDays } from 'lucide-react';
import { format, parseISO, isWeekend, isValid, eachDayOfInterval, getYear, getMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HolidayManagerModalProps {
  holidays: string[];
  onUpdateHolidays: (newHolidays: string[]) => void;
  onClose: () => void;
}

type Mode = 'SINGLE' | 'RANGE';

export const HolidayManagerModal: React.FC<HolidayManagerModalProps> = ({ holidays, onUpdateHolidays, onClose }) => {
  const [mode, setMode] = useState<Mode>('SINGLE');
  const [singleDate, setSingleDate] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>(() => {
      return { [new Date().getFullYear()]: true };
  });

  const groupedHolidays = useMemo(() => {
    const groups: Record<number, Record<number, string[]>> = {};
    const sorted = [...holidays].sort();
    sorted.forEach(dateStr => {
        const date = parseISO(dateStr);
        if (!isValid(date)) return;
        const year = getYear(date);
        const month = getMonth(date);
        if (!groups[year]) groups[year] = {};
        if (!groups[year][month]) groups[year][month] = [];
        groups[year][month].push(dateStr);
    });
    return groups;
  }, [holidays]);

  const sortedYears = useMemo(() => Object.keys(groupedHolidays).map(Number).sort((a, b) => b - a), [groupedHolidays]);
  const toggleYear = (year: number) => { setExpandedYears(prev => ({ ...prev, [year]: !prev[year] })); };

  const handleAdd = () => {
    let datesToAdd: string[] = [];
    if (mode === 'SINGLE') {
        if (!singleDate) return;
        datesToAdd = [singleDate];
    } else {
        if (!rangeStart || !rangeEnd) return;
        if (rangeStart > rangeEnd) { alert('A data final deve ser posterior à data inicial.'); return; }
        try { const interval = eachDayOfInterval({ start: parseISO(rangeStart), end: parseISO(rangeEnd) }); datesToAdd = interval.map(date => format(date, 'yyyy-MM-dd')); } catch (error) { console.error(error); return; }
    }
    const newUniqueDates = datesToAdd.filter(d => !holidays.includes(d));
    if (newUniqueDates.length === 0) { alert('Todas as datas selecionadas já estão cadastradas.'); return; }
    const updated = [...holidays, ...newUniqueDates].sort();
    onUpdateHolidays(updated);
    if (newUniqueDates.length > 0) { const yearToExpand = getYear(parseISO(newUniqueDates[0])); setExpandedYears(prev => ({...prev, [yearToExpand]: true})); }
    setSingleDate(''); setRangeStart(''); setRangeEnd('');
  };

  const handleRemove = (dateToRemove: string) => { onUpdateHolidays(holidays.filter(d => d !== dateToRemove)); };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-5xl w-full p-6 border dark:border-slate-700 flex flex-col h-[80vh]">
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-700 pb-4 shrink-0">
          <div><h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Calendar className="text-brand-600 dark:text-brand-400" size={24} /> Dias Não Úteis</h3><p className="text-sm text-slate-500 dark:text-slate-400">Cadastre feriados e folgas da empresa.</p></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={24} /></button>
        </div>
        <div className="flex flex-col md:flex-row gap-6 h-full overflow-hidden">
            <div className="w-full md:w-1/3 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-700 pb-4 md:pb-0 md:pr-4 shrink-0 overflow-y-auto">
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg shrink-0">
                    <button onClick={() => setMode('SINGLE')} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'SINGLE' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}><Calendar size={14} /> Data Única</button>
                    <button onClick={() => setMode('RANGE')} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'RANGE' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}><CalendarRange size={14} /> Período</button>
                </div>
                <div className="flex flex-col gap-4">
                    {mode === 'SINGLE' ? (
                        <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Selecionar Data</label><input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 dark:[color-scheme:dark]" /></div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">De</label><input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 text-sm dark:[color-scheme:dark]" /></div>
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Até</label><input type="date" value={rangeEnd} min={rangeStart} onChange={(e) => setRangeEnd(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 text-sm dark:[color-scheme:dark]" /></div>
                        </div>
                    )}
                    <button onClick={handleAdd} disabled={mode === 'SINGLE' ? !singleDate : (!rangeStart || !rangeEnd)} className="w-full h-[40px] bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors flex items-center justify-center shadow-sm font-semibold text-sm gap-2"><Plus size={18} /> Adicionar</button>
                </div>
                <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400 flex items-start gap-2"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /><p>Datas cadastradas são subtraídas dos cálculos de dias úteis (apenas se caírem em dias de semana).</p></div>
            </div>
            <div className="w-full md:w-2/3 flex flex-col h-full overflow-hidden">
                 <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><CalendarDays size={16} /> Calendário ({holidays.length} dias)</h4>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                    {holidays.length === 0 ? (<div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg h-full flex flex-col items-center justify-center"><Calendar className="text-slate-300 mb-2" size={32} /><p className="text-slate-400 text-sm">Nenhum feriado cadastrado.</p></div>) : (sortedYears.map(year => (
                            <div key={year} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800/50">
                                <button onClick={() => toggleYear(year)} className="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors border-b border-slate-100 dark:border-slate-700">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{year}</span>
                                    <div className="flex items-center gap-2"><span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{Object.values(groupedHolidays[year]).flat().length} dias</span>{expandedYears[year] ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}</div>
                                </button>
                                {expandedYears[year] && (
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {Object.keys(groupedHolidays[year]).map(Number).sort((a, b) => a - b).map(month => {
                                            const monthName = format(new Date(year, month, 1), 'MMMM', { locale: ptBR });
                                            const monthDates = groupedHolidays[year][month].sort();
                                            return (
                                                <div key={month} className="bg-white dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-700 p-2">
                                                    <h5 className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase mb-2 border-b border-slate-100 dark:border-slate-700 pb-1">{monthName}</h5>
                                                    <div className="flex flex-wrap gap-2">{monthDates.map(dateStr => { const date = parseISO(dateStr); const isWe = isWeekend(date); return (<div key={dateStr} className={`group flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors ${isWe ? 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900/30 dark:text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'}`} title={`${format(date, "EEEE", { locale: ptBR })}${isWe ? ' (Fim de Semana)' : ''}`}><span className="font-mono font-medium">{format(date, 'dd')}</span><button onClick={() => handleRemove(dateStr)} className="text-slate-400 hover:text-rose-500 transition-colors opacity-50 group-hover:opacity-100" aria-label="Remover data"><X size={12} /></button></div>); })}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};