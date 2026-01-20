import React, { useState } from 'react';
import { X, Calendar, Plus, Trash2, AlertCircle } from 'lucide-react';
import { format, parseISO, isWeekend, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HolidayManagerModalProps {
  holidays: string[];
  onUpdateHolidays: (newHolidays: string[]) => void;
  onClose: () => void;
}

export const HolidayManagerModal: React.FC<HolidayManagerModalProps> = ({ holidays, onUpdateHolidays, onClose }) => {
  const [newDate, setNewDate] = useState('');

  const handleAdd = () => {
    if (!newDate) return;
    
    // Prevent duplicates
    if (holidays.includes(newDate)) {
      alert('Esta data já está cadastrada.');
      return;
    }

    // Optional: Warn if it's a weekend, but allow it (maybe they work weekends usually but this specific one is off?)
    // For this business logic, we usually only care about weekdays for subtraction, 
    // but saving it doesn't hurt.
    
    const updated = [...holidays, newDate].sort();
    onUpdateHolidays(updated);
    setNewDate('');
  };

  const handleRemove = (dateToRemove: string) => {
    onUpdateHolidays(holidays.filter(d => d !== dateToRemove));
  };

  // Group holidays by year/month for better visibility could be nice, 
  // but a simple sorted list is sufficient for v1.

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border dark:border-slate-700 flex flex-col max-h-[80vh]">
        
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Calendar className="text-brand-600 dark:text-brand-400" size={24} />
              Dias Não Úteis
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cadastre feriados e folgas da empresa.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={24} />
          </button>
        </div>

        {/* Input Area */}
        <div className="flex gap-2 mb-6">
            <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Selecionar Data</label>
                <input 
                    type="date" 
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 dark:[color-scheme:dark]"
                />
            </div>
            <div className="flex items-end">
                <button 
                    onClick={handleAdd}
                    disabled={!newDate}
                    className="h-[42px] px-4 bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors flex items-center justify-center"
                >
                    <Plus size={20} />
                </button>
            </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-1">
            {holidays.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    <p className="text-slate-400 text-sm">Nenhum feriado cadastrado.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {holidays.map(dateStr => {
                        const date = parseISO(dateStr);
                        const isWe = isWeekend(date);
                        return (
                            <div key={dateStr} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700/50 group">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${isWe ? 'bg-amber-400' : 'bg-brand-500'}`}></div>
                                    <div>
                                        <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            {format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                        </span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400 capitalize">
                                            {format(date, "EEEE", { locale: ptBR })}
                                            {isWe && ' (Fim de Semana)'}
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleRemove(dateStr)}
                                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400 flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <p>Estas datas serão subtraídas automaticamente do cálculo de dias úteis nos indicadores e cronogramas (apenas se caírem em dias de semana).</p>
        </div>

      </div>
    </div>
  );
};
