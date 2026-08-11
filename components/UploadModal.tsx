import { UploadCloud, X, FolderInput, FileText } from 'lucide-react';
import { ClientDoc, Discipline, ProjectPhase, SiteType } from '../types';

type EntryMode = 'FILES' | 'PASTE';

interface UploadModalProps {
  clients: ClientDoc[];
  rodoviaClients: ClientDoc[];
  uploadClient: string;
  onUploadClientChange: (v: string) => void;
  shouldShowBaseInput: boolean;
  uploadBase: string;
  onUploadBaseChange: (v: string) => void;
  uploadPhase: ProjectPhase;
  onUploadPhaseChange: (v: ProjectPhase) => void;
  entryMode: EntryMode;
  onEntryModeChange: (v: EntryMode) => void;
  pasteText: string;
  onPasteTextChange: (v: string) => void;
  isFolderUpload: boolean;
  onFolderUploadChange: (v: boolean) => void;
  uploadDiscipline: Discipline;
  onUploadDisciplineChange: (v: Discipline) => void;
  onClose: () => void;
  onPasteReview: () => void;
  onTriggerFileSelect: () => void;
}

// Modal de importação: Etapa 1 (configuração) — a etapa de conferência é o
// ImportReviewModal, aberto depois que os arquivos/lista são processados.
export function UploadModal({
  clients,
  rodoviaClients,
  uploadClient,
  onUploadClientChange,
  shouldShowBaseInput,
  uploadBase,
  onUploadBaseChange,
  uploadPhase,
  onUploadPhaseChange,
  entryMode,
  onEntryModeChange,
  pasteText,
  onPasteTextChange,
  isFolderUpload,
  onFolderUploadChange,
  uploadDiscipline,
  onUploadDisciplineChange,
  onClose,
  onPasteReview,
  onTriggerFileSelect,
}: UploadModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all border dark:border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Importar Projetos</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            aria-label="Fechar Modal"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Cliente Padrão (Registro de Obra) *
            </label>
            <select
              value={uploadClient}
              onChange={(e) => onUploadClientChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3"
            >
              <option value="" disabled>
                Selecione um cliente...
              </option>
              {clients
                .filter((c) => c.type !== SiteType.HIGHWAY)
                .map((client) => (
                  <option key={client.id} value={client.name}>
                    {client.name}
                  </option>
                ))}
            </select>
            {clients.length === 0 && (
              <p className="text-xs text-rose-500 mt-1">
                Nenhum cliente cadastrado. Use o botão "Registro de Obra".
              </p>
            )}
            {rodoviaClients.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Obras de Rodovia não aparecem aqui: cadastre os moldes na aba Projetos Referências e
                instancie nas bases pela própria referência.
              </p>
            )}
          </div>

          {shouldShowBaseInput && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Nº da Base - Localização
              </label>
              <input
                type="text"
                value={uploadBase}
                onChange={(e) => onUploadBaseChange(e.target.value)}
                placeholder="Ex: Base 01, Centro"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3"
              />
            </div>
          )}

          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Fase do Projeto
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="projectPhase"
                  value={ProjectPhase.PRELIMINARY}
                  checked={uploadPhase === ProjectPhase.PRELIMINARY}
                  onChange={() => onUploadPhaseChange(ProjectPhase.PRELIMINARY)}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Preliminar / Básico
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="projectPhase"
                  value={ProjectPhase.EXECUTIVE}
                  checked={uploadPhase === ProjectPhase.EXECUTIVE}
                  onChange={() => onUploadPhaseChange(ProjectPhase.EXECUTIVE)}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Executivo (Padrão)
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Como deseja cadastrar?
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
              <button
                onClick={() => onEntryModeChange('FILES')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-all ${entryMode === 'FILES' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <UploadCloud size={16} /> Arquivos
              </button>
              <button
                onClick={() => onEntryModeChange('PASTE')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-all ${entryMode === 'PASTE' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <FileText size={16} /> Colar Lista
              </button>
            </div>
          </div>

          {entryMode === 'PASTE' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Nomes dos projetos{' '}
                <span className="text-xs font-normal text-slate-400">
                  (um por linha — pode colar do Excel)
                </span>
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => onPasteTextChange(e.target.value)}
                placeholder={
                  'PLANTA BAIXA ELETRICA\nDETALHAMENTO HIDRAULICA\nCORTE AA ESTRUTURA...'
                }
                className="w-full h-32 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 p-3 resize-none font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">
                {pasteText.split('\n').filter((l) => l.trim()).length} projeto(s) detectado(s). A
                disciplina será sugerida pelo nome e você poderá conferir tudo antes de salvar.
              </p>
            </div>
          )}

          {entryMode === 'FILES' && (
            <div className="bg-brand-50 dark:bg-slate-700/50 p-3 rounded-lg border border-brand-100 dark:border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FolderInput className="text-brand-600 dark:text-brand-400" size={20} />
                  <div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                      Modo Pasta (Auto-Tag)
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      Detecta Disciplina pelo nome da pasta
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFolderUpload}
                    onChange={(e) => onFolderUploadChange(e.target.checked)}
                    className="sr-only peer"
                    aria-label="Ativar Modo Pasta"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-700"></div>
                </label>
              </div>
            </div>
          )}

          <div
            className={`${isFolderUpload ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all`}
          >
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Disciplina Padrão {isFolderUpload && '(Usada se a detecção falhar)'}
            </label>
            <div className="relative">
              <select
                value={uploadDiscipline}
                onChange={(e) => onUploadDisciplineChange(e.target.value as Discipline)}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3 pr-8"
              >
                {Object.values(Discipline).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg
                  className="h-4 w-4 fill-current"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
          >
            Cancelar
          </button>
          {entryMode === 'PASTE' ? (
            <button
              onClick={onPasteReview}
              className="px-6 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-md transition-all flex items-center"
            >
              Revisar Lista
            </button>
          ) : (
            <button
              onClick={onTriggerFileSelect}
              className="px-6 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-md transition-all flex items-center"
            >
              Selecionar Arquivos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
