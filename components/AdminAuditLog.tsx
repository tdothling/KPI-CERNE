import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { LogEntry } from '../utils/logger';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ShieldAlert, X, Search, FileJson, User, Calendar, Target, Activity, RefreshCw } from 'lucide-react';

interface AdminAuditLogProps {
  currentUserEmail: string | null | undefined;
  onClose: () => void;
}

const ADMIN_EMAIL = 'thiago.dothling@cerne.internal';

export const AdminAuditLog: React.FC<AdminAuditLogProps> = ({ currentUserEmail, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Verifica permissão
  const isAdmin = currentUserEmail === ADMIN_EMAIL;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'logs_sistema'), orderBy('created_at', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LogEntry[];
      setLogs(data);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchLogs();
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-md text-center border-2 border-rose-500">
          <ShieldAlert size={64} className="text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Acesso Negado</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">Esta área é restrita para auditoria administrativa.</p>
          <button onClick={onClose} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white px-6 py-2 rounded-lg font-bold">Voltar</button>
        </div>
      </div>
    );
  }

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action: string) => {
    if (action.includes('EXCLUIR')) return 'text-rose-600 bg-rose-50 dark:bg-rose-900/30 border-rose-200';
    if (action.includes('CRIAR') || action.includes('ADICIONAR')) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200';
    if (action.includes('EDITAR') || action.includes('ATUALIZAR')) return 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-200';
    return 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 border-blue-200';
  };

  const formatLogDate = (timestamp: any) => {
    if (!timestamp) return '-';
    // Firestore Timestamp to Date
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col border dark:border-slate-700 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ShieldAlert className="text-brand-600 dark:text-brand-400" size={24} /> 
              Audit Log (Sistema)
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Registro imutável de ações no banco de dados.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex gap-4 items-center bg-white dark:bg-slate-800">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por ação, usuário ou alvo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" 
            />
          </div>
          <button onClick={fetchLogs} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors" title="Atualizar">
            <RefreshCw size={20} />
          </button>
          <div className="text-sm text-slate-500 ml-auto">
            Mostrando {filteredLogs.length} registros
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900/50">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3"><div className="flex items-center gap-1"><Calendar size={14} /> Data/Hora</div></th>
                <th className="px-6 py-3"><div className="flex items-center gap-1"><User size={14} /> Usuário</div></th>
                <th className="px-6 py-3"><div className="flex items-center gap-1"><Activity size={14} /> Ação</div></th>
                <th className="px-6 py-3"><div className="flex items-center gap-1"><Target size={14} /> Alvo</div></th>
                <th className="px-6 py-3 text-right">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">Carregando logs de auditoria...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">Nenhum registro encontrado.</td></tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {formatLogDate(log.created_at)}
                    </td>
                    <td className="px-6 py-3 text-slate-800 dark:text-slate-200">
                      {log.user_email.replace('@cerne.internal', '')}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300 font-medium max-w-xs truncate" title={log.target}>
                      {log.target}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button 
                        onClick={() => setSelectedLog(log)}
                        className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        <FileJson size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Detalhes JSON */}
        {selectedLog && (
          <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-end">
            <div className="w-full md:w-1/3 h-full bg-white dark:bg-slate-800 shadow-2xl border-l dark:border-slate-700 flex flex-col animate-in slide-in-from-right duration-300">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
                <h4 className="font-bold text-slate-800 dark:text-white">Detalhes do Log</h4>
                <button onClick={() => setSelectedLog(null)}><X size={20} className="text-slate-500" /></button>
              </div>
              <div className="p-6 flex-1 overflow-auto">
                <div className="mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">ID do Log</span>
                  <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{selectedLog.id}</p>
                </div>
                <div className="mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">UID Usuário</span>
                  <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{selectedLog.user_uid}</p>
                </div>
                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};