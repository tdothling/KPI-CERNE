
import React from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  addYears, 
  subYears, 
  addQuarters, 
  subQuarters, 
  startOfQuarter, 
  endOfQuarter,
  getQuarter,
  getYear,
  getMonth
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, CalendarRange } from 'lucide-react';
import { DateFilterType } from '../types';

interface DateRangeFilterProps {
  filterType: DateFilterType;
  setFilterType: (type: DateFilterType) => void;
  referenceDate: Date;
  setReferenceDate: (date: Date) => void;
  customRange: { start: string; end: string };
  setCustomRange: (range: { start: string; end: string }) => void;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  filterType,
  setFilterType,
  referenceDate,
  setReferenceDate,
  customRange,
  setCustomRange
}) => {

  const handlePrev = () => {
    switch (filterType) {
      case 'MONTH': setReferenceDate(subMonths(referenceDate, 1)); break;
      case 'QUARTER': setReferenceDate(subQuarters(referenceDate, 1)); break;
      case 'SEMESTER': setReferenceDate(subMonths(referenceDate, 6)); break; // Approximation for nav
      case 'YEAR': setReferenceDate(subYears(referenceDate, 1)); break;
      default: break;
    }
  };

  const handleNext = () => {
    switch (filterType) {
      case 'MONTH': setReferenceDate(addMonths(referenceDate, 1)); break;
      case 'QUARTER': setReferenceDate(addQuarters(referenceDate, 1)); break;
      case 'SEMESTER': setReferenceDate(addMonths(referenceDate, 6)); break;
      case 'YEAR': setReferenceDate(addYears(referenceDate, 1)); break;
      default: break;
    }
  };

  const renderLabel = () => {
    switch (filterType) {
      case 'MONTH':
        return format(referenceDate, 'MMMM yyyy', { locale: ptBR });
      case 'QUARTER':
        return `${getQuarter(referenceDate)}º Trimestre ${getYear(referenceDate)}`;
      case 'SEMESTER':
        const currentMonth = getMonth(referenceDate);
        const semester = currentMonth < 6 ? 1 : 2;
        return `${semester}º Semestre ${getYear(referenceDate)}`;
      case 'YEAR':
        return format(referenceDate, 'yyyy');
      default:
        return '';
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm gap-2">
      
      {/* Filter Type Selector */}
      <div className="relative">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as DateFilterType)}
          className="appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm rounded-md py-1.5 pl-8 pr-8 focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer font-medium"
        >
          <option value="ALL">Todo o Período</option>
          <option value="MONTH">Mensal</option>
          <option value="QUARTER">Trimestral</option>
          <option value="SEMESTER">Semestral</option>
          <option value="YEAR">Anual</option>
          <option value="CUSTOM">Personalizado</option>
        </select>
        <CalendarRange size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {/* Navigation Controls (Hidden for ALL and CUSTOM) */}
      {filterType !== 'ALL' && filterType !== 'CUSTOM' && (
        <div className="flex items-center bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700">
          <button 
            onClick={handlePrev}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-l-md text-slate-500 dark:text-slate-400 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          
          <span className="px-3 min-w-[140px] text-center text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize select-none">
            {renderLabel()}
          </span>

          <button 
            onClick={handleNext}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-r-md text-slate-500 dark:text-slate-400 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Custom Range Inputs */}
      {filterType === 'CUSTOM' && (
        <div className="flex items-center gap-2">
          <input 
            type="date" 
            value={customRange.start}
            onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
            className="border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded px-2 py-1 text-sm dark:[color-scheme:dark]"
          />
          <span className="text-slate-400 text-xs">até</span>
          <input 
            type="date" 
            value={customRange.end}
            onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
            className="border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded px-2 py-1 text-sm dark:[color-scheme:dark]"
          />
        </div>
      )}
    </div>
  );
};
