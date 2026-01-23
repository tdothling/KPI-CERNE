import React, { useEffect, useState, useCallback } from 'react';
import { X, ShieldAlert, Search, Activity, ChevronDown, ChevronUp, RefreshCw, Download } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User } from 'firebase/auth';

interface AdminLogsProps {
  currentUser: User | null;
  onClose: () => void;
}

interface LogEntry {
  id: string;
  acao: string;
  alvo: string;
  usuario_email: string;
  data: Timestamp;
  detalhes?: any;
}

const ADMIN_EMAILS = ["thiago.dothling@cerne.internal"];
const LOGS_PER_PAGE = 50;

export const AdminLogs: React.FC<AdminLogsProps> = ({ currentUser, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const hasAccess = currentUser && ADMIN_EMAILS.includes(currentUser.email || '');

  const fetchLogs = useCallback(async (isNextPage = false) => {
    if (!hasAccess || !db) return;

    try {
      if (isNextPage) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      let q;
      const logsRef = collection(db, "logs_sistema");

      // Se for paginação (Carregar Mais), usamos startAfter
      if (isNextPage && lastVisible) {
        q = query(logsRef, orderBy("data", "desc"), startAfter(lastVisible), limit(LOGS_PER_PAGE));
      } else {
        // Primeira carga ou Refresh
        q = query(logsRef, orderBy("data", "desc"), limit(LOGS_PER_PAGE));
      }

      const querySnapshot = await getDocs(q);
      
      const fetchedLogs: LogEntry[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as LogEntry);
      });

      // Atualiza o cursor para a próxima página
      const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastVisible(lastDoc);

      // Verifica se há mais logs para carregar
      if (querySnapshot.docs.length < LOGS_PER_PAGE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      if (isNextPage) {
        setLogs(prev => [...prev, ...fetchedLogs]);
      } else {
        setLogs(fetchedLogs);
      }

    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [hasAccess, lastVisible]);

  // Carga inicial
  useEffect(() => {
    if (hasAccess) {
      fetchLogs(false);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]); 

  const handleRefresh = () => {
    setLastVisible(null);
    setHasMore(true);
    fetchLogs(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getActionColor = (action: string) => {
    if (action.includes('EXCLUSAO')) return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800';
    if (action.includes('LOTE') || action.includes('IMPORTACAO')) return 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800';
    if (action.includes('CRIACAO')) return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
  };

  const filteredLogs = logs.filter(log => 
    log.alvo.toLowerCase().includes(searchTerm.toLowerCase()) || 
    log.usuario_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.acao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!hasAccess) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-sm text-center border border-rose-200 dark:border-rose-900 shadow-2xl">
          <ShieldAlert size={48} className="mx-auto text-rose-600 mb-4" />
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Acesso Negado</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Seu usuário não tem permissão para visualizar os logs de auditoria.</p>
          <button onClick={onClose} className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-5xl w-full h-[85vh] flex flex-col border dark:border-slate-700 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ShieldAlert className="text-brand-600 dark:text-brand-400" size={24} />
              Log de Auditoria
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Rastreamento de atividades (Modo Econômico: Atualize para ver novos)</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={handleRefresh} 
                disabled={loading}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500 dark:text-slate-400 disabled:opacity-50" 
                title="Recarregar Dados"
            >
                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={24} /></button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Filtrar registros carregados..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" 
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Carregados: {logs.length}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Activity className="animate-spin mb-2" size={32} />
              <p>Buscando registros...</p>
            </div>
          ) : (
            <>
                <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs sticky top-0 shadow-sm z-10">
                    <tr>
                    <th className="px-6 py-3 font-semibold">Data/Hora</th>
                    <th className="px-6 py-3 font-semibold">Usuário</th>
                    <th className="px-6 py-3 font-semibold">Ação</th>
                    <th className="px-6 py-3 font-semibold">Alvo</th>
                    <th className="px-6 py-3 font-semibold text-right">Detalhes</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                    {filteredLogs.map(log => (
                    <React.Fragment key={log.id}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-6 py-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                            {log.data ? format(log.data.toDate(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : '-'}
                        </td>
                        <td className="px-6 py-3 text-slate-800 dark:text-slate-200 font-medium">
                            {log.usuario_email}
                        </td>
                        <td className="px-6 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getActionColor(log.acao)}`}>
                            {log.acao}
                            </span>
                        </td>
                        <td className="px-6 py-3 text-slate-600 dark:text-slate-300 truncate max-w-[200px]" title={log.alvo}>
                            {log.alvo}
                        </td>
                        <td className="px-6 py-3 text-right">
                            {log.detalhes && Object.keys(log.detalhes).length > 0 ? (
                            <button 
                                onClick={() => toggleExpand(log.id)}
                                className="text-brand-600 hover:text-brand-700 dark:text-brand-400 hover:underline text-xs font-medium flex items-center justify-end gap-1 ml-auto"
                            >
                                {expandedRow === log.id ? 'Ocultar' : 'Ver JSON'}
                                {expandedRow === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            ) : (
                            <span className="text-slate-300 dark:text-slate-600">-</span>
                            )}
                        </td>
                        </tr>
                        {expandedRow === log.id && (
                        <tr className="bg-slate-50 dark:bg-slate-900/50">
                            <td colSpan={5} className="px-6 py-4">
                            <pre className="text-xs font-mono bg-slate-100 dark:bg-black/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 overflow-x-auto">
                                {JSON.stringify(log.detalhes, null, 2)}
                            </pre>
                            </td>
                        </tr>
                        )}
                    </React.Fragment>
                    ))}
                    {filteredLogs.length === 0 && (
                    <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-400 italic">
                        Nenhum registro encontrado.
                        </td>
                    </tr>
                    )}
                </tbody>
                </table>
                
                {/* Load More Button */}
                {hasMore && !searchTerm && (
                    <div className="p-4 flex justify-center bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                        <button 
                            onClick={() => fetchLogs(true)}
                            disabled={loadingMore}
                            className="flex items-center gap-2 px-6 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                        >
                            {loadingMore ? <Activity size={16} className="animate-spin" /> : <Download size={16} />}
                            {loadingMore ? 'Carregando...' : 'Carregar Mais Antigos'}
                        </button>
                    </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
