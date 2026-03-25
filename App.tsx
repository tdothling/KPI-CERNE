import React, { useState, useRef, useEffect } from 'react';
import { ProjectFile, Discipline, Status, RevisionReason, DateFilterType, MaterialDoc, PurchaseDoc, ClientDoc, SiteType, ProjectFilterState, ProjectPhase, Period } from './types';
import { Dashboard } from './components/Dashboard';
import { ProjectList } from './components/ProjectList';
import { ProjectTimeline } from './components/ProjectTimeline';
import { BatchEditModal } from './components/BatchEditModal';
import { MaterialBatchEditModal } from './components/MaterialBatchEditModal';
import { HolidayManagerModal } from './components/HolidayManagerModal';
import { ClientManagerModal } from './components/ClientManagerModal';
import { DateRangeFilter } from './components/DateRangeFilter';
import { MaterialList } from './components/MaterialList';
import { PurchaseList } from './components/PurchaseList';
import { LoginModal } from './components/LoginModal';
import { AdvancedFilter } from './components/AdvancedFilter';
import { DataMigration } from './components/DataMigration';
import { CerneLogo } from './components/CerneLogo';
import { UploadCloud, Filter, X, Layers, FolderInput, Moon, Sun, LayoutDashboard, Calendar, List, CalendarDays, Download, Package, FileSpreadsheet, Database, LogIn, LogOut, ShoppingCart, HardHat, Search, ChevronDown, CheckSquare, Square, FileText, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { logoutUser, formatUsername } from './services/auth';
import { detectDiscipline, extractMetadataFromMaterialFilename, validateFile } from './utils';
import { useAppData } from './hooks/useAppData';
import { useAppFilters } from './hooks/useAppFilters';
import { addProject, addMaterial } from './services/db';

type Tab = 'dashboard' | 'timeline' | 'projects' | 'materials' | 'purchases';
type ImportType = 'PROJECT' | 'MATERIAL_LIST';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [projectFilter, setProjectFilter] = useState<ProjectFilterState>({ clients: [], disciplines: [], isActive: false });

  const {
    projects, materials, purchases, clients, holidays, dbConnected, currentUser,
    updateProject, deleteProject, addProjectRevision, promoteProjectToExecutive,
    updateMaterial, deleteMaterial, addMaterialRevision,
    handleAddPurchase, handleUpdatePurchase, handleDeletePurchase,
    handleAddClient, handleUpdateClient, handleDeleteClient,
    handleBatchUpdate, handleBatchWorkflow,
    handleMaterialBatchUpdate, handleMaterialBatchWorkflow,
    handleUpdateHolidays
  } = useAppData(projectFilter);

  const {
    selectedClients, setSelectedClients, toggleClientSelection,
    selectedDisciplines, setSelectedDisciplines, toggleDisciplineSelection,
    dateFilterType, setDateFilterType,
    referenceDate, setReferenceDate,
    customRange, setCustomRange,
    filteredProjects, filteredMaterials, filteredPurchases,
    uniqueClients
  } = useAppFilters(projects, materials, purchases, clients);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isClientFilterOpen, setIsClientFilterOpen] = useState(false);
  const [isDisciplineFilterOpen, setIsDisciplineFilterOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [isMaterialBatchEditOpen, setIsMaterialBatchEditOpen] = useState(false);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  const [importType, setImportType] = useState<ImportType>('PROJECT');
  const [uploadDiscipline, setUploadDiscipline] = useState<Discipline>(Discipline.ARCHITECTURE);
  const [uploadPhase, setUploadPhase] = useState<ProjectPhase>(ProjectPhase.PRELIMINARY);
  const [uploadClient, setUploadClient] = useState<string>('');
  const [uploadBase, setUploadBase] = useState<string>('');
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Todos os usuários agora têm acesso total às ferramentas e ações, exceto à aba de compras
  const isAdmin = true;
  const isReadOnly = false;
  const showPurchasesTab = currentUser?.email?.startsWith('thiago.dothling');

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!currentUser || (currentUser.email && !currentUser.email.startsWith('thiago.dothling') && activeTab === 'purchases')) {
      if (activeTab === 'purchases') {
        setActiveTab('dashboard');
      }
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    if (isFolderUpload) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    } else {
      input.removeAttribute('webkitdirectory');
      input.removeAttribute('directory');
    }
  }, [isFolderUpload]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const selectedUploadClientDoc = (() => {
    return clients.find(c => c.name === uploadClient);
  })();

  const shouldShowBaseInput = !selectedUploadClientDoc || selectedUploadClientDoc.type === SiteType.OPERATIONAL_BASE;

  const handleOpenUploadModal = () => {
    setIsUploadModalOpen(true);
    setUploadDiscipline(Discipline.ARCHITECTURE);
    setUploadClient('');
    setUploadBase('');
    setUploadPhase(ProjectPhase.PRELIMINARY);
    setIsFolderUpload(false);
    setImportType('PROJECT');
  };

  const triggerFileSelect = () => {
    if (!uploadClient.trim()) {
      alert("Por favor, selecione um Cliente (Registro de Obra).");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const finalClientName = uploadClient.trim();
    const clientDoc = clients.find(c => c.name === finalClientName);

    let finalBaseName = 'Geral';
    if (clientDoc && clientDoc.type === SiteType.OPERATIONAL_BASE) {
      finalBaseName = uploadBase.trim() || 'Geral';
    }

    const validFiles = Array.from(files).filter(validateFile);

    if (validFiles.length < files.length) {
      alert(`${files.length - validFiles.length} arquivos foram ignorados por terem extensões não permitidas.`);
    }

    if (validFiles.length === 0) {
      event.target.value = '';
      return;
    }

    const currentHour = new Date().getHours();
    const autoPeriod: Period = currentHour < 12 ? 'MANHA' : 'TARDE';

    try {
      if (importType === 'PROJECT') {
        const promises = validFiles.map(async (f: any) => {
          let discipline = uploadDiscipline;
          if (isFolderUpload && f.webkitRelativePath) {
            const detected = detectDiscipline(f.webkitRelativePath);
            if (detected) discipline = detected;
          }

          const cleanFilename = f.name.replace(/\.[^/.]+$/, "");

          return addProject({
            filename: cleanFilename,
            groupId: crypto.randomUUID(),
            revision: 0,
            client: finalClientName,
            base: finalBaseName,
            discipline: discipline,
            phase: uploadPhase,
            status: Status.IN_PROGRESS,
            startDate: new Date().toISOString().split('T')[0],
            startPeriod: autoPeriod,
            endDate: '', sendDate: '', feedbackDate: '', blockedDays: 0, revisions: []
          });
        });
        await Promise.all(promises);
        setActiveTab('projects');
      } else if (importType === 'MATERIAL_LIST') {
        const promises = validFiles.map(async (f: any) => {
          const metadata = extractMetadataFromMaterialFilename(f.name, finalClientName);
          const cleanFilename = f.name.replace(/\.[^/.]+$/, "");

          return addMaterial({
            filename: cleanFilename,
            groupId: crypto.randomUUID(),
            revision: 0,
            client: finalClientName,
            base: finalBaseName,
            discipline: metadata.discipline,
            startDate: new Date().toISOString().split('T')[0],
            startPeriod: autoPeriod,
            endDate: '', status: 'IN_PROGRESS', revisions: []
          });
        });
        await Promise.all(promises);
        setActiveTab('materials');
      }
    } catch (error) {
      console.error("Erro no upload:", error);
      alert("Ocorreu um erro ao processar alguns arquivos. Verifique sua conexão e permissões.");
    }

    setIsUploadModalOpen(false);
    event.target.value = '';
  };

  const handleExportCSV = () => setIsExportModalOpen(true);

  const handleConfirmExport = (type: 'PROJECTS' | 'MATERIALS' | 'PURCHASES') => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = "";

    if (type === 'PROJECTS') {
      headers = ["Nome do Arquivo", "Cliente", "Base", "Disciplina", "Fase", "Status", "Data Inicio", "Data Fim", "Data Envio", "Data Feedback", "Dias Bloqueados"];
      rows = filteredProjects.map(p => [
        p.filename, p.client, p.base || '', p.discipline, p.phase || 'Executivo', p.status,
        p.startDate, p.endDate, p.sendDate, p.feedbackDate, p.blockedDays
      ]);
      filename = "Projetos";
    } else if (type === 'MATERIALS') {
      headers = ["Arquivo", "Cliente", "Base", "Disciplina", "Status", "Data Inicio", "Data Fim"];
      rows = filteredMaterials.map(m => [
        m.filename, m.client, m.base || '', m.discipline, m.status,
        m.startDate, m.endDate
      ]);
      filename = "Lista_Materiais";
    } else if (type === 'PURCHASES') {
      headers = ["Descricao", "Cliente", "Base", "Aplicacao", "Solicitante", "Status", "Data Pedido", "Data Chegada", "Observacao"];
      rows = filteredPurchases.map(p => [
        p.description, p.client, p.base || '', p.application, p.requester, p.status,
        p.requestDate, p.arrivalDate, p.observation || ''
      ]);
      filename = "Compras";
    }

    const csvContent = [
      headers.join(";"),
      ...rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setIsExportModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-200 print:bg-white print:pb-0 print:h-auto print:min-h-0 print:overflow-visible">
      {(isClientFilterOpen || isDisciplineFilterOpen) && <div className="fixed inset-0 z-40 bg-transparent print:hidden" onClick={() => { setIsClientFilterOpen(false); setIsDisciplineFilterOpen(false); }}></div>}

      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 transition-colors duration-200 print:hidden">
        {/* Layer 1: Global Top Bar */}
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-3">
              <CerneLogo />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest border-l border-slate-200 dark:border-slate-700 pl-3 hidden sm:inline">KPI Tracker</span>
            </div>
            
            <div className="hidden md:flex items-center relative max-w-xs ml-4">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
               <input 
                 type="text" 
                 placeholder="Busca global..." 
                 className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-full pl-9 pr-4 py-1.5 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-brand-500/30 transition-all"
               />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {!dbConnected && (
              <div className="flex items-center text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-3 py-1 rounded-full text-[10px] font-bold border border-rose-100 dark:border-rose-900/30">
                <Database size={12} className="mr-1.5" />
                OFFLINE
              </div>
            )}

            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme} 
                className="p-2 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 rounded-lg transition-colors"
                title="Alternar Tema"
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              {currentUser ? (
                <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700">
                  <div className="flex flex-col items-end mr-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">{formatUsername(currentUser.email)}</span>
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-tighter">Online</span>
                  </div>
                  <button 
                    onClick={logoutUser} 
                    className="p-2 bg-slate-50 dark:bg-slate-700/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors border border-slate-200 dark:border-slate-700" 
                    title="Sair"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsLoginModalOpen(true)} 
                  className="flex items-center gap-2 bg-brand-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-sm hover:shadow-md transition-all active:scale-95"
                >
                  <LogIn size={14} />
                  <span>Entrar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Layer 2: Functional Toolbar */}
        <div className="w-full px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
          <nav className="flex space-x-1 h-full items-center" aria-label="Tabs">
            <NavTab active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={16} />} label="Indicadores" />
            <NavTab active={activeTab === 'timeline'} onClick={() => setActiveTab('timeline')} icon={<Calendar size={16} />} label="Cronograma" />
            <NavTab active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} icon={<List size={16} />} label="Projetos" />
            <NavTab active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={<Package size={16} />} label="Materiais" />
            {showPurchasesTab && <NavTab active={activeTab === 'purchases'} onClick={() => setActiveTab('purchases')} icon={<ShoppingCart size={16} />} label="Compras" />}
          </nav>

          <div className="flex items-center gap-2">
            {/* Filters Group */}
            <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 overflow-hidden">
               <FilterButton active={selectedClients.length > 0} onClick={() => { setIsClientFilterOpen(!isClientFilterOpen); setIsDisciplineFilterOpen(false); }}>
                 <Filter size={14} />
                 <span className="max-w-[80px] truncate">{selectedClients.length === 0 ? 'Clientes' : `${selectedClients.length}`}</span>
                 <ChevronDown size={12} className="opacity-40" />
               </FilterButton>
               
               <div className="w-px h-6 bg-slate-100 dark:bg-slate-700 mx-0.5"></div>
               
               <FilterButton active={selectedDisciplines.length > 0} onClick={() => { setIsDisciplineFilterOpen(!isDisciplineFilterOpen); setIsClientFilterOpen(false); }}>
                 <Layers size={14} />
                 <span className="max-w-[80px] truncate">{selectedDisciplines.length === 0 ? 'Disciplinas' : `${selectedDisciplines.length}`}</span>
                 <ChevronDown size={12} className="opacity-40" />
               </FilterButton>

               <div className="w-px h-6 bg-slate-100 dark:bg-slate-700 mx-0.5"></div>

               <button onClick={() => setIsFilterModalOpen(true)} className={`p-1.5 rounded transition-all hover:bg-slate-100 dark:hover:bg-slate-700 ${projectFilter.isActive ? 'text-brand-600' : 'text-slate-400'}`}>
                 <Search size={14} />
               </button>
            </div>

            {/* Actions Group */}
            <div className="flex items-center gap-2 ml-2">
              {!isReadOnly && activeTab !== 'dashboard' && (
                <button 
                  onClick={handleOpenUploadModal} 
                  disabled={!dbConnected} 
                  className="bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2"
                >
                  <UploadCloud size={14} />
                  <span>Importar</span>
                </button>
              )}

              <div className="relative">
                <button 
                  onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
                  className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-300 transition-colors"
                >
                  <MoreHorizontal size={18} />
                </button>

                {isActionsMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsActionsMenuOpen(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Ferramentas e Ações</div>
                      
                      {activeTab !== 'dashboard' && (
                        <ActionMenuItem icon={<Download size={16} />} label="Exportar Dados" onClick={handleExportCSV} />
                      )}
                      
                      {!isReadOnly && (
                        <>
                          {(activeTab === 'projects' || activeTab === 'materials') && (
                            <ActionMenuItem 
                              icon={<Layers size={16} />} 
                              label="Edição em Lote" 
                              onClick={() => { setIsBatchEditOpen(true); setIsMaterialBatchEditOpen(true); setIsActionsMenuOpen(false); }} 
                            />
                          )}
                          {activeTab !== 'dashboard' && (
                            <>
                              <ActionMenuItem icon={<HardHat size={16} />} label="Registro de Obra" onClick={() => { setIsClientManagerOpen(true); setIsActionsMenuOpen(false); }} />
                              <ActionMenuItem icon={<CalendarDays size={16} />} label="Gerenciar Feriados" onClick={() => { setIsHolidayManagerOpen(true); setIsActionsMenuOpen(false); }} />
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dropdowns logic (Clientes/Disciplinas) relocated for better layering */}
        <div className="relative">
          {isClientFilterOpen && (
            <div className="absolute right-40 top-0 mt-2 z-50">
               {/* Client Filter Content (unchanged) */}
               <FilterDropdown 
                 title="Filtrar Clientes" 
                 onClear={() => setSelectedClients([])} 
                 items={uniqueClients} 
                 selectedItems={selectedClients} 
                 onToggle={toggleClientSelection} 
               />
            </div>
          )}
          {isDisciplineFilterOpen && (
            <div className="absolute right-20 top-0 mt-2 z-50">
               <FilterDropdown 
                 title="Filtrar Disciplinas" 
                 onClear={() => setSelectedDisciplines([])} 
                 items={Object.values(Discipline)} 
                 selectedItems={selectedDisciplines} 
                 onToggle={toggleDisciplineSelection} 
               />
            </div>
          )}
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 print:p-0 print:w-full print:max-w-none">
        <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-end print:hidden">
            <div className="w-full lg:w-auto">
               <DateRangeFilter filterType={dateFilterType} setFilterType={setDateFilterType} referenceDate={referenceDate} setReferenceDate={setReferenceDate} customRange={customRange} setCustomRange={setCustomRange} />
            </div>
        </div>

        <div className="mt-6 print:mt-0">
          {isAdmin && activeTab === 'dashboard' && <DataMigration projects={projects} materials={materials} onUpdateProject={updateProject} onUpdateMaterial={updateMaterial} />}
          {activeTab === 'dashboard' && <div className="animate-in fade-in zoom-in-95 duration-200"><Dashboard data={filteredProjects} materials={filteredMaterials} clients={clients} isDarkMode={isDarkMode} holidays={holidays} /></div>}
          {activeTab === 'timeline' && <div className="animate-in fade-in zoom-in-95 duration-200"><ProjectTimeline projects={filteredProjects} holidays={holidays} clients={clients} /></div>}
          {activeTab === 'projects' && <div className="animate-in fade-in zoom-in-95 duration-200"><ProjectList projects={filteredProjects} onUpdate={updateProject} onDelete={deleteProject} onAddRevision={addProjectRevision} onPromote={promoteProjectToExecutive} holidays={holidays} readOnly={isReadOnly} /></div>}
          {activeTab === 'materials' && <div className="animate-in fade-in zoom-in-95 duration-200"><MaterialList materials={filteredMaterials} onUpdate={updateMaterial} onDelete={deleteMaterial} onAddRevision={addMaterialRevision} readOnly={isReadOnly} /></div>}
          {activeTab === 'purchases' && showPurchasesTab && <div className="animate-in fade-in zoom-in-95 duration-200"><PurchaseList purchases={filteredPurchases} onAdd={handleAddPurchase} onUpdate={handleUpdatePurchase} onDelete={handleDeletePurchase} currentUser={currentUser ? formatUsername(currentUser.email) : ''} holidays={holidays} readOnly={isReadOnly} /></div>}
        </div>
      </main>

      {/* Hidden file input - triggered programmatically by triggerFileSelect */}
      <input
        ref={(el) => {
          (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          if (el) {
            if (isFolderUpload) {
              el.setAttribute('webkitdirectory', '');
              el.setAttribute('directory', '');
            } else {
              el.removeAttribute('webkitdirectory');
              el.removeAttribute('directory');
            }
          }
        }}
        type="file"
        className="hidden"
        multiple
        accept={importType === 'MATERIAL_LIST' ? '.xlsx,.xls' : '.dwg,.rvt,.pdf,.DWG,.RVT,.PDF'}
        onChange={handleFilesSelected}
      />

      {/* Upload Modal with Phase Selector */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all border dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">Importar Arquivos</h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Fechar Modal">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6 mb-8">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">O que você deseja importar?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setImportType('PROJECT'); setIsFolderUpload(false); }} className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${importType === 'PROJECT' ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' : 'border-slate-200 dark:border-slate-600 hover:border-brand-200 text-slate-500'}`}>
                    <List size={24} className="mb-1" /> <span className="text-sm font-medium">Projetos</span> <span className="text-[10px] opacity-70">DWG, RVT, PDF</span>
                  </button>
                  <button onClick={() => { setImportType('MATERIAL_LIST'); setIsFolderUpload(false); }} className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${importType === 'MATERIAL_LIST' ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' : 'border-slate-200 dark:border-slate-600 hover:border-brand-200 text-slate-500'}`}>
                    <FileSpreadsheet size={24} className="mb-1" /> <span className="text-sm font-medium">Listas de Materiais</span> <span className="text-[10px] opacity-70">Excel (XLSX, XLS)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Cliente Padrão (Registro de Obra) *
                </label>
                <select
                  value={uploadClient}
                  onChange={(e) => setUploadClient(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3"
                >
                  <option value="" disabled>Selecione um cliente...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.name}>{client.name}</option>
                  ))}
                </select>
                {clients.length === 0 && <p className="text-xs text-rose-500 mt-1">Nenhum cliente cadastrado. Use o botão "Registro de Obra".</p>}
              </div>

              {(importType === 'PROJECT' || importType === 'MATERIAL_LIST') && shouldShowBaseInput && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nº da Base - Localização</label>
                  <input type="text" value={uploadBase} onChange={(e) => setUploadBase(e.target.value)} placeholder="Ex: Base 01, Centro" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3" />
                </div>
              )}

              {importType === 'PROJECT' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fase do Projeto</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="projectPhase" value={ProjectPhase.PRELIMINARY} checked={uploadPhase === ProjectPhase.PRELIMINARY} onChange={() => setUploadPhase(ProjectPhase.PRELIMINARY)} className="text-brand-600 focus:ring-brand-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Preliminar / Básico</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="projectPhase" value={ProjectPhase.EXECUTIVE} checked={uploadPhase === ProjectPhase.EXECUTIVE} onChange={() => setUploadPhase(ProjectPhase.EXECUTIVE)} className="text-brand-600 focus:ring-brand-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Executivo (Padrão)</span>
                    </label>
                  </div>
                </div>
              )}

              {importType === 'PROJECT' && (
                <div className="bg-brand-50 dark:bg-slate-700/50 p-3 rounded-lg border border-brand-100 dark:border-slate-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2"><FolderInput className="text-brand-600 dark:text-brand-400" size={20} /><div><span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">Modo Pasta (Auto-Tag)</span><span className="text-xs text-slate-500 dark:text-slate-400 block">Detecta Disciplina pelo nome da pasta</span></div></div>
                    <label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={isFolderUpload} onChange={(e) => setIsFolderUpload(e.target.checked)} className="sr-only peer" aria-label="Ativar Modo Pasta" /><div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-700"></div></label>
                  </div>
                </div>
              )}

              <div className={`${(importType === 'PROJECT' && isFolderUpload) ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all`}>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Disciplina Padrão {importType === 'PROJECT' && isFolderUpload && '(Usada se a detecção falhar)'} {importType === 'MATERIAL_LIST' && '(Será tentada a detecção pelo nome do arquivo)'}</label>
                <div className="relative">
                  <select value={uploadDiscipline} onChange={(e) => setUploadDiscipline(e.target.value as Discipline)} className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3 pr-8">
                    {Object.values(Discipline).map((d) => (<option key={d} value={d}>{d}</option>))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg></div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button onClick={() => setIsUploadModalOpen(false)} className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors">Cancelar</button>
              <button onClick={triggerFileSelect} className="px-6 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-md transition-all flex items-center">Selecionar Arquivos {importType === 'MATERIAL_LIST' && 'Excel'}</button>
            </div>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Download className="text-brand-600 dark:text-brand-400" size={20} />
                Exportar Dados
              </h3>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Fechar Modal">
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Selecione qual base de dados deseja exportar para CSV. Os dados serão filtrados conforme a visualização atual.
            </p>

            <div className="space-y-3">
              <button onClick={() => handleConfirmExport('PROJECTS')} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg group transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 p-2 rounded-lg">
                    <List size={20} />
                  </div>
                  <div className="text-left">
                    <span className="block font-semibold text-slate-800 dark:text-slate-200">Projetos</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Controle de Arquivos</span>
                  </div>
                </div>
                <Download size={18} className="text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors" />
              </button>

              <button onClick={() => handleConfirmExport('MATERIALS')} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg group transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 p-2 rounded-lg">
                    <Package size={20} />
                  </div>
                  <div className="text-left">
                    <span className="block font-semibold text-slate-800 dark:text-slate-200">Lista de Materiais</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Controle de Listas</span>
                  </div>
                </div>
                <Download size={18} className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </button>

              {showPurchasesTab && (
                <button onClick={() => handleConfirmExport('PURCHASES')} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg group transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-2 rounded-lg">
                      <ShoppingCart size={20} />
                    </div>
                    <div className="text-left">
                      <span className="block font-semibold text-slate-800 dark:text-slate-200">Compras</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Solicitações e Entregas</span>
                    </div>
                  </div>
                  <Download size={18} className="text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                </button>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsExportModalOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isFilterModalOpen && (
        <AdvancedFilter
          clients={clients}
          currentFilter={projectFilter}
          onApplyFilter={setProjectFilter}
          onClose={() => setIsFilterModalOpen(false)}
        />
      )}

      {isBatchEditOpen && (
        <BatchEditModal projects={filteredProjects} onClose={() => setIsBatchEditOpen(false)} onApply={handleBatchUpdate} onWorkflow={handleBatchWorkflow} holidays={holidays} />
      )}

      {isMaterialBatchEditOpen && (
        <MaterialBatchEditModal materials={filteredMaterials} onClose={() => setIsMaterialBatchEditOpen(false)} onApply={handleMaterialBatchUpdate} onWorkflow={handleMaterialBatchWorkflow} />
      )}

      {isHolidayManagerOpen && (
        <HolidayManagerModal holidays={holidays} onUpdateHolidays={handleUpdateHolidays} onClose={() => setIsHolidayManagerOpen(false)} />
      )}

      {isClientManagerOpen && (
        <ClientManagerModal
          clients={clients}
          onAddClient={handleAddClient}
          onUpdateClient={handleUpdateClient}
          onDeleteClient={handleDeleteClient}
          onClose={() => setIsClientManagerOpen(false)}
        />
      )}

      {isLoginModalOpen && (
        <LoginModal onClose={() => setIsLoginModalOpen(false)} onLoginSuccess={() => setIsLoginModalOpen(false)} />
      )}
    </div>
  );
}

// --- Sub-componentes do Header (Redesign) ---

function NavTab({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick} 
      className={`h-full px-4 flex items-center gap-2 text-xs font-bold transition-all relative ${
        active ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-500 rounded-t-full"></div>}
    </button>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1 text-[11px] font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
        active ? 'text-brand-700 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function ActionMenuItem({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
    >
      <span className="text-slate-400">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function FilterDropdown({ title, onClear, items, selectedItems, onToggle }: { 
  title: string, onClear: () => void, items: string[], selectedItems: string[], onToggle: (item: string) => void 
}) {
  return (
    <div className="w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
      <div className="px-3 pb-2 mb-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{title}</span>
        <button onClick={onClear} className="text-[10px] text-brand-600 dark:text-brand-400 font-bold hover:underline">Limpar</button>
      </div>
      <div className="max-h-60 overflow-y-auto custom-scrollbar px-1">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-slate-400 text-center italic">Nenhum item disponível</div>
        ) : (
          items.map(item => {
            const isSelected = selectedItems.includes(item);
            return (
              <button
                key={item}
                onClick={() => onToggle(item)}
                className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors ${
                  isSelected ? 'text-brand-700 dark:text-brand-300 font-bold bg-brand-50/50 dark:bg-brand-900/20' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {isSelected ? <CheckSquare size={14} className="text-brand-600 dark:text-brand-400" /> : <Square size={14} className="text-slate-300 dark:text-slate-500" />}
                <span className="truncate">{item}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
