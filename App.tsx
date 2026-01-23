import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProjectFile, Discipline, Status, RevisionReason, DateFilterType, MaterialDoc, PurchaseDoc, ClientDoc, SiteType } from './types';
import { Dashboard } from './components/Dashboard';
import { ProjectList } from './components/ProjectList';
import { ProjectTimeline } from './components/ProjectTimeline';
import { BatchEditModal } from './components/BatchEditModal';
import { HolidayManagerModal } from './components/HolidayManagerModal';
import { ClientManagerModal } from './components/ClientManagerModal';
import { DateRangeFilter } from './components/DateRangeFilter';
import { MaterialList } from './components/MaterialList';
import { PurchaseList } from './components/PurchaseList';
import { LoginModal } from './components/LoginModal'; 
import { AdminLogs } from './components/AdminLogs';
import { UploadCloud, Filter, X, Layers, FolderInput, Moon, Sun, LayoutDashboard, Calendar, List, CalendarDays, Download, Package, FileSpreadsheet, Database, LogIn, LogOut, ShoppingCart, HardHat, ShieldAlert } from 'lucide-react';
import { parseISO, isValid, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, getMonth, setMonth, setDate, endOfDay, format } from 'date-fns';
import { subscribeToProjects, addProject, updateProjectInDb, deleteProjectFromDb, subscribeToMaterials, addMaterial, updateMaterialInDb, deleteMaterialFromDb, subscribeToPurchases, addPurchase, updatePurchaseInDb, deletePurchaseFromDb, subscribeToClients, addClient, updateClientInDb, deleteClientFromDb, subscribeToHolidays, saveHolidaysToDb } from './services/db';
import { subscribeToAuth, logoutUser, formatUsername } from './services/auth';
import { db } from './firebase';
import { User } from 'firebase/auth';
import { registrarLog } from './services/logger';

const CerneLogo = () => (
  <svg viewBox="0 0 140 40" className="h-10 w-auto" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Logo CERNE">
    <path d="M12 0L140 0V40H0V12L12 0Z" fill="#651830" />
    <text x="70" y="28" fill="white" fontSize="24" fontFamily="Arial, sans-serif" fontWeight="bold" textAnchor="middle" letterSpacing="2">CERNE</text>
  </svg>
);

const getProjectBaseName = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const match = nameWithoutExt.match(/^(.*?)\s\[R\d+\]$/);
  return match ? match[1] : nameWithoutExt;
};

const getRevisionNumber = (filename: string): number => {
  const match = filename.match(/\[R(\d+)\]/);
  return match ? parseInt(match[1], 10) : 0;
};

const detectDiscipline = (text: string): Discipline | null => {
  const normalized = text.toLowerCase();
  if (normalized.includes('arq')) return Discipline.ARCHITECTURE;
  if (normalized.includes('estrut')) return Discipline.STRUCTURE;
  if (normalized.includes('fund')) return Discipline.FOUNDATION;
  if (normalized.includes('hidr')) return Discipline.HYDRAULIC;
  if (normalized.includes('eletr') || normalized.includes('elétr')) return Discipline.ELECTRICAL;
  if (normalized.includes('dados') || normalized.includes('logica')) return Discipline.DATA;
  if (normalized.includes('spda')) return Discipline.SPDA;
  if (normalized.includes('clima') || normalized.includes('hvac') || normalized.includes('ar cond')) return Discipline.HVAC;
  return null;
};

const extractMetadataFromMaterialFilename = (filename: string, defaultClient: string) => {
    const discipline = detectDiscipline(filename) || Discipline.OTHER;
    return { discipline, client: defaultClient };
};

const generateRevisionFilename = (name: string): string => {
  const regex = /^(.*)\s\[R(\d+)\](\.[^.]*)?$/; 
  const match = name.match(regex);
  if (match) {
    const base = match[1];
    const num = parseInt(match[2], 10) + 1;
    const ext = match[3] || '';
    return `${base} [R${num}]${ext}`;
  } else {
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex !== -1) {
       const base = name.substring(0, lastDotIndex);
       const ext = name.substring(lastDotIndex);
       return `${base} [R1]${ext}`;
    }
    return `${name} [R1]`;
  }
};

type Tab = 'dashboard' | 'timeline' | 'projects' | 'materials' | 'purchases';
type ImportType = 'PROJECT' | 'MATERIAL_LIST';

export default function App() {
  const [projects, setProjects] = useState<ProjectFile[]>([]);
  const [materials, setMaterials] = useState<MaterialDoc[]>([]);
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([]); 
  const [clients, setClients] = useState<ClientDoc[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [dbConnected, setDbConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  const isReadOnly = !currentUser;
  
  // Security check for Admin button visibility (matches AdminLogs logic)
  const isAdmin = currentUser && currentUser.email === "thiago.dothling@cerne.internal";

  useEffect(() => {
    if (!db) {
        setDbConnected(false);
        return;
    }
    setDbConnected(true);

    const unsubProjects = subscribeToProjects(setProjects);
    const unsubMaterials = subscribeToMaterials(setMaterials);
    const unsubPurchases = subscribeToPurchases(setPurchases);
    const unsubClients = subscribeToClients(setClients);
    const unsubHolidays = subscribeToHolidays(setHolidays);
    const unsubAuth = subscribeToAuth(setCurrentUser);

    return () => {
        unsubProjects();
        unsubMaterials();
        unsubPurchases();
        unsubClients();
        unsubHolidays();
        unsubAuth();
    };
  }, []);

  const [selectedClient, setSelectedClient] = useState<string>('Todos');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('ALL');
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [customRange, setCustomRange] = useState<{start: string, end: string}>({ start: '', end: '' });

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>('PROJECT');
  const [uploadDiscipline, setUploadDiscipline] = useState<Discipline>(Discipline.ARCHITECTURE);
  const [uploadClient, setUploadClient] = useState<string>('');
  const [uploadBase, setUploadBase] = useState<string>(''); 
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAdminLogsOpen, setIsAdminLogsOpen] = useState(false);

  const selectedUploadClientDoc = useMemo(() => {
      return clients.find(c => c.name === uploadClient);
  }, [clients, uploadClient]);

  const shouldShowBaseInput = !selectedUploadClientDoc || selectedUploadClientDoc.type === SiteType.OPERATIONAL_BASE;

  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const getFilterDateRange = () => {
    if (dateFilterType === 'ALL') return null;
    let start: Date, end: Date;
    if (dateFilterType === 'CUSTOM') {
      if (!customRange.start || !customRange.end) return null;
      start = parseISO(customRange.start);
      end = endOfDay(parseISO(customRange.end));
      return { start, end };
    }
    switch (dateFilterType) {
      case 'MONTH': start = startOfMonth(referenceDate); end = endOfMonth(referenceDate); break;
      case 'QUARTER': start = startOfQuarter(referenceDate); end = endOfQuarter(referenceDate); break;
      case 'SEMESTER':
        const month = getMonth(referenceDate);
        if (month < 6) { start = startOfYear(referenceDate); end = setDate(setMonth(referenceDate, 5), 30); } 
        else { start = setDate(setMonth(referenceDate, 6), 1); end = endOfYear(referenceDate); }
        end.setHours(23, 59, 59, 999);
        break;
      case 'YEAR': start = startOfYear(referenceDate); end = endOfYear(referenceDate); break;
      default: return null;
    }
    return { start, end };
  };

  const filteredProjects = useMemo(() => {
    let result = projects;
    if (selectedClient !== 'Todos') {
      result = result.filter(p => p.client === selectedClient);
    }
    const dateRange = getFilterDateRange();
    if (dateRange) {
      const { start: filterStart, end: filterEnd } = dateRange;
      result = result.filter(p => {
        if (!p.startDate) return false;
        const projectStart = parseISO(p.startDate);
        let projectEnd: Date;
        if (p.endDate && isValid(parseISO(p.endDate))) {
            projectEnd = parseISO(p.endDate);
        } else {
            projectEnd = new Date(); 
        }
        return projectStart <= filterEnd && projectEnd >= filterStart;
      });
    }
    return result;
  }, [projects, selectedClient, dateFilterType, referenceDate, customRange]);

  const filteredMaterials = useMemo(() => {
    let result = materials;
    if (selectedClient !== 'Todos') {
      result = result.filter(m => m.client === selectedClient);
    }
    const dateRange = getFilterDateRange();
    if (dateRange) {
      const { start: filterStart, end: filterEnd } = dateRange;
      result = result.filter(m => {
        if (!m.startDate) return false;
        const matStart = parseISO(m.startDate);
        let matEnd: Date;
        if (m.endDate && isValid(parseISO(m.endDate))) {
            matEnd = parseISO(m.endDate);
        } else {
            matEnd = new Date(); 
        }
        return matStart <= filterEnd && matEnd >= filterStart;
      });
    }
    return result;
  }, [materials, selectedClient, dateFilterType, referenceDate, customRange]);

  const filteredPurchases = useMemo(() => {
      let result = purchases;
      if (selectedClient !== 'Todos') {
        result = result.filter(p => p.client === selectedClient);
      }
      return result;
  }, [purchases, selectedClient]);

  const uniqueClients = useMemo(() => {
    const registeredNames = clients.map(c => c.name);
    const projectClients = new Set(projects.map(p => p.client));
    const merged = new Set([...registeredNames, ...projectClients]);
    return ['Todos', ...Array.from(merged).sort()];
  }, [clients, projects]);

  const handleOpenUploadModal = () => {
    setIsUploadModalOpen(true);
    setUploadDiscipline(Discipline.ARCHITECTURE); 
    setUploadClient(''); 
    setUploadBase(''); 
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

    // PASSO 3 (EXEMPLO B): LOG DE IMPORTAÇÃO EM LOTE
    // Registra apenas 1 log para N arquivos
    const count = files.length;
    let logAction = "IMPORTACAO";
    let logDetails = {
        quantidade: count,
        cliente: finalClientName,
        tipo: importType,
        arquivos: Array.from(files).map((f:any) => f.name).slice(0, 5) // Salva só os 5 primeiros nomes para não estourar o log
    };

    if (importType === 'PROJECT') {
        Array.from(files).forEach((f: any) => {
            let discipline = uploadDiscipline;
            if (isFolderUpload && f.webkitRelativePath) {
                const detected = detectDiscipline(f.webkitRelativePath);
                if (detected) discipline = detected;
            }

            addProject({
                filename: f.name,
                client: finalClientName,
                base: finalBaseName,
                discipline: discipline, 
                status: Status.IN_PROGRESS,
                startDate: new Date().toISOString().split('T')[0],
                endDate: '',
                sendDate: '',
                feedbackDate: '',
                blockedDays: 0,
                revisions: []
            });
        });
        setActiveTab('projects');
        registrarLog(logAction, `${count} Projetos Importados`, logDetails);
    } else if (importType === 'MATERIAL_LIST') {
         Array.from(files).forEach((f: any) => {
             const metadata = extractMetadataFromMaterialFilename(f.name, finalClientName);
             addMaterial({
                 filename: f.name,
                 client: finalClientName,
                 base: finalBaseName,
                 discipline: metadata.discipline,
                 startDate: new Date().toISOString().split('T')[0],
                 endDate: '',
                 status: 'IN_PROGRESS',
                 revisions: []
             });
         });
         setActiveTab('materials');
         registrarLog(logAction, `${count} Listas Importadas`, logDetails);
    }

    setIsUploadModalOpen(false);
    event.target.value = '';
  };

  // PASSO 3 (EXEMPLO A): LOG DE AÇÃO ÚNICA (Atualização de Projeto)
  const updateProject = (updated: ProjectFile) => { 
      updateProjectInDb(updated);
      
      // Encontra o projeto antigo para comparar (opcional, mas bom para detalhes)
      const oldProject = projects.find(p => p.id === updated.id);
      
      registrarLog("EDICAO", updated.filename, {
          projetoId: updated.id,
          statusAnterior: oldProject?.status,
          novoStatus: updated.status,
          mudancas: {
              status: updated.status !== oldProject?.status ? updated.status : undefined,
              dataFim: updated.endDate !== oldProject?.endDate ? updated.endDate : undefined
          }
      });
  };

  const deleteProject = (id: string) => { 
      const project = projects.find(p => p.id === id);
      deleteProjectFromDb(id); 
      registrarLog("EXCLUSAO", project?.filename || id, { collection: 'projects' });
  };

  const addProjectRevision = (id: string, reason: RevisionReason, comment: string) => {
      const originalProject = projects.find(p => p.id === id);
      if (!originalProject) return;
      updateProjectInDb({ ...originalProject, status: Status.REVISED });
      const { id: _, ...projectData } = originalProject;
      const newFilename = generateRevisionFilename(originalProject.filename);
      
      addProject({
        ...projectData, 
        filename: newFilename, 
        status: Status.IN_PROGRESS,
        startDate: new Date().toISOString().split('T')[0], 
        endDate: '', sendDate: '', feedbackDate: '', blockedDays: 0, 
        revisions: [{ id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], reason, comment }]
      });

      registrarLog("CRIACAO", newFilename, { acao: "NOVA_REVISAO", origem: originalProject.filename, motivo: reason });
  };
  const updateMaterial = (updated: MaterialDoc) => updateMaterialInDb(updated);
  const deleteMaterial = (id: string) => deleteMaterialFromDb(id);
  const addMaterialRevision = (id: string, reason: RevisionReason, comment: string) => {
      const original = materials.find(m => m.id === id);
      if (!original) return;
      updateMaterialInDb({ ...original, status: 'REVISED' });
      const { id: _, ...materialData } = original;
      addMaterial({
          ...materialData,
          filename: generateRevisionFilename(original.filename),
          status: 'IN_PROGRESS',
          startDate: new Date().toISOString().split('T')[0], endDate: '',
          revisions: [{ id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], reason: reason.toString(), comment }]
      });
  };
  const handleAddPurchase = (purchase: Omit<PurchaseDoc, 'id'>) => addPurchase(purchase);
  const handleUpdatePurchase = (updated: PurchaseDoc) => updatePurchaseInDb(updated);
  const handleDeletePurchase = (id: string) => { if(confirm("Confirmar exclusão?")) deletePurchaseFromDb(id); };

  const handleAddClient = (client: Omit<ClientDoc, 'id'>) => addClient(client);
  const handleUpdateClient = (client: ClientDoc) => updateClientInDb(client);
  const handleDeleteClient = (id: string) => { if(confirm("Excluir cliente?")) deleteClientFromDb(id); };

  const handleBatchUpdate = (ids: string[], field: keyof ProjectFile, value: any) => {
      ids.forEach(id => {
        const project = projects.find(p => p.id === id);
        if (project) {
            const updatedProject = { ...project, [field]: value };
            updateProjectInDb(updatedProject);
        }
    });
    // PASSO 3 (EXEMPLO B - VARIAÇÃO): LOG DE EDIÇÃO EM LOTE
    registrarLog("EDICAO_LOTE", `${ids.length} Itens Alterados`, {
        campo: field,
        novoValor: value,
        idsAfetados: ids
    });
  };

  const handleBatchWorkflow = (ids: string[], action: 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT', date: string) => {
      let count = 0;
      ids.forEach(id => {
        const project = projects.find(p => p.id === id);
        if (!project) return;
        const updatedProject = { ...project };
        let shouldUpdate = false;
        if (action === 'COMPLETE') { updatedProject.status = Status.DONE; updatedProject.endDate = date; shouldUpdate = true; }
        if (action === 'SEND') { updatedProject.status = Status.WAITING_APPROVAL; updatedProject.sendDate = date; shouldUpdate = true; }
        if (action === 'APPROVE') { updatedProject.status = Status.APPROVED; updatedProject.feedbackDate = date; shouldUpdate = true; }
        if (action === 'REJECT') { updatedProject.status = Status.REJECTED; updatedProject.feedbackDate = date; shouldUpdate = true; }
        if (shouldUpdate) {
            updateProjectInDb(updatedProject);
            count++;
        }
    });
    // LOG DE WORKFLOW EM LOTE
    registrarLog("WORKFLOW_LOTE", `${count} Itens - Ação: ${action}`, {
        acao: action,
        dataAplicada: date
    });
  };
  const handleUpdateHolidays = (newHolidays: string[]) => saveHolidaysToDb(newHolidays);
  
  const handleExportCSV = () => setIsExportModalOpen(true);

  const handleConfirmExport = (type: 'PROJECTS' | 'MATERIALS' | 'PURCHASES') => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = "";

    if (type === 'PROJECTS') {
        headers = ["Nome do Arquivo", "Cliente", "Base", "Disciplina", "Status", "Data Inicio", "Data Fim", "Data Envio", "Data Feedback", "Dias Bloqueados"];
        rows = filteredProjects.map(p => [
            p.filename, p.client, p.base || '', p.discipline, p.status, 
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-200">
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 transition-colors duration-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CerneLogo />
            <span className="text-xs text-slate-400 font-medium ml-2 uppercase tracking-widest border-l border-slate-300 pl-2">KPI Tracker</span>
          </div>

          <div className="flex items-center space-x-4">
            {!dbConnected && (
                <div className="hidden lg:flex items-center text-rose-600 bg-rose-50 px-3 py-1 rounded-full text-xs font-bold animate-pulse border border-rose-200" role="alert">
                    <Database size={14} className="mr-1" aria-hidden="true" />
                    DB Desconectado
                </div>
            )}

            {currentUser ? (
              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700">
                 <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatUsername(currentUser.email)}</span>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Online</span>
                    </div>
                 </div>
                 <button onClick={logoutUser} className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors" title="Sair" aria-label="Sair"><LogOut size={18} /></button>
              </div>
            ) : (
               <button onClick={() => setIsLoginModalOpen(true)} className="hidden sm:flex items-center gap-2 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40 text-brand-700 dark:text-brand-400 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-brand-100 dark:border-brand-900/30"><LogIn size={16} /><span>Entrar</span></button>
            )}

            <button onClick={toggleTheme} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Alternar Tema">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

             <div className="hidden md:flex items-center space-x-2 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600">
              <Filter className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer" aria-label="Filtrar por Cliente">
                {uniqueClients.map(c => <option key={c} value={c} className="dark:bg-slate-800">{c}</option>)}
              </select>
            </div>

            {!isReadOnly && (
              <>
                 {isAdmin && (
                    <button onClick={() => setIsAdminLogsOpen(true)} className="p-2 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" title="Logs de Auditoria">
                        <ShieldAlert size={20} />
                    </button>
                 )}

                <button onClick={() => setIsHolidayManagerOpen(true)} className="p-2 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative" aria-label="Gerenciar Feriados">
                    <CalendarDays size={20} />
                    {holidays.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full"></span>}
                </button>

                <button onClick={() => setIsBatchEditOpen(true)} className="hidden md:flex bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center space-x-2 border border-slate-200 dark:border-slate-600">
                  <Layers className="w-4 h-4" />
                  <span>Edição em Lote</span>
                </button>

                <button onClick={() => setIsClientManagerOpen(true)} className="hidden md:flex bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center space-x-2 border border-slate-200 dark:border-slate-600">
                  <HardHat className="w-4 h-4" />
                  <span>Registro de Obra</span>
                </button>
                
                <button onClick={handleOpenUploadModal} disabled={!dbConnected} className="bg-brand-700 hover:bg-brand-800 disabled:bg-slate-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-sm">
                  <UploadCloud className="w-4 h-4" />
                  <span className="hidden sm:inline">Importar</span>
                </button>
              </>
            )}

             <button onClick={handleExportCSV} className="hidden md:flex bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors items-center space-x-2 border border-slate-200 dark:border-slate-600">
              <Download className="w-4 h-4" />
              <span className="hidden lg:inline">Exportar</span>
            </button>
            
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFilesSelected} {...({ webkitdirectory: isFolderUpload ? "" : undefined } as any)} accept={isFolderUpload ? undefined : (importType === 'PROJECT' ? ".dwg,.rvt,.pln,.pdf,.dxf,.csv" : ".xlsx,.xls,.csv")} />
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {!dbConnected && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3">
                <Database className="text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-bold text-rose-800">Banco de Dados Não Configurado</h4>
                    <p className="text-sm text-rose-700">O sistema está em modo somente leitura...</p>
                </div>
            </div>
        )}

        <div className="mb-6 flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-end">
          <div className="w-full lg:w-auto border-b border-slate-200 dark:border-slate-700 overflow-x-auto overflow-y-hidden no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            <nav className="-mb-px flex space-x-6 min-w-max" aria-label="Tabs">
              <button onClick={() => setActiveTab('dashboard')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'dashboard' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}><LayoutDashboard size={18} /> Indicadores</button>
              <button onClick={() => setActiveTab('timeline')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'timeline' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}><Calendar size={18} /> Cronograma</button>
              <button onClick={() => setActiveTab('projects')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'projects' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}><List size={18} /> Projetos</button>
              <button onClick={() => setActiveTab('materials')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'materials' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}><Package size={18} /> Lista de Materiais</button>
              <button onClick={() => setActiveTab('purchases')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'purchases' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}><ShoppingCart size={18} /> Compras</button>
            </nav>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-end sm:items-center">
             <div className="md:hidden w-full flex items-center space-x-2 bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600">
                <Filter className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="bg-transparent w-full text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none" aria-label="Filtrar por Cliente">
                  {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            {!currentUser && ( <button onClick={() => setIsLoginModalOpen(true)} className="md:hidden w-full flex items-center justify-center gap-2 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40 text-brand-700 dark:text-brand-400 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-brand-100 dark:border-brand-900/30"><LogIn size={16} /><span>Entrar</span></button> )}
            {currentUser && ( <div className="md:hidden w-full flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatUsername(currentUser.email)}</span><button onClick={logoutUser} className="text-rose-600 dark:text-rose-400 text-xs font-bold uppercase">Sair</button></div> )}

            <DateRangeFilter filterType={dateFilterType} setFilterType={setDateFilterType} referenceDate={referenceDate} setReferenceDate={setReferenceDate} customRange={customRange} setCustomRange={setCustomRange} />
          </div>
        </div>

        <div className="mt-6">
          {activeTab === 'dashboard' && <div className="animate-in fade-in zoom-in-95 duration-200"><Dashboard data={filteredProjects} materials={filteredMaterials} isDarkMode={isDarkMode} holidays={holidays} /></div>}
          {activeTab === 'timeline' && <div className="animate-in fade-in zoom-in-95 duration-200"><ProjectTimeline projects={filteredProjects} holidays={holidays} /></div>}
          {activeTab === 'projects' && <div className="animate-in fade-in zoom-in-95 duration-200"><ProjectList projects={filteredProjects} onUpdate={updateProject} onDelete={deleteProject} onAddRevision={addProjectRevision} holidays={holidays} readOnly={isReadOnly} /></div>}
          {activeTab === 'materials' && <div className="animate-in fade-in zoom-in-95 duration-200"><MaterialList materials={materials} onUpdate={updateMaterial} onDelete={deleteMaterial} onAddRevision={addMaterialRevision} readOnly={isReadOnly} /></div>}
          {activeTab === 'purchases' && <div className="animate-in fade-in zoom-in-95 duration-200"><PurchaseList purchases={purchases} onAdd={handleAddPurchase} onUpdate={handleUpdatePurchase} onDelete={handleDeletePurchase} currentUser={currentUser ? formatUsername(currentUser.email) : ''} holidays={holidays} readOnly={isReadOnly} /></div>}
        </div>
      </main>
      
       {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
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
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
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
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
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
            </div>
            
             <div className="mt-6 flex justify-end">
                 <button onClick={() => setIsExportModalOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                     Cancelar
                 </button>
             </div>
          </div>
        </div>
      )}

      {isBatchEditOpen && (
        <BatchEditModal projects={filteredProjects} onClose={() => setIsBatchEditOpen(false)} onApply={handleBatchUpdate} onWorkflow={handleBatchWorkflow} holidays={holidays} />
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

      {isAdminLogsOpen && (
        <AdminLogs currentUser={currentUser} onClose={() => setIsAdminLogsOpen(false)} />
      )}
    </div>
  );
}