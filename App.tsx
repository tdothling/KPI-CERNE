
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProjectFile, Discipline, Status, RevisionReason, DateFilterType, MaterialDoc, MaterialStatus } from './types';
import { Dashboard } from './components/Dashboard';
import { ProjectList } from './components/ProjectList';
import { ProjectTimeline } from './components/ProjectTimeline';
import { BatchEditModal } from './components/BatchEditModal';
import { HolidayManagerModal } from './components/HolidayManagerModal';
import { DateRangeFilter } from './components/DateRangeFilter';
import { MaterialList } from './components/MaterialList';
import { UploadCloud, Loader2, Filter, X, Layers, FolderInput, Moon, Sun, LayoutDashboard, Calendar, List, CalendarDays, Download, Package, FileSpreadsheet } from 'lucide-react';
import { 
  differenceInCalendarDays, 
  differenceInBusinessDays, 
  parseISO, 
  isWeekend, 
  isWithinInterval, 
  isValid,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  getMonth,
  setMonth,
  setDate
} from 'date-fns';

// Sample initial data for testing
const INITIAL_PROJECTS: ProjectFile[] = [
  {
    id: '1',
    filename: 'PRJ-A-2024-ARC-01.dwg',
    client: 'Construtora Alpha',
    base: 'Torre A',
    discipline: Discipline.ARCHITECTURE,
    status: Status.IN_PROGRESS,
    startDate: '2023-10-01',
    endDate: '2023-10-05',
    sendDate: '',
    feedbackDate: '',
    blockedDays: 0,
    revisions: []
  },
  {
    id: '2',
    filename: 'PRJ-A-2024-HID-02.dwg',
    client: 'Construtora Alpha',
    base: 'Torre B',
    discipline: Discipline.HYDRAULIC,
    status: Status.DONE, 
    startDate: '2023-10-02',
    endDate: '2023-10-10',
    sendDate: '2023-10-04',
    feedbackDate: '2023-10-07',
    blockedDays: 3,
    revisions: [{ id: 'r1', date: '2023-10-08', reason: RevisionReason.CLIENT_REQUEST, comment: 'Alteração de layout' }]
  }
];

const INITIAL_MATERIALS: MaterialDoc[] = [
  {
    id: 'm1',
    client: 'Construtora Alpha',
    filename: 'LM-TorreA-Hidraulica.xlsx',
    base: 'Torre A',
    discipline: Discipline.HYDRAULIC,
    startDate: '2023-10-10',
    endDate: '',
    status: 'IN_PROGRESS',
    revisions: []
  }
];

// Custom CERNE Logo Component
const CerneLogo = () => (
  <svg viewBox="0 0 140 40" className="h-10 w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background with chamfered top-left corner */}
    <path d="M12 0L140 0V40H0V12L12 0Z" fill="#651830" />
    {/* Text CERNE - Simplified representation */}
    <text x="70" y="28" fill="white" fontSize="24" fontFamily="Arial, sans-serif" fontWeight="bold" textAnchor="middle" letterSpacing="2">
      CERNE
    </text>
  </svg>
);

// --- TAXONOMY & HELPERS ---

// Helper to detect discipline from folder path or filename
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

// Placeholder for future advanced taxonomy logic
const extractMetadataFromMaterialFilename = (filename: string, defaultClient: string) => {
    // 1. Try to detect Discipline
    const discipline = detectDiscipline(filename) || Discipline.OTHER;
    
    // 2. Try to detect Client (Simple heuristics, expand later)
    // E.g. "Cerne_ProjectX_List.xlsx"
    let client = defaultClient;
    // Example logic: if filename starts with a known pattern, extract it.
    // For now, we rely mostly on the user input default, but this is the place to add Regex.
    
    return { discipline, client };
};


// Helper to generate next revision filename
const generateRevisionFilename = (name: string): string => {
  const regex = /^(.*)\s\[R(\d+)\](\.[^.]*)?$/; // Matches "Name [R1].ext" or "Name [R1]"
  const match = name.match(regex);

  if (match) {
    const base = match[1];
    const num = parseInt(match[2], 10) + 1;
    const ext = match[3] || '';
    return `${base} [R${num}]${ext}`;
  } else {
    // Find extension if exists
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex !== -1) {
       const base = name.substring(0, lastDotIndex);
       const ext = name.substring(lastDotIndex);
       return `${base} [R1]${ext}`;
    }
    return `${name} [R1]`;
  }
};

// Helper for Holiday Calculation
const calculateBusinessDaysWithHolidays = (start: Date, end: Date, holidays: string[]) => {
    let days = differenceInBusinessDays(end, start);
    
    let holidaysOnWeekdays = 0;
    holidays.forEach(h => {
        const hDate = parseISO(h);
        if (isValid(hDate) && isWithinInterval(hDate, { start, end })) {
            if (!isWeekend(hDate)) {
                holidaysOnWeekdays++;
            }
        }
    });

    return Math.max(0, days - holidaysOnWeekdays);
};


type Tab = 'dashboard' | 'timeline' | 'projects' | 'materials';
type ImportType = 'PROJECT' | 'MATERIAL_LIST';

export default function App() {
  const [projects, setProjects] = useState<ProjectFile[]>(INITIAL_PROJECTS);
  const [materials, setMaterials] = useState<MaterialDoc[]>(INITIAL_MATERIALS);
  
  const [selectedClient, setSelectedClient] = useState<string>('Todos');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [holidays, setHolidays] = useState<string[]>([]); // Store 'YYYY-MM-DD' strings
  
  // Date Filter State
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('ALL');
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [customRange, setCustomRange] = useState<{start: string, end: string}>({ start: '', end: '' });

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>('PROJECT');
  const [uploadDiscipline, setUploadDiscipline] = useState<Discipline>(Discipline.ARCHITECTURE);
  const [uploadClient, setUploadClient] = useState<string>('');
  const [uploadBase, setUploadBase] = useState<string>(''); // Base State
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Edit State
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  
  // Holiday Manager State
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);

  // Dark Mode Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Helper to calculate Start/End Date based on DateFilterType
  const getFilterDateRange = () => {
    if (dateFilterType === 'ALL') return null;
    
    let start: Date, end: Date;

    if (dateFilterType === 'CUSTOM') {
      if (!customRange.start || !customRange.end) return null;
      start = parseISO(customRange.start);
      end = parseISO(customRange.end);
      // set End to end of day to be inclusive
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    switch (dateFilterType) {
      case 'MONTH':
        start = startOfMonth(referenceDate);
        end = endOfMonth(referenceDate);
        break;
      case 'QUARTER':
        start = startOfQuarter(referenceDate);
        end = endOfQuarter(referenceDate);
        break;
      case 'SEMESTER':
        const month = getMonth(referenceDate);
        if (month < 6) { // 1st Semester (Jan-Jun)
          start = startOfYear(referenceDate);
          end = setDate(setMonth(referenceDate, 5), 30); // June 30th
        } else { // 2nd Semester (Jul-Dec)
          start = setDate(setMonth(referenceDate, 6), 1); // July 1st
          end = endOfYear(referenceDate);
        }
        // Fix strict End Of Day
        end.setHours(23, 59, 59, 999);
        break;
      case 'YEAR':
        start = startOfYear(referenceDate);
        end = endOfYear(referenceDate);
        break;
      default:
        return null;
    }
    return { start, end };
  };

  // Filter Data
  const filteredProjects = useMemo(() => {
    let result = projects;

    // 1. Client Filter
    if (selectedClient !== 'Todos') {
      result = result.filter(p => p.client === selectedClient);
    }

    // 2. Date Filter
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

  const uniqueClients = useMemo(() => {
    const clients = new Set(projects.map(p => p.client));
    return ['Todos', ...Array.from(clients).sort()];
  }, [projects]);

  // Clients list for Datalist
  const clientSuggestions = useMemo(() => {
    const clients = new Set([
        ...projects.map(p => p.client),
        ...materials.map(m => m.client)
    ]);
    return Array.from(clients).sort();
  }, [projects, materials]);

  // Handle File Upload Flow
  const handleOpenUploadModal = () => {
    setIsUploadModalOpen(true);
    setUploadDiscipline(Discipline.ARCHITECTURE); 
    setUploadClient(''); 
    setUploadBase(''); 
    setIsFolderUpload(false); 
    setImportType('PROJECT'); // Default to Project
  };

  const triggerFileSelect = () => {
    if (!uploadClient.trim()) {
      alert("Por favor, informe o nome do Cliente.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // 1. Handle PROJECT Import
    if (importType === 'PROJECT') {
        const finalClientName = uploadClient.trim() || 'Cliente Geral';
        const finalBaseName = uploadBase.trim() || 'Geral';

        const newProjects: ProjectFile[] = Array.from(files).map((f: any) => {
            let discipline = uploadDiscipline;
            
            if (isFolderUpload && f.webkitRelativePath) {
                const detected = detectDiscipline(f.webkitRelativePath);
                if (detected) discipline = detected;
            }

            return {
                id: crypto.randomUUID(),
                filename: f.name,
                client: finalClientName,
                base: finalBaseName,
                discipline: discipline, 
                status: Status.TODO,
                startDate: new Date().toISOString().split('T')[0],
                endDate: '',
                sendDate: '',
                feedbackDate: '',
                blockedDays: 0,
                revisions: []
            };
        });

        setProjects(prev => [...newProjects, ...prev]);
        setActiveTab('projects');
    }
    
    // 2. Handle MATERIAL LIST Import
    else if (importType === 'MATERIAL_LIST') {
         const finalClientName = uploadClient.trim() || 'Cliente Geral';
         const finalBaseName = uploadBase.trim() || 'Geral';

         const newMaterials: MaterialDoc[] = Array.from(files).map((f: any) => {
             // Taxonomy Logic for Materials
             const metadata = extractMetadataFromMaterialFilename(f.name, finalClientName);

             return {
                 id: crypto.randomUUID(),
                 filename: f.name,
                 client: metadata.client, // Use extracted or fallback
                 base: finalBaseName,
                 discipline: metadata.discipline, // Use extracted or fallback
                 startDate: new Date().toISOString().split('T')[0],
                 endDate: '',
                 status: 'IN_PROGRESS',
                 revisions: []
             };
         });
         
         setMaterials(prev => [...prev, ...newMaterials]);
         setActiveTab('materials');
    }

    setIsUploadModalOpen(false);
    event.target.value = '';
  };

  // --- CRUD OPERATIONS (PROJECTS) ---
  const updateProject = (updated: ProjectFile) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const addProjectRevision = (id: string, reason: RevisionReason, comment: string) => {
    const originalProject = projects.find(p => p.id === id);
    if (!originalProject) return;

    const updatedOriginal: ProjectFile = { ...originalProject, status: Status.REVISED };
    const newProject: ProjectFile = {
      ...originalProject,
      id: crypto.randomUUID(), 
      filename: generateRevisionFilename(originalProject.filename), 
      status: Status.TODO, 
      startDate: new Date().toISOString().split('T')[0], 
      endDate: '', 
      sendDate: '', 
      feedbackDate: '', 
      blockedDays: 0, 
      revisions: [{ id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], reason, comment }]
    };

    setProjects(prev => {
        const listWithUpdatedOriginal = prev.map(p => p.id === id ? updatedOriginal : p);
        return [...listWithUpdatedOriginal, newProject];
    });
  };

  // --- CRUD OPERATIONS (MATERIALS) ---
  const updateMaterial = (updated: MaterialDoc) => {
     setMaterials(prev => prev.map(m => m.id === updated.id ? updated : m));
  };

  const deleteMaterial = (id: string) => {
     setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const addMaterialRevision = (id: string, reason: RevisionReason, comment: string) => {
      const original = materials.find(m => m.id === id);
      if (!original) return;

      const updatedOriginal: MaterialDoc = { ...original, status: 'REVISED' };
      const newDoc: MaterialDoc = {
          ...original,
          id: crypto.randomUUID(),
          filename: generateRevisionFilename(original.filename),
          status: 'IN_PROGRESS',
          startDate: new Date().toISOString().split('T')[0],
          endDate: '',
          revisions: [{ id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], reason: reason.toString(), comment }]
      };

      setMaterials(prev => {
          const list = prev.map(m => m.id === id ? updatedOriginal : m);
          return [...list, newDoc];
      });
  };


  // Batch Update Logic (Fields)
  const handleBatchUpdate = (ids: string[], field: keyof ProjectFile, value: any) => {
    setProjects(prev => prev.map(project => {
      if (!ids.includes(project.id)) return project;
      const updatedProject = { ...project, [field]: value };
      
      // Consistency Logic (Same as before)
      if (field === 'blockedDays' && updatedProject.sendDate) {
        const days = parseFloat(value as string);
        const validDays = isNaN(days) ? 0 : days;
        const startDate = new Date(updatedProject.sendDate);
        const targetTime = startDate.getTime() + (validDays * 24 * 60 * 60 * 1000);
        updatedProject.feedbackDate = new Date(targetTime).toISOString().split('T')[0];
      }
      return updatedProject;
    }));
  };
  
  // Batch Workflow Logic (Actions)
  const handleBatchWorkflow = (ids: string[], action: 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT', date: string) => {
    setProjects(prev => prev.map(project => {
      if (!ids.includes(project.id)) return project;
      const updatedProject = { ...project };

      if (action === 'COMPLETE') {
          if (updatedProject.startDate && date < updatedProject.startDate) return project; 
          updatedProject.status = Status.DONE;
          updatedProject.endDate = date;
      }
      if (action === 'SEND') {
          if (!updatedProject.endDate || date < updatedProject.endDate) return project;
          updatedProject.status = Status.WAITING_APPROVAL;
          updatedProject.sendDate = date;
      }
      if (action === 'APPROVE') {
          if (!updatedProject.sendDate || date < updatedProject.sendDate) return project; 
          updatedProject.status = Status.APPROVED;
          updatedProject.feedbackDate = date;
          updatedProject.blockedDays = calculateBusinessDaysWithHolidays(parseISO(updatedProject.sendDate), parseISO(date), holidays);
      }
      if (action === 'REJECT') {
          if (!updatedProject.sendDate || date < updatedProject.sendDate) return project;
          updatedProject.status = Status.REJECTED;
          updatedProject.feedbackDate = date;
          updatedProject.blockedDays = calculateBusinessDaysWithHolidays(parseISO(updatedProject.sendDate), parseISO(date), holidays);
      }
      return updatedProject;
    }));
  };

  // CSV Export Logic
  const handleExportCSV = () => {
    const headers = ["Arquivo","Cliente","Disciplina","Status","Data Início","Data Fim (Exec)","Data Envio","Data Feedback","Dias Bloqueados","Qtd Revisões","Base"];
    const rows = filteredProjects.map(p => [
      `"${p.filename.replace(/"/g, '""')}"`, 
      `"${p.client.replace(/"/g, '""')}"`,
      `"${p.discipline}"`,
      `"${p.status}"`,
      p.startDate || '',
      p.endDate || '',
      p.sendDate || '',
      p.feedbackDate || '',
      p.blockedDays,
      p.revisions.length,
      `"${(p.base || 'Geral').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `kpi_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 transition-colors duration-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CerneLogo />
            <span className="text-xs text-slate-400 font-medium ml-2 uppercase tracking-widest border-l border-slate-300 pl-2">KPI Tracker</span>
          </div>

          <div className="flex items-center space-x-4">
            <button onClick={toggleTheme} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

             <div className="hidden md:flex items-center space-x-2 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600">
              <Filter className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer">
                {uniqueClients.map(c => <option key={c} value={c} className="dark:bg-slate-800">{c}</option>)}
              </select>
            </div>

            <button onClick={() => setIsHolidayManagerOpen(true)} className="p-2 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative">
                <CalendarDays size={20} />
                {holidays.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full"></span>}
            </button>

             <button onClick={handleExportCSV} className="hidden md:flex bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors items-center space-x-2 border border-slate-200 dark:border-slate-600">
              <Download className="w-4 h-4" />
              <span className="hidden lg:inline">Exportar</span>
            </button>

            <button onClick={() => setIsBatchEditOpen(true)} className="hidden md:flex bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center space-x-2 border border-slate-200 dark:border-slate-600">
              <Layers className="w-4 h-4" />
              <span>Edição em Lote</span>
            </button>
            
            <button onClick={handleOpenUploadModal} className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 shadow-sm">
              <UploadCloud className="w-4 h-4" />
              <span className="hidden sm:inline">Importar</span>
            </button>
            
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFilesSelected}
              {...({ webkitdirectory: isFolderUpload ? "" : undefined } as any)}
              accept={isFolderUpload ? undefined : (importType === 'PROJECT' ? ".dwg,.rvt,.pln,.pdf,.dxf,.csv" : ".xlsx,.xls,.csv")}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Controls Bar */}
        <div className="mb-6 flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-end">
          {/* Tab Navigation */}
          <div className="w-full lg:w-auto border-b border-slate-200 dark:border-slate-700">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
              <button onClick={() => setActiveTab('dashboard')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'dashboard' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}>
                <LayoutDashboard size={18} /> Indicadores
              </button>
              <button onClick={() => setActiveTab('timeline')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'timeline' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}>
                <Calendar size={18} /> Cronograma
              </button>
              <button onClick={() => setActiveTab('projects')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'projects' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}>
                <List size={18} /> Projetos
              </button>
              <button onClick={() => setActiveTab('materials')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === 'materials' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'}`}>
                <Package size={18} /> Lista de Materiais
              </button>
            </nav>
          </div>

          {/* Date Filter */}
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-end sm:items-center">
             <div className="md:hidden w-full flex items-center space-x-2 bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600">
                <Filter className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="bg-transparent w-full text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none">
                  {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <DateRangeFilter filterType={dateFilterType} setFilterType={setDateFilterType} referenceDate={referenceDate} setReferenceDate={setReferenceDate} customRange={customRange} setCustomRange={setCustomRange} />
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'dashboard' && (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              <Dashboard data={filteredProjects} isDarkMode={isDarkMode} holidays={holidays} />
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              <ProjectTimeline projects={filteredProjects} holidays={holidays} />
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              <ProjectList projects={filteredProjects} onUpdate={updateProject} onDelete={deleteProject} onAddRevision={addProjectRevision} holidays={holidays} />
            </div>
          )}

          {activeTab === 'materials' && (
             <div className="animate-in fade-in zoom-in-95 duration-200">
                <MaterialList 
                    materials={materials} 
                    onUpdate={updateMaterial} 
                    onDelete={deleteMaterial} 
                    onAddRevision={addMaterialRevision} 
                />
             </div>
          )}
        </div>
      </main>
      
       {/* Upload Modal */}
       {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all border dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">Importar Arquivos</h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6 mb-8">
              
              {/* 1. Import Type Selector */}
              <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">O que você deseja importar?</label>
                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => { setImportType('PROJECT'); setIsFolderUpload(false); }}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${importType === 'PROJECT' ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' : 'border-slate-200 dark:border-slate-600 hover:border-brand-200 text-slate-500'}`}
                      >
                          <List size={24} className="mb-1" />
                          <span className="text-sm font-medium">Projetos</span>
                          <span className="text-[10px] opacity-70">DWG, RVT, PDF</span>
                      </button>

                      <button 
                        onClick={() => { setImportType('MATERIAL_LIST'); setIsFolderUpload(false); }}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${importType === 'MATERIAL_LIST' ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' : 'border-slate-200 dark:border-slate-600 hover:border-brand-200 text-slate-500'}`}
                      >
                          <FileSpreadsheet size={24} className="mb-1" />
                          <span className="text-sm font-medium">Listas de Materiais</span>
                          <span className="text-[10px] opacity-70">Excel (XLSX, XLS)</span>
                      </button>
                  </div>
              </div>

              {/* Client Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Cliente Padrão
                </label>
                <input 
                  list="client-options"
                  value={uploadClient}
                  onChange={(e) => setUploadClient(e.target.value)}
                  placeholder="Selecione ou digite..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3"
                  autoFocus
                />
                <datalist id="client-options">
                  {clientSuggestions.map(client => (
                    <option key={client} value={client} />
                  ))}
                </datalist>
              </div>

               {/* Base Selection (Updated to allow Material List) */}
               {(importType === 'PROJECT' || importType === 'MATERIAL_LIST') && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Base / Setor / Bloco
                    </label>
                    <input 
                    type="text"
                    value={uploadBase}
                    onChange={(e) => setUploadBase(e.target.value)}
                    placeholder="Ex: Torre A, Bloco 1..."
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3"
                    />
                </div>
               )}

              {/* Folder Upload Toggle (Only for Project) */}
              {importType === 'PROJECT' && (
                <div className="bg-brand-50 dark:bg-slate-700/50 p-3 rounded-lg border border-brand-100 dark:border-slate-600">
                    <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <FolderInput className="text-brand-600 dark:text-brand-400" size={20} />
                        <div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">Modo Pasta (Auto-Tag)</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">Detecta Disciplina pelo nome da pasta</span>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                        type="checkbox" 
                        checked={isFolderUpload}
                        onChange={(e) => setIsFolderUpload(e.target.checked)}
                        className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-700"></div>
                    </label>
                    </div>
                </div>
              )}

              {/* Discipline Selection (Fallback for Project or Default for Material) */}
              <div className={`${(importType === 'PROJECT' && isFolderUpload) ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all`}>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Disciplina Padrão {importType === 'PROJECT' && isFolderUpload && '(Usada se a detecção falhar)'} {importType === 'MATERIAL_LIST' && '(Será tentada a detecção pelo nome do arquivo)'}
                </label>
                <div className="relative">
                  <select 
                    value={uploadDiscipline}
                    onChange={(e) => setUploadDiscipline(e.target.value as Discipline)}
                    className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-base rounded-lg focus:ring-brand-500 focus:border-brand-500 block p-3 pr-8"
                  >
                    {Object.values(Discipline).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                    <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button onClick={() => setIsUploadModalOpen(false)} className="px-6 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors">Cancelar</button>
              <button onClick={triggerFileSelect} className="px-6 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-md transition-all flex items-center">
                Selecionar Arquivos {importType === 'MATERIAL_LIST' && 'Excel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Edit Modal */}
      {isBatchEditOpen && (
        <BatchEditModal projects={filteredProjects} onClose={() => setIsBatchEditOpen(false)} onApply={handleBatchUpdate} onWorkflow={handleBatchWorkflow} />
      )}

      {/* Holiday Manager Modal */}
      {isHolidayManagerOpen && (
        <HolidayManagerModal holidays={holidays} onUpdateHolidays={setHolidays} onClose={() => setIsHolidayManagerOpen(false)} />
      )}
    </div>
  );
}