import { Download, X, List, Truck } from 'lucide-react';

export function ExportModal({
  onClose,
  onConfirmExport,
}: {
  onClose: () => void;
  onConfirmExport: (type: 'PROJECTS' | 'SUPPLIES') => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Download className="text-brand-600 dark:text-brand-400" size={20} />
            Exportar Dados
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            aria-label="Fechar Modal"
          >
            <X size={24} />
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Selecione qual base de dados deseja exportar para CSV. Os dados serão filtrados conforme a
          visualização atual.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => onConfirmExport('PROJECTS')}
            className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg group transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 p-2 rounded-lg">
                <List size={20} />
              </div>
              <div className="text-left">
                <span className="block font-semibold text-slate-800 dark:text-slate-200">
                  Canteiro de Obras
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Controle de Arquivos de Projeto
                </span>
              </div>
            </div>
            <Download
              size={18}
              className="text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"
            />
          </button>

          <button
            onClick={() => onConfirmExport('SUPPLIES')}
            className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg group transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-2 rounded-lg">
                <Truck size={20} />
              </div>
              <div className="text-left">
                <span className="block font-semibold text-slate-800 dark:text-slate-200">
                  Suprimentos
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Pedidos e Itens (uma linha por item)
                </span>
              </div>
            </div>
            <Download
              size={18}
              className="text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors"
            />
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
