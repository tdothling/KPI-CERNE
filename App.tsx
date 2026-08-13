import React, { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import {
  ProjectFile,
  Discipline,
  Status,
  SiteType,
  ProjectFilterState,
  ProjectPhase,
  Period,
} from './types';
import { BatchEditModal } from './components/BatchEditModal';
import { HolidayManagerModal } from './components/HolidayManagerModal';
import { TrashModal } from './components/TrashModal';
import { DateRangeFilter } from './components/DateRangeFilter';
import { LoginModal } from './components/LoginModal';
import { AdvancedFilter } from './components/AdvancedFilter';
import { DataMigration } from './components/DataMigration';
import { ImportReviewModal, StagingRow } from './components/ImportReviewModal';
import { CerneLogo } from './components/CerneLogo';
import { NavTab, FilterButton, ActionMenuItem, FilterDropdown } from './components/AppNav';
import { UploadModal } from './components/UploadModal';
import { ExportModal } from './components/ExportModal';
import {
  UploadCloud,
  Filter,
  Layers,
  Moon,
  Sun,
  LayoutDashboard,
  Calendar,
  List,
  CalendarDays,
  Download,
  Database,
  LogIn,
  LogOut,
  Truck,
  HardHat,
  Search,
  ChevronDown,
  MoreHorizontal,
  BookOpen,
  FolderKanban,
  Trash2,
  Route,
  Building2,
  Factory,
} from 'lucide-react';

// Code-splitting por aba: cada tela pesada vira um chunk próprio (o Dashboard carrega
// o recharts, por exemplo) e só é baixada quando o usuário abre a aba correspondente.
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const CanteiroPage = lazy(() =>
  import('./components/canteiro/CanteiroPage').then((m) => ({ default: m.CanteiroPage })),
);
const ProjectTimeline = lazy(() =>
  import('./components/ProjectTimeline').then((m) => ({ default: m.ProjectTimeline })),
);
const ObrasPage = lazy(() =>
  import('./components/ObrasPage').then((m) => ({ default: m.ObrasPage })),
);
const SupplyPage = lazy(() =>
  import('./components/supply/SupplyPage').then((m) => ({ default: m.SupplyPage })),
);
const CatalogoPage = lazy(() =>
  import('./components/portfolio/CatalogoPage').then((m) => ({ default: m.CatalogoPage })),
);
const CarteiraPage = lazy(() =>
  import('./components/portfolio/CarteiraPage').then((m) => ({ default: m.CarteiraPage })),
);
const AcoPage = lazy(() => import('./components/aco/AcoPage').then((m) => ({ default: m.AcoPage })));

const TabLoading = () => (
  <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
    <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-600 border-t-transparent mr-3"></div>
    Carregando...
  </div>
);
import { format } from 'date-fns';
import { logoutUser, formatUsername } from './services/auth';
import { detectDiscipline, validateFile } from './utils';
import { useAppData } from './hooks/useAppData';
import { useAppFilters } from './hooks/useAppFilters';
import { addProject } from './services/db';
import { portfolioToProjectFiles } from './domain/portfolio';
import { totalKg } from './domain/steel';

type Tab =
  | 'dashboard'
  | 'timeline'
  | 'obras'
  | 'projects'
  | 'catalogo'
  | 'carteira'
  | 'suprimentos'
  | 'estruturas';
type EntryMode = 'FILES' | 'PASTE';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [projectFilter, setProjectFilter] = useState<ProjectFilterState>({
    clients: [],
    disciplines: [],
    isActive: false,
  });

  const {
    projects,
    supplyOrders,
    clients,
    holidays,
    dbConnected,
    currentUser,
    trashItems,
    handleRestoreTrash,
    handlePurgeTrash,
    updateProject,
    deleteProject,
    addProjectRevision,
    promoteProjectToExecutive,
    referencias,
    conjuntos,
    pranchas,
    handleAddReferencia,
    handleAddReferencias,
    handleDeleteReferencias,
    handleUpdateReferencia,
    handleDeleteReferencia,
    handleMoveReferencia,
    handleMoveReferenciasLote,
    handleInstanciar,
    handleInstanciarLote,
    handleDeleteConjunto,
    handleMovePrancha,
    handleMovePranchasLote,
    handleAbrirRevisaoPrancha,
    handleUpdatePrancha,
    handleAddPrancha,
    handleDeletePrancha,
    handleMigratePortfolio,
    handleAddSupplyOrder,
    handleUpdateSupplyOrder,
    handleDeleteSupplyOrder,
    handleMoveSupplyStatus,
    handleToggleSupplyItem,
    handleMigrateLegacyPurchases,
    handleAddClient,
    handleUpdateClient,
    handleDeleteClient,
    handleBatchUpdate,
    handleBatchWorkflow,
    handleUpdateHolidays,
    countLegacyDisciplines,
    handleUnificarDisciplinaEstruturaCobertura,
    steelRecords,
    handleAddSteelRecord,
    handleUpdateSteelRecord,
    handleReviseSteelRecord,
    handleDeleteSteelRecord,
  } = useAppData(projectFilter);

  // Obras de RODOVIA usam o fluxo Catálogo/Carteira (Referência → Conjunto → Prancha).
  // Canteiros e bases operacionais seguem o fluxo atual de arquivos (aba Projetos).
  const rodoviaClients = useMemo(
    () => clients.filter((c) => c.type === SiteType.HIGHWAY),
    [clients],
  );
  const rodoviaNames = useMemo(
    () => new Set(rodoviaClients.map((c) => c.name.trim().toLowerCase())),
    [rodoviaClients],
  );
  const isRodoviaProject = (client: string) =>
    rodoviaNames.has((client || '').trim().toLowerCase());

  // As abas legadas (Indicadores/Cronograma/Projetos/CSV) não mostram projetos de
  // obras de rodovia: após a migração eles vivem na Carteira e apareceriam em dobro.
  const legacyProjects = useMemo(
    () => projects.filter((p) => !isRodoviaProject(p.client)),
    [projects, rodoviaNames],
  );

  // Projetos de rodovia ainda não migrados. Uma família (groupId) é considerada
  // migrada se QUALQUER doc dela virou referência/prancha/conjunto. Enquanto a
  // migração não acontece, esses docs continuam nos Indicadores (decisão do
  // usuário: sem perda de informação) — via canal somente-leitura do Dashboard,
  // nunca em dobro com a projeção da carteira.
  const unmigratedRodoviaProjects = useMemo(() => {
    const rodoviaProjects = projects.filter((p) => isRodoviaProject(p.client));
    if (rodoviaProjects.length === 0) return [] as ProjectFile[];
    const migratedIds = new Set<string>();
    referencias.forEach((r) => r.legacy?.originalId && migratedIds.add(r.legacy.originalId));
    pranchas.forEach((p) => p.legacy?.originalId && migratedIds.add(p.legacy.originalId));
    conjuntos.forEach((c) => c.legacy?.originalId && migratedIds.add(c.legacy.originalId));
    const families = new Map<string, ProjectFile[]>();
    rodoviaProjects.forEach((p) => {
      const key = p.groupId || p.id;
      if (!families.has(key)) families.set(key, []);
      families.get(key)!.push(p);
    });
    const pending: ProjectFile[] = [];
    families.forEach((fam) => {
      if (!fam.some((p) => migratedIds.has(p.id))) pending.push(...fam);
    });
    return pending;
  }, [projects, rodoviaNames, referencias, conjuntos, pranchas]);

  // Banner de migração pendente na Carteira
  const legacyPendingCount = unmigratedRodoviaProjects.length;

  // Projeção da Carteira/Catálogo como ProjectFile SOMENTE-LEITURA: alimenta os
  // Indicadores (OTD, IAPR, tempos, WIP, alertas) sem duplicar a lógica dos KPIs.
  // Nunca entra na Edição em Lote nem no export de Projetos (IDs são sintéticos).
  const portfolioProjects = useMemo(
    () => portfolioToProjectFiles(referencias, conjuntos, pranchas),
    [referencias, conjuntos, pranchas],
  );

  // Canal extra dos Indicadores: projeção da carteira + rodovia ainda não migrada.
  // Recebe os mesmos filtros e alimenta APENAS o Dashboard (não entra na aba
  // Projetos, na Edição em Lote, no export CSV nem no Cronograma).
  const dashboardOnlyProjects = useMemo(
    () => [...portfolioProjects, ...unmigratedRodoviaProjects],
    [portfolioProjects, unmigratedRodoviaProjects],
  );

  const {
    selectedClients,
    setSelectedClients,
    toggleClientSelection,
    selectedDisciplines,
    setSelectedDisciplines,
    toggleDisciplineSelection,
    dateFilterType,
    setDateFilterType,
    referenceDate,
    setReferenceDate,
    customRange,
    setCustomRange,
    filteredProjects,
    filteredPortfolioProjects,
    filteredSupplyOrders,
    dateFilteredProjects,
    dateFilteredPortfolioProjects,
    uniqueClients,
  } = useAppFilters(legacyProjects, supplyOrders, clients, dashboardOnlyProjects);

  // Indicadores enxergam projetos legados + carteira + rodovia não migrada, já filtrados
  const dashboardData = useMemo(
    () => [...filteredProjects, ...filteredPortfolioProjects],
    [filteredProjects, filteredPortfolioProjects],
  );

  // Cronograma cobre TODOS os projetos: canteiro/bases + carteira de rodovia
  // (projeção somente-leitura) + rodovia não migrada, na mesma janela de data
  const timelineData = useMemo(
    () => [...dateFilteredProjects, ...dateFilteredPortfolioProjects],
    [dateFilteredProjects, dateFilteredPortfolioProjects],
  );

  // O filtro antigo (Clientes/Disciplinas/Lupa) vive APENAS nos Indicadores. As demais
  // abas são navegadas por obra (cards) — recebem os dados sem esse filtro global.

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isClientFilterOpen, setIsClientFilterOpen] = useState(false);
  const [isDisciplineFilterOpen, setIsDisciplineFilterOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  const [uploadDiscipline, setUploadDiscipline] = useState<Discipline>(Discipline.ARCHITECTURE);
  const [uploadPhase, setUploadPhase] = useState<ProjectPhase>(ProjectPhase.PRELIMINARY);
  const [uploadClient, setUploadClient] = useState<string>('');
  const [uploadBase, setUploadBase] = useState<string>('');
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>('FILES');
  const [pasteText, setPasteText] = useState('');
  const [stagingRows, setStagingRows] = useState<StagingRow[] | null>(null);
  const [stagingContext, setStagingContext] = useState<{ client: string; base: string }>({
    client: '',
    base: '',
  });
  const [stagingSaving, setStagingSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Todos os usuários têm acesso total às ferramentas e ações.
  // A migração de dados antigos (banner na aba Suprimentos) continua restrita ao admin.
  const isAdmin = true;
  const isReadOnly = false;
  const isMigrationAdmin = !!currentUser?.email?.startsWith('thiago.dothling');

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

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
    return clients.find((c) => c.name === uploadClient);
  })();

  const shouldShowBaseInput =
    !selectedUploadClientDoc || selectedUploadClientDoc.type === SiteType.OPERATIONAL_BASE;

  const handleOpenUploadModal = () => {
    setIsUploadModalOpen(true);
    setUploadDiscipline(Discipline.ARCHITECTURE);
    setUploadClient('');
    setUploadBase('');
    setUploadPhase(ProjectPhase.PRELIMINARY);
    setIsFolderUpload(false);
    setEntryMode('FILES');
    setPasteText('');
  };

  const triggerFileSelect = () => {
    if (!uploadClient.trim()) {
      alert('Por favor, selecione um Cliente (Registro de Obra).');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const finalClientName = uploadClient.trim();
    const clientDoc = clients.find((c) => c.name === finalClientName);

    let finalBaseName = 'Geral';
    if (clientDoc && clientDoc.type === SiteType.OPERATIONAL_BASE) {
      finalBaseName = uploadBase.trim() || 'Geral';
    }

    const validFiles = Array.from(files).filter(validateFile);

    if (validFiles.length < files.length) {
      alert(
        `${files.length - validFiles.length} arquivos foram ignorados por terem extensões não permitidas.`,
      );
    }

    if (validFiles.length === 0) {
      event.target.value = '';
      return;
    }

    const currentHour = new Date().getHours();
    const autoPeriod: Period = currentHour < 12 ? 'MANHA' : 'TARDE';

    // Nada é salvo aqui: monta as linhas e abre a etapa de conferência
    const today = new Date().toISOString().split('T')[0];
    const rows: StagingRow[] = validFiles.map((f: any) => {
      let discipline = detectDiscipline(f.name) || uploadDiscipline;
      if (isFolderUpload && f.webkitRelativePath) {
        const detected = detectDiscipline(f.webkitRelativePath);
        if (detected) discipline = detected;
      }
      return {
        tempId: crypto.randomUUID(),
        filename: f.name.replace(/\.[^/.]+$/, ''),
        discipline,
        phase: uploadPhase,
        startDate: today,
        startPeriod: autoPeriod,
      };
    });
    setIsUploadModalOpen(false);
    setStagingContext({ client: finalClientName, base: finalBaseName });
    setStagingRows(rows);
    event.target.value = '';
  };

  // Cadastro por lista colada (sem arquivos físicos): um nome por linha
  const handlePasteReview = () => {
    if (!uploadClient.trim()) {
      alert('Por favor, selecione um Cliente (Registro de Obra).');
      return;
    }
    const names = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (names.length === 0) {
      alert('Cole ao menos um nome de projeto (um por linha).');
      return;
    }

    const finalClientName = uploadClient.trim();
    const clientDoc = clients.find((c) => c.name === finalClientName);
    let finalBaseName = 'Geral';
    if (clientDoc && clientDoc.type === SiteType.OPERATIONAL_BASE) {
      finalBaseName = uploadBase.trim() || 'Geral';
    }

    const today = new Date().toISOString().split('T')[0];
    const autoPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';

    const rows: StagingRow[] = names.map((name) => ({
      tempId: crypto.randomUUID(),
      filename: name.replace(/\.[^/.]+$/, ''),
      discipline: detectDiscipline(name) || uploadDiscipline,
      phase: uploadPhase,
      startDate: today,
      startPeriod: autoPeriod,
    }));

    setIsUploadModalOpen(false);
    setStagingContext({ client: finalClientName, base: finalBaseName });
    setStagingRows(rows);
    setPasteText('');
  };

  // Grava os projetos conferidos na etapa de revisão
  const handleConfirmStaging = async () => {
    if (!stagingRows || stagingRows.length === 0) return;
    setStagingSaving(true);
    try {
      await Promise.all(
        stagingRows.map((row) =>
          addProject({
            filename: row.filename.trim(),
            groupId: crypto.randomUUID(),
            revision: 0,
            client: stagingContext.client,
            base: stagingContext.base,
            discipline: row.discipline,
            phase: row.phase,
            status: Status.IN_PROGRESS,
            startDate: row.startDate,
            startPeriod: row.startPeriod,
            endDate: '',
            sendDate: '',
            feedbackDate: '',
            blockedDays: 0,
            revisions: [],
          }),
        ),
      );
      setStagingRows(null);
      setActiveTab('projects');
    } catch (error) {
      console.error('Erro ao cadastrar projetos:', error);
      alert(
        'Ocorreu um erro ao salvar os projetos. Verifique sua conexão e permissões. Nenhuma linha foi perdida — tente confirmar novamente.',
      );
    } finally {
      setStagingSaving(false);
    }
  };

  const handleExportCSV = () => setIsExportModalOpen(true);

  const handleConfirmExport = (type: 'PROJECTS' | 'SUPPLIES') => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = '';

    if (type === 'PROJECTS') {
      headers = [
        'Nome do Arquivo',
        'Cliente',
        'Base',
        'Disciplina',
        'Fase',
        'Status',
        'Data Inicio',
        'Data Fim',
        'Data Envio',
        'Data Feedback',
        'Dias Bloqueados',
      ];
      rows = filteredProjects.map((p) => [
        p.filename,
        p.client,
        p.base || '',
        p.discipline,
        p.phase || 'Executivo',
        p.status,
        p.startDate,
        p.endDate,
        p.sendDate,
        p.feedbackDate,
        p.blockedDays,
      ]);
      filename = 'Projetos';
    } else if (type === 'SUPPLIES') {
      // Itens achatados: uma linha por item do pedido
      headers = [
        'Pedido',
        'Cliente',
        'Base',
        'Aplicacao',
        'Disciplina',
        'Solicitante',
        'Prioridade',
        'Status',
        'Data Criacao',
        'Necessario Ate',
        'Lista Pronta',
        'Em Cotacao',
        'Comprado',
        'Entregue',
        'Item',
        'Qtd',
        'Unidade',
        'Item Entregue',
        'Item Entregue Em',
      ];
      rows = filteredSupplyOrders.flatMap((o) => {
        const orderCols = [
          o.title,
          o.client,
          o.base || '',
          o.application || '',
          o.discipline || '',
          o.requester || '',
          o.priority || 'NORMAL',
          o.status,
          o.createdAt || '',
          o.neededBy || '',
          o.milestones?.readyAt || '',
          o.milestones?.quotingAt || '',
          o.milestones?.boughtAt || '',
          o.milestones?.deliveredAt || '',
        ];
        if (!o.items || o.items.length === 0) return [[...orderCols, '', '', '', '', '']];
        return o.items.map((item) => [
          ...orderCols,
          item.description,
          item.quantity,
          item.unit,
          item.delivered ? 'Sim' : 'Nao',
          item.deliveredAt || '',
        ]);
      });
      filename = 'Suprimentos';
    }

    const csvContent = [
      headers.join(';'),
      ...rows.map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(';')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setIsExportModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-200 print:bg-white print:pb-0 print:h-auto print:min-h-0 print:overflow-visible">
      {(isClientFilterOpen || isDisciplineFilterOpen) && (
        <div
          className="fixed inset-0 z-40 bg-transparent print:hidden"
          onClick={() => {
            setIsClientFilterOpen(false);
            setIsDisciplineFilterOpen(false);
          }}
        ></div>
      )}

      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 transition-colors duration-200 print:hidden">
        {/* Layer 1: Global Top Bar */}
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-3">
              <CerneLogo />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest border-l border-slate-200 dark:border-slate-700 pl-3 hidden sm:inline">
                KPI Tracker
              </span>
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
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                      {formatUsername(currentUser.email)}
                    </span>
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-tighter">
                      Online
                    </span>
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
          <nav
            className="flex space-x-1 h-full items-center overflow-x-auto custom-scrollbar flex-1 min-w-0 pr-4"
            aria-label="Tabs"
          >
            <NavTab
              active={activeTab === 'dashboard'}
              onClick={() => setActiveTab('dashboard')}
              icon={<LayoutDashboard size={16} className="min-w-[16px]" />}
              label="Indicadores"
            />
            <NavTab
              active={activeTab === 'timeline'}
              onClick={() => setActiveTab('timeline')}
              icon={<Calendar size={16} className="min-w-[16px]" />}
              label="Cronograma"
            />
            <NavTab
              active={activeTab === 'obras'}
              onClick={() => setActiveTab('obras')}
              icon={<HardHat size={16} className="min-w-[16px]" />}
              label="Obras"
            />
            {/* Grupo destacado: obras de CANTEIRO/BASES (ciclo completo dentro da própria aba) */}
            <div className="flex items-center h-9 my-auto mx-1 rounded-lg border border-emerald-300/70 dark:border-emerald-700/50 bg-emerald-50/70 dark:bg-emerald-900/15 flex-shrink-0 overflow-hidden">
              <span
                className="self-stretch flex items-center gap-1 pl-2.5 pr-2 text-[9px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-500 bg-emerald-100/70 dark:bg-emerald-900/25 border-r border-emerald-200/70 dark:border-emerald-800/40"
                title="Aba exclusiva de canteiros e bases operacionais"
              >
                <Building2 size={11} className="min-w-[11px]" /> Canteiros
              </span>
              <NavTab
                active={activeTab === 'projects'}
                onClick={() => setActiveTab('projects')}
                icon={<List size={16} className="min-w-[16px]" />}
                label="Canteiro de Obras"
              />
            </div>
            {/* Grupo destacado: fluxo exclusivo de OBRAS DE RODOVIA (referência → replicação por base) */}
            <div className="flex items-center h-9 my-auto mx-1 rounded-lg border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-900/15 flex-shrink-0 overflow-hidden">
              <span
                className="self-stretch flex items-center gap-1 pl-2.5 pr-2 text-[9px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-500 bg-amber-100/70 dark:bg-amber-900/25 border-r border-amber-200/70 dark:border-amber-800/40"
                title="Abas exclusivas de obras de rodovia"
              >
                <Route size={11} className="min-w-[11px]" /> Rodovias
              </span>
              <NavTab
                active={activeTab === 'catalogo'}
                onClick={() => setActiveTab('catalogo')}
                icon={<BookOpen size={16} className="min-w-[16px]" />}
                label="Projetos Referências"
              />
              <NavTab
                active={activeTab === 'carteira'}
                onClick={() => setActiveTab('carteira')}
                icon={<FolderKanban size={16} className="min-w-[16px]" />}
                label="Projetos Locais"
              />
            </div>
            <NavTab
              active={activeTab === 'suprimentos'}
              onClick={() => setActiveTab('suprimentos')}
              icon={<Truck size={16} className="min-w-[16px]" />}
              label="Suprimentos"
            />
            <NavTab
              active={activeTab === 'estruturas'}
              onClick={() => setActiveTab('estruturas')}
              icon={<Factory size={16} className="min-w-[16px]" />}
              label="Estruturas"
            />
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0 pl-2">
            {/* Filtro antigo (Clientes/Disciplinas/Lupa): só nos Indicadores — nas demais
                abas a navegação é por obra (cards), então este grupo some para não conflitar. */}
            {activeTab === 'dashboard' && (
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 overflow-hidden">
                <FilterButton
                  active={selectedClients.length > 0}
                  onClick={() => {
                    setIsClientFilterOpen(!isClientFilterOpen);
                    setIsDisciplineFilterOpen(false);
                  }}
                >
                  <Filter size={14} />
                  <span className="max-w-[80px] truncate">
                    {selectedClients.length === 0 ? 'Clientes' : `${selectedClients.length}`}
                  </span>
                  <ChevronDown size={12} className="opacity-40" />
                </FilterButton>

                <div className="w-px h-6 bg-slate-100 dark:bg-slate-700 mx-0.5"></div>

                <FilterButton
                  active={selectedDisciplines.length > 0}
                  onClick={() => {
                    setIsDisciplineFilterOpen(!isDisciplineFilterOpen);
                    setIsClientFilterOpen(false);
                  }}
                >
                  <Layers size={14} />
                  <span className="max-w-[80px] truncate">
                    {selectedDisciplines.length === 0
                      ? 'Disciplinas'
                      : `${selectedDisciplines.length}`}
                  </span>
                  <ChevronDown size={12} className="opacity-40" />
                </FilterButton>

                <div className="w-px h-6 bg-slate-100 dark:bg-slate-700 mx-0.5"></div>

                <button
                  onClick={() => setIsFilterModalOpen(true)}
                  className={`p-1.5 rounded transition-all hover:bg-slate-100 dark:hover:bg-slate-700 ${projectFilter.isActive ? 'text-brand-600' : 'text-slate-400'}`}
                >
                  <Search size={14} />
                </button>
              </div>
            )}

            {/* Actions Group */}
            <div className="flex items-center gap-2 ml-2">
              {!isReadOnly && (activeTab === 'projects' || activeTab === 'timeline') && (
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
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsActionsMenuOpen(false)}
                    ></div>
                    <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        Ferramentas e Ações
                      </div>

                      {activeTab !== 'dashboard' && (
                        <ActionMenuItem
                          icon={<Download size={16} />}
                          label="Exportar Dados"
                          onClick={handleExportCSV}
                        />
                      )}

                      {/* Lixeira: disponível em TODAS as abas — restaura qualquer exclusão */}
                      <ActionMenuItem
                        icon={<Trash2 size={16} />}
                        label={`Lixeira${trashItems.length > 0 ? ` (${trashItems.length})` : ''}`}
                        onClick={() => {
                          setIsTrashOpen(true);
                          setIsActionsMenuOpen(false);
                        }}
                      />

                      {!isReadOnly && (
                        <>
                          {activeTab === 'projects' && (
                            <ActionMenuItem
                              icon={<Layers size={16} />}
                              label="Edição em Lote (Canteiro)"
                              onClick={() => {
                                setIsBatchEditOpen(true);
                                setIsActionsMenuOpen(false);
                              }}
                            />
                          )}
                          {activeTab !== 'dashboard' && (
                            <>
                              <ActionMenuItem
                                icon={<HardHat size={16} />}
                                label="Controle de Obras"
                                onClick={() => {
                                  setActiveTab('obras');
                                  setIsActionsMenuOpen(false);
                                }}
                              />
                              <ActionMenuItem
                                icon={<CalendarDays size={16} />}
                                label="Gerenciar Feriados"
                                onClick={() => {
                                  setIsHolidayManagerOpen(true);
                                  setIsActionsMenuOpen(false);
                                }}
                              />
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
          {activeTab === 'dashboard' && isClientFilterOpen && (
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
          {activeTab === 'dashboard' && isDisciplineFilterOpen && (
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
        {/* Janela de data: Indicadores (analítico) e Cronograma (linha do tempo). As
            abas operacionais são navegadas por obra, sem esse recorte temporal global. */}
        {(activeTab === 'dashboard' || activeTab === 'timeline') && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-end print:hidden">
            <div className="w-full lg:w-auto">
              <DateRangeFilter
                filterType={dateFilterType}
                setFilterType={setDateFilterType}
                referenceDate={referenceDate}
                setReferenceDate={setReferenceDate}
                customRange={customRange}
                setCustomRange={setCustomRange}
              />
            </div>
          </div>
        )}

        <div className="mt-6 print:mt-0">
          <Suspense fallback={<TabLoading />}>
            {isAdmin && activeTab === 'dashboard' && (
              <DataMigration
                projects={projects}
                onUpdateProject={updateProject}
                legacyDisciplinesCount={countLegacyDisciplines()}
                onUnificarDisciplinaEstruturaCobertura={handleUnificarDisciplinaEstruturaCobertura}
              />
            )}
            {activeTab === 'dashboard' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <Dashboard
                  data={dashboardData}
                  clients={clients}
                  isDarkMode={isDarkMode}
                  holidays={holidays}
                />
              </div>
            )}
            {activeTab === 'timeline' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <ProjectTimeline projects={timelineData} holidays={holidays} clients={clients} />
              </div>
            )}
            {activeTab === 'obras' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <ObrasPage
                  clients={clients}
                  projectCount={(name) => projects.filter((p) => p.client === name).length}
                  steelSummary={(name) => {
                    const recs = steelRecords.filter((r) => r.client === name);
                    if (recs.length === 0) return null;
                    return { count: recs.length, kg: recs.reduce((s, r) => s + totalKg(r), 0) };
                  }}
                  onAddClient={handleAddClient}
                  onUpdateClient={handleUpdateClient}
                  onDeleteClient={handleDeleteClient}
                />
              </div>
            )}
            {activeTab === 'projects' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <CanteiroPage
                  projects={legacyProjects}
                  clients={clients}
                  onAdd={addProject}
                  onUpdate={updateProject}
                  onDelete={deleteProject}
                  onAddRevision={addProjectRevision}
                  onPromote={promoteProjectToExecutive}
                  holidays={holidays}
                  readOnly={isReadOnly}
                />
              </div>
            )}
            {activeTab === 'catalogo' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <CatalogoPage
                  referencias={referencias}
                  conjuntos={conjuntos}
                  clients={rodoviaClients}
                  holidays={holidays}
                  readOnly={isReadOnly}
                  onAdd={handleAddReferencia}
                  onUpdate={handleUpdateReferencia}
                  onDelete={handleDeleteReferencia}
                  onMove={handleMoveReferencia}
                  onMoveLote={handleMoveReferenciasLote}
                  onInstanciar={handleInstanciar}
                  onInstanciarLote={handleInstanciarLote}
                  onAddMany={handleAddReferencias}
                  onDeleteMany={handleDeleteReferencias}
                />
              </div>
            )}
            {activeTab === 'carteira' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <CarteiraPage
                  referencias={referencias}
                  conjuntos={conjuntos}
                  pranchas={pranchas}
                  clients={rodoviaClients}
                  holidays={holidays}
                  readOnly={isReadOnly}
                  legacyPendingCount={legacyPendingCount}
                  isMigrationAdmin={isMigrationAdmin}
                  onMigrate={handleMigratePortfolio}
                  onMovePrancha={handleMovePrancha}
                  onMovePranchasLote={handleMovePranchasLote}
                  onAbrirRevisaoPrancha={handleAbrirRevisaoPrancha}
                  onUpdatePrancha={handleUpdatePrancha}
                  onAddPrancha={handleAddPrancha}
                  onDeletePrancha={handleDeletePrancha}
                  onDeleteConjunto={handleDeleteConjunto}
                />
              </div>
            )}
            {activeTab === 'suprimentos' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <SupplyPage
                  orders={supplyOrders}
                  clients={clients}
                  holidays={holidays}
                  currentUser={currentUser ? formatUsername(currentUser.email) : ''}
                  isAdmin={isMigrationAdmin}
                  readOnly={isReadOnly}
                  onAdd={handleAddSupplyOrder}
                  onUpdate={handleUpdateSupplyOrder}
                  onDelete={handleDeleteSupplyOrder}
                  onMoveStatus={handleMoveSupplyStatus}
                  onToggleItem={handleToggleSupplyItem}
                  onMigrateLegacy={handleMigrateLegacyPurchases}
                />
              </div>
            )}
            {activeTab === 'estruturas' && (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <AcoPage
                  clients={clients}
                  steelRecords={steelRecords}
                  isDarkMode={isDarkMode}
                  readOnly={isReadOnly}
                  onAdd={handleAddSteelRecord}
                  onUpdate={handleUpdateSteelRecord}
                  onRevise={handleReviseSteelRecord}
                  onDelete={handleDeleteSteelRecord}
                />
              </div>
            )}
          </Suspense>
        </div>
      </main>

      {/* Hidden file input - triggered programmatically by triggerFileSelect.
          Os atributos webkitdirectory/directory são controlados pelo useEffect de isFolderUpload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".dwg,.rvt,.pdf,.DWG,.RVT,.PDF"
        onChange={handleFilesSelected}
      />

      {/* Upload Modal with Phase Selector */}
      {isUploadModalOpen && (
        <UploadModal
          clients={clients}
          rodoviaClients={rodoviaClients}
          uploadClient={uploadClient}
          onUploadClientChange={setUploadClient}
          shouldShowBaseInput={shouldShowBaseInput}
          uploadBase={uploadBase}
          onUploadBaseChange={setUploadBase}
          uploadPhase={uploadPhase}
          onUploadPhaseChange={setUploadPhase}
          entryMode={entryMode}
          onEntryModeChange={setEntryMode}
          pasteText={pasteText}
          onPasteTextChange={setPasteText}
          isFolderUpload={isFolderUpload}
          onFolderUploadChange={setIsFolderUpload}
          uploadDiscipline={uploadDiscipline}
          onUploadDisciplineChange={setUploadDiscipline}
          onClose={() => setIsUploadModalOpen(false)}
          onPasteReview={handlePasteReview}
          onTriggerFileSelect={triggerFileSelect}
        />
      )}

      {stagingRows && (
        <ImportReviewModal
          rows={stagingRows}
          client={stagingContext.client}
          base={stagingContext.base}
          saving={stagingSaving}
          onChangeRows={setStagingRows}
          onConfirm={handleConfirmStaging}
          onCancel={() => {
            if (!stagingSaving) setStagingRows(null);
          }}
        />
      )}

      {isExportModalOpen && (
        <ExportModal
          onClose={() => setIsExportModalOpen(false)}
          onConfirmExport={handleConfirmExport}
        />
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
        <BatchEditModal
          projects={filteredProjects}
          onClose={() => setIsBatchEditOpen(false)}
          onApplyPatches={handleBatchUpdate}
          onWorkflow={handleBatchWorkflow}
          holidays={holidays}
        />
      )}

      {isHolidayManagerOpen && (
        <HolidayManagerModal
          holidays={holidays}
          onUpdateHolidays={handleUpdateHolidays}
          onClose={() => setIsHolidayManagerOpen(false)}
        />
      )}

      {isTrashOpen && (
        <TrashModal
          items={trashItems}
          onRestore={handleRestoreTrash}
          onPurge={handlePurgeTrash}
          onClose={() => setIsTrashOpen(false)}
          readOnly={isReadOnly}
        />
      )}

      {isLoginModalOpen && (
        <LoginModal
          onClose={() => setIsLoginModalOpen(false)}
          onLoginSuccess={() => setIsLoginModalOpen(false)}
        />
      )}
    </div>
  );
}
